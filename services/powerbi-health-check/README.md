# Power BI Health Check Service

Diagnóstico automático de calidad, optimización y planificación de capacidad para reportes Power BI antes de migración a Microsoft Fabric.

## 🎯 Propósito

El servicio de Health Check aborda un problema crítico para clientes con múltiples reportes Power BI en Fabric:

- **15% de reportes** tienen problemas de performance o diseño
- **Muchos no pueden publicarse en Fabric** por restricciones de memoria (~256 MB/reporte)
- **Inversión ciega en Fabric** sin saber si los modelos están listos → costoso (F16/F32)

**Solución:** Diagnóstico profundo + recomendaciones + ROI cuantificable

### Beneficios Clave

| Beneficio | Cómo | Valor |
|-----------|------|-------|
| **Priorización** | Matriz Effort vs Impact | Optimizar reportes de alto ROI primero |
| **Evitar sorpresas** | Health Score 0-100 por reporte | Saber antes de migrar que F8 no alcanza |
| **Cuantificar ROI** | Scenarios con ahorros/mes | $1k-$1.5k/mes savings típicos |
| **Roadmap claro** | 4-8 semanas ordenado | 40-150 horas consulting, no abierto |

## 📋 Componentes

### 1. **Extractor** (Bronze Layer)
```bash
python extract_powerbi.py
```
- Lee metadata via Power BI REST API + Scanner API
- Extrae: medidas, dimensiones, jerarquías, tabla schemas
- Salida: JSON en `bronze/pbi_*`

### 2. **Normalizer** (Silver Layer - Candidates)
```bash
python normalize_silver.py
```
- Agrupa medidas similares (fuzzy match ≥70%)
- Detecta duplicados (DAX hash) y conflictos
- Salida: candidate groups en `silver/metric_candidates`

### 3. **Analyzer** (Silver Layer - Health) ← NUEVO
```bash
python analyze_health.py
```
- Calcula Health Score 0-100 (6 factores ponderados)
- Detección automática de 5 anti-patrones DAX
- Recomendaciones de mejora por reporte
- Salida: `silver/health_analysis/health_scores_*.json`

### 4. **Capacity Planner** (Silver Layer - Sizing) ← NUEVO
```bash
python capacity_calculator.py
```
- Estima Fabric SKU requerido (F2-F128)
- Genera 3 optimization scenarios con ROI
- Proyecta impacto de crecimiento de usuarios
- Salida: `silver/capacity_planning/capacity_report_*.json`

### 5. **Portal UI**
```
powerbi-health-check-portal.html
```
- Dashboard interactivo con Health Scores
- Tabla: Top 8 reportes por riesgo
- Matriz: Effort vs Impact para priorización
- Calculator: Escenarios sin/con optimización
- Roadmap: 4-8 semanas con hitos

## 🚀 Guía de Inicio Rápido

### Setup

```bash
cd services/powerbi-health-check/extractor

# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Configurar credenciales Azure AD
cp .env.example .env
# Editar .env con:
#  - AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
#  - PBI_WORKSPACE_ID
#  - ONELAKE_ACCOUNT_NAME, ONELAKE_WORKSPACE_ID
```

### Ejecutar Pipeline Completo

```bash
# 1. Extraer metadata (5-15 min según # reportes)
python extract_powerbi.py

# 2. Normalizar (detectar duplicados)
python normalize_silver.py

# 3. Analizar salud
python analyze_health.py

# 4. Calcular capacity & ROI
python capacity_calculator.py

# 5. Ver resultados en portal
# (Abrir powerbi-health-check-portal.html con datos mock o reales)
```

## 📊 Health Score Model

Combina 6 factores en score 0-100:

```
Health = (Memory×0.30 + Density×0.20 + DAX×0.20 + Query×0.15 + Refresh×0.10 + RLS×0.05) × 100
```

### Factores

| # | Factor | Peso | Qué mide | Crítico si |
|----|--------|------|---------|-----------|
| 1 | Memory Footprint | 30% | GB estimado en memoria | >256 MB |
| 2 | Data Density | 20% | Sparseness (rows/cols×card) | <15% |
| 3 | DAX Efficiency | 20% | Anti-patrones detectados | Score <70 |
| 4 | Query Perf | 15% | Complejidad jerarquías | 5+ levels |
| 5 | Refresh Time | 10% | Duración estimada | >30 min |
| 6 | RLS Complexity | 5% | # de reglas RLS | >5 rules |

### Severidad

- 🟢 **OK** (≥70): Modelo listo, pocas mejoras necesarias
- 🟡 **ADVERTENCIA** (50-69): Revisar optimizaciones menores
- 🔴 **CRÍTICO** (<50): NO PUBLICAR en Fabric sin optimizar

### DAX Anti-patrones Detectados

1. `CALCULATE(measure, FILTER(...))` → usar `ALL/ALLSELECTED`
2. `SUMX(..., no_CALCULATE)` → context bloatware
3. `EVALUATE ROW(...)` en medida → no soportado
4. Variables con iterators → ineficiente
5. `HASONEVALUE()` → deprecado, usar `ISINSCOPE`

## 💰 Capacity Planning

### Fórmula CU

```
CU = (GB × 12 × concurrency) +         # Memory (12 CU/GB)
     (reports × 8) +                   # Report overhead
     (concurrent_users × 15) +          # User concurrency
     (reports × refresh_freq × 0.83)    # Refresh ops
     × health_adjustment_factor
```

### Fabric SKU Reference

