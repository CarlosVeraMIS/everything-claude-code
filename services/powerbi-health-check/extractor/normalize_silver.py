"""
MIvisualization — Silver Layer: Normalización y detección de similitudes
Lee el bronze layer y agrupa métricas/dimensiones similares entre distintos .pbix.

Algoritmo:
  - Nombre similar (fuzzy matching ≥ 70%) → candidatos del mismo grupo
  - DAX idéntico (mismo hash) → duplicado exacto → merge automático
  - DAX diferente + nombre similar → CONFLICTO → alerta para el admin
"""

import json
import pathlib
import logging
from itertools import combinations
from rapidfuzz import fuzz

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("mivi.silver")

SIMILARITY_THRESHOLD = 70   # % mínimo para considerar dos medidas candidatas
CONFLICT_THRESHOLD   = 85   # Si nombre muy similar pero DAX diferente → conflicto


# ─────────────────────────────────────────
# CARGAR BRONZE
# ─────────────────────────────────────────

def load_bronze(layer: str) -> list[dict]:
    bronze_dir = pathlib.Path(f"./bronze/{layer}")
    if not bronze_dir.exists():
        return []
    records = []
    for f in bronze_dir.glob("*.json"):
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
            if isinstance(data, list):
                records.extend(data)
    log.info(f"Bronze [{layer}]: {len(records)} registros cargados")
    return records


# ─────────────────────────────────────────
# NORMALIZAR NOMBRE
# ─────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Limpia el nombre para comparación: minúsculas, sin guiones/underscores/espacios extra."""
    import re
    name = name.lower().strip()
    name = re.sub(r"[_\-\s]+", " ", name)
    name = re.sub(r"[^a-záéíóúüñ0-9 ]", "", name)
    return name.strip()


# ─────────────────────────────────────────
# DETECTAR GRUPOS DE MEDIDAS SIMILARES
# ─────────────────────────────────────────

def detect_measure_groups(measures: list[dict]) -> list[dict]:
    """
    Agrupa medidas por similitud de nombre y compara expresiones DAX.
    Retorna lista de grupos con su tipo: MATCH, DUPLICATE, CONFLICT.
    """
    groups   = []
    visited  = set()

    for i, a in enumerate(measures):
        if i in visited:
            continue

        group_members = [a]
        visited.add(i)
        a_norm = normalize_name(a["measure_name"])

        for j, b in enumerate(measures):
            if j <= i or j in visited:
                continue

            b_norm   = normalize_name(b["measure_name"])
            name_sim = fuzz.ratio(a_norm, b_norm)

            if name_sim >= SIMILARITY_THRESHOLD:
                group_members.append(b)
                visited.add(j)

        if len(group_members) < 2:
            continue  # Medida única — no genera candidato todavía

        # Analizar el grupo
        dax_hashes = {m["dax_hash"] for m in group_members}
        name_sims  = [
            fuzz.ratio(
                normalize_name(x["measure_name"]),
                normalize_name(y["measure_name"])
            )
            for x, y in combinations(group_members, 2)
        ]
        avg_sim = sum(name_sims) / len(name_sims) if name_sims else 100

        # Clasificar el grupo
        if len(dax_hashes) == 1:
            group_type = "DUPLICATE"    # Mismo DAX exacto — merge automático seguro
        elif avg_sim >= CONFLICT_THRESHOLD:
            group_type = "CONFLICT"     # Nombres muy similares pero DAX distintos
        else:
            group_type = "CANDIDATE"    # Similar pero puede ser intencional

        groups.append({
            "group_id":        f"mg_{abs(hash(a_norm))%100000:05d}",
            "candidate_name":  a["measure_name"],   # nombre del primero como sugerencia
            "group_type":      group_type,
            "similarity_avg":  round(avg_sim, 1),
            "dax_hashes":      list(dax_hashes),
            "member_count":    len(group_members),
            "members":         json.dumps([
                {
                    "dataset_id":   m["dataset_id"],
                    "measure_name": m["measure_name"],
                    "dax_hash":     m["dax_hash"],
                    "dax_preview":  m["dax_expression"][:80] + "…"
                                    if len(m.get("dax_expression","")) > 80
                                    else m.get("dax_expression",""),
                }
                for m in group_members
            ]),
            "status":          "pending",   # pending | certified | dismissed | conflict
            "created_at":      __import__("datetime").datetime.utcnow().isoformat(),
        })

    log.info(f"Grupos detectados: {len(groups)}")
    log.info(f"  DUPLICATE: {sum(1 for g in groups if g['group_type']=='DUPLICATE')}")
    log.info(f"  CONFLICT:  {sum(1 for g in groups if g['group_type']=='CONFLICT')}")
    log.info(f"  CANDIDATE: {sum(1 for g in groups if g['group_type']=='CANDIDATE')}")
    return groups


