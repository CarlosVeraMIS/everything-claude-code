# Real Power BI Validation Guide

Complete guide for validating the Health Check Service against real Power BI workspaces.

## Prerequisites

1. **Azure AD Application Registration**
   - Register app in Azure Portal → App registrations
   - Grant permissions: Power BI Service API → User.Read, DataflowSpace.ReadWrite.All
   - Create client secret

2. **Power BI Workspace Access**
   - At least one workspace with datasets
   - Admin access to workspace for metadata extraction

3. **Environment Setup**
   ```bash
   cd services/powerbi-health-check/backend
   npm install
   cp .env.example .env
   ```

4. **Configure .env**
   ```bash
   # Azure AD
   AZURE_TENANT_ID=your-tenant-id            # From Azure Portal
   AZURE_CLIENT_ID=your-app-id               # App registration
   AZURE_CLIENT_SECRET=your-client-secret    # Secret value
   
   # Power BI
   PBI_WORKSPACE_ID=your-workspace-id        # From Power BI workspace settings
   
   # Feature flags
   FEATURE_REAL_EXTRACTION=true              # Enable Power BI API calls
   NODE_ENV=development
   ```

## Step 1: Validate Authentication

Test Azure AD authentication and Power BI token generation:

```bash
node src/cli/validate-powerbi.js --test-auth
```

**Expected Output:**
```
ℹ Checking Azure AD credentials...
✓ Azure credentials configured
ℹ Requesting Power BI access token...
✓ Power BI access token obtained
✓ JWT token generated successfully
✓ JWT verification passed
```

**Troubleshooting:**
- **"Missing Azure credentials"** → Check AZURE_* vars in .env
- **"Invalid grant"** → Verify CLIENT_SECRET hasn't expired, re-create if needed
- **"Unauthorized"** → Check app has Power BI API permissions in Azure Portal

## Step 2: Validate Extraction

Test Power BI metadata extraction:

```bash
node src/cli/validate-powerbi.js --test-extraction
```

**Expected Output:**
```
ℹ Connecting to workspace: abc-123
✓ Found 50 datasets
ℹ Extracting dataset 1/3: Sales Dashboard
✓   ├─ Tables: 8
✓   ├─ Measures: 45
✓   └─ Mode: Import
```

**What it validates:**
- ✓ Power BI workspace connectivity
- ✓ Dataset listing API
- ✓ Metadata extraction (tables, measures, columns)
- ✓ Dataset structure integrity

**Troubleshooting:**
- **"No datasets found"** → Workspace is empty or has only Live/DirectQuery datasets
- **"Invalid tables array"** → Dataset structure corrupted or API changed
- **"Timeout"** → Network issue or Power BI API rate limiting

## Step 3: Validate Health Analysis

Test the 6-factor health scoring model:

```bash
node src/cli/validate-powerbi.js --test-analysis
```

**Expected Output:**
```
ℹ Analyzing sample dataset health...
✓ Health Score: 72/100
✓ Severity: ADVERTENCIA
⚠ Issues found: 3
  1. Memory footprint high
  2. DAX ineficient
  3. Refresh duration high
✓ All health factors validated
```

**What it validates:**
- ✓ 6-factor calculation (Memory, Density, DAX, Query, Refresh, RLS)
- ✓ Score range 0-100
- ✓ Severity classification (OK / ADVERTENCIA / CRÍTICO)
- ✓ Issue compilation
- ✓ DAX anti-pattern detection

**Interpretation:**
| Health Score | Severity | Recommendation |
|-------------|----------|-----------------|
| ≥70 | OK | Safe for Fabric migration |
| 50-69 | ADVERTENCIA | Minor optimizations needed |
| <50 | CRÍTICO | Do NOT migrate, requires optimization |

## Step 4: Validate Capacity Calculator

Test Fabric SKU sizing and ROI calculations:

```bash
node src/cli/validate-powerbi.js --test-capacity
```

