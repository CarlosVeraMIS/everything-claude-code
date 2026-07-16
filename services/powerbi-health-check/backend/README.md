# Power BI Health Check - Backend API

Node.js/Express backend for MIvisualization Health Check Service.

## Features

- **Power BI Integration**: Extract metadata via REST API + Scanner API
- **Health Analysis**: 6-factor health score model with DAX anti-pattern detection
- **Capacity Planning**: Fabric SKU sizing + ROI calculations
- **SQLite Database**: Persistent storage of extractions, analyses, and reports
- **JWT Authentication**: Secure Azure AD integration
- **Real-time API**: REST endpoints for all health check operations

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Azure AD tenant credentials (for Power BI access)

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, PBI_WORKSPACE_ID

# Start development server
npm run dev
```

Server runs on `http://localhost:3000`

## API Endpoints

### Authentication

```bash
POST /api/auth/token
# Exchange Azure credentials for JWT
# Body: { workspaceId, userEmail }
# Returns: { accessToken, expiresIn }

GET /api/auth/verify
# Verify current JWT token
# Headers: Authorization: Bearer <token>
```

### Extraction

```bash
POST /api/extraction/extract
# Extract metadata from Power BI workspace
# Body: { workspaceId, datasetIds? }
# Returns: { extractionId, datasetCount, datasets }

GET /api/extraction/status/:extractionId
# Get extraction status
```

### Health Analysis

```bash
POST /api/analysis/health
# Analyze health of datasets
# Body: { datasets: [...] }
# Returns: { analysisCount, analyses }

GET /api/analysis/health
# Get all health analyses

GET /api/analysis/health/:datasetId
# Get health analysis for specific dataset
```

### Capacity Planning

```bash
POST /api/capacity/calculate
# Calculate capacity requirements
# Body: { healthAnalyses: [...], reportName? }
# Returns: { reportId, currentScenario, optimizationAnalysis, growthScenarios }

POST /api/capacity/scenario
# Calculate specific scenario
# Body: { totalGB, reportCount, userCount, userScenario, healthScoreAvg }
# Returns: { scenario, cuTotal, recommendedSKU, priceMonthly }

GET /api/capacity/reports
# Get all capacity reports
```

### Health & Metrics

```bash
GET /api/health
# Service health check

GET /api/metrics/summary
# Get summary metrics
```

## Architecture

```
src/
├── index.js              # Express app entry point
├── config/               # Configuration management
├── middleware/           # Express middleware (auth, error handling)
├── services/             # Business logic
│   ├── auth.js          # Azure AD + JWT authentication
│   ├── pbi-extractor.js # Power BI metadata extraction
│   ├── health-analyzer.js # 6-factor health scoring
│   └── capacity-calculator.js # Fabric SKU sizing
├── routes/              # API endpoints
│   ├── auth.js
│   ├── extraction.js
│   ├── analysis.js
│   ├── capacity.js
│   ├── metrics.js
│   └── health.js
├── db/                  # Database
│   └── sqlite.js        # SQLite schema + queries
└── utils/               # Utilities
    └── logger.js        # Logging
```

## Services

### AuthService
- Azure AD authentication via MSAL
- JWT token generation and verification
- Power BI access token management

### PowerBIExtractor
- Lists datasets in workspace
- Extracts tables, measures, columns
- Estimates dataset size
- Full metadata export

### HealthAnalyzer
- 6-factor model: Memory, Density, DAX, Query, Refresh, RLS
- DAX anti-pattern detection (5 patterns)
- Severity classification (OK / ADVERTENCIA / CRÍTICO)
- Issue compilation

### CapacityCalculator
- CU requirement calculation
- Fabric SKU sizing (F2-F128)
- 3 optimization scenarios (Basic/Intermediate/Complete)
- Growth scenarios (20-200 users)
- ROI analysis

## Database Schema

- `extractions`: Metadata extraction history
- `datasets`: Extracted dataset records
- `health_analyses`: Health score results
- `capacity_reports`: Capacity calculation outputs
- `optimizations`: Optimization recommendations
- `sessions`: JWT sessions
- `audit_log`: Action audit trail

## Configuration

All settings in `.env`:

```bash
# Azure AD
AZURE_TENANT_ID=xxx
AZURE_CLIENT_ID=xxx
AZURE_CLIENT_SECRET=xxx

# Power BI
PBI_WORKSPACE_ID=xxx

# App
NODE_ENV=development
PORT=3000

# Analysis weights
HEALTH_SCORE_WEIGHTS={"memory":0.30,"density":0.20,...}
```

## Development

### Logging

Logs are written to `logs/` directory:
- `logs/error.log` - Errors
- `logs/warn.log` - Warnings
- `logs/info.log` - Info messages
- `logs/debug.log` - Debug messages

### Testing

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
```

### Linting

```bash
npm run lint
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables (Production)

```bash
NODE_ENV=production
JWT_SECRET=<secure-random-string>
AZURE_*=<production-values>
DATABASE_PATH=/data/health-check.db
```

## Performance Considerations

- Power BI API calls have rate limits (~100 requests/sec)
- Extraction time: O(D×M) where D=datasets, M=measures
- Typical extraction: 5-15 min for 50 reports
- Analysis is CPU-bound, ~1-2 min for 50 reports
- Capacity calculation is <1 sec

## Error Handling

API errors return JSON with status code:

```json
{
  "error": "Error message",
  "details": "Additional context",
  "requestId": "req-12345"
}
```

Status codes:
- 400: Bad request
- 401: Unauthorized
- 404: Not found
- 500: Server error

## Future Enhancements

- [ ] Background job queue for long-running extractions
- [ ] WebSocket support for real-time updates
- [ ] Multi-workspace support
- [ ] Scheduled automatic health checks
- [ ] Machine learning for health prediction
- [ ] Integration with Fabric Premium monitoring

## Support

For issues or questions, contact: carlos.j.vera.d@gmail.com
