"""
MIvisualization — Capacity Calculator
Estima requerimientos de Fabric SKU basado en:
- Tamaño datos (GB en memoria)
- Número de reportes activos
- Usuarios concurrentes
- Refresh frequency
- Query complexity

Mapea a Fabric capacities: F2 (24 CU), F4 (48 CU), F8 (96 CU), F16 (192 CU), F32 (384 CU), etc.
Fórmula: CU_necesarios = (GB * factor_memoria) + (reportes * factor_reporte) + (usuarios * factor_usuario)
"""

import json
import pathlib
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("mivi.capacity")

# Fabric Capacity Reference
FABRIC_CAPACITIES = {
    "F2": {"cu": 24, "price_monthly": 250},
    "F4": {"cu": 48, "price_monthly": 500},
    "F8": {"cu": 96, "price_monthly": 1000},
    "F16": {"cu": 192, "price_monthly": 2000},
    "F32": {"cu": 384, "price_monthly": 4000},
    "F64": {"cu": 768, "price_monthly": 8000},
    "F128": {"cu": 1536, "price_monthly": 16000},
}

# Factores de consumo CU
MEMORY_FACTOR_CU_PER_GB = 12          # 1 GB en memoria ≈ 12 CU por hora de query
REPORT_FACTOR_CU = 8                   # Overhead por reporte (esquema, cache)
USER_CONCURRENT_FACTOR_CU = 15         # CU por usuario concurrente
REFRESH_FACTOR_CU_PER_REFRESH = 20     # CU por refresh (24h cycle)

# Escenarios de usuario
USER_SCENARIOS = {
    "light": {"concurrent_ratio": 0.1, "queries_per_user_day": 20, "avg_query_time_sec": 5},
    "medium": {"concurrent_ratio": 0.2, "queries_per_user_day": 50, "avg_query_time_sec": 8},
    "heavy": {"concurrent_ratio": 0.3, "queries_per_user_day": 100, "avg_query_time_sec": 12},
}

# Ajustes por salud del modelo (post-optimization)
HEALTH_SCORE_ADJUSTMENT = {
    80.0: 1.0,      # Muy saludable, consumo normal
    70.0: 1.15,     # Saludable, +15% consumo
    60.0: 1.35,     # Advertencia, +35% consumo
    50.0: 1.60,     # Crítico, +60% consumo
    0.0: 2.0,       # Muy malo, dobla consumo (doble el cálculo base)
}


# ─────────────────────────────────────────
# CALCULAR CONSUMO CU
# ─────────────────────────────────────────

def estimate_memory_consumption(health_analyses: list[dict]) -> float:
    """
    Suma tamaño estimado en GB de todos los datasets.
    Basado en column count * cardinality de análisis.
    """
    total_gb = 0.0

    for analysis in health_analyses:
        factors = analysis.get("factors", {})
        memory_factor = factors.get("memory_footprint", {})

        # Heurística: health score de memoria → GB
        # Score 100 = 100 MB, Score 50 = 500 MB, Score 10 = 1 GB+
        memory_score = memory_factor.get("score", 50)
        estimated_gb = (100 - memory_score) / 100 * 1.5  # Máx 1.5 GB por dataset

        total_gb += estimated_gb

    return total_gb


def calculate_cu_requirement(
    total_gb: float,
    report_count: int,
    user_count: int,
    user_scenario: str = "medium",
    health_score_avg: float = 70.0,
    refresh_per_day: int = 2
) -> Dict:
    """
    Calcula CU necesarios para un escenario.
    Retorna dict con breakdown por factor y SKU recomendado.
    """

    scenario = USER_SCENARIOS.get(user_scenario, USER_SCENARIOS["medium"])

    # Consumo por memoria (GB)
    concurrent_users = max(1, int(user_count * scenario["concurrent_ratio"]))
    memory_cu = total_gb * MEMORY_FACTOR_CU_PER_GB * (concurrent_users / max(1, user_count))

    # Consumo por reportes
    report_cu = report_count * REPORT_FACTOR_CU

    # Consumo por usuarios concurrentes
    user_cu = concurrent_users * USER_CONCURRENT_FACTOR_CU

    # Consumo por refreshes (24h cycle)
    refresh_cu = report_count * refresh_per_day * REFRESH_FACTOR_CU_PER_REFRESH / 24

    # Total base
    total_cu_base = memory_cu + report_cu + user_cu + refresh_cu

    # Ajuste por salud: mejor salud → menor consumo
    health_adjustment = 1.0
    for threshold in sorted(HEALTH_SCORE_ADJUSTMENT.keys(), reverse=True):
        if health_score_avg >= threshold:
            health_adjustment = HEALTH_SCORE_ADJUSTMENT[threshold]
            break

    total_cu = total_cu_base * health_adjustment

    # Encontrar SKU mínimo que soporte CU
    recommended_sku = None
    for sku_name in ["F2", "F4", "F8", "F16", "F32", "F64", "F128"]:
        if FABRIC_CAPACITIES[sku_name]["cu"] >= total_cu:
            recommended_sku = sku_name
            break

    if not recommended_sku:
        recommended_sku = "F128"  # Máximo

    return {
        "scenario": user_scenario,
        "users": user_count,
        "concurrent_users": concurrent_users,
        "reports": report_count,
        "total_gb": round(total_gb, 2),
        "cu_breakdown": {
            "memory": round(memory_cu, 1),
            "reports": round(report_cu, 1),
            "concurrent_users": round(user_cu, 1),
            "refresh": round(refresh_cu, 1),
        },
        "cu_total_base": round(total_cu_base, 1),
        "health_adjustment": round(health_adjustment, 2),
        "cu_total": round(total_cu, 1),
        "recommended_sku": recommended_sku,
        "sku_cu_capacity": FABRIC_CAPACITIES[recommended_sku]["cu"],
        "price_monthly": FABRIC_CAPACITIES[recommended_sku]["price_monthly"],
        "utilization": round((total_cu / FABRIC_CAPACITIES[recommended_sku]["cu"]) * 100, 1),
    }


