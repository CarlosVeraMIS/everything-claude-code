"""
MIvisualization — Power BI Metadata Extractor
Extrae medidas, dimensiones y jerarquías de todos los .pbix
publicados en un Fabric Workspace y los guarda en OneLake (bronze layer).

Requisitos:
    pip install requests pandas deltalake python-dotenv rapidfuzz

Variables de entorno (.env):
    AZURE_TENANT_ID
    AZURE_CLIENT_ID
    AZURE_CLIENT_SECRET
    PBI_WORKSPACE_ID
    ONELAKE_ACCOUNT_NAME   (ej: mivisualizationdev)
    ONELAKE_WORKSPACE_ID
"""

import os
import json
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional
import requests
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("mivi.extractor")

# ─────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────

TENANT_ID      = os.getenv("AZURE_TENANT_ID")
CLIENT_ID      = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET  = os.getenv("AZURE_CLIENT_SECRET")
WORKSPACE_ID   = os.getenv("PBI_WORKSPACE_ID")

PBI_BASE       = "https://api.powerbi.com/v1.0/myorg"
AUTHORITY      = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
SCOPE          = "https://analysis.windows.net/powerbi/api/.default"


# ─────────────────────────────────────────
# 1. AUTENTICACIÓN
# ─────────────────────────────────────────

def get_access_token() -> str:
    """Obtiene token OAuth2 via client credentials (app registrada en Azure AD)."""
    resp = requests.post(AUTHORITY, data={
        "grant_type":    "client_credentials",
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "scope":         SCOPE,
    }, timeout=30)
    resp.raise_for_status()
    token = resp.json()["access_token"]
    log.info("Token obtenido correctamente")
    return token


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─────────────────────────────────────────
# 2. LISTAR DATASETS DEL WORKSPACE
# ─────────────────────────────────────────

def get_datasets(token: str) -> list[dict]:
    """
    Retorna todos los datasets (modelos Import) del workspace.
    Cada dataset corresponde a un .pbix publicado.
    """
    url  = f"{PBI_BASE}/groups/{WORKSPACE_ID}/datasets"
    resp = requests.get(url, headers=headers(token), timeout=30)
    resp.raise_for_status()

    datasets = resp.json().get("value", [])
    log.info(f"Datasets encontrados: {len(datasets)}")

    # Solo Import mode (los Direct Query no tienen modelo embebido extraíble igual)
    import_datasets = [
        d for d in datasets
        if d.get("isRefreshable", False)  # proxy de Import mode
    ]
    log.info(f"Datasets Import mode: {len(import_datasets)}")
    return import_datasets


# ─────────────────────────────────────────
# 3. EXTRAER MEDIDAS (MEASURES)
# ─────────────────────────────────────────

def get_measures(token: str, dataset_id: str) -> list[dict]:
    """
    Extrae TODAS las medidas DAX del dataset.
    Endpoint: GET /datasets/{id}/tables → dentro de cada tabla busca 'measures'
    """
    url  = f"{PBI_BASE}/datasets/{dataset_id}/tables"
    resp = requests.get(url, headers=headers(token), timeout=30)
    resp.raise_for_status()

    tables   = resp.json().get("value", [])
    measures = []

    for table in tables:
        table_name = table.get("name", "")
        for m in table.get("measures", []):
            dax = m.get("expression", "")
            measures.append({
                "dataset_id":    dataset_id,
                "table_name":    table_name,
                "measure_name":  m.get("name", ""),
                "dax_expression": dax,
                "dax_hash":      hashlib.md5(dax.strip().lower().encode()).hexdigest(),
                "description":   m.get("description"),
                "format_string": m.get("formatString"),
                "is_hidden":     m.get("isHidden", False),
                "extracted_at":  datetime.now(timezone.utc).isoformat(),
            })

    log.info(f"  Dataset {dataset_id[:8]}… → {len(measures)} medidas")
    return measures


# ─────────────────────────────────────────
# 4. EXTRAER DIMENSIONES (TABLAS + COLUMNAS)
# ─────────────────────────────────────────

