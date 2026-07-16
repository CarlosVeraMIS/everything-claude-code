const express = require('express');
const pbiExtractor = require('../services/pbi-extractor');
const healthAnalyzer = require('../services/health-analyzer');
const capacityCalculator = require('../services/capacity-calculator');
const { asyncHandler, requireAuth } = require('../middleware/auth');
const { APIError } = require('../middleware/error');
const { logger } = require('../utils/logger');
const { db_api } = require('../db/sqlite');

const router = express.Router();

/**
 * POST /api/extraction/extract
 * Extract metadata from Power BI workspace
 */
router.post('/extract', requireAuth, asyncHandler(async (req, res) => {
  const { workspaceId, datasetIds } = req.body;

  if (!workspaceId) {
    throw new APIError(400, 'workspaceId is required');
  }

  try {
    logger.info(`Starting extraction for workspace: ${workspaceId}`);

    // Create extraction record
    const extractionId = await db_api.createExtraction(workspaceId);

    // Get datasets
    let datasets = [];
    if (datasetIds && datasetIds.length > 0) {
      // Extract specific datasets
      for (const datasetId of datasetIds) {
        try {
          const metadata = await pbiExtractor.extractFullMetadata(datasetId);
          datasets.push(metadata);
          await db_api.createDataset(extractionId, metadata);
        } catch (error) {
          logger.warn(`Failed to extract dataset ${datasetId}:`, error.message);
        }
      }
    } else {
      // Extract all datasets in workspace
      datasets = await pbiExtractor.extractAllDatasets();
      for (const dataset of datasets) {
        if (!dataset.error) {
          await db_api.createDataset(extractionId, dataset);
        }
      }
    }

    // Update extraction status
    await db_api.updateExtraction(extractionId, {
      datasetCount: datasets.filter(d => !d.error).length,
      status: 'completed',
    });

    // Log to audit
    await db_api.log('extraction_completed', 'extraction', extractionId, {
      datasetCount: datasets.length,
      workspaceId,
    }, req.user.userEmail);

    res.json({
      extractionId,
      datasetCount: datasets.length,
      datasets: datasets.map(d => ({
        datasetId: d.datasetId,
        name: d.name,
        error: d.error || null,
      })),
    });
  } catch (error) {
    logger.error('Extraction failed:', error);
    throw new APIError(500, 'Extraction failed', error.message);
  }
}));

/**
 * GET /api/extraction/status/:extractionId
 * Get extraction status
 */
router.get('/status/:extractionId', requireAuth, asyncHandler(async (req, res) => {
  const { extractionId } = req.params;

  // TODO: Query database for extraction status
  res.json({
    extractionId,
    status: 'completed',
    message: 'Implementation pending',
  });
}));

module.exports = router;
