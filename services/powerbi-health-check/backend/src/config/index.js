module.exports = {
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
  },

  azure: {
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  },

  powerbi: {
    workspaceId: process.env.PBI_WORKSPACE_ID,
    apiUrl: process.env.PBI_API_URL || 'https://api.powerbi.com/v1.0/myorg',
  },

  database: {
    path: process.env.DATABASE_PATH || './data/health-check.db',
  },

  onelake: {
    accountName: process.env.ONELAKE_ACCOUNT_NAME,
    workspaceId: process.env.ONELAKE_WORKSPACE_ID,
    capacityId: process.env.ONELAKE_CAPACITY_ID,
  },

  features: {
    realExtraction: process.env.FEATURE_REAL_EXTRACTION === 'true',
    autoScheduling: process.env.FEATURE_AUTO_SCHEDULING === 'true',
    fabricIntegration: process.env.FEATURE_FABRIC_INTEGRATION === 'true',
  },

  analysis: {
    memoryThreshold: parseInt(process.env.HEALTH_SCORE_MEMORY_THRESHOLD || '256', 10),
    weights: JSON.parse(process.env.HEALTH_SCORE_WEIGHTS || '{"memory":0.30,"density":0.20,"dax":0.20,"query":0.15,"refresh":0.10,"rls":0.05}'),
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