def get_dimensions(token: str, dataset_id: str) -> list[dict]:
    """
    Extrae tablas de dimensión con sus columnas y tipos de dato.
    Excluye la tabla de hechos principal (Fact_*) — solo dimensiones.
    """
    url  = f"{PBI_BASE}/datasets/{dataset_id}/tables"
    resp = requests.get(url, headers=headers(token), timeout=30)
    resp.raise_for_status()

    tables     = resp.json().get("value", [])
    dimensions = []

    for table in tables:
        table_name = table.get("name", "")

        # Clasificar: si el nombre empieza con Fact_ o contiene solo medidas, omitir
        is_fact = table_name.lower().startswith("fact") or table_name.lower().startswith("fct")
        columns = table.get("columns", [])
        has_measures = len(table.get("measures", [])) > 0

        # Incluir si es dimensión (no fact) o si tiene columnas (no solo medidas)
        if is_fact and not columns:
            continue

        col_summary = [
            {
                "name":        c.get("name"),
                "data_type":   c.get("dataType"),
                "is_hidden":   c.get("isHidden", False),
                "is_key":      c.get("summarizeBy") == "none",
                "sort_by":     c.get("sortByColumn"),
                "description": c.get("description"),
            }
            for c in columns
            if not c.get("isHidden", False)  # Solo columnas visibles
        ]

        dimensions.append({
            "dataset_id":    dataset_id,
            "table_name":    table_name,
            "is_fact_table": is_fact,
            "is_date_table": table.get("isHidden", False) is False and "fecha" in table_name.lower()
                             or "date" in table_name.lower() or "time" in table_name.lower()
                             or "calendar" in table_name.lower(),
            "column_count":  len(col_summary),
            "columns":       json.dumps(col_summary),       # serializado para Delta
            "has_measures":  has_measures,
            "extracted_at":  datetime.now(timezone.utc).isoformat(),
        })

    log.info(f"  Dataset {dataset_id[:8]}… → {len(dimensions)} tablas")
    return dimensions


# ─────────────────────────────────────────
# 5. EXTRAER JERARQUÍAS
# ─────────────────────────────────────────

def get_hierarchies(token: str, dataset_id: str) -> list[dict]:
    """
    Extrae jerarquías definidas en el modelo (Año→Mes→Día, Cat→SubCat→Prod, etc.)
    Las jerarquías son fundamentales para entender cómo el usuario filtra datos.
    """
    url  = f"{PBI_BASE}/datasets/{dataset_id}/tables"
    resp = requests.get(url, headers=headers(token), timeout=30)
    resp.raise_for_status()

    tables      = resp.json().get("value", [])
    hierarchies = []

    for table in tables:
        for h in table.get("hierarchies", []):
            levels = [
                {"ordinal": lvl.get("ordinal"), "column": lvl.get("column", {}).get("name")}
                for lvl in sorted(h.get("levels", []), key=lambda x: x.get("ordinal", 0))
            ]
            hierarchies.append({
                "dataset_id":      dataset_id,
                "table_name":      table.get("name"),
                "hierarchy_name":  h.get("name"),
                "levels":          json.dumps(levels),
                "levels_path":     " → ".join(lvl["column"] for lvl in levels if lvl["column"]),
                "extracted_at":    datetime.now(timezone.utc).isoformat(),
            })

    log.info(f"  Dataset {dataset_id[:8]}… → {len(hierarchies)} jerarquías")
    return hierarchies


# ─────────────────────────────────────────
# 6. SCANNER API — escaneo masivo del workspace
# ─────────────────────────────────────────

def scan_workspace(token: str) -> Optional[dict]:
    """
    Scanner API: escaneo profundo del workspace completo.
    Retorna metadata de datasets, reportes, páginas y sensitivity labels.
    Requiere permiso: Tenant.Read.All (Admin API).
    """
    admin_base = "https://api.powerbi.com/v1.0/myorg/admin"

    # Paso 1: disparar el escaneo
    scan_resp = requests.post(
        f"{admin_base}/workspaces/getInfo",
        headers=headers(token),
        params={"lineage": "true", "datasourceDetails": "true",
                "datasetSchema": "true", "datasetExpressions": "true"},
        json={"workspaces": [WORKSPACE_ID]},
        timeout=60,
    )

    if scan_resp.status_code == 403:
        log.warning("Scanner API requiere rol de Admin de tenant. Usando REST API básica.")
        return None

    scan_resp.raise_for_status()
    scan_id = scan_resp.json().get("id")
    log.info(f"Escaneo iniciado: {scan_id}")

    # Paso 2: esperar resultado (polling simple)
    import time
    for attempt in range(10):
        time.sleep(3)
        status_resp = requests.get(
            f"{admin_base}/workspaces/scanStatus/{scan_id}",
            headers=headers(token), timeout=30,
        )
        status_resp.raise_for_status()
        status = status_resp.json().get("status")
        log.info(f"  Estado escaneo: {status} (intento {attempt+1})")
        if status == "Succeeded":
            break
    else:
        log.warning("Escaneo tardó demasiado, usando datos parciales.")
        return None

    # Paso 3: obtener resultado
    result_resp = requests.get(
        f"{admin_base}/workspaces/scanResult/{scan_id}",
        headers=headers(token), timeout=60,
    )
    result_resp.raise_for_status()
    log.info("Scanner API completado exitosamente")
    return result_resp.json()


