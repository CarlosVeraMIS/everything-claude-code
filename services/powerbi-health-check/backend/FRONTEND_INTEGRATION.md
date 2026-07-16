# Frontend Integration Guide

Complete guide for testing the integrated Health Check Portal (frontend + backend).

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Browser)                       │
├─────────────────────────────────────────────────────────────┤
│  index.html                                                 │
│  ├─ public/js/client.js (API Client)                        │
│  └─ public/js/app.js (Application Controller)               │
├─────────────────────────────────────────────────────────────┤
│              HTTP REST API (Express.js)                     │
├─────────────────────────────────────────────────────────────┤
│                    Backend Services                         │
│  ├─ Authentication (Azure AD + JWT)                         │
│  ├─ Power BI Extraction (metadata only)                     │
│  ├─ Health Analysis (6-factor scoring)                      │
│  ├─ Capacity Calculator (SKU sizing & ROI)                  │
│  └─ Database (SQLite)                                       │
└─────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Install Dependencies

```bash
cd services/powerbi-health-check/backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env

# Edit .env with your Azure AD credentials
nano .env
```

**Required Variables:**
```bash
# Azure AD
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-secret

# Power BI
PBI_WORKSPACE_ID=your-workspace-id

# Features
FEATURE_REAL_EXTRACTION=true
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key-change-in-production
```

### 3. Start Backend Server

```bash
npm run dev
```

Expected output:
```
🏥 Health Check Service running on http://localhost:3000
Environment: development
Portal: http://localhost:3000
```

## Testing Frontend Integration

### Access the Portal

Open browser to: **http://localhost:3000**

### Login Flow

1. **Enter Workspace ID** - Copy from Power BI workspace settings
2. **Enter Email** - Your email address (must have workspace access)
3. **Click "Connect to Power BI"**

**Backend Flow:**
- Frontend sends POST /api/auth/token
- Backend authenticates with Azure AD
- Backend generates JWT token
- Frontend stores token in localStorage
- Frontend displays main dashboard

### Extract Metadata

**Button:** Extract Power BI Metadata

**Frontend Flow:**
1. Shows confirmation dialog
2. Sets loading indicator
3. Calls POST /api/extraction/extract
4. Displays results

**Backend Flow:**
1. Validates authentication (requireAuth middleware)
2. Calls pbiExtractor.extractAllDatasets()
3. Stores metadata in SQLite
4. Returns dataset count and names
5. Logs to audit trail

**Expected Response:**
```json
{
  "extractionId": "ext_123abc",
  "datasetCount": 50,
  "datasets": [
    {
      "datasetId": "ds1",
      "name": "Sales Dashboard",
      "error": null
    }
  ]
}
```

### Analyze Health

**Button:** Analyze Health

**Frontend Flow:**
1. Uses extracted datasets (or mock data for demo)
2. Calls POST /api/analysis/health
3. Displays health scores with severity colors

**Backend Flow:**
1. Calls healthAnalyzer.analyzeHealth() for each dataset
2. Calculates 6 factors (memory, density, DAX, query, refresh, RLS)
3. Computes health score 0-100
4. Classifies severity (OK/ADVERTENCIA/CRÍTICO)
5. Stores in database
6. Returns analyses

**Frontend Display:**
- Health score (0-100) with circular progress
- Severity badge (green/orange/red)
- Top issues (max 2)
- Circular gauge visualization

### Calculate Capacity

**Button:** Calculate Capacity

**Frontend Flow:**
1. Requires health analyses (shows alert if none)
2. Calls POST /api/capacity/calculate
3. Displays optimization scenarios

**Backend Flow:**
1. Calls capacityCalculator.generateCapacityReport()
2. Calculates CU requirements
3. Recommends optimal SKU (F2-F128)
4. Generates 3 optimization scenarios (basic/intermediate/complete)
5. Calculates ROI and payback periods
6. Stores report in database

**Frontend Display:**
- Current SKU and pricing
- Optimization scenarios with monthly/annual savings
- Payback period in months
- Effort hours required

## Component Communication Map

```
┌──────────────────┐
│   index.html     │
│  (Main DOM)      │
└────────┬─────────┘
         │
         └──→ client.js (HealthCheckClient)
              ├─ setToken() - Store auth in localStorage
              ├─ getToken() - POST /api/auth/token
              ├─ verifyToken() - GET /api/auth/verify
              ├─ extractPowerBI() - POST /api/extraction/extract
              ├─ analyzeHealth() - POST /api/analysis/health
              ├─ calculateCapacity() - POST /api/capacity/calculate
              ├─ getHealthAnalyses() - GET /api/analysis/health
              ├─ getCapacityReports() - GET /api/capacity/reports
              └─ request() - Base HTTP method with Bearer token

         └──→ app.js (HealthCheckApp)
              ├─ init() - Check auth & render appropriate screen
              ├─ showLoginForm() - Render login UI
              ├─ showMainApp() - Render dashboard
              ├─ handleLogin() - Call client.getToken()
              ├─ handleLogout() - Call client.logout()
              ├─ handleExtraction() - Call client.extractPowerBI()
              ├─ handleAnalysis() - Call client.analyzeHealth()
              ├─ handleCapacity() - Call client.calculateCapacity()
              ├─ loadData() - Call client.getHealthAnalyses()
              ├─ renderHealthAnalysis() - Display analyses
              ├─ renderCapacityReport() - Display capacity plan
              ├─ renderMetrics() - Display summary stats
              ├─ switchTab() - Switch between Health/Capacity/Metrics
              ├─ updateUserInfo() - Display user & workspace
              └─ showLoading() - Show/hide loading indicator
```

