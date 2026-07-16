const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { logger } = require('../utils/logger');

const dbPath = config.database.path;
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Failed to open database:', err);
        reject(err);
        return;
      }

      logger.info(`Database opened: ${dbPath}`);

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
          return;
        }

        createTables()
          .then(() => {
            logger.info('Database tables initialized');
            resolve();
          })
          .catch(reject);
      });
    });
  });
}

async function createTables() {
  const tables = [
    // Extraction history
    `CREATE TABLE IF NOT EXISTS extractions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      dataset_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      error_message TEXT,
      metadata JSON
    )`,

    // Extracted datasets
    `CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      extraction_id TEXT NOT NULL,
      dataset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      table_count INTEGER,
      measure_count INTEGER,
      data_mode TEXT,
      extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (extraction_id) REFERENCES extractions(id)
    )`,

    // Health analysis results
    `CREATE TABLE IF NOT EXISTS health_analyses (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      dataset_name TEXT NOT NULL,
      health_score REAL NOT NULL,
      severity TEXT NOT NULL,
      factors JSON NOT NULL,
      issues JSON,
      analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(dataset_id, analyzed_at)
    )`,

    // Capacity calculations
    `CREATE TABLE IF NOT EXISTS capacity_reports (
      id TEXT PRIMARY KEY,
      report_name TEXT NOT NULL,
      report_count INTEGER NOT NULL,
      avg_health_score REAL,
      total_memory_gb REAL,
      current_sku TEXT,
      current_cu REAL,
      current_price REAL,
      optimization_scenarios JSON,
      growth_scenarios JSON,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Optimization recommendations
    `CREATE TABLE IF NOT EXISTS optimizations (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      effort_hours INTEGER,
      expected_impact REAL,
      priority INTEGER,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    )`,

    // Sessions/API keys
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Audit log
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      user_email TEXT,
      resource_type TEXT,
      resource_id TEXT,
      details JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const table of tables) {
    await runQuery(table);
  }
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// High-level API functions
const db_api = {
  // Extractions
  createExtraction: async (workspaceId) => {
    const id = `ext_${Date.now()}`;
    await runQuery(
      'INSERT INTO extractions (id, workspace_id) VALUES (?, ?)',
      [id, workspaceId]
    );
    return id;
  },

  updateExtraction: async (id, updates) => {
    const { datasetCount, status, error } = updates;
    await runQuery(
      'UPDATE extractions SET dataset_count = ?, status = ?, completed_at = ?, error_message = ? WHERE id = ?',
      [datasetCount, status, status === 'completed' ? new Date().toISOString() : null, error, id]
    );
  },

  // Datasets
  createDataset: async (extractionId, dataset) => {
    const id = `ds_${Date.now()}`;
    await runQuery(
      'INSERT INTO datasets (id, extraction_id, dataset_id, name, description, table_count, measure_count, data_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, extractionId, dataset.datasetId, dataset.name, dataset.description, dataset.tables.length, dataset.measures, dataset.defaultMode]
    );
    return id;
  },

  // Health Analyses
  createHealthAnalysis: async (analysis) => {
    const id = `ha_${Date.now()}`;
    await runQuery(
      'INSERT INTO health_analyses (id, dataset_id, dataset_name, health_score, severity, factors, issues) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, analysis.datasetId, analysis.datasetName, analysis.healthScore, analysis.severity, JSON.stringify(analysis.factors), JSON.stringify(analysis.issues)]
    );
    return id;
  },

  getHealthAnalyses: async (datasetId = null) => {
    if (datasetId) {
      return await allQuery(
        'SELECT * FROM health_analyses WHERE dataset_id = ? ORDER BY analyzed_at DESC',
        [datasetId]
      );
    }
    return await allQuery('SELECT * FROM health_analyses ORDER BY analyzed_at DESC LIMIT 1000');
  },

  // Capacity Reports
  createCapacityReport: async (report) => {
    const id = `cr_${Date.now()}`;
    await runQuery(
      'INSERT INTO capacity_reports (id, report_name, report_count, avg_health_score, total_memory_gb, current_sku, current_cu, current_price, optimization_scenarios, growth_scenarios) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        `Report ${new Date().toISOString()}`,
        report.reportMetadata.reportCount,
        report.reportMetadata.avgHealthScore,
        report.reportMetadata.totalMemoryGB,
        report.currentScenario.recommendedSKU,
        report.currentScenario.cuTotal,
        report.currentScenario.priceMonthly,
        JSON.stringify(report.optimizationAnalysis),
        JSON.stringify(report.growthScenarios)
      ]
    );
    return id;
  },

  getCapacityReports: async () => {
    return await allQuery(
      'SELECT * FROM capacity_reports ORDER BY generated_at DESC LIMIT 100'
    );
  },

  // Audit log
  log: async (action, resourceType, resourceId, details = null, userEmail = null) => {
    const id = `au_${Date.now()}`;
    await runQuery(
      'INSERT INTO audit_log (id, action, resource_type, resource_id, details, user_email) VALUES (?, ?, ?, ?, ?, ?)',
      [id, action, resourceType, resourceId, JSON.stringify(details), userEmail]
    );
  },
};

module.exports = {
  initializeDatabase,
  db_api,
  getQuery,
  allQuery,
  runQuery,
};
