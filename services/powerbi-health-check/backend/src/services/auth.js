const axios = require('axios');
const jwt = require('jsonwebtoken');
const { PublicClientApplication } = require('@azure/msal-node');
const config = require('../config');
const { logger } = require('../utils/logger');

class AuthService {
  constructor() {
    // MSAL client for Azure AD authentication
    this.msalConfig = {
      auth: {
        clientId: config.azure.clientId,
        authority: `https://login.microsoftonline.com/${config.azure.tenantId}`,
        clientSecret: config.azure.clientSecret,
      },
    };

    this.pca = new PublicClientApplication(this.msalConfig);
  }

  /**
   * Get Power BI access token using Azure AD credentials
   */
  async getPowerBIToken() {
    try {
      const tokenRequest = {
        scopes: ['https://analysis.windows.net/powerbi/api/.default'],
        clientId: config.azure.clientId,
        clientSecret: config.azure.clientSecret,
        authority: `https://login.microsoftonline.com/${config.azure.tenantId}`,
      };

      // Use direct POST to token endpoint
      const tokenUrl = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/token`;

      const response = await axios.post(tokenUrl, {
        grant_type: 'client_credentials',
        client_id: config.azure.clientId,
        client_secret: config.azure.clientSecret,
        scope: 'https://analysis.windows.net/powerbi/api/.default',
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000;

      logger.info('Power BI access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get Power BI token:', error);
      throw new Error('Authentication failed: ' + error.message);
    }
  }

  /**
   * Get cached or refresh Power BI token
   */
  async getValidToken() {
    // Check if token is still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiry > Date.now() + 5 * 60 * 1000) {
      return this.accessToken;
    }

    return this.getPowerBIToken();
  }

  /**
   * Generate JWT for internal use
   */
  generateJWT(payload) {
    return jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.jwtExpiry,
      issuer: 'health-check-service',
    });
  }

  /**
   * Verify JWT token
   */
  verifyJWT(token) {
    try {
      return jwt.verify(token, config.auth.jwtSecret);
    } catch (error) {
      logger.warn('JWT verification failed:', error.message);
      return null;
    }
  }

  /**
   * Create session token with workspace info
   */
  createSessionToken(workspaceId, userId, userEmail) {
    return this.generateJWT({
      workspaceId,
      userId,
      userEmail,
      iat: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Extract JWT from Authorization header
   */
  extractToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}

module.exports = new AuthService();