## Error Handling

### Frontend Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Please enter workspace ID and email" | Missing input | Fill in both fields |
| "Authentication failed: ..." | Invalid credentials | Check workspace ID and email |
| "Extraction failed: ..." | No datasets or API error | Verify workspace has datasets |
| "Run health analysis first" | Try capacity without analysis | Run "Analyze Health" first |
| Network errors | Backend unavailable | Ensure server is running on port 3000 |

### Backend Error Responses

| Status | Example | Meaning |
|--------|---------|---------|
| 400 | Missing required fields | Bad request format |
| 401 | Invalid or expired token | Re-authenticate |
| 404 | Dataset not found | Wrong workspace or ID |
| 500 | Internal Server Error | Check backend logs |

## Testing Checklist

### Authentication
- [ ] Can log in with valid credentials
- [ ] Token stored in localStorage
- [ ] Can verify token is valid
- [ ] Login form shows when not authenticated
- [ ] Logout clears token and shows login form

### Extraction
- [ ] Extract button visible in main app
- [ ] Confirmation dialog appears
- [ ] Loading indicator shows during extraction
- [ ] Results display dataset count
- [ ] Extracted datasets list shows names

### Analysis
- [ ] Analyze button visible and enabled
- [ ] Health scores calculate correctly
- [ ] Severity badges show correct colors
  - Green for OK (≥70)
  - Orange for ADVERTENCIA (50-69)
  - Red for CRÍTICO (<50)
- [ ] Health score gauge displays correctly
- [ ] Issues list shows top problems

### Capacity
- [ ] Capacity button visible and enabled
- [ ] Requires health analyses (shows alert if missing)
- [ ] SKU recommendation shows F-series (F2-F128)
- [ ] Price calculates correctly
- [ ] Optimization scenarios show different SKUs
- [ ] Savings calculations are positive

### Metrics
- [ ] Metrics tab displays summary stats
- [ ] Total analyses count is correct
- [ ] Average health score calculates correctly
- [ ] Critical count shows CRÍTICO analyses
- [ ] Healthy count shows OK analyses

### UI/UX
- [ ] Portal is responsive (desktop/mobile)
- [ ] Tab switching works smoothly
- [ ] Loading spinner animates
- [ ] All text is readable (dark theme)
- [ ] Buttons are clickable and responsive
- [ ] User info displays email and workspace

## Performance Benchmarks

| Operation | Target | Notes |
|-----------|--------|-------|
| Page load | <2s | Static HTML + JS |
| Login | <1s | JWT generation is fast |
| Extract 50 datasets | 5-15 min | Power BI API rate limited |
| Analyze 50 datasets | 1-2 min | CPU-bound calculation |
| Calculate capacity | <1s | In-memory math |
| Display results | <500ms | DOM rendering |

## Database Inspection

### View Extracted Data

```bash
# Open SQLite CLI
sqlite3 data/health-check.db

# List all tables
.tables

# Check extraction records
SELECT * FROM extractions LIMIT 5;

# Check datasets
SELECT * FROM datasets LIMIT 5;

# Check health analyses
SELECT * FROM health_analyses LIMIT 5;
```

## Troubleshooting

### Problem: "Cannot GET /"

**Cause:** Static file serving not working

**Solution:**
```bash
# Check public/index.html exists
ls -la services/powerbi-health-check/backend/public/

# Verify Express static middleware in src/index.js:
# app.use(express.static(path.join(__dirname, '../../public')));
```

### Problem: "Cannot find module 'client.js'"

**Cause:** Script paths incorrect in HTML

**Solution:**
- Verify script tags use `/js/client.js` (absolute path)
- Check files exist in public/js/

### Problem: "CORS error in browser console"

**Cause:** Frontend and backend on different origins

**Solution:**
```bash
# Edit .env
CORS_ORIGIN=http://localhost:3000

# Restart backend
npm run dev
```

### Problem: "Authentication failed: Unauthorized"

**Cause:** Azure AD credentials incorrect

**Solution:**
1. Verify AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in .env
2. Check app registration has Power BI API permissions
3. Ensure client secret hasn't expired

### Problem: "No datasets found"

**Cause:** Workspace is empty or wrong ID

**Solution:**
1. Verify PBI_WORKSPACE_ID in .env
2. Ensure workspace has at least one dataset
3. Check you have admin access to workspace

### Problem: "Token verification failed"

**Cause:** JWT_SECRET mismatch or expired token

**Solution:**
1. Ensure JWT_SECRET is set in .env
2. Clear browser localStorage and re-login
3. Set JWT_EXPIRY to longer duration if needed

## Production Deployment Checklist

Before deploying to production:

- [ ] Change JWT_SECRET to secure random value
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS/TLS
- [ ] Set CORS_ORIGIN to production domain
- [ ] Configure production database path
- [ ] Enable security headers (helmet already does this)
- [ ] Set up log aggregation
- [ ] Create database backups
- [ ] Test with production Azure AD app
- [ ] Load test with realistic dataset sizes

## Next Steps

1. **Run full validation suite:**
   ```bash
   npm run validate
   ```

2. **Start backend and test manually:**
   ```bash
   npm run dev
   # Open http://localhost:3000 in browser
   ```

3. **Monitor backend logs for errors:**
   ```bash
   # In another terminal
   tail -f logs/app.log
   ```

4. **After successful testing:**
   - Commit changes to git
   - Create PR for team review
   - Deploy to staging environment
   - Run E2E tests against staging

---

**Status:** Frontend-Backend integration complete and ready for testing.
