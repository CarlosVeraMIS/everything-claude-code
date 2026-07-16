#!/usr/bin/env node

/**
 * Accuracy Validation - Compare estimated vs actual metrics
 *
 * Usage:
 *   node src/cli/validate-accuracy.js --dataset-id <id> --actual-size <mb> --actual-refresh <min>
 */

require('dotenv').config();
const pbiExtractor = require('../services/pbi-extractor');
const healthAnalyzer = require('../services/health-analyzer');
const { logger } = require('../utils/logger');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m',
};

class AccuracyValidator {
  constructor() {
    this.metrics = {
      memoryEstimate: { estimated: 0, actual: null, variance: null },
      refreshEstimate: { estimated: 0, actual: null, variance: null },
      measureCount: { estimated: 0, actual: 0, accuracy: 1.0 },
      tableCount: { estimated: 0, actual: 0, accuracy: 1.0 },
    };
  }

  log(type, message, value = null) {
    const colors_obj = {
      info: colors.blue,
      success: colors.green,
      error: colors.red,
      warn: colors.yellow,
    };

    const icon = { info: 'ℹ', success: '✓', error: '✗', warn: '⚠' };
    const prefix = colors_obj[type] + icon[type] + colors.reset;

    let output = `${prefix} ${message}`;
    if (value !== null && value !== undefined) {
      output += ` ${colors.gray}${typeof value === 'object' ? JSON.stringify(value) : value}${colors.reset}`;
    }

    console.log(output);
  }

  calculateVariance(estimated, actual) {
    if (actual === 0) return null;
    return Math.abs((estimated - actual) / actual * 100).toFixed(1);
  }

  async validateDataset(datasetId, actualSize = null, actualRefresh = null) {
    console.log(`${colors.blue}\n═══ Accuracy Validation ═══${colors.reset}\n`);
    this.log('info', `Analyzing dataset: ${datasetId}`);

    try {
      const metadata = await pbiExtractor.extractFullMetadata(datasetId);

      console.log(`\n${colors.blue}Dataset Overview${colors.reset}`);
      this.log('info', `Name: ${metadata.name}`);
      this.log('info', `Mode: ${metadata.defaultMode}`);
      this.log('info', `Tables: ${metadata.tables.length}`);
      this.log('info', `Measures: ${metadata.measures}`);

      // Analyze health
      console.log(`\n${colors.blue}Health Analysis${colors.reset}`);
      const analysis = healthAnalyzer.analyzeHealth(metadata);

      this.log('success', `Health Score: ${analysis.healthScore}/100`);
      this.log('success', `Severity: ${analysis.severity}`);

      // Memory estimation accuracy
      if (actualSize) {
        const estimatedSize = this.estimateMemorySize(metadata);
        const variance = this.calculateVariance(estimatedSize, actualSize);

        console.log(`\n${colors.blue}Memory Estimation Accuracy${colors.reset}`);
        this.log('info', `Estimated: ${estimatedSize.toFixed(1)} MB`);
        this.log('info', `Actual: ${actualSize} MB`);
        this.log(
          variance < 20 ? 'success' : variance < 50 ? 'warn' : 'error',
          `Variance: ${variance}%`
        );

        this.metrics.memoryEstimate = {
          estimated: estimatedSize,
          actual: actualSize,
          variance: parseFloat(variance),
        };
      }

      // Refresh duration accuracy
      if (actualRefresh) {
        const estimatedRefresh = this.estimateRefreshDuration(metadata);
        const variance = this.calculateVariance(estimatedRefresh, actualRefresh);

        console.log(`\n${colors.blue}Refresh Duration Accuracy${colors.reset}`);
        this.log('info', `Estimated: ${estimatedRefresh.toFixed(1)} min`);
        this.log('info', `Actual: ${actualRefresh} min`);
        this.log(
          variance < 30 ? 'success' : variance < 60 ? 'warn' : 'error',
          `Variance: ${variance}%`
        );

        this.metrics.refreshEstimate = {
          estimated: estimatedRefresh,
          actual: actualRefresh,
          variance: parseFloat(variance),
        };
      }

      // Health factors breakdown
      console.log(`\n${colors.blue}Health Factors Breakdown${colors.reset}`);

      const factors = [
        { name: 'Memory Footprint', score: analysis.factors.memoryFootprint.score },
        { name: 'Data Density', score: analysis.factors.dataDensity.score },
        { name: 'DAX Efficiency', score: analysis.factors.daxEfficiency.score },
        { name: 'Query Performance', score: analysis.factors.queryPerformance.score },
        { name: 'Refresh Duration', score: analysis.factors.refreshDuration.score },
        { name: 'RLS Complexity', score: analysis.factors.rlsComplexity.score },
      ];

      factors.forEach(factor => {
        const scorePercent = (factor.score * 100).toFixed(0);
        const status = factor.score >= 0.7 ? 'success' : factor.score >= 0.5 ? 'warn' : 'error';
        this.log(status, `${factor.name}: ${scorePercent}%`);
      });

      // Issues
      if (analysis.issues.length > 0) {
        console.log(`\n${colors.blue}Issues Found (${analysis.issues.length})${colors.reset}`);
        analysis.issues.forEach((issue, i) => {
          this.log('warn', `${i + 1}. ${issue}`);
        });
      } else {
        this.log('success', 'No issues detected');
      }

      // Recommendations
      console.log(`\n${colors.blue}Optimization Recommendations${colors.reset}`);
      if (analysis.factors.memoryFootprint.score < 0.7) {
        this.log('warn', 'Consider archival or aggregation to reduce memory');
      }
      if (analysis.factors.daxEfficiency.score < 0.7) {
        this.log('warn', `Found ${analysis.factors.daxEfficiency.topIssues.length} DAX anti-patterns`);
      }
      if (analysis.factors.refreshDuration.score < 0.7) {
        this.log('warn', 'Optimize table structure or incremental refresh');
      }

      this.printMetrics();
      return analysis;
    } catch (error) {
      this.log('error', 'Validation failed:', error.message);
      process.exit(1);
    }
  }