**Expected Output:**
```
ℹ Generating capacity report for 50 datasets...
✓ Current SKU: F16
✓ CU Required: 1044
✓ Price/Month: $2000
✓ Utilization: 54.4%
ℹ After basic optimization (40h, 15% reduction):
✓   ├─ SKU: F8
✓   ├─ Price: $1000
✓   └─ Monthly Savings: $1000 ($12000/year)
```

**What it validates:**
- ✓ CU calculation formula
- ✓ SKU recommendation (F2-F128)
- ✓ Pricing accuracy
- ✓ ROI calculations
- ✓ Optimization scenarios

**Fabric SKU Reference:**
| SKU | CU | Price/mo | Typical Use |
|-----|----|---------:|-------------|
| F2 | 24 | $250 | Dev/Test, <10 reports |
| F4 | 48 | $500 | 10-25 reports |
| F8 | 96 | $1,000 | 25-60 reports (optimized) |
| F16 | 192 | $2,000 | 50+ reports (unoptimized) |
| F32+ | 384+ | $4,000+ | Enterprise (100+ reports) |

## Step 5: Validation Accuracy Test

Test estimation accuracy against known actual metrics:

```bash
# Get actual metrics from Power BI workspace
# 1. Dataset size: Settings → Size (shown in Power BI)
# 2. Refresh duration: Refresh history
# 3. Measure count: Model view

# Run validation
node src/cli/validate-accuracy.js \
  --dataset-id <workspace-id>/<dataset-id> \
  --actual-size 250 \
  --actual-refresh 15
```

**Expected Output:**
```
Dataset Overview
ℹ Name: Sales Dashboard
ℹ Mode: Import
ℹ Tables: 12
ℹ Measures: 48

Memory Estimation Accuracy
ℹ Estimated: 245.3 MB
ℹ Actual: 250 MB
✓ Variance: 1.9%

Refresh Duration Accuracy
ℹ Estimated: 14.2 min
ℹ Actual: 15 min
✓ Variance: 5.3%
```

**Accuracy Targets:**
| Metric | Target Variance | Acceptable |
|--------|-----------------|-----------|
| Memory | <20% | Good estimation |
| Refresh Time | <30% | Reasonable estimate |
| Measure Count | <5% | High accuracy |

## Full Validation Suite

Run all tests in sequence:

```bash
npm run validate
# or
node src/cli/validate-powerbi.js --test-all
```

**Expected output: All 4 tests PASS**

## Production Validation Checklist

Before deploying to production, verify:

- [ ] **Authentication**
  - [ ] Azure AD credentials configured
  - [ ] Power BI token generation works
  - [ ] JWT tokens validate successfully

- [ ] **Extraction**
  - [ ] Can list datasets in workspace
  - [ ] Can extract metadata from ≥10 datasets
  - [ ] Error handling for problematic datasets
  - [ ] Performance: <15 min for 50 datasets

- [ ] **Health Analysis**
  - [ ] All 6 factors calculate correctly
  - [ ] Scores range 0-100
  - [ ] Severity classification matches scores
  - [ ] DAX anti-patterns detected in samples

- [ ] **Capacity Calculator**
  - [ ] CU calculation matches expected values
  - [ ] SKU recommendations realistic
  - [ ] ROI scenarios make business sense
  - [ ] Growth scenarios show proper scaling

- [ ] **Database**
  - [ ] SQLite database creates successfully
  - [ ] Records persist after extraction
  - [ ] Queries return valid data

- [ ] **Error Handling**
  - [ ] API errors return proper status codes
  - [ ] No sensitive data in error messages
  - [ ] Network timeouts handled gracefully
  - [ ] Invalid inputs rejected cleanly

## Real Customer Validation

Example: Validating for customer with 50 Power BI reports

### 1. Initial Health Assessment (15 min)

```bash
node src/cli/validate-powerbi.js --test-extraction
# Extracts metadata from all 50 reports
# Expected: 50 datasets, ~1000+ measures total
```

### 2. Health Scoring (5 min)

