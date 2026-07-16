const axios = require('axios');
const authService = require('./auth');
const { logger } = require('../utils/logger');
const config = require('../config');

class PowerBIExtractor {
  constructor() {
    this.apiUrl = config.powerbi.apiUrl;
    this.workspaceId = config.powerbi.workspaceId;
  }

  /**
   * Get all datasets in the workspace
   */
  async getDatasets() {
    try {
      const token = await authService.getValidToken();
      const url = `${this.apiUrl}/groups/${this.workspaceId}/datasets`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      logger.info(`Retrieved ${response.data.value.length} datasets from workspace`);
      return response.data.value;
    } catch (error) {
      logger.error('Failed to get datasets:', error);
      throw new Error('Failed to retrieve datasets: ' + error.message);
    }
  }

  /**
   * Get dataset details including tables and measures
   */
  async getDatasetDetails(datasetId) {
    try {
      const token = await authService.getValidToken();
      const url = `${this.apiUrl}/datasets/${datasetId}`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      logger.error(`Failed to get dataset ${datasetId} details:`, error);
      throw error;
    }
  }

  /**
   * Get all tables in a dataset
   */
  async getTables(datasetId) {
    try {
      const token = await authService.getValidToken();
      const url = `${this.apiUrl}/datasets/${datasetId}/tables`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      logger.info(`Retrieved ${response.data.value.length} tables from dataset ${datasetId}`);
      return response.data.value;
    } catch (error) {
      logger.error(`Failed to get tables for dataset ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Get all measures in a dataset
   */
  async getMeasures(datasetId) {
    try {
      const token = await authService.getValidToken();
      const url = `${this.apiUrl}/datasets/${datasetId}`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Flatten all measures from all tables
      const measures = [];
      if (response.data.tables) {
        response.data.tables.forEach(table => {
          if (table.measures) {
            table.measures.forEach(measure => {
              measures.push({
                tableId: table.name,
                name: measure.name,
                expression: measure.expression,
                formatString: measure.formatString || null,
                hidden: measure.hidden || false,
                description: measure.description || null,
              });
            });
          }
        });
      }

      logger.info(`Retrieved ${measures.length} measures from dataset ${datasetId}`);
      return measures;
    } catch (error) {
      logger.error(`Failed to get measures for dataset ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Extract complete metadata from a dataset
   */
  async extractFullMetadata(datasetId) {
    try {
      logger.info(`Starting metadata extraction for dataset ${datasetId}`);

      const [details, tables, measures] = await Promise.all([
        this.getDatasetDetails(datasetId),
        this.getTables(datasetId),
        this.getMeasures(datasetId),
      ]);

      const metadata = {
        datasetId,
        name: details.name,
        description: details.description || null,
        createdDate: details.createdDate || null,
        configuredBy: details.configuredBy || null,
        defaultMode: details.defaultMode || 'Import', // Import or DirectQuery
        tables: tables.map(t => ({
          name: t.name,
          description: t.description || null,
          columns: t.columns ? t.columns.length : 0,
          measures: t.measures ? t.measures.length : 0,
        })),
        measures: measures.length,
        measuresDetail: measures,
        extractedAt: new Date().toISOString(),
      };

      logger.info(`Metadata extraction completed for ${datasetId}`);
      return metadata;
    } catch (error) {
      logger.error(`Failed to extract full metadata for ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Extract metadata from all datasets in workspace
   */
  async extractAllDatasets() {
    try {
      const datasets = await this.getDatasets();

      if (!datasets || datasets.length === 0) {
        logger.warn('No datasets found in workspace');
        return [];
      }

      logger.info(`Starting extraction for ${datasets.length} datasets`);

      // Extract metadata for each dataset with error handling
      const results = [];
      for (const dataset of datasets) {
        try {
          const metadata = await this.extractFullMetadata(dataset.id);
          results.push(metadata);
        } catch (error) {
          logger.warn(`Skipped dataset ${dataset.id}: ${error.message}`);
          results.push({
            datasetId: dataset.id,
            name: dataset.name,
            error: error.message,
            extractedAt: new Date().toISOString(),
          });
        }
      }

      logger.info(`Extraction completed: ${results.filter(r => !r.error).length} successful, ${results.filter(r => r.error).length} failed`);
      return results;
    } catch (error) {
      logger.error('Failed to extract all datasets:', error);
      throw error;
    }
  }

  /**
   * Get dataset size estimation (in MB)
   */
  async estimateDatasetSize(datasetId) {
    try {
      const token = await authService.getValidToken();
      const url = `${this.apiUrl}/datasets/${datasetId}`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Size estimation based on table count and column cardinality
      // This is a rough heuristic (actual compression depends on Vertipaq)
      let estimatedSizeMB = 0;
      if (response.data.tables) {
        response.data.tables.forEach(table => {
          const cols = table.columns ? table.columns.length : 0;
          // Rough estimate: ~8 bytes per value × average cardinality
          estimatedSizeMB += (cols * 100 * 1024) / (1024 * 1024); // ~100k cardinality avg
        });
      }

      return Math.max(estimatedSizeMB, 10); // Minimum 10MB
    } catch (error) {
      logger.error(`Failed to estimate size for dataset ${datasetId}:`, error);
      return null;
    }
  }
}

module.exports = new PowerBIExtractor();
