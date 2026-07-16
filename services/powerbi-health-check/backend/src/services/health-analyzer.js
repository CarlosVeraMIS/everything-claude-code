const config = require('../config');
const { logger } = require('../utils/logger');
const crypto = require('crypto');

class HealthAnalyzer {
  constructor() {
    this.weights = config.analysis.weights;
    this.memoryThreshold = config.analysis.memoryThreshold;

    // DAX anti-patterns to detect
    this.antiPatterns = [
      { name: 'CALCULATE_FILTER', regex: /CALCULATE\s*\([^)]*FILTER\s*\(/gi, severity: 'high' },
      { name: 'SUMX_NO_CALCULATE', regex: /SUMX\s*\([^)]*[^a]*\)/gi, severity: 'high' },
      { name: 'EVALUATE_ROW', regex: /EVALUATE\s+ROW\s*\(/gi, severity: 'critical' },
      { name: 'HASONEVALUE', regex: /HASONEVALUE\s*\(/gi, severity: 'medium' },
      { name: 'ITERATOR_VARS', regex: /VAR\s+\w+\s*=\s*FILTER\s*\(/gi, severity: 'medium' },
    ];
  }

  /**
   * Calculate 6-factor health score (0-100)
   */
  analyzeHealth(metadata) {
    try {
      logger.info(`Analyzing health for dataset: ${metadata.name}`);

      const factors = {
        memoryFootprint: this.analyzeMemoryFootprint(metadata),
        dataDensity: this.analyzeDataDensity(metadata),
        daxEfficiency: this.analyzeDaxEfficiency(metadata),
        queryPerformance: this.analyzeQueryPerformance(metadata),
        refreshDuration: this.analyzeRefreshDuration(metadata),
        rlsComplexity: this.analyzeRLSComplexity(metadata),
      };

      // Calculate weighted score
      const score = Math.round(
        (factors.memoryFootprint.score * this.weights.memory +
          factors.dataDensity.score * this.weights.density +
          factors.daxEfficiency.score * this.weights.dax +
          factors.queryPerformance.score * this.weights.query +
          factors.refreshDuration.score * this.weights.refresh +
          factors.rlsComplexity.score * this.weights.rls) * 100
      );

      const severity = this.calculateSeverity(score);
      const issues = this.compileIssues(factors);

      const analysis = {
        datasetId: metadata.datasetId,
        datasetName: metadata.name,
        healthScore: score,
        severity,
        factors,
        issues,
        metadata: {
          measureCount: metadata.measures,
          tableCount: metadata.tables.length,
          hierarchyCount: 0, // TODO: extract from metadata
          dataMode: metadata.defaultMode,
        },
        analyzedAt: new Date().toISOString(),
      };

      logger.info(`Health analysis complete for ${metadata.name}: score=${score}, severity=${severity}`);
      return analysis;
    } catch (error) {
      logger.error('Health analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze memory footprint (30% weight)
   */
  analyzeMemoryFootprint(metadata) {
    // Estimate based on table count and measure complexity
    const tableCount = metadata.tables.length;
    const measureCount = metadata.measures;

    // Heuristic: ~50MB per table + ~5MB per 10 measures
    const estimatedSizeMB = tableCount * 50 + (measureCount / 10) * 5;

    let score = 1.0;
    if (estimatedSizeMB > this.memoryThreshold * 2) {
      score = 0.2; // Critical
    } else if (estimatedSizeMB > this.memoryThreshold) {
      score = 0.4; // High concern
    } else if (estimatedSizeMB > this.memoryThreshold / 2) {
      score = 0.7; // OK
    } else {
      score = 1.0; // Excellent
    }

    return {
      score,
      reason: `Estimated ${estimatedSizeMB.toFixed(0)}MB in memory (threshold: ${this.memoryThreshold}MB)`,
      detail: {
        estimatedSizeMB: parseFloat(estimatedSizeMB.toFixed(2)),
        tableCount,
        measureCount,
      },
    };
  }

  /**
   * Analyze data density (20% weight)
   * Sparse models compress poorly
   */
  analyzeDataDensity(metadata) {
    const tableCount = metadata.tables.length;

    // If we have metadata with column counts
    let totalColumns = 0;
    metadata.tables.forEach(t => {
      totalColumns += t.columns || 0;
    });

    // Heuristic: avg 50 columns per table if not specified
    totalColumns = totalColumns || tableCount * 50;

    // Density = measures / (tables × avg_columns)
    const density = metadata.measures / (tableCount * (totalColumns / tableCount));

    let score = 1.0;
    if (density < 0.15) {
      score = 0.3; // Very sparse
    } else if (density < 0.3) {
      score = 0.6; // Sparse
    } else if (density < 0.6) {
      score = 0.85; // Normal
    } else {
      score = 1.0; // Dense
    }

    return {
      score,
      reason: `Data density: ${(density * 100).toFixed(1)}% (sparse models compress poorly)`,
      detail: {
        density: parseFloat((density * 100).toFixed(1)),
        totalColumns,
        estimatedCardinality: 'medium',
      },
    };
  }

  /**
   * Analyze DAX efficiency (20% weight)
   */
  analyzeDaxEfficiency(metadata) {
    if (!metadata.measuresDetail || metadata.measuresDetail.length === 0) {
      return {
        score: 1.0,
        reason: 'No measures to analyze',
        topIssues: [],
      };
    }

    const issues = [];
    const measures = metadata.measuresDetail;

    measures.forEach(measure => {
      if (!measure.expression) return;

      for (const pattern of this.antiPatterns) {
        if (pattern.regex.test(measure.expression)) {
          issues.push({
            measure: measure.name,
            pattern: pattern.name,
            severity: pattern.severity,
          });
          pattern.regex.lastIndex = 0; // Reset regex
        }
      }
    });

    // Score based on issue count
    let score = 1.0;
    if (issues.length > 0) {
      const criticalCount = issues.filter(i => i.severity === 'critical').length;
      const highCount = issues.filter(i => i.severity === 'high').length;

      score = Math.max(0.1, 1.0 - (criticalCount * 0.3 + highCount * 0.15));
    }

    return {
      score,
      reason: `${issues.length} DAX anti-patterns detected`,
      topIssues: issues.slice(0, 5),
    };
  }

  /**
   * Analyze query performance (15% weight)
   */
  analyzeQueryPerformance(metadata) {
    // Heuristic based on number of tables and measure complexity
    const tableCount = metadata.tables.length;
    const measureCount = metadata.measures;

    // Complexity score
    const complexity = (tableCount + measureCount) / 100;

    let score = 1.0;
    if (complexity > 2) {
      score = 0.4; // Complex
    } else if (complexity > 1) {
      score = 0.7; // Moderate
    } else {
      score = 1.0; // Simple
    }

    return {
      score,
      reason: `Query complexity: ${complexity.toFixed(2)} (${tableCount} tables, ${measureCount} measures)`,
      detail: {
        tableCount,
        measureCount,
        complexity: parseFloat(complexity.toFixed(2)),
      },
    };
  }

  /**
   * Analyze refresh duration (10% weight)
   */
  analyzeRefreshDuration(metadata) {
    // Heuristic: ~1sec per 1M rows (assumption) + 5sec per table
    const estimatedSeconds = metadata.tables.length * 5 + 10;

    let score = 1.0;
    if (estimatedSeconds > 1800) { // 30 min
      score = 0.3; // Critical
    } else if (estimatedSeconds > 900) { // 15 min
      score = 0.6; // High
    } else if (estimatedSeconds > 300) { // 5 min
      score = 0.85; // OK
    } else {
      score = 1.0; // Good
    }

    return {
      score,
      reason: `Estimated refresh time: ~${estimatedSeconds}s (${(estimatedSeconds / 60).toFixed(1)}min)`,
      detail: {
        estimatedSeconds,
        tableCount: metadata.tables.length,
      },
    };
  }

  /**
   * Analyze RLS complexity (5% weight)
   */
  analyzeRLSComplexity(metadata) {
    // Check for RLS indicators in measure expressions
    const rlsPatterns = [
      /USERIDENTITY\s*\(/gi,
      /USERNAME\s*\(/gi,
      /USERPRINCIPALNAME\s*\(/gi,
    ];

    let rlsRuleCount = 0;
    if (metadata.measuresDetail) {
      metadata.measuresDetail.forEach(measure => {
        if (!measure.expression) return;
        rlsPatterns.forEach(pattern => {
          const matches = measure.expression.match(pattern);
          if (matches) rlsRuleCount += matches.length;
          pattern.lastIndex = 0;
        });
      });
    }

    let score = 1.0;
    if (rlsRuleCount > 5) {
      score = 0.4; // Complex RLS
    } else if (rlsRuleCount > 0) {
      score = 0.8; // Some RLS
    } else {
      score = 1.0; // No RLS
    }

    return {
      score,
      reason: `RLS complexity: ${rlsRuleCount} rules detected`,
      detail: {
        ruleCount: rlsRuleCount,
      },
    };
  }

  /**
   * Calculate severity level
   */
  calculateSeverity(score) {
    if (score >= 70) return 'OK';
    if (score >= 50) return 'ADVERTENCIA';
    return 'CRÍTICO';
  }

  /**
   * Compile actionable issues
   */
  compileIssues(factors) {
    const issues = [];

    if (factors.memoryFootprint.score < 0.7) {
      issues.push(`Memory footprint high — ${factors.memoryFootprint.reason}`);
    }

    if (factors.dataDensity.score < 0.7) {
      issues.push(`Data density low — ${factors.dataDensity.reason}`);
    }

    if (factors.daxEfficiency.score < 0.7) {
      issues.push(`DAX inefficient — ${factors.daxEfficiency.reason}`);
      if (factors.daxEfficiency.topIssues.length > 0) {
        issues.push(`  Top DAX issues: ${factors.daxEfficiency.topIssues
          .slice(0, 3)
          .map(i => `${i.measure} (${i.pattern})`)
          .join(', ')}`);
      }
    }

    if (factors.queryPerformance.score < 0.7) {
      issues.push(`Query performance risk — ${factors.queryPerformance.reason}`);
    }

    if (factors.refreshDuration.score < 0.7) {
      issues.push(`Refresh duration high — ${factors.refreshDuration.reason}`);
    }

    if (factors.rlsComplexity.score < 0.8) {
      issues.push(`RLS complexity — ${factors.rlsComplexity.reason}`);
    }

    return issues;
  }
}

module.exports = new HealthAnalyzer();
