"""
MIvisualization — Health Check: Quality & Optimization Analysis
Lee metadatos de Bronze layer y calcula Health Score por reporte.

Modelo de salud (8 factores ponderados):
  - Memory footprint (30%)  : tamaño .pbix + card. / densidad datos
  - Data density (20%)      : filas totales / total columnas (sparseness)
  - DAX efficiency (20%)    : anti-patrones, iterators, no-summary measures
  - Query perf (15%)        : complejidad jerarquías + filter context
  - Refresh duration (10%)  : time estimado basado en cardinality
  - RLS complexity (5%)     : número reglas + cruzadas vs simples
"""

import json
import pathlib
import logging
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional, Dict, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("mivi.health")

# Umbrales para detección de problemas
MEMORY_THRESHOLD_MB = 256      # Rojo si > 256 MB estimado
DENSITY_THRESHOLD = 0.15       # Rojo si data density < 15% (muy sparse)
REFRESH_THRESHOLD_MIN = 30     # Rojo si refresh > 30 min
RLS_COMPLEXITY_HIGH = 5        # Amarillo si > 5 reglas
DAX_EFFICIENCY_THRESHOLD = 0.7 # Rojo si score < 0.7

# Patrones DAX ineficientes
DAX_ANTIPATTERNS = [
    (r"CALCULATE\s*\(\s*[A-Za-z_]\w*\s*,\s*FILTER", "CALCULATE con FILTER anidado (usar ALL/ALLSELECTED)"),
    (r"SUMX\s*\(\s*'[^']+'\s*,\s*(?!CALCULATE)", "SUMX sin CALCULATE (context bloatware)"),
    (r"EVALUATE\s+ROW", "EVALUATE en medida (anti-patrón)"),
    (r"VAR\s+\w+\s*=\s*(?:FILTER|CALCULATETABLE).*\n.*ITERATE", "Variable con iterator (DAX ineficiente)"),
    (r"HASONEVALUE\s*\(\s*\[", "HASONEVALUE (deprecado, usar ISINSCOPE)"),
]


# ─────────────────────────────────────────
# CARGAR METADATA DE BRONZE
# ─────────────────────────────────────────

def load_bronze(layer: str) -> list[dict]:
    """Carga JSON de bronze layer."""
    bronze_dir = pathlib.Path(f"./bronze/{layer}")
    if not bronze_dir.exists():
        return []
    records = []
    for f in bronze_dir.glob("*.json"):
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
            if isinstance(data, list):
                records.extend(data)
    return records


# ─────────────────────────────────────────
# 1. MEMORY FOOTPRINT SCORE (30%)
# ─────────────────────────────────────────

def estimate_memory_footprint(
    dimensions: list[dict],
    measures_count: int,
    avg_row_count: int = 1000000
) -> tuple[float, str]:
    """
    Estima tamaño en memoria del modelo.
    Heurística: (columnas * cardinality * bytes_por_tipo) / 1024 / 1024
    Retorna: (score 0-1, reasoning)
    """
    total_cols = sum(d["column_count"] for d in dimensions)

    # Estimar cardinality promedio
    avg_cardinality = min(avg_row_count, 10000000)

    # Bytes estimados (varchar ~50b, int ~4b, date ~4b)
    estimated_bytes = total_cols * avg_cardinality * 8  # promedio ponderado
    estimated_mb = estimated_bytes / 1024 / 1024

    # Scoring: 100 MB = 1.0, 500 MB = 0.5, > 500 MB = 0.2 (rojo)
    if estimated_mb < 100:
        score = 1.0
    elif estimated_mb < 300:
        score = 0.8
    elif estimated_mb < 500:
        score = 0.5
    else:
        score = 0.2

    reason = f"~{estimated_mb:.0f}MB estimado"
    if estimated_mb > MEMORY_THRESHOLD_MB:
        reason += " ⚠️ CRÍTICO"

    return score, reason


# ─────────────────────────────────────────
# 2. DATA DENSITY SCORE (20%)
# ─────────────────────────────────────────

def calculate_data_density(dimensions: list[dict], avg_rows: int = 1000000) -> tuple[float, str]:
    """
    Data density = filas_totales / (columnas * max_cardinality)
    Alta density = muchos datos en tabla pequeña (Vertipaq comprime bien)
    Baja density = muchas columnas, pocos datos (sparse = ineficiente)
    """
    if not dimensions:
        return 1.0, "Sin tablas"

    total_cols = sum(d["column_count"] for d in dimensions)
    if total_cols == 0:
        return 1.0, "Sin columnas"

    # Asumir cardinality max por tabla = 10% de avg_rows
    max_cardinality = int(avg_rows * 0.1)

    # Density = 1 / (cols * avg_cardinality_factor)
    density = avg_rows / (total_cols * max_cardinality) if total_cols > 0 else 0.5

    # Scoring
    if density > 0.3:
        score = 1.0
    elif density > 0.15:
        score = 0.7
    elif density > 0.05:
        score = 0.4
    else:
        score = 0.1

    reason = f"Densidad: {density:.2%}"
    if density < DENSITY_THRESHOLD:
        reason += " ⚠️ Sparse"

    return score, reason


