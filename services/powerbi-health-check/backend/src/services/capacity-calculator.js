const { logger } = require('../utils/logger');

// Fabric capacity reference
const FABRIC_CAPACITIES = {
  F2: { cu: 24, price: 250 },
  F4: { cu: 48, price: 500 },
  F8: { cu: 96, price: 1000 },
  F16: { cu: 192, price: 2000 },
  F32: { cu: 384, price: 4000 },
  F64: { cu: 768, price: 8000 },
  F128: { cu: 1536, price: 16000 },
};

const USER_SCENARIOS = {
  light: { concurrencyRatio: 0.1, queriesPerDay: 20, avgQuerySec: 5 },
  medium: { concurrencyRatio: 0.2, queriesPerDay: 50, avgQuerySec: 8 },
  heavy: { concurrencyRatio: 0.3, queriesPerDay: 100, avgQuerySec: 12 },
};

const HEALTH_ADJUSTMENT = {
  80: 1.0,   // Excellent
  70: 1.15,  // Good
  60: 1.35,  // Warning
  50: 1.6,   // Critical
  0: 2.0,    // Very bad
};

class CapacityCalculator {
  /**
   * Calculate CU requirement for a scenario
   */
  calculateCURequirement(params) {
    const {
      totalGB = 0,
      reportCount = 1,
      userCount = 1,
      userScenario = 'medium',
      healthScoreAvg = 70,
      refreshPerDay = 2,
    } = params;

    const scenario = USER_SCENARIOS[userScenario] || USER_SCENARIOS.medium;

    // CU breakdown
    const concurrentUsers = Math.max(1, Math.floor(userCount * scenario.concurrencyRatio));
    const memoryCU = totalGB * 12 * (concurrentUsers / Math.max(1, userCount));
    const reportCU = reportCount * 8;
    const userCU = concurrentUsers * 15;
    const refreshCU = (reportCount * refreshPerDay * 20) / 24;

    const totalCUBase = memoryCU + reportCU + userCU + refreshCU;

    // Health adjustment
    let healthAdjustment = 1.0;
    for (const [threshold, factor] of Object.entries(HEALTH_ADJUSTMENT).sort((a, b) => b[0] - a[0])) {
      if (healthScoreAvg >= parseInt(threshold)) {
        healthAdjustment = factor;
        break;
      }
    }

    const totalCU = totalCUBase * healthAdjustment;

    // Find recommended SKU
    let recommendedSKU = 'F128';
    for (const [sku, capacity] of Object.entries(FABRIC_CAPACITIES)) {
      if (capacity.cu >= totalCU) {
        recommendedSKU = sku;
        break;
      }
    }

    return {
      scenario: userScenario,
      users: userCount,
      concurrentUsers,
      reports: reportCount,
      totalGB: parseFloat(totalGB.toFixed(2)),
      cuBreakdown: {
        memory: parseFloat(memoryCU.toFixed(1)),
        reports: parseFloat(reportCU.toFixed(1)),
        concurrentUsers: parseFloat(userCU.toFixed(1)),
        refresh: parseFloat(refreshCU.toFixed(1)),
      },
      cuTotalBase: parseFloat(totalCUBase.toFixed(1)),
      healthAdjustment: parseFloat(healthAdjustment.toFixed(2)),
      cuTotal: parseFloat(totalCU.toFixed(1)),
      recommendedSKU,
      skuCapacity: FABRIC_CAPACITIES[recommendedSKU].cu,
      priceMonthly: FABRIC_CAPACITIES[recommendedSKU].price,
      utilization: parseFloat(((totalCU / FABRIC_CAPACITIES[recommendedSKU].cu) * 100).toFixed(1)),
    };
  }

  /**
   * Estimate total GB from health analyses
   */
  estimateTotalGB(healthAnalyses) {
    let totalGB = 0;

    healthAnalyses.forEach(analysis => {
      const memoryScore = analysis.factors.memoryFootprint.score;
      // Map score to GB: 100=0.1GB, 50=0.5GB, 10=1.5GB
      const estimatedGB = ((100 - memoryScore * 100) / 100) * 1.5;
      totalGB += estimatedGB;
    });

    return totalGB;
  }

