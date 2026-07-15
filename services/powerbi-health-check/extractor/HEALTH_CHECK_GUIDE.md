# MIvisualization — Health Check Service

Servicio de análisis de calidad y optimización de reportes Power BI. Incluye extracción de metadata, análisis de salud, y recomendaciones de capacity planning en Fabric.

## 📋 Pipeline Completo

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. EXTRACCIÓN (extract_powerbi.py)                              │
│    Lee metadata de todos los .pbix en el workspace               │
│    → Bronze layer: raw JSON (measures, dimensions, hierarchies)  │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ 2. NORMALIZACIÓN (normalize_silver.py)                          │
│    Agrupa medidas/dimensiones similares, detecta duplicados     │
│    → Silver layer: candidate groups + conflicts                 │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ 3. ANÁLISIS DE SALUD (analyze_health.py) ← NUEVO               │
│    Calcula Health Score 0-100 basado en 6 factores             │
│    → Silver layer: health_analysis (metrics + issues)           │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ 4. CAPACITY PLANNING (capacity_calculator.py) ← NUEVO          │
│    Estima Fabric SKU requerido + ROI de optimización           │
│    → Silver layer: capacity_planning (scenarios + pricing)      │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ 5. PORTAL UI (powerbi-health-check-portal.html)                 │
│    Dashboard interactivo con health scores, reportes en riesgo,  │
│    matriz effort/impact, capacity calculator, roadmap           │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisitos
```bash
pip install -r requirements.txt
```

### Ejecutar Pipeline Completo

```bash
# 1. Extraer metadata (requiere .env configurado con Azure credentials)
python extract_powerbi.py

# 2. Normalizar (detectar duplicados y conflictos)
python normalize_silver.py

# 3. Analizar salud de cada reporte
python analyze_health.py

# 4. Generar recomendaciones de capacity
python capacity_calculator.py

# 5. Abrir portal en navegador
open powerbi-health-check-portal.html
```

## 📊 Modelo de Health Score

Health Score (0-100) combina 6 factores:

| Factor | Peso | Qué mide | Umbral crítico |
|--------|------|---------|-----------------|
| **Memory Footprint** | 30% | Tamaño .pbix en memoria (GB) | >256 MB |
| **Data Density** | 20% | Sparseness: filas/(cols * card) | <15% |
| **DAX Efficiency** | 20% | Anti-patrones DAX detectados | Score <0.7 |
| **Query Performance** | 15% | Complejidad jerarquías | 5+ hierarchies |
| **Refresh Duration** | 10% | Tiempo estimado refresh | >30 min |
| **RLS Complexity** | 5% | Número reglas RLS | >5 rules |

**Cálculo:**
```
Health Score = (F1×0.30 + F2×0.20 + F3×0.20 + F4×0.15 + F5×0.10 + F6×0.05) × 100
```

**Severidad:**
- 🟢 **OK** (≥70): No requiere acción inmediata
- 🟡 **ADVERTENCIA** (50-69): Revisar optimizaciones menores
- 🔴 **CRÍTICO** (<50): Optimización urgente antes de migrar a Fabric

### Anti-patrones DAX Detectados

El análisis identifica automáticamente:

1. `CALCULATE` con `FILTER` anidado → usar `ALL/ALLSELECTED`
2. `SUMX` sin `CALCULATE` → context bloatware
3. `EVALUATE` en medida → no soportado
4. Variables con iterators → DAX ineficiente
5. `HASONEVALUE` → deprecado, usar `ISINSCOPE`

## 💰 Capacity Planning & ROI

### Fabric SKU Reference

| SKU | CU | Precio/mes |
|-----|----|-----------:|
| F2 | 24 | $250 |
| F4 | 48 | $500 |
| F8 | 96 | $1,000 |
| F16 | 192 | $2,000 |
| F32 | 384 | $4,000 |

### Fórmula de Cálculo CU

```
CU_necesarios = 
  (GB × 12 × concurrency_ratio) +           # Memory factor
  (reportes × 8) +                           # Report overhead
  (usuarios_concurrentes × 15) +             # User factor
  (reportes × refreshes_por_día × 20/24) +   # Refresh factor
  (ajuste por health score)
```

### Escenarios de Usuario

- **Light** (10% concurrencia): 20 queries/día, 5s promedio
- **Medium** (20% concurrencia): 50 queries/día, 8s promedio
- **Heavy** (30% concurrencia): 100 queries/día, 12s promedio

### Ejemplo: Customer 50 reportes

**Sin optimización:**
- 34 GB memoria estimada
- 50 users, medium scenario
- Require: F16 ($2,000/mes)

**Con optimización básica (DAX + aggregations):**
- 29 GB (-15%)
- Health score: +15
- Require: F8 ($1,000/mes)
- **Ahorro: $1,000/mes = $12k/año**

**Con optimización completa (full refactor):**
- 17 GB (-50%)
- Health score: +40
- Require: F4 ($500/mes)
- **Ahorro: $1,500/mes = $18k/año**

## 📈 Salidas Generadas

### Bronze Layer
```
./bronze/
├── pbi_measures/          # Medidas DAX + metadata
├── pbi_dimensions/        # Tablas + columnas
├── pbi_hierarchies/       # Jerarquías
└── pbi_datasets/          # Dataset metadata
```