# ─────────────────────────────────────────
# DETECTAR GRUPOS DE DIMENSIONES SIMILARES
# ─────────────────────────────────────────

def detect_dimension_groups(dimensions: list[dict]) -> list[dict]:
    """
    Agrupa tablas de dimensión similares entre distintos .pbix.
    Compara nombres de tabla y número de columnas.
    """
    groups  = []
    visited = set()

    for i, a in enumerate(dimensions):
        if i in visited:
            continue

        group_members = [a]
        visited.add(i)
        a_norm = normalize_name(a["table_name"])

        for j, b in enumerate(dimensions):
            if j <= i or j in visited:
                continue
            # Misma tabla en mismo dataset no cuenta
            if a["dataset_id"] == b["dataset_id"]:
                continue

            b_norm   = normalize_name(b["table_name"])
            name_sim = fuzz.ratio(a_norm, b_norm)

            if name_sim >= SIMILARITY_THRESHOLD:
                group_members.append(b)
                visited.add(j)

        if len(group_members) < 2:
            continue

        # Verificar si las columnas son compatibles
        col_counts = [m["column_count"] for m in group_members]
        col_variance = max(col_counts) - min(col_counts)

        group_type = "CANDIDATE"
        if col_variance == 0:
            group_type = "MATCH"        # Misma cantidad de columnas → probablemente iguales
        elif col_variance > 5:
            group_type = "DIVERGENT"    # Muy distintas — posiblemente diferentes

        groups.append({
            "group_id":       f"dg_{abs(hash(a_norm))%100000:05d}",
            "candidate_name": a["table_name"],
            "group_type":     group_type,
            "col_variance":   col_variance,
            "member_count":   len(group_members),
            "members":        json.dumps([
                {
                    "dataset_id":   m["dataset_id"],
                    "table_name":   m["table_name"],
                    "column_count": m["column_count"],
                    "is_date_table":m["is_date_table"],
                }
                for m in group_members
            ]),
            "status":    "pending",
            "created_at": __import__("datetime").datetime.utcnow().isoformat(),
        })

    log.info(f"Grupos de dimensiones: {len(groups)}")
    return groups


# ─────────────────────────────────────────
# GUARDAR SILVER
# ─────────────────────────────────────────

def save_silver(data: list[dict], layer: str):
    out_dir = pathlib.Path(f"./silver/{layer}")
    out_dir.mkdir(parents=True, exist_ok=True)
    ts       = __import__("datetime").datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = out_dir / f"{ts}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info(f"Silver guardado: {filename}")


# ─────────────────────────────────────────
# PIPELINE SILVER
# ─────────────────────────────────────────

def run_normalization():
    log.info("═══ MIvisualization — Normalización Silver Layer ═══")

    measures   = load_bronze("pbi_measures")
    dimensions = load_bronze("pbi_dimensions")

    if not measures:
        log.warning("Sin medidas en bronze. Ejecutar extract_powerbi.py primero.")
        return

    measure_groups   = detect_measure_groups(measures)
    dimension_groups = detect_dimension_groups(dimensions)

    save_silver(measure_groups,   "metric_candidates")
    save_silver(dimension_groups, "dimension_candidates")

    # Alertas de conflicto para el admin
    conflicts = [g for g in measure_groups if g["group_type"] == "CONFLICT"]
    if conflicts:
        save_silver(conflicts, "conflict_alerts")
        log.warning(f"⚠ {len(conflicts)} conflictos detectados — revisar en MIvisualization UI")

    log.info("═══ Normalización completada ═══")
    log.info(f"  Grupos de métricas    : {len(measure_groups)}")
    log.info(f"  Grupos de dimensiones : {len(dimension_groups)}")
    log.info(f"  Conflictos            : {len(conflicts)}")

    return {
        "metric_groups":    len(measure_groups),
        "dimension_groups": len(dimension_groups),
        "conflicts":        len(conflicts),
    }


if __name__ == "__main__":
    run_normalization()