# ─────────────────────────────────────────
# OPTIMIZACIÓN Y ROI
# ─────────────────────────────────────────

def calculate_optimization_impact(
    base_scenario: Dict,
    optimized_scenarios: List[Dict],  # Diferentes niveles de optimización
    hourly_cost_per_cu: float = 0.1   # Aproximado
) -> Dict:
    """
    Compara escenarios sin/con optimización y calcula ROI.
    Retorna análisis de savings y payback period.
    """

    base_sku = base_scenario["recommended_sku"]
    base_price = base_scenario["price_monthly"]

    optimizations = []

    for opt in optimized_scenarios:
        opt_sku = opt["recommended_sku"]
        opt_price = opt["price_monthly"]
        monthly_savings = base_price - opt_price
        optimization_effort_hours = opt.get("effort_hours", 40)
        investment_cost = optimization_effort_hours * 150  # $150/hora consulting

        payback_months = investment_cost / max(1, monthly_savings) if monthly_savings > 0 else 999

        optimizations.append({
            "description": opt.get("description", "Optimization"),
            "base_sku": base_sku,
            "optimized_sku": opt_sku,
            "base_cu": base_scenario["cu_total"],
            "optimized_cu": opt["cu_total"],
            "cu_reduction": round(base_scenario["cu_total"] - opt["cu_total"], 1),
            "reduction_percent": round(
                ((base_scenario["cu_total"] - opt["cu_total"]) / base_scenario["cu_total"]) * 100, 1
            ),
            "base_price_monthly": base_price,
            "optimized_price_monthly": opt_price,
            "monthly_savings": monthly_savings,
            "annual_savings": monthly_savings * 12,
            "investment_cost": investment_cost,
            "payback_months": round(payback_months, 1),
            "effort_hours": optimization_effort_hours,
        })

    return {
        "base_scenario": base_scenario,
        "optimizations": optimizations,
    }


# ─────────────────────────────────────────
# COMPARAR ESCENARIOS DE USUARIO
# ─────────────────────────────────────────

def compare_user_scenarios(
    total_gb: float,
    report_count: int,
    health_score_avg: float,
    user_scenarios_to_test: List[str] = ["light", "medium", "heavy"]
) -> Dict:
    """
    Calcula CU requirement para cada escenario de usuario.
    Útil para planning: "¿Qué pasa si crecemos a 100 usuarios?"
    """

    scenarios_result = {}

    for user_count in [20, 50, 100, 200]:
        scenario_results = {}
        for scenario_name in user_scenarios_to_test:
            result = calculate_cu_requirement(
                total_gb,
                report_count,
                user_count,
                user_scenario=scenario_name,
                health_score_avg=health_score_avg,
            )
            scenario_results[scenario_name] = result

        scenarios_result[f"{user_count}_users"] = scenario_results

    return scenarios_result


# ─────────────────────────────────────────
# LOAD ANALYSIS & GENERATE REPORT
# ─────────────────────────────────────────

def load_health_analysis(analysis_file: Optional[str] = None) -> list[dict]:
    """Carga el análisis de salud más reciente o específico."""
    if analysis_file:
        with open(analysis_file, encoding="utf-8") as f:
            return json.load(f)

    # Buscar el más reciente
    silver_dir = pathlib.Path("./silver/health_analysis")
    if not silver_dir.exists():
        log.warning("No health analysis found. Run analyze_health.py first.")
        return []

    files = sorted(silver_dir.glob("*.json"), reverse=True)
    if not files:
        return []

    with open(files[0], encoding="utf-8") as f:
        return json.load(f)


