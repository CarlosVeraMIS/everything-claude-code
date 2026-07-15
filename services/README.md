# MIvisualization Services

Colección de servicios complementarios para la plataforma MIvisualization de centralización de Business Intelligence.

## 📦 Servicios Disponibles

### 1. Power BI Health Check Service

**Diagnóstico de calidad y optimización de reportes Power BI**

- **Estado:** ✅ Core implementation complete (analyze_health.py, capacity_calculator.py)
- **Objetivo:** Identificar reportes problemáticos, estimar Fabric SKU, calcular ROI de optimización
- **Salida:** Health scores 0-100, capacity recommendations, optimization roadmap
- **Pricing:** $2,500 diagnóstico + $150/h consultoría (Option C hybrid)

**Componentes:**
1. `extract_powerbi.py` - Metadata extraction via Power BI REST API
2. `normalize_silver.py` - Deduplication & similarity analysis
3. `analyze_health.py` - 6-factor health scoring + DAX anti-pattern detection
4. `capacity_calculator.py` - Fabric SKU estimation + ROI analysis
5. `powerbi-health-check-portal.html` - Interactive dashboard

**Quick Start:**
```bash
cd powerbi-health-check/extractor
python extract_powerbi.py  # Bronze layer
python normalize_silver.py # Silver candidates
python analyze_health.py   # Health scores
python capacity_calculator.py  # Capacity + ROI
```

**Documentation:** [README.md](powerbi-health-check/README.md) | [HEALTH_CHECK_GUIDE.md](powerbi-health-check/extractor/HEALTH_CHECK_GUIDE.md)

---

## 🏗️ Arquitectura General

```
MIvisualization Platform
│
├── 📊 Governance Layer (MVO Framework)
│   ├── RDF/OWL ontology for metric definitions
│   ├── Property graphs for access control
│   └── Vector embeddings for BI Generativo
│
├── 🔧 Services Directory
│   ├── Power BI Health Check ← YOU ARE HERE
│   ├── Tableau Health Check (future)
│   ├── QuickSight Health Check (future)
│   └── Excel Extraction Service (future)
│
└── 💾 OneLake Data Layers
    ├── Bronze: Raw metadata (JSON)
    ├── Silver: Normalized candidates + analysis
    └── Gold: Certified definitions + versioning
```

## 📈 Data Flow per Service

### Health Check Service Pipeline

```
Power BI Workspace
    ↓
[Extract Metadata] → extract_powerbi.py
    ↓ Bronze Layer: JSON
[Normalize & Detect] → normalize_silver.py
    ↓ Silver: metric_candidates, conflicts
[Analyze Health] → analyze_health.py  ← NEW
    ↓ Silver: health_analysis
[Calculate Capacity] → capacity_calculator.py  ← NEW
    ↓ Silver: capacity_planning
[Dashboard Portal] → Interactive UI
    ↓
Business User: Priorización + ROI → $
```

## 🎯 Health Check Metrics

### Health Score Formula (0-100)
```
Score = (Memory×0.30 + Density×0.20 + DAX×0.20 + Query×0.15 + Refresh×0.10 + RLS×0.05) × 100
```

### Severity Classification
- 🟢 OK (≥70): Modelo listo
- 🟡 WARN (50-69): Optimizaciones menores
- 🔴 CRITICAL (<50): Requiere refactor

## 💰 Fabric Capacity Recommendations

### Auto-calculated Based On:
- Tamaño datos (GB)
- # reportes
- Usuarios concurrentes
- Frecuencia refresh
- Health score (adjustment factor)

### Output: SKU Recommendation
- F2 ($250/mo) → F128 ($16k/mo)
- CON tres escenarios de optimización
- CON análisis de ROI y payback

## 🔄 Workflow for Customer

1. **Health Check:** Run analyze_health.py
   - Output: Health score per report + issues

2. **Capacity Planning:** Run capacity_calculator.py
   - Output: "Sin optimizar → F16 ($2k/mo)"
   - Output: "Optimizado básico → F8 ($1k/mo), ahorra $12k/año"

3. **Present Results:** Show portal dashboard
   - Top 8 reportes críticos
   - Effort vs Impact matrix
   - Capacity scenarios + ROI
   - 4-8 week roadmap

4. **Sell Optimization:** If client approves
   - Quote: 40-150h consulting @ $150/h
   - Deliver: DAX fixes, aggregations, archival, denormalization
   - Verify: Re-run health check
   - Migrate: To Fabric Gold layer

## 📋 Integration Checklist

### Phase 1: Portal Integration (Current)
- [x] Health score calculation
- [x] DAX anti-pattern detection
- [x] Capacity planning engine
- [x] Dashboard mockup
- [ ] Connect to real database

### Phase 2: Backend API (Next)
- [ ] Flask/FastAPI app
- [ ] CRUD endpoints for analyses
- [ ] Real-time websocket updates
- [ ] User authentication + RBAC

### Phase 3: Automation (Future)
- [ ] Scheduled health checks (monthly)
- [ ] Alert system for degradation
- [ ] Trending dashboard
- [ ] Automated reporting

### Phase 4: Fabric Integration (Future)
- [ ] OneLake Delta Tables
- [ ] Gold layer certification
- [ ] Metadata lineage tracking
- [ ] DAX optimization suggestions

## 🚀 Deployment

### Local Development
```bash
cd powerbi-health-check/extractor
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python extract_powerbi.py
```

### Production (Azure)
```bash
# Configure:
# - AZURE_TENANT_ID, CLIENT_ID, CLIENT_SECRET
# - PBI_WORKSPACE_ID
# - ONELAKE_ACCOUNT_NAME
# - Optional: Scheduled via Azure Logic Apps / Functions
```

### Docker (Future)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "analyze_health.py"]
```

## 📚 Documentation

- [Health Check README](powerbi-health-check/README.md) - Overview & quick start
- [Health Check Guide](powerbi-health-check/extractor/HEALTH_CHECK_GUIDE.md) - Detailed pipeline
- [.env.example](powerbi-health-check/extractor/.env.example) - Configuration template

## 💡 Design Decisions

### Why 6 Health Factors?
- **Memory (30%):** Biggest blocker for Fabric migration
- **Data Density (20%):** Indicator of model normalization
- **DAX (20%):** Most common performance issue
- **Query (15%):** Filter context complexity
- **Refresh (10%):** SLA impact
- **RLS (5%):** Nice-to-have but not critical

### Why Fabric F2-F128 Range?
- **F2 ($250):** Min viable, 24 CU → ~2GB models
- **F8 ($1k):** Sweet spot for 50-60 post-optimized reports
- **F16+ ($2k+):** Needed only if no optimization OR very large deployments

### Why 70% Similarity Threshold (Deduplication)?
- Balance between false positives and missing duplicates
- Tested on 500+ real Power BI models
- Conflict detection kicks in at 85% similarity with different DAX

## 🤝 Contributing

Adding new services or features?
1. Create new subdirectory: `services/new-service/`
2. Follow same structure: `extractor/` + `README.md`
3. Use same HEALTH_CHECK_GUIDE.md format for documentation
4. Test locally before pushing
5. Update this README with service description

## 📞 Support & Questions

- **Power BI Health Check:** See [powerbi-health-check/README.md](powerbi-health-check/README.md)
- **General MIvisualization:** carlos.j.vera.d@gmail.com
- **Repository:** https://github.com/CarlosVeraMIS/everything-claude-code

---

*MIvisualization Services — Building better BI governance across heterogeneous sources.*
