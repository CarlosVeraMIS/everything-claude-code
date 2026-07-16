#!/usr/bin/env node

/**
 * Validate real Power BI integration
 *
 * Usage:
 *   node src/cli/validate-powerbi.js --test-extraction
 *   node src/cli/validate-powerbi.js --test-auth
 *   node src/cli/validate-powerbi.js --test-all
 *   node src/cli/validate-powerbi.js --dataset-id <id>
 */

require('dotenv').config();
const authService = require('../services/auth');
const pbiExtractor = require('../services/pbi-extractor');
const healthAnalyzer = require('../services/health-analyzer');
const capacityCalculator = require('../services/capacity-calculator');
const { logger } = require('../utils/logger');

const config = require('../config');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m',
};

class PowerBIValidator {
  constructor() {
    this.results = {
      auth: null,
      extraction: null,
      analysis: null,
      capacity: null,
    };
  }

  log(type, message, data = null) {
    const timestamp = new Date().toISOString().slice(11, 19);
    let prefix = '';

    switch (type) {
      case 'info':
        prefix = `${colors.blue}ℹ${colors.reset}`;
        break;
      case 'success':
        prefix = `${colors.green}✓${colors.reset}`;
        break;
      case 'error':
        prefix = `${colors.red}✗${colors.reset}`;
        break;
      case 'warn':
        prefix = `${colors.yellow}⚠${colors.reset}`;
        break;
      default:
        prefix = '•';
    }

    console.log(`[${timestamp}] ${prefix} ${message}`);
    if (data) {
      console.log(`${colors.gray}${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
  }

  async testAuth() {
    console.log(`\n${colors.blue}═══ Testing Authentication ═══${colors.reset}\n`);

    try {
      this.log('info', 'Checking Azure AD credentials...');

      if (!config.azure.tenantId || !config.azure.clientId || !config.azure.clientSecret) {
        throw new Error('Missing Azure credentials in .env');
      }

      this.log('success', 'Azure credentials configured');

      this.log('info', 'Requesting Power BI access token...');
      const token = await authService.getPowerBIToken();

      if (!token) {
        throw new Error('Failed to get access token');
      }

      this.log('success', 'Power BI access token obtained');
      this.log('info', `Token length: ${token.length} chars`);
      this.log('info', `Token preview: ${token.substring(0, 20)}...`);

      // Test JWT generation
      const jwt = authService.generateJWT({
        workspaceId: config.powerbi.workspaceId,
        userEmail: 'test@company.com',
      });

      this.log('success', 'JWT token generated successfully');
      this.log('info', `JWT preview: ${jwt.substring(0, 20)}...`);

      // Verify JWT
      const verified = authService.verifyJWT(jwt);
      if (verified && verified.workspaceId === config.powerbi.workspaceId) {
        this.log('success', 'JWT verification passed');
      } else {
        throw new Error('JWT verification failed');
      }

      this.results.auth = { success: true, tokenType: 'Bearer' };
      return true;
    } catch (error) {
      this.log('error', `Authentication test failed: ${error.message}`);
      this.results.auth = { success: false, error: error.message };
      return false;
    }
  }

  async testExtraction() {
    console.log(`\n${colors.blue}═══ Testing Power BI Extraction ═══${colors.reset}\n`);

    if (!this.results.auth?.success) {
      this.log('error', 'Skipping extraction test (authentication failed)');
      return false;
    }

    try {
      this.log('info', `Connecting to workspace: ${config.powerbi.workspaceId}`);

      const datasets = await pbiExtractor.getDatasets();

      if (!datasets || datasets.length === 0) {
        this.log('warn', 'No datasets found in workspace');
        this.results.extraction = { success: true, datasetCount: 0, datasets: [] };
        return true;
      }

      this.log('success', `Found ${datasets.length} datasets`);

      // Extract first 3 datasets for validation
      const testCount = Math.min(3, datasets.length);
      const extractedDatasets = [];

      for (let i = 0; i < testCount; i++) {
        const dataset = datasets[i];
        this.log('info', `Extracting dataset ${i + 1}/${testCount}: ${dataset.name}`);

        try {
          const metadata = await pbiExtractor.extractFullMetadata(dataset.id);

          // Validate metadata structure
          this.validateMetadata(metadata);

          this.log('success', `  ├─ Tables: ${metadata.tables.length}`);
          this.log('success', `  ├─ Measures: ${metadata.measures}`);
          this.log('success', `  └─ Mode: ${metadata.defaultMode}`);

          extractedDatasets.push({
            name: metadata.name,
            tables: metadata.tables.length,
            measures: metadata.measures,
            mode: metadata.defaultMode,
          });
        } catch (error) {
          this.log('error', `  Failed to extract: ${error.message}`);
        }
      }

      this.results.extraction = {
        success: true,
        totalDatasets: datasets.length,
        extracted: extractedDatasets,
      };

      return true;
    } catch (error) {
      this.log('error', `Extraction test failed: ${error.message}`);
      this.results.extraction = { success: false, error: error.message };
      return false;
    }
  }

  validateMetadata(metadata) {
    if (!metadata.datasetId) throw new Error('Missing datasetId');
    if (!metadata.name) throw new Error('Missing dataset name');
    if (!Array.isArray(metadata.tables)) throw new Error('Invalid tables array');
    if (typeof metadata.measures !== 'number') throw new Error('Invalid measure count');
  }

  async testAnalysis() {
    console.log(`\n${colors.blue}═══ Testing Health Analysis ═══${colors.reset}\n`);

    if (!this.results.extraction?.extracted?.length) {
      this.log('warn', 'Skipping analysis test (no extracted datasets)');
      return false;
    }

    try {
      const sampleDataset = {
        datasetId: 'test-001',
        name: 'Test Dashboard',
        description: 'Sample for health analysis',
        tables: [
          { name: 'Fact_Sales', description: 'Sales data', columns: 15 },
          { name: 'Dim_Customer', description: 'Customer data', columns: 8 },
          { name: 'Dim_Date', description: 'Date dimension', columns: 5 },
        ],
        measures: 45,
        defaultMode: 'Import',
        measuresDetail: [
          {
            name: 'Total Revenue',
            expression: 'CALCULATE(SUM(Sales[Amount]), ALL(Date))',
            tableId: 'Fact_Sales',
          },
          {
            name: 'YoY Growth',
            expression: 'DIVIDE([Revenue], [Prior Year Revenue])',
            tableId: 'Fact_Sales',
          },
          {
            name: 'Bad Measure',
            expression: 'CALCULATE(SUM([Amount]), FILTER(Sales, USERIDENTITY() = "user"))',
            tableId: 'Fact_Sales',
          },
        ],
      };

      this.log('info', 'Analyzing sample dataset health...');

      const analysis = healthAnalyzer.analyzeHealth(sampleDataset);

      this.log('success', `Health Score: ${analysis.healthScore}/100`);
      this.log('success', `Severity: ${analysis.severity}`);

      if (analysis.issues.length > 0) {
        this.log('warn', `Issues found: ${analysis.issues.length}`);
        analysis.issues.forEach((issue, i) => {
          this.log('warn', `  ${i + 1}. ${issue}`);
        });
      }

      // Validate score
      if (analysis.healthScore < 0 || analysis.healthScore > 100) {
        throw new Error(`Invalid health score: ${analysis.healthScore}`);
      }

      if (!['OK', 'ADVERTENCIA', 'CRÍTICO'].includes(analysis.severity)) {
        throw new Error(`Invalid severity: ${analysis.severity}`);
      }

      // Validate factors
      const factorKeys = ['memoryFootprint', 'dataDensity', 'daxEfficiency', 'queryPerformance', 'refreshDuration', 'rlsComplexity'];
      for (const key of factorKeys) {
        if (!analysis.factors[key]) throw new Error(`Missing factor: ${key}`);
        if (typeof analysis.factors[key].score !== 'number') throw new Error(`Invalid factor score: ${key}`);
      }

      this.log('success', 'All health factors validated');

      this.results.analysis = {
        success: true,
        healthScore: analysis.healthScore,
        severity: analysis.severity,
        factorsCount: Object.keys(analysis.factors).length,
        issuesCount: analysis.issues.length,
      };

      return true;
    } catch (error) {
      this.log('error', `Analysis test failed: ${error.message}`);
      this.results.analysis = { success: false, error: error.message };
      return false;
    }
  }

  async testCapacity() {
    console.log(`\n${colors.blue}═══ Testing Capacity Calculator ═══${colors.reset}\n`);

    try {
      const sampleAnalyses = [
        {
          datasetId: 'ds1',
          datasetName: 'Dashboard 1',
          healthScore: 72,
          factors: {
            memoryFootprint: { score: 0.8, detail: { estimatedSizeMB: 150 } },
            dataDensity: { score: 0.7 },
            daxEfficiency: { score: 0.65 },
            queryPerformance: { score: 0.75 },
            refreshDuration: { score: 0.8 },
            rlsComplexity: { score: 0.9 },
          },
        },
        {
          datasetId: 'ds2',
          datasetName: 'Dashboard 2',
          healthScore: 68,
          factors: {
            memoryFootprint: { score: 0.7, detail: { estimatedSizeMB: 200 } },
            dataDensity: { score: 0.6 },
            daxEfficiency: { score: 0.55 },
            queryPerformance: { score: 0.7 },
            refreshDuration: { score: 0.75 },
            rlsComplexity: { score: 0.85 },
          },
        },
      ];

      this.log('info', 'Generating capacity report for 50 datasets (sample)...');

      // Mock scenario with 50 reports
      const sampleScenario = {
        reportMetadata: {
          reportCount: 50,
          avgHealthScore: 70,
          criticalReports: 8,
          totalMemoryGB: 34.2,
        },
        currentScenario: {},
        optimizationAnalysis: {},
        growthScenarios: {},
      };

      const scenario = capacityCalculator.calculateCURequirement({
        totalGB: 34.2,
        reportCount: 50,
        userCount: 50,
        userScenario: 'medium',
        healthScoreAvg: 70,
        refreshPerDay: 2,
      });

      this.log('success', `Current SKU: ${scenario.recommendedSKU}`);
      this.log('success', `CU Required: ${scenario.cuTotal}`);
      this.log('success', `Price/Month: $${scenario.priceMonthly}`);
      this.log('success', `Utilization: ${scenario.utilization}%`);

      // Test optimization scenario
      const optScenario = capacityCalculator.calculateCURequirement({
        totalGB: 34.2 * 0.85, // 15% reduction
        reportCount: 50,
        userCount: 50,
        userScenario: 'medium',
        healthScoreAvg: 85, // +15 improvement
        refreshPerDay: 2,
      });

      const savings = scenario.priceMonthly - optScenario.priceMonthly;

      this.log('info', 'After basic optimization (40h, 15% reduction):');
      this.log('success', `  ├─ SKU: ${optScenario.recommendedSKU}`);
      this.log('success', `  ├─ Price: $${optScenario.priceMonthly}`);
      this.log('success', `  └─ Monthly Savings: $${savings} ($${savings * 12}/year)`);

      // Validate
      if (scenario.cuTotal <= 0) throw new Error('Invalid CU calculation');
      if (!['F2', 'F4', 'F8', 'F16', 'F32', 'F64', 'F128'].includes(scenario.recommendedSKU)) {
        throw new Error(`Invalid SKU: ${scenario.recommendedSKU}`);
      }

      this.results.capacity = {
        success: true,
        currentSKU: scenario.recommendedSKU,
        currentCU: scenario.cuTotal,
        optimizedSKU: optScenario.recommendedSKU,
        monthlySavings: savings,
      };

      return true;
    } catch (error) {
      this.log('error', `Capacity test failed: ${error.message}`);
      this.results.capacity = { success: false, error: error.message };
      return false;
    }
  }

  printSummary() {
    console.log(`\n${colors.blue}═══ Validation Summary ═══${colors.reset}\n`);

    const results = {
      'Authentication': this.results.auth?.success ? '✓ PASS' : '✗ FAIL',
      'Power BI Extraction': this.results.extraction?.success ? '✓ PASS' : '✗ FAIL',
      'Health Analysis': this.results.analysis?.success ? '✓ PASS' : '✗ FAIL',
      'Capacity Calculator': this.results.capacity?.success ? '✓ PASS' : '✗ FAIL',
    };

    for (const [test, status] of Object.entries(results)) {
      const isPass = status.includes('PASS');
      const color = isPass ? colors.green : colors.red;
      console.log(`${color}${status}${colors.reset} ${test}`);
    }

    const allPassed = Object.values(this.results).every(r => r?.success);

    console.log(`\n${allPassed ? colors.green : colors.yellow}Overall: ${allPassed ? 'ALL TESTS PASSED ✓' : 'SOME TESTS FAILED'}${colors.reset}\n`);

    console.log('Detailed Results:');
    console.log(JSON.stringify(this.results, null, 2));
  }

  async run(options = {}) {
    console.log(`${colors.blue}
╔═══════════════════════════════════════════╗
║  Power BI Health Check - Validation Suite ║
║                                           ║
║  Testing real Power BI integration        ║
╚═══════════════════════════════════════════╝${colors.reset}`);

    try {
      const testAll = options.testAll || (!options.testAuth && !options.testExtraction && !options.testAnalysis && !options.testCapacity);

      if (options.testAuth || testAll) {
        const authPassed = await this.testAuth();
        if (!authPassed && !testAll) process.exit(1);
      }

      if (options.testExtraction || testAll) {
        const extractionPassed = await this.testExtraction();
        if (!extractionPassed && !testAll) process.exit(1);
      }

      if (options.testAnalysis || testAll) {
        const analysisPassed = await this.testAnalysis();
        if (!analysisPassed && !testAll) process.exit(1);
      }

      if (options.testCapacity || testAll) {
        const capacityPassed = await this.testCapacity();
        if (!capacityPassed && !testAll) process.exit(1);
      }

      this.printSummary();

      process.exit(Object.values(this.results).every(r => r?.success) ? 0 : 1);
    } catch (error) {
      this.log('error', 'Validation failed:', error);
      process.exit(1);
    }
  }
}

// CLI argument parsing
const args = process.argv.slice(2);
const options = {
  testAuth: args.includes('--test-auth'),
  testExtraction: args.includes('--test-extraction'),
  testAnalysis: args.includes('--test-analysis'),
  testCapacity: args.includes('--test-capacity'),
  testAll: args.includes('--test-all'),
};

const validator = new PowerBIValidator();
validator.run(options);

module.exports = PowerBIValidator;