# ─────────────────────────────────────────
# 7. GUARDAR EN BRONZE LAYER (JSON local / OneLake)
# ─────────────────────────────────────────

def save_bronze(data: list[dict], layer: str, dataset_id: str) -> str:
    """
    Guarda los datos extraídos en el bronze layer.
    Por ahora: JSON local en ./bronze/{layer}/
    En producción: reemplazar por deltalake write a OneLake.
    """
    import pathlib
    out_dir = pathlib.Path(f"./bronze/{layer}")
    out_dir.mkdir(parents=True, exist_ok=True)

    ts       = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = out_dir / f"{dataset_id[:8]}_{ts}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    log.info(f"  Guardado: {filename} ({len(data)} registros)")
    return str(filename)


# Descomenta este bloque para escribir directo a OneLake via Delta Lake:
#
# from deltalake import write_deltalake
# import pandas as pd
#
# def save_to_onelake(data: list[dict], table_path: str):
#     """
#     Escribe a OneLake en formato Delta Table.
#     table_path: abfss://workspace@account.dfs.fabric.microsoft.com/bronze/pbi_measures
#     """
#     df = pd.DataFrame(data)
#     write_deltalake(
#         table_path,
#         df,
#         mode="append",
#         storage_options={
#             "account_name":  os.getenv("ONELAKE_ACCOUNT_NAME"),
#             "tenant_id":     TENANT_ID,
#             "client_id":     CLIENT_ID,
#             "client_secret": CLIENT_SECRET,
#         }
#     )
#     log.info(f"OneLake → {table_path}: {len(data)} registros escritos")


# ─────────────────────────────────────────
# 8. PIPELINE PRINCIPAL
# ─────────────────────────────────────────

def run_extraction():
    """
    Pipeline completo de extracción para un workspace.
    Ejecutar: python extract_powerbi.py
    """
    log.info("═══ MIvisualization — Extracción de metadata Power BI ═══")

    # Auth
    token = get_access_token()

    # Intentar Scanner API primero (más completo)
    scan_result = scan_workspace(token)
    if scan_result:
        scan_path = save_bronze([scan_result], "scanner_output", WORKSPACE_ID)
        log.info(f"Scanner API guardado en: {scan_path}")

    # Extracción por dataset (siempre disponible)
    datasets = get_datasets(token)

    all_measures    = []
    all_dimensions  = []
    all_hierarchies = []
    summary         = []

    for ds in datasets:
        ds_id   = ds["id"]
        ds_name = ds.get("name", ds_id)
        log.info(f"Procesando: {ds_name}")

        measures    = get_measures(token, ds_id)
        dimensions  = get_dimensions(token, ds_id)
        hierarchies = get_hierarchies(token, ds_id)

        # Enriquecer con metadata del dataset
        ds_meta = {
            "dataset_id":          ds_id,
            "dataset_name":        ds_name,
            "created_date":        ds.get("createdDate"),
            "is_refreshable":      ds.get("isRefreshable"),
            "configured_by":       ds.get("configuredBy"),
            "target_storage_mode": ds.get("targetStorageMode", "Import"),
            "workspace_id":        WORKSPACE_ID,
            "extracted_at":        datetime.now(timezone.utc).isoformat(),
        }

        all_measures.extend(measures)
        all_dimensions.extend(dimensions)
        all_hierarchies.extend(hierarchies)

        summary.append({
            **ds_meta,
            "measure_count":    len(measures),
            "dimension_count":  len(dimensions),
            "hierarchy_count":  len(hierarchies),
        })

    # Guardar en bronze
    if all_measures:
        save_bronze(all_measures, "pbi_measures", WORKSPACE_ID)
    if all_dimensions:
        save_bronze(all_dimensions, "pbi_dimensions", WORKSPACE_ID)
    if all_hierarchies:
        save_bronze(all_hierarchies, "pbi_hierarchies", WORKSPACE_ID)

    save_bronze(summary, "pbi_datasets", WORKSPACE_ID)

    # Resumen final
    log.info("═══ Extracción completada ═══")
    log.info(f"  Datasets procesados : {len(datasets)}")
    log.info(f"  Medidas extraídas   : {len(all_measures)}")
    log.info(f"  Tablas extraídas    : {len(all_dimensions)}")
    log.info(f"  Jerarquías extraídas: {len(all_hierarchies)}")

    return {
        "datasets":    len(datasets),
        "measures":    len(all_measures),
        "dimensions":  len(all_dimensions),
        "hierarchies": len(all_hierarchies),
    }


if __name__ == "__main__":
    run_extraction()