| SKU | CU | Precio/mes | Típico para |
|-----|----|-----------:|---------|
| F2 | 24 | $250 | Dev, <10 reportes |
| F4 | 48 | $500 | 10-25 reportes |
| F8 | 96 | $1,000 | 25-60 reportes (post-opt) |
| F16 | 192 | $2,000 | 50+ reportes (sin opt) |
| F32 | 384 | $4,000 | 100+ reportes |

### Ejemplo: Customer 50 reportes, 50 usuarios

**Sin optimización:**
```
Health score: 68/100
Memory: 34 GB
Concurrency: 10 users
→ CU requerido: 1,044 CU
→ Recomendación: F16 ($2,000/mes)
```

**Con optimización básica (DAX fixes + aggregations, 40h):**
```
Health score: 83/100
Memory: 29 GB (-15%)
CU requerido: 789 CU
→ Recomendación: F8 ($1,000/mes)
→ Ahorro: $1,000/mes = $12k/año
→ Payback: 6 meses
```

**Con optimización completa (full refactor, 150h):**
```
Health score: 98/100
Memory: 17 GB (-50%)
CU requerido: 425 CU
→ Recomendación: F4 ($500/mes)
→ Ahorro: $1,500/mes = $18k/año
→ Payback: 4 meses
```

## 📈 Salidas

### Bronze Layer (Raw Metadata)
```
bronze/
├── pbi_measures/          # Todas las medidas DAX
├── pbi_dimensions/        # Tablas + columnas
├── pbi_hierarchies/       # Jerarquías (Año→Mes→Día, etc.)
└── pbi_datasets/          # Dataset metadata
```

### Silver Layer (Analysis)
```
silver/
├── metric_candidates/     # Grupos de medidas similares
├── dimension_candidates/  # Grupos de tablas similares
├── conflict_alerts/       # Conflictos detectados
├── health_analysis/       # ← Health scores por reporte
└── capacity_planning/     # ← Scenarios + SKU recommendations
```

### Formato Health Analysis

```json
{
  "dataset_name": "Dashboard_Ventas",
  "health_score": 38.5,
  "severity": "CRÍTICO",
  "factors": {
    "memory_footprint": {
      "score": 15.0,
      "reason": "~425MB estimado ⚠️ CRÍTICO"
    },
    "dax_efficiency": {
      "score": 62.0,
      "top_issues": [
        "MeasureA: CALCULATE con FILTER anidado",
        "MeasureB: SUMX sin CALCULATE"
      ]
    },
    ...
  },
  "issues": [
    "Memory footprint alto",
    "DAX ineficiente"
  ],
  "metadata": {
    "measure_count": 45,
    "dimension_count": 8,
    "hierarchy_count": 3
  }
}
```

### Formato Capacity Report

```json
{
  "current_scenario": {
    "users": 50,
    "reports": 50,
    "total_gb": 34.2,
    "cu_total": 1043.7,
    "recommended_sku": "F16",
    "price_monthly": 2000,
    "utilization": 54.4
  },
  "optimizations": [
    {
      "description": "Básica (DAX + Agg)",
      "optimized_sku": "F8",
      "monthly_savings": 1000,
      "payback_months": 6.0,
      "effort_hours": 40
    },
    ...
  ],
  "growth_scenarios": {
    "20_users": {...},
    "50_users": {...},
    "100_users": {...},
    "200_users": {...}
  }
}
```

## 🎯 Próximos Pasos

### Fase 1: Backend API
- [ ] Flask/FastAPI con CRUD de análisis
- [ ] Websocket para updates en tiempo real
- [ ] Authentication + Role-based access

### Fase 2: Gold Layer (Governance)
- [ ] Workflow de certificación de medidas canónicas
- [ ] Versionado de definiciones
- [ ] Audit trail de cambios

### Fase 3: Monitoring
- [ ] Ejecución automática (mensual/semanal)
- [ ] Alertas por degradación
- [ ] Dashboard de trending

### Fase 4: Fabric Integration
- [ ] Script de migración a OneLake Gold
- [ ] Power Query templates para linked items
- [ ] DAX generator para medidas optimizadas

## 📝 Pricing Model

### Opción A: Por diagnóstico
- **$2,500** por análisis completo (50-100 reportes)
- Incluye: Health Check, Capacity Planning, 2h de consultoría

### Opción B: Por hora consultoría
- **$150/hora** implementation (40-150h típico)
- Health Check costo fijo: $2,500
- Más flexible para proyectos grandes

### Opción C: Hybrid (Recomendado)
- **$2,500** Health Check + inicial planning
- **$150/hora** por optimización (después cliente decide)
- Alineado a cliente: solo paga por trabajo real

## 🐛 Troubleshooting

**Azure Auth Error**
→ Verificar AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET en .env

**"No health analyses found"**
→ Ejecutar primero: `python extract_powerbi.py` + `python analyze_health.py`

**Health Score < 20**
→ Revisar `top_issues` en output; probablemente DAX muy ineficiente

**F32+ recomendado**
→ Opción 1: Más optimización; Opción 2: Split workspaces; Opción 3: Premium capacity

## 📚 Referencias

- [extract_powerbi.py](extractor/extract_powerbi.py) - Bronze layer extraction
- [normalize_silver.py](extractor/normalize_silver.py) - Deduplication & conflicts
- [analyze_health.py](extractor/analyze_health.py) - Health scoring
- [capacity_calculator.py](extractor/capacity_calculator.py) - SKU planning
- [HEALTH_CHECK_GUIDE.md](extractor/HEALTH_CHECK_GUIDE.md) - Complete documentation

## 📞 Support

Para preguntas sobre MIvisualization Health Check Service:
- Email: carlos.j.vera.d@gmail.com
- Repo: https://github.com/CarlosVeraMIS/everything-claude-code