### Silver Layer
```
./silver/
├── metric_candidates/     # Grupos de medidas similares
├── dimension_candidates/  # Grupos de tablas similares
├── conflict_alerts/       # Conflictos detectados
├── health_analysis/       # Health scores por reporte ← NUEVO
└── capacity_planning/     # Scenarios + ROI ← NUEVO
```

## 🔍 Formato de Output

### health_analysis/health_scores_YYYYMMDD_HHMMSS.json

```json
[
  {
    "dataset_id": "123abc...",
    "dataset_name": "Dashboard_Ventas",
    "health_score": 38.5,
    "severity": "CRÍTICO",
    "factors": {
      "memory_footprint": {
        "score": 15.0,
        "weight": "30%",
        "reason": "~425MB estimado ⚠️ CRÍTICO"
      },
      "data_density": { "score": 45.0, "weight": "20%", "reason": "..." },
      "dax_efficiency": {
        "score": 62.0,
        "weight": "20%",
        "reason": "3 anti-patrones detectados",
        "top_issues": [
          "MeasureA: CALCULATE con FILTER anidado",
          "MeasureB: SUMX sin CALCULATE"
        ]
      },
      ...
    },
    "issues": [
      "Memory footprint alto — considerar agregación",
      "DAX ineficiente — revisar anti-patrones"
    ],
    "metadata": {
      "measure_count": 45,
      "dimension_count": 8,
      "hierarchy_count": 3
    }
  }
]
```

### capacity_planning/capacity_report_YYYYMMDD_HHMMSS.json

```json
{
  "report_metadata": {
    "generated_at": "2026-07-15T10:30:00Z",
    "report_count": 50,
    "avg_health_score": 68.3,
    "critical_reports": 8,
    "total_memory_gb": 34.2
  },
  "current_scenario": {
    "scenario": "medium",
    "users": 50,
    "concurrent_users": 10,
    "reports": 50,
    "total_gb": 34.2,
    "cu_breakdown": {
      "memory": 410.4,
      "reports": 400.0,
      "concurrent_users": 150.0,
      "refresh": 83.3
    },
    "cu_total": 1043.7,
    "recommended_sku": "F16",
    "price_monthly": 2000,
    "utilization": 54.4
  },
  "optimization_analysis": {
    "base_scenario": {...},
    "optimizations": [
      {
        "description": "Básica (DAX + Agg)",
        "base_sku": "F16",
        "optimized_sku": "F8",
        "cu_reduction": 250.5,
        "reduction_percent": 24.0,
        "monthly_savings": 1000,
        "annual_savings": 12000,
        "investment_cost": 6000,
        "payback_months": 6.0,
        "effort_hours": 40
      },
      ...
    ]
  },
  "growth_scenarios": {
    "20_users": { "light": {...}, "medium": {...}, "heavy": {...} },
    "50_users": { "light": {...}, "medium": {...}, "heavy": {...} },
    "100_users": { "light": {...}, "medium": {...}, "heavy": {...} },
    "200_users": { "light": {...}, "medium": {...}, "heavy": {...} }
  }
}
```

## 🎯 Próximos Pasos

1. **Backend API** (Flask/FastAPI)
   - CRUD operations en health_analysis y capacity_planning
   - Websocket para updates en tiempo real
   - Authentication + authorization (rol-based)

2. **Gold Layer** (governance_certification.py)
   - Workflow de aprobación de medidas canónicas
   - Versionado de definiciones
   - Audit trail de cambios

3. **Monitoring** (health_check_monitor.py)
   - Ejecución automática mensual
   - Alertas por degradación
   - Trending dashboard

4. **Integración con Fabric**
   - Script para migrar certificadas a OneLake Gold
   - Power Query templates para linked items
   - DAX generator para medidas optimizadas

## 📝 Variables de Entorno

```bash
# .env (requerido para extract_powerbi.py)
AZURE_TENANT_ID=xxx
AZURE_CLIENT_ID=xxx
AZURE_CLIENT_SECRET=xxx
PBI_WORKSPACE_ID=xxx
ONELAKE_ACCOUNT_NAME=xxx
ONELAKE_WORKSPACE_ID=xxx

# Opcional (para capacity calculator)
FABRIC_HOURLY_COST_PER_CU=0.10  # Para cálculos financieros
OPTIMIZATION_RATE_PER_HOUR=150  # Consulting rate
```

## 🐛 Troubleshooting

**"No health analyses found"**
→ Ejecutar `python analyze_health.py` primero, que depende de `python extract_powerbi.py`

**Health Score muy bajo (< 20)**
→ Revisar `top_issues` en output JSON; probablemente DAX muy ineficiente o modelo muy grande

**Capacity Calculator recomienda F32+**
→ Considerar: (a) más optimización, (b) split en múltiples workspaces, (c) Premium capacity vs Fabric

## 📚 Referencias

- [Microsoft Fabric Capacity](https://learn.microsoft.com/fabric/enterprise/capacity-settings)
- [Power BI REST API](https://learn.microsoft.com/rest/api/power-bi/)
- [DAX Best Practices](https://learn.microsoft.com/dax/best-practices/)
- [Vertipaq Compression](https://www.sqlbi.com/articles/analysis-services-query-processor/)
