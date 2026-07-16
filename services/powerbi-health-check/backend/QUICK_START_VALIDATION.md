# Quick Start: Real Power BI Validation

Get up and running in 5 minutes.

## 1. Prerequisites

- Node.js 18+
- Azure AD tenant with app registration
- Power BI workspace with at least 1 dataset

## 2. Setup (2 min)

```bash
cd services/powerbi-health-check/backend

# Install dependencies
npm install

# Create .env
cp .env.example .env

# Edit .env with your credentials
nano .env  # or your editor
```

**Required env vars:**
```bash
AZURE_TENANT_ID=<from-azure-portal>
AZURE_CLIENT_ID=<from-app-registration>
AZURE_CLIENT_SECRET=<generated-secret>
PBI_WORKSPACE_ID=<from-powerbi-workspace-settings>
FEATURE_REAL_EXTRACTION=true
```

## 3. Run Validation (2 min)

### Test Everything

```bash
npm run validate
```

Expected: All 4 tests PASS ✓

### Or Test Individual Components

```bash
# Auth only
npm run validate:auth

# Extraction (list datasets)
npm run validate:extraction

# Health analysis
npm run validate:analysis

# Capacity calculation
npm run validate:capacity
```

## 4. Accuracy Test (Optional)

Test against real dataset metrics:

```bash
# First, get actual values from Power BI:
# 1. Right-click dataset → Settings → Size (MB)
# 2. Monitor → Refresh history (minutes)

npm run validate:accuracy -- \
  --dataset-id <workspace-id>/<dataset-id> \
  --actual-size 250 \
  --actual-refresh 15
```

## 5. Start Backend (Optional)

Run the full API server:

```bash
npm run dev
# Server on http://localhost:3000

# In another terminal, test API:
curl http://localhost:3000/api/health
```

## Example Output

```
╔═══════════════════════════════════════════╗
║  Power BI Health Check - Validation Suite ║
║                                           ║
║  Testing real Power BI integration        ║
╚═══════════════════════════════════════════╝

[12:34:56] ✓ Authentication
[12:34:57] ✓ Azure credentials configured
[12:35:01] ✓ Power BI access token obtained
[12:35:02] ✓ JWT token generated successfully

[12:35:03] ✓ Power BI Extraction
[12:35:05] ✓ Found 50 datasets
[12:35:10] ✓ Extracted sample dataset: Sales Dashboard
[12:35:12] ✓ - Tables: 8
[12:35:12] ✓ - Measures: 45

[12:35:13] ✓ Health Analysis
[12:35:14] ✓ Health Score: 72/100
[12:35:14] ✓ Severity: ADVERTENCIA

[12:35:15] ✓ Capacity Calculator
[12:35:16] ✓ Current SKU: F16
[12:35:16] ✓ Price/Month: $2000
[12:35:17] ✓ Optimized SKU: F8 ($1000)

═══ Validation Summary ═══

✓ PASS Authentication
✓ PASS Power BI Extraction
✓ PASS Health Analysis
✓ PASS Capacity Calculator

Overall: ALL TESTS PASSED ✓
```

## Troubleshooting

### "Missing Azure credentials"
→ Check .env file has AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET

### "Unauthorized - Invalid grant"
→ Client secret expired, re-create in Azure Portal

### "No datasets found"
→ Workspace is empty or PBI_WORKSPACE_ID is wrong

### "Token verification failed"
→ JWT_SECRET not set or mismatched

## Next Steps

✅ If all tests pass, backend is ready for:
- Frontend integration
- Production deployment
- Real customer validation

📖 For detailed info: See [VALIDATION.md](./VALIDATION.md)

---

**Backend Status:** Production Ready ✓