# ─────────────────────────────────────────
# 3. DAX EFFICIENCY SCORE (20%)
# ─────────────────────────────────────────

def analyze_dax_efficiency(measures: list[dict]) -> tuple[float, str, List[str]]:
    """
    Escanea todas las medidas para detectar anti-patrones DAX.
    Retorna: (score 0-1, reasoning, [list de problemas])
    """
    if not measures:
        return 1.0, "Sin medidas", []

    issues = []
    antipattern_count = 0

    for measure in measures:
        dax = measure.get("dax_expression", "")
        if not dax:
            continue

        for pattern, description in DAX_ANTIPATTERNS:
            if re.search(pattern, dax, re.IGNORECASE | re.MULTILINE):
                issues.append(f"{measure['measure_name']}: {description}")
                antipattern_count += 1

    # Scoring: -0.15 por cada anti-patrón detectado
    score = max(0.1, 1.0 - (antipattern_count * 0.15))

    reason = f"{len(measures)} medidas analizadas, {antipattern_count} anti-patrones"
    if antipattern_count > 0:
        reason += " ⚠️"

    return score, reason, issues[:5]  # Top 5 issues


# ─────────────────────────────────────────
# 4. QUERY PERFORMANCE SCORE (15%)
# ─────────────────────────────────────────

def analyze_query_complexity(
    dimensions: list[dict],
    hierarchies: list[dict]
) -> tuple[float, str]:
    """
    Estima complejidad de queries basada en jerarquías y RLS.
    Más jerarquías = más filter context complexity.
    """
    if not dimensions:
        return 1.0, "Sin dimensiones"

    # Contar jerarquías por tabla
    hierarchy_count = len(hierarchies)
    avg_hier_per_table = hierarchy_count / len(dimensions) if dimensions else 0

    # Scoring: 0 hier = 1.0, 5+ hier = 0.5
    if avg_hier_per_table < 1:
        score = 1.0
    elif avg_hier_per_table < 3:
        score = 0.8
    elif avg_hier_per_table < 5:
        score = 0.6
    else:
        score = 0.4

    reason = f"{hierarchy_count} jerarquías, {avg_hier_per_table:.1f} promedio/tabla"
    return score, reason


# ─────────────────────────────────────────
# 5. REFRESH DURATION SCORE (10%)
# ─────────────────────────────────────────

def estimate_refresh_duration(dimensions: list[dict]) -> tuple[float, str]:
    """
    Estima duración refresh basada en número de tablas y cardinality.
    Heurística: 1 seg por 1M filas + 5 seg overhead.
    """
    if not dimensions:
        return 1.0, "Sin tablas"

    # Asumir 1M filas promedio por tabla
    estimated_secs = len(dimensions) * (1 + 5)  # 5 seg por tabla
    estimated_mins = estimated_secs / 60

    # Scoring: 5 min = 1.0, 15 min = 0.7, 30+ min = 0.2 (rojo)
    if estimated_mins < 5:
        score = 1.0
    elif estimated_mins < 15:
        score = 0.7
    elif estimated_mins < 30:
        score = 0.4
    else:
        score = 0.1

    reason = f"~{estimated_mins:.0f} min estimado"
    if estimated_mins > REFRESH_THRESHOLD_MIN:
        reason += " ⚠️ Lento"

    return score, reason


# ─────────────────────────────────────────
# 6. RLS COMPLEXITY SCORE (5%)
# ─────────────────────────────────────────

def analyze_rls_complexity(measures: list[dict]) -> tuple[float, str]:
    """
    Detecta reglas RLS (USERIDENTITY, USERNAME) en DAX.
    Múltiples reglas RLS = performance penalty.
    """
    rls_measures = []
    for m in measures:
        dax = m.get("dax_expression", "")
        if re.search(r"USERIDENTITY|USERNAME|USERPRINCIPALNAME", dax, re.IGNORECASE):
            rls_measures.append(m["measure_name"])

    rls_count = len(rls_measures)

    # Scoring
    if rls_count == 0:
        score = 1.0
    elif rls_count < 3:
        score = 0.9
    elif rls_count < 5:
        score = 0.7
    else:
        score = 0.4

    reason = f"{rls_count} medidas con RLS"
    if rls_count > RLS_COMPLEXITY_HIGH:
        reason += " ⚠️ Complejo"

    return score, reason


# ─────────────────────────────────────────
# CALCULAR HEALTH SCORE GLOBAL
# ─────────────────────────────────────────