  estimateMemorySize(metadata) {
    // Heuristic: ~50MB per table + ~5MB per 10 measures
    const tableSize = metadata.tables.length * 50;
    const measureSize = (metadata.measures / 10) * 5;
    return tableSize + measureSize;
  }

  estimateRefreshDuration(metadata) {
    // Heuristic: ~5 seconds per table + 10 seconds overhead
    const duration = metadata.tables.length * 5 + 10;
    return duration / 60; // Convert to minutes
  }

  printMetrics() {
    console.log(`\n${colors.blue}═══ Metrics Summary ═══${colors.reset}\n`);

    if (this.metrics.memoryEstimate.actual) {
      console.log('Memory Estimation:');
      console.log(`  Estimated: ${this.metrics.memoryEstimate.estimated.toFixed(1)} MB`);
      console.log(`  Actual: ${this.metrics.memoryEstimate.actual} MB`);
      console.log(`  Variance: ${this.metrics.memoryEstimate.variance}%`);
    }

    if (this.metrics.refreshEstimate.actual) {
      console.log('\nRefresh Duration:');
      console.log(`  Estimated: ${this.metrics.refreshEstimate.estimated.toFixed(1)} min`);
      console.log(`  Actual: ${this.metrics.refreshEstimate.actual} min`);
      console.log(`  Variance: ${this.metrics.refreshEstimate.variance}%`);
    }
  }
}

// CLI parsing
const args = process.argv.slice(2);

const getArgValue = (argName) => {
  const index = args.indexOf(argName);
  return index !== -1 ? args[index + 1] : null;
};

const datasetId = getArgValue('--dataset-id');
const actualSize = getArgValue('--actual-size') ? parseFloat(getArgValue('--actual-size')) : null;
const actualRefresh = getArgValue('--actual-refresh') ? parseFloat(getArgValue('--actual-refresh')) : null;

if (!datasetId) {
  console.log(`${colors.red}Error: --dataset-id is required${colors.reset}`);
  console.log(`\nUsage:\n  node src/cli/validate-accuracy.js --dataset-id <id> [--actual-size <mb>] [--actual-refresh <min>]`);
  process.exit(1);
}

const validator = new AccuracyValidator();
validator.validateDataset(datasetId, actualSize, actualRefresh).catch(error => {
  console.error(error);
  process.exit(1);
});