  /**
   * Calculate optimization impact
   */
  calculateOptimizationImpact(currentScenario, optimizedScenarios) {
    const basePrice = currentScenario.priceMonthly;

    const optimizations = optimizedScenarios.map(opt => {
      const monthlySavings = basePrice - opt.priceMonthly;
      const investmentCost = opt.effortHours * 150; // $150/hour rate
      const paybackMonths = monthlySavings > 0 ? investmentCost / monthlySavings : 999;

      return {
        description: opt.description,
        baseSKU: currentScenario.recommendedSKU,
        optimizedSKU: opt.recommendedSKU,
        baseCU: currentScenario.cuTotal,
        optimizedCU: opt.cuTotal,
        cuReduction: parseFloat((currentScenario.cuTotal - opt.cuTotal).toFixed(1)),
        reductionPercent: parseFloat(
          (((currentScenario.cuTotal - opt.cuTotal) / currentScenario.cuTotal) * 100).toFixed(1)
        ),
        basePriceMonthly: basePrice,
        optimizedPriceMonthly: opt.priceMonthly,
        monthlySavings,
        annualSavings: monthlySavings * 12,
        investmentCost,
        paybackMonths: parseFloat(paybackMonths.toFixed(1)),
        effortHours: opt.effortHours,
      };
    });

    return {
      baseScenario: currentScenario,
      optimizations,
    };
  }

  /**
   * Generate full capacity report
   */
  generateCapacityReport(healthAnalyses) {
    if (!healthAnalyses || healthAnalyses.length === 0) {
      throw new Error('No health analyses provided');
    }

    const reportCount = healthAnalyses.length;
    const avgHealthScore = healthAnalyses.reduce((sum, a) => sum + a.healthScore, 0) / reportCount;
    const totalGB = this.estimateTotalGB(healthAnalyses);
    const criticalCount = healthAnalyses.filter(a => a.severity === 'CRÍTICO').length;

    // Current scenario (no optimization)
    const currentScenario = this.calculateCURequirement({
      totalGB,
      reportCount,
      userCount: 50,
      userScenario: 'medium',
      healthScoreAvg: avgHealthScore,
    });

    // Optimization scenarios
    const opt1 = this.calculateCURequirement({
      totalGB: totalGB * 0.85,
      reportCount,
      userCount: 50,
      userScenario: 'medium',
      healthScoreAvg: Math.min(100, avgHealthScore + 15),
    });
    opt1.description = 'Básica (DAX + Agg)';
    opt1.effortHours = 40;

    const opt2 = this.calculateCURequirement({
      totalGB: totalGB * 0.70,
      reportCount,
      userCount: 50,
      userScenario: 'medium',
      healthScoreAvg: Math.min(100, avgHealthScore + 25),
    });
    opt2.description = 'Intermedia (Archival + Denorm)';
    opt2.effortHours = 75;

    const opt3 = this.calculateCURequirement({
      totalGB: totalGB * 0.50,
      reportCount,
      userCount: 50,
      userScenario: 'medium',
      healthScoreAvg: Math.min(100, avgHealthScore + 40),
    });
    opt3.description = 'Completa (Full Refactor)';
    opt3.effortHours = 150;

    // ROI Analysis
    const optimizationAnalysis = this.calculateOptimizationImpact(currentScenario, [opt1, opt2, opt3]);

    // Growth scenarios
    const growthScenarios = {};
    for (const userCount of [20, 50, 100, 200]) {
      growthScenarios[`${userCount}_users`] = {};
      for (const [scenarioName] of Object.entries(USER_SCENARIOS)) {
        growthScenarios[`${userCount}_users`][scenarioName] = this.calculateCURequirement({
          totalGB,
          reportCount,
          userCount,
          userScenario: scenarioName,
          healthScoreAvg: avgHealthScore,
        });
      }
    }

    return {
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        reportCount,
        avgHealthScore: parseFloat(avgHealthScore.toFixed(1)),
        criticalReports: criticalCount,
        totalMemoryGB: parseFloat(totalGB.toFixed(2)),
      },
      currentScenario,
      optimizationAnalysis,
      growthScenarios,
    };
  }
}

module.exports = new CapacityCalculator();