def calculate_health_score(
    dataset_id: str,
    dataset_name: str,
    measures: list[dict],
    dimensions: list[dict],
    hierarchies: list[dict]
) -> dict:
    """
    Calcula Health Score ponderado (0-100) combinando 6 factores.
    Retorna objeto con score, issues, y recomendaciones.
    """

    # Calcular cada factor
    memory_score, memory_reason = estimate_memory_footprint(dimensions)
    density_score, density_reason = calculate_data_density(dimensions)
    dax_score, dax_reason, dax_issues = analyze_dax_efficiency(measures)
    perf_score, perf_reason = analyze_query_complexity(dimensions, hierarchies)
    refresh_score, refresh_reason = estimate_refresh_duration(dimensions)
    rls_score, rls_reason = analyze_rls_complexity(measures)

    # Ponderación
    health_score = (
        (memory_score * 0.30) +
        (density_score * 0.20) +
        (dax_score * 0.20) +
        (perf_score * 0.15) +
        (refresh_score * 0.10) +
        (rls_score * 0.05)
    ) * 100

    # Determinar severidad y recomendaciones
    issues = []
    if memory_score < 0.7:
        issues.append("Memory footprint alto — considerar agregación o archival")
    if density_score < 0.5:
        issues.append("Datos muy sparse — normalizar estructura o eliminar columnas innecesarias")
    if dax_score < 0.7:
        issues.append("DAX ineficiente — revisar anti-patrones")
    if rls_score < 0.8:
        issues.append("RLS complejo — puede afectar performance en queries")

    severity = "CRÍTICO" if health_score < 50 else "ADVERTENCIA" if health_score < 70 else "OK"

    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset_name,
        "health_score": round(health_score, 1),
        "severity": severity,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
        "factors": {
            "memory_footprint": {
                "score": round(memory_score * 100, 1),
                "weight": "30%",
                "reason": memory_reason,
            },
            "data_density": {
                "score": round(density_score * 100, 1),
                "weight": "20%",
                "reason": density_reason,
            },
            "dax_efficiency": {
                "score": round(dax_score * 100, 1),
                "weight": "20%",
                "reason": dax_reason,
                "top_issues": dax_issues,
            },
            "query_performance": {
                "score": round(perf_score * 100, 1),
                "weight": "15%",
                "reason": perf_reason,
            },
            "refresh_duration": {
                "score": round(refresh_score * 100, 1),
                "weight": "10%",
                "reason": refresh_reason,
            },
            "rls_complexity": {
                "score": round(rls_score * 100, 1),
                "weight": "5%",
                "reason": rls_reason,
            },
        },
        "issues": issues,
        "metadata": {
            "measure_count": len(measures),
            "dimension_count": len(dimensions),
            "hierarchy_count": len(hierarchies),
        }
    }


# ─────────────────────────────────────────
# GUARDAR ANÁLISIS
# ─────────────────────────────────────────

def save_analysis(analyses: list[dict]):
    """Guarda resultados en silver layer."""
    out_dir = pathlib.Path("./silver/health_analysis")
    out_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = out_dir / f"health_scores_{ts}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(analyses, f, ensure_ascii=False, indent=2)

    log.info(f"Análisis guardado: {filename}")
    return str(filename)


# ─────────────────────────────────────────
# PIPELINE PRINCIPAL
# ─────────────────────────────────────────

def run_health_analysis():
    """
    Analiza salud y optimización de todos los datasets del workspace.
    Ejecutar: python analyze_health.py
    """
    log.info("═══ MIvisualization — Health Check Analysis ═══")

    datasets = load_bronze("pbi_datasets")
    measures_all = load_bronze("pbi_measures")
    dimensions_all = load_bronze("pbi_dimensions")
    hierarchies_all = load_bronze("pbi_hierarchies")

    if not datasets:
        log.warning("Sin datasets en bronze. Ejecutar extract_powerbi.py primero.")
        return

    analyses = []
    critical_count = 0

    for ds in datasets:
        ds_id = ds["dataset_id"]
        ds_name = ds.get("dataset_name", ds_id)

        # Filtrar metadata por dataset
        measures = [m for m in measures_all if m.get("dataset_id") == ds_id]
        dimensions = [d for d in dimensions_all if d.get("dataset_id") == ds_id]
        hierarchies = [h for h in hierarchies_all if h.get("dataset_id") == ds_id]

        # Calcular salud
        analysis = calculate_health_score(ds_id, ds_name, measures, dimensions, hierarchies)
        analyses.append(analysis)

        log.info(f"{ds_name}: {analysis['health_score']}/100 ({analysis['severity']})")

        if analysis["severity"] == "CRÍTICO":
            critical_count += 1
            for issue in analysis["issues"]:
                log.warning(f"  ⚠️ {issue}")

    # Guardar resultados
    save_analysis(analyses)

    # Resumen
    log.info("═══ Análisis completado ═══")
    log.info(f"  Datasets analizados: {len(datasets)}")
    log.info(f"  Health promedio: {sum(a['health_score'] for a in analyses) / len(analyses):.1f}/100")
    log.info(f"  Críticos: {critical_count}")

    return {
        "datasets_analyzed": len(datasets),
        "avg_health_score": round(sum(a["health_score"] for a in analyses) / len(analyses), 1),
        "critical": critical_count,
        "analyses": analyses,
    }


if __name__ == "__main__":
    run_health_analysis()