```bash
curl -X POST http://localhost:3000/api/analysis/health \
  -H "Authorization: Bearer <token>" \
  -d '{"datasets": [...50 datasets...]}'

# Returns: Health scores, issues, recommendations
# Example output:
# - 42 datasets OK (84%)
# - 5 datasets ADVERTENCIA (10%)
# - 3 datasets CRÍTICO (6%) ← Needs immediate attention
```

### 3. Capacity Planning (2 min)

```bash
curl -X POST http://localhost:3000/api/capacity/calculate \
  -H "Authorization: Bearer <token>" \
  -d '{"healthAnalyses": [...50 analyses...]}'

# Returns: SKU recommendation + ROI
# Example:
# Current: F16 ($2,000/mo)
# After 40h optimization: F8 ($1,000/mo)
# ROI: $12,000/year, 6-month payback
```

### 4. Accuracy Validation

```bash
# For each critical dataset, validate against actual metrics
node src/cli/validate-accuracy.js \
  --dataset-id <critical-dataset> \
  --actual-size 425 \
  --actual-refresh 35

# Should show <20% variance for production readiness
```

### 5. Report Generation

Generate final health check report:

```bash
curl -X GET http://localhost:3000/api/capacity/reports \
  -H "Authorization: Bearer <token>"

# Returns: Full capacity report with:
# ✓ Current state analysis
# ✓ Top 8 reports at risk
# ✓ Optimization recommendations
# ✓ ROI projections
# ✓ Growth scenarios
```

## Common Issues & Resolutions

### Issue: "Unauthorized - Invalid PowerBI token"

**Cause:** Azure credentials incorrect or expired

**Solution:**
1. Verify AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
2. Re-generate client secret in Azure Portal
3. Ensure app has Power BI API permissions

### Issue: "404 - Dataset not found"

**Cause:** Dataset in different workspace or deleted

**Solution:**
1. Verify PBI_WORKSPACE_ID is correct
2. Check dataset still exists in Power BI
3. Ensure user has workspace admin access

### Issue: "Memory estimation off by >30%"

**Cause:** Heuristic doesn't account for compression ratio

**Solution:**
1. Get actual size from Power BI (Settings → Size)
2. Compare with estimated
3. Adjust multiplier in health-analyzer.js
4. Typical compression: Vertipaq 50-80% better

### Issue: "Health score too low for good models"

**Cause:** Thresholds might be too strict for your models

**Solution:**
1. Validate weights in config: `HEALTH_SCORE_WEIGHTS`
2. Adjust if needed (default: 30% memory, 20% density, etc.)
3. Test with multiple datasets to confirm

## Performance Benchmarks

Target performance for production:

| Operation | Time | Notes |
|-----------|------|-------|
| Auth token | ~500ms | Azure AD roundtrip |
| Extract 50 datasets | 5-15 min | Power BI API rate limit: ~100 req/sec |
| Health analysis (50) | 1-2 min | CPU-bound, single-threaded |
| Capacity calculation | <1 sec | In-memory |
| Database operations | <10ms | SQLite |

**Total pipeline time: 6-17 minutes for 50 datasets**

## Next Steps

After successful validation:

1. **Deploy to Production**
   - Set NODE_ENV=production
   - Use secure JWT_SECRET
   - Enable HTTPS/TLS
   - Set up monitoring/logging

2. **Integrate with Portal**
   - Connect frontend to backend API
   - Implement real-time progress updates
   - Add visualization of results

3. **Automation**
   - Schedule monthly health checks
   - Set up alert rules for degradation
   - Create trending dashboard

4. **Enhancement**
   - Collect feedback on accuracy
   - Tune thresholds based on customer data
   - Add more DAX patterns
   - Implement ML for prediction

## Support

For validation issues:
- Check logs in `logs/` directory
- Enable DEBUG logging: `LOG_LEVEL=debug`
- Review IMPLEMENTATION.md for architecture
- Contact: carlos.j.vera.d@gmail.com

---

**Validation Status:** Ready for production deployment after passing all tests.
