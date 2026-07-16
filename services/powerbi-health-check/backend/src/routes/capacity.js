const express = require('express');
const capacityCalculator = require('../services/capacity-calculator');
const { asyncHandler, requireAuth } = require('../middleware/auth');
const { APIError } = require('../middleware/error');
const { logger } = require('../utils/logger');
const { db_api } = require('../db/sqlite');

const router = express.Router();

/**
 * POST /api/capacity/calculate
 * Calculate capacity requirements and ROI
 */
router.post('/calculate', requireAuth, asyncHandler(async (req, res) => {
  const { healthAnalyses, reportName } = req.body;

  if (!healthAnalyses || !Array.isArray(healthAnalyses) || healthAnalyses.length === 0) {
    throw new APIError(400, 'healthAnalyses array is required');
  }

  try {
    logger.info(`Calculating capacity for ${healthAnalyses.length} reports`);

    const report = capacityCalculator.generateCapacityReport(healthAnalyses);

    // Store report in database
    const reportId = await db_api.createCapacityReport(report);

    // Log to audit
    await db_api.log('capacity_calculated', 'capacity_report', reportId, {
      reportCount: healthAnalyses.length,
      avgHealthScore: report.reportMetadata.avgHealthScore,
      recommendedSKU: report.currentScenario.recommendedSKU,
    }, req.user.userEmail);

    res.json({
      reportId,
      ...report,
    });
  } catch (error) {
    logger.error('Capacity calculation failed:', error);
    throw new APIError(500, 'Capacity calculation failed', error.message);
  }
}));

/**
 * GET /api/capacity/reports
 * Get all capacity reports
 */
router.get('/reports', requireAuth, asyncHandler(async (req, res) => {
  const reports = await db_api.getCapacityReports();

  const formatted = reports.map(r => ({
    ...r,
    optimizationScenarios: JSON.parse(r.optimization_scenarios),
    growthScenarios: JSON.parse(r.growth_scenarios),
  }));

  res.json({
    count: formatted.length,
    reports: formatted,
  });
}));

/**
 * POST /api/capacity/scenario
 * Calculate a specific capacity scenario
 */
router.post('/scenario', requireAuth, asyncHandler(async (req, res) => {
  const {
    totalGB,
    reportCount,
    userCount,
    userScenario = 'medium',
    healthScoreAvg = 70,
    refreshPerDay = 2,
  } = req.body;

  if (typeof totalGB !== 'number' || typeof reportCount !== 'number') {
    throw new APIError(400, 'totalGB and reportCount are required numbers');
  }

  try {
    const scenario = capacityCalculator.calculateCURequirement({
      totalGB,
      reportCount,
      userCount,
      userScenario,
      healthScoreAvg,
      refreshPerDay,
    });

    res.json(scenario);
  } catch (error) {
    logger.error('Scenario calculation failed:', error);
    throw new APIError(500, 'Scenario calculation failed', error.message);
  }
}));

module.exports = router;