def generate_capacity_report(health_analyses: list[dict]) -> Dict:
    """
    Genera reporte completo de capacidad.
    Incluye: current state, optimized scenarios, ROI analysis.
    """

    if not health_analyses:
        return {"error": "No health analyses found"}

    # Métricas agregadas
    report_count = len(health_analyses)
    avg_health_score = sum(a["health_score"] for a in health_analyses) / report_count
    total_gb = estimate_memory_consumption(health_analyses)
    critical_count = sum(1 for a in health_analyses if a["severity"] == "CRÍTICO")

    # Escenario actual (sin optimización, usuario_count = 50)
    current_scenario = calculate_cu_requirement(
        total_gb,
        report_count,
        user_count=50,
        user_scenario="medium",
        health_score_avg=avg_health_score,
    )

    # Escenarios post-optimización (diferentes niveles)
    # Nivel 1: Optimización básica (DAX + aggregations) → health +15
    opt_level1 = calculate_cu_requirement(
        total_gb * 0.85,  # 15% reducción de tamaño
        report_count,
        user_count=50,
        user_scenario="medium",
        health_score_avg=min(100, avg_health_score + 15),
    )
    opt_level1["description"] = "Básica (DAX + Agg)"
    opt_level1["effort_hours"] = 40

    # Nivel 2: Optimización intermedia (archival + denorm) → health +25
    opt_level2 = calculate_cu_requirement(
        total_gb * 0.70,  # 30% reducción
        report_count,
        user_count=50,
        user_scenario="medium",
        health_score_avg=min(100, avg_health_score + 25),
    )
    opt_level2["description"] = "Intermedia (Archival + Denorm)"
    opt_level2["effort_hours"] = 75

    # Nivel 3: Optimización completa (full refactor) → health +40
    opt_level3 = calculate_cu_requirement(
        total_gb * 0.50,  # 50% reducción
        report_count,
        user_count=50,
        user_scenario="medium",
        health_score_avg=min(100, avg_health_score + 40),
    )
    opt_level3["description"] = "Completa (Full Refactor)"
    opt_level3["effort_hours"] = 150

    # ROI Analysis
    optimization_analysis = calculate_optimization_impact(
        current_scenario,
        [opt_level1, opt_level2, opt_level3],
    )

    # Escenarios de crecimiento
    growth_scenarios = compare_user_scenarios(
        total_gb, report_count, avg_health_score
    )

    return {
        "report_metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "report_count": report_count,
            "avg_health_score": round(avg_health_score, 1),
            "critical_reports": critical_count,
            "total_memory_gb": round(total_gb, 2),
        },
        "current_scenario": current_scenario,
        "optimization_analysis": optimization_analysis,
        "growth_scenarios": growth_scenarios,
    }


# ─────────────────────────────────────────
# SAVE REPORT
# ─────────────────────────────────────────

def save_capacity_report(report: Dict):
    """Guarda reporte en silver layer."""
    out_dir = pathlib.Path("./silver/capacity_planning")
    out_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = out_dir / f"capacity_report_{ts}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    log.info(f"Capacity report guardado: {filename}")
    return str(filename)


# ─────────────────────────────────────────
# PIPELINE
# ─────────────────────────────────────────

def run_capacity_planning():
    """
    Pipeline de planificación de capacidad.
    Ejecutar: python capacity_calculator.py
    """
    log.info("═══ MIvisualization — Capacity Planning ═══")

    health_analyses = load_health_analysis()
    if not health_analyses:
        log.warning("No health analyses found. Run analyze_health.py first.")
        return

    report = generate_capacity_report(health_analyses)
    save_capacity_report(report)

    # Resumen en logs
    current = report["current_scenario"]
    opt1 = report["optimization_analysis"]["optimizations"][0]

    log.info("═══ Capacity Planning Results ═══")
    log.info(f"Reporte actual:")
    log.info(f"  {current['reports']} reportes → {current['recommended_sku']} ({current['cu_total']} CU)")
    log.info(f"  ${current['price_monthly']}/mes")
    log.info(f"Optimización básica:")
    log.info(f"  {opt1['optimized_sku']} ({opt1['optimized_cu']} CU)")
    log.info(f"  Ahorro: ${opt1['monthly_savings']}/mes (-{opt1['reduction_percent']}%)")
    log.info(f"  ROI: {opt1['payback_months']} meses")

    return report


if __name__ == "__main__":
    run_capacity_planning()
