const express = require('express');
const authService = require('../services/auth');
const { asyncHandler, requireAuth } = require('../middleware/auth');
const { APIError } = require('../middleware/error');
const { logger } = require('../utils/logger');
const { db_api } = require('../db/sqlite');

const router = express.Router();

/**
 * POST /api/auth/token
 * Exchange Azure credentials for JWT
 */
router.post('/token', asyncHandler(async (req, res) => {
  const { workspaceId, userId, userEmail } = req.body;

  if (!workspaceId || !userEmail) {
    throw new APIError(400, 'Missing required fields: workspaceId, userEmail');
  }

  try {
    // Verify Power BI access
    const token = await authService.getPowerBIToken();

    // Generate session JWT
    const sessionToken = authService.createSessionToken(workspaceId, userId || 'anonymous', userEmail);

    // Log to audit trail
    await db_api.log('auth_token_created', 'session', sessionToken, { workspaceId, userEmail });

    res.json({
      accessToken: sessionToken,
      expiresIn: '7d',
      tokenType: 'Bearer',
    });
  } catch (error) {
    logger.error('Token generation failed:', error);
    throw new APIError(401, 'Failed to authenticate with Power BI', error.message);
  }
}));

/**
 * GET /api/auth/verify
 * Verify current JWT token
 */
router.get('/verify', requireAuth, (req, res) => {
  res.json({
    valid: true,
    payload: req.user,
  });
});

/**
 * POST /api/auth/refresh
 * Refresh Power BI token (internal)
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  try {
    const token = await authService.getPowerBIToken();
    res.json({ success: true });
  } catch (error) {
    throw new APIError(500, 'Failed to refresh Power BI token');
  }
}));

module.exports = router;
