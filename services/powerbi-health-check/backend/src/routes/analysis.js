const express = require('express');
const healthAnalyzer = require('../services/health-analyzer');
const capacityCalculator = require('../services/capacity-calculator');
const { asyncHandler, requireAuth } = require('../middleware/auth');
const { APIError } = require('../middleware/error');
const { logger } = require('../utils/logger');
const { db_api, allQuery } = require('../db/sqlite');

const router = express.Router();

/**
 * POST /api/analysis/health
 * Analyze health of extracted datasets
 */
router.post('/health', requireAuth, asyncHandler(async (req, res) => {
  const { datasets } = req.body;

  if (!datasets || !Array.isArray(datasets) || datasets.length === 0) {
    throw new APIError(400, 'datasets array is required');
  }

  try {
    logger.info(`Analyzing health for ${datasets.length} datasets`);

    const analyses = [];

    for (const dataset of datasets) {
      try {
        const analysis = healthAnalyzer.analyzeHealth(dataset);
        analyses.push(analysis);

        // Store in database
        await db_api.createHealthAnalysis(analysis);
      } catch (error) {
        logger.warn(`Health analysis failed for ${dataset.name}:`, error.message);
        analyses.push({
          datasetId: dataset.datasetId,
          datasetName: dataset.name,
          error: error.message,
        });
      }
    }

    // Log to audit
    await db_api.log('health_analysis_completed', 'analysis', 'batch', {
      datasetCount: datasets.length,
      analysisCount: analyses.filter(a => !a.error).length,
    }, req.user.userEmail);

    res.json({
      analysisCount: analyses.length,
      analyses,
    });
  } catch (error) {
    logger.error('Health analysis failed:', error);
    throw new APIError(500, 'Health analysis failed', error.message);
  }
}));

/**
 * GET /api/analysis/health/:datasetId
 * Get health analysis for a specific dataset
 */
router.get('/health/:datasetId', requireAuth, asyncHandler(async (req, res) => {
  const { datasetId } = req.params;

  const analyses = await db_api.getHealthAnalyses(datasetId);

  if (!analyses || analyses.length === 0) {
    throw new APIError(404, 'No health analyses found for this dataset');
  }

  // Return latest analysis
  const latest = analyses[0];
  latest.factors = JSON.parse(latest.factors);
  latest.issues = JSON.parse(latest.issues);

  res.json(latest);
}));

/**
 * GET /api/analysis/health
 * Get all health analyses
 */
router.get('/health', requireAuth, asyncHandler(async (req, res) => {
  const analyses = await db_api.getHealthAnalyses();

  const formatted = analyses.map(a => ({
    ...a,
    factors: JSON.parse(a.factors),
    issues: JSON.parse(a.issues),
  }));

  res.json({
    count: formatted.length,
    analyses: formatted,
  });
}));

module.exports = router;
