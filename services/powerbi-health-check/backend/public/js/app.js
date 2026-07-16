/**
 * Health Check Portal - Application Controller
 */

class HealthCheckApp {
  constructor() {
    this.client = new HealthCheckClient();
    this.currentData = {
      analyses: [],
      capacityReport: null,
      workspaceId: null,
      userEmail: null,
    };

    this.init();
  }

  async init() {
    // Check if already authenticated
    const isAuthenticated = await this.client.verifyToken();

    if (isAuthenticated) {
      this.showMainApp();
      await this.loadData();
    } else {
      this.showLoginForm();
    }

    // Setup event listeners
    this.setupEventListeners();
  }

  showLoginForm() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div style="
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      ">
        <div style="
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          width: 100%;
          max-width: 400px;
        ">
          <h1 style="
            color: #667eea;
            margin-bottom: 30px;
            text-align: center;
            font-size: 24px;
          ">🏥 Health Check Portal</h1>

          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; color: #333; font-weight: 600;">
              Workspace ID
            </label>
            <input
              id="workspaceInput"
              type="text"
              placeholder="Enter Power BI workspace ID"
              style="
                width: 100%;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
              "
            />
          </div>

          <div style="margin-bottom: 30px;">
            <label style="display: block; margin-bottom: 8px; color: #333; font-weight: 600;">
              Email
            </label>
            <input
              id="emailInput"
              type="email"
              placeholder="your@email.com"
              style="
                width: 100%;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
              "
            />
          </div>

          <button
            id="loginBtn"
            style="
              width: 100%;
              padding: 12px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 4px;
              font-weight: 600;
              cursor: pointer;
              font-size: 16px;
            "
          >
            Connect to Power BI
          </button>

          <p style="
            text-align: center;
            margin-top: 20px;
            color: #999;
            font-size: 12px;
          ">
            Make sure your Power BI workspace ID and email are configured in .env
          </p>
        </div>
      </div>
    `;

    document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
  }

  showMainApp() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div style="min-height: 100vh; background: #0f1419; color: #e0e0e0;">
        <header style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        ">
          <div style="max-width: 1600px; margin: 0 auto;">
            <h1 style="color: white; margin: 0; font-size: 24px;">
              🏥 Power BI Health Check Portal
            </h1>
            <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;">
              <span id="userInfo"></span>
              <button id="logoutBtn" style="
                float: right;
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
              ">
                Logout
              </button>
            </p>
          </div>
        </header>

        <div style="max-width: 1600px; margin: 0 auto; padding: 30px 20px;">
          <!-- Loading indicator -->
          <div id="loadingIndicator" style="display: none; text-align: center; padding: 40px;">
            <div style="
              display: inline-block;
              width: 40px;
              height: 40px;
              border: 4px solid #333;
              border-top-color: #667eea;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            "></div>
            <p style="margin-top: 15px; color: #999;">Loading...</p>
          </div>

          <!-- Main content -->
          <div id="mainContent" style="display: none;">
            <!-- Control Panel -->
            <div style="
              background: #1a1f29;
              border: 1px solid #333;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 30px;
            ">
              <h2 style="color: #667eea; margin-top: 0;">
                📊 Control Panel
              </h2>
              <button id="extractBtn" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                margin-right: 10px;
              ">
                🔄 Extract Power BI Metadata
              </button>
              <button id="analyzeBtn" style="
                background: #ff9800;
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                margin-right: 10px;
              ">
                🔍 Analyze Health
              </button>
              <button id="capacityBtn" style="
                background: #4caf50;
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
              ">
                💾 Calculate Capacity
              </button>
            </div>

            <!-- Results Tabs -->
            <div style="
              background: #1a1f29;
              border: 1px solid #333;
              border-radius: 8px;
              overflow: hidden;
            ">
              <div style="
                display: flex;
                border-bottom: 2px solid #333;
              ">
                <button class="tab-btn" data-tab="health" style="
                  flex: 1;
                  padding: 15px;
                  background: none;
                  border: none;
                  color: #999;
                  cursor: pointer;
                  font-weight: 600;
                  border-bottom: 2px solid transparent;
                  transition: all 0.3s;
                ">
                  📊 Health Analysis
                </button>
                <button class="tab-btn" data-tab="capacity" style="
                  flex: 1;
                  padding: 15px;
                  background: none;
                  border: none;
                  color: #999;
                  cursor: pointer;
                  font-weight: 600;
                  border-bottom: 2px solid transparent;
                  transition: all 0.3s;
                ">
                  💰 Capacity Planning
                </button>
                <button class="tab-btn" data-tab="metrics" style="
                  flex: 1;
                  padding: 15px;
                  background: none;
                  border: none;
                  color: #999;
                  cursor: pointer;
                  font-weight: 600;
                  border-bottom: 2px solid transparent;
                  transition: all 0.3s;
                ">
                  📈 Metrics
                </button>
              </div>

              <div id="healthTab" class="tab-content" style="padding: 20px;">
                <div id="healthContent" style="color: #999;">
                  No health analyses available. Click "Analyze Health" to start.
                </div>
              </div>

              <div id="capacityTab" class="tab-content" style="padding: 20px; display: none;">
                <div id="capacityContent" style="color: #999;">
                  No capacity reports available. Click "Calculate Capacity" to start.
                </div>
              </div>

              <div id="metricsTab" class="tab-content" style="padding: 20px; display: none;">
                <div id="metricsContent" style="color: #999;">
                  No metrics available yet.
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;

    // Setup event listeners
    document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
    document.getElementById('extractBtn').addEventListener('click', () => this.handleExtraction());
    document.getElementById('analyzeBtn').addEventListener('click', () => this.handleAnalysis());
    document.getElementById('capacityBtn').addEventListener('click', () => this.handleCapacity());

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    this.updateUserInfo();
  }

  setupEventListeners() {
    // Already set up in showLoginForm and showMainApp
  }

  async handleLogin() {
    const workspaceId = document.getElementById('workspaceInput').value;
    const userEmail = document.getElementById('emailInput').value;

    if (!workspaceId || !userEmail) {
      alert('Please enter workspace ID and email');
      return;
    }

    try {
      this.showLoading(true);
      await this.client.getToken(workspaceId, userEmail);
      this.showMainApp();
      await this.loadData();
    } catch (error) {
      alert(`Authentication failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  async handleLogout() {
    this.client.logout();
    this.init();
  }

  async handleExtraction() {
    if (!confirm('Extract metadata from all datasets in workspace?')) return;

    try {
      this.showLoading(true);
      const result = await this.client.extractPowerBI();

      alert(`✓ Extraction complete!\n${result.datasetCount} datasets extracted.`);
      await this.loadData();
    } catch (error) {
      alert(`Extraction failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  async handleAnalysis() {
    // Mock data for demo (would be real data in production)
    const mockAnalyses = [
      {
        datasetId: 'ds1',
        datasetName: 'Sales Dashboard',
        healthScore: 72,
        severity: 'ADVERTENCIA',
        factors: { memoryFootprint: { score: 0.7 }, daxEfficiency: { score: 0.65 } },
        issues: ['Memory footprint high', 'DAX inefficient'],
      },
    ];

    try {
      this.showLoading(true);
      const result = await this.client.analyzeHealth(mockAnalyses);

      this.currentData.analyses = result.analyses || [];
      this.renderHealthAnalysis();
      this.switchTab('health');
    } catch (error) {
      alert(`Analysis failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  async handleCapacity() {
    if (this.currentData.analyses.length === 0) {
      alert('Run health analysis first');
      return;
    }

    try {
      this.showLoading(true);
      const result = await this.client.calculateCapacity(this.currentData.analyses);

      this.currentData.capacityReport = result;
      this.renderCapacityReport();
      this.switchTab('capacity');
    } catch (error) {
      alert(`Capacity calculation failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  async loadData() {
    try {
      this.showLoading(true);
      const analyses = await this.client.getHealthAnalyses();
      this.currentData.analyses = analyses.analyses || [];
    } catch (error) {
      console.warn('Could not load analyses:', error);
    } finally {
      this.showLoading(false);
      this.renderDashboard();
    }
  }

  renderDashboard() {
    const mainContent = document.getElementById('mainContent');
    if (mainContent) mainContent.style.display = 'block';

    this.renderHealthAnalysis();
    this.renderMetrics();
  }

  renderHealthAnalysis() {
    const content = document.getElementById('healthContent');

    if (this.currentData.analyses.length === 0) {
      content.innerHTML = '<p style="color: #999;">No health analyses available. Click "Analyze Health" to start.</p>';
      return;
    }

    const html = this.currentData.analyses.map(a => `
      <div style="
        background: #0f1419;
        border-left: 4px solid ${a.severity === 'OK' ? '#4caf50' : a.severity === 'ADVERTENCIA' ? '#ff9800' : '#f44336'};
        padding: 15px;
        margin-bottom: 15px;
        border-radius: 4px;
      ">
        <h3 style="margin: 0 0 10px 0; color: white;">${a.datasetName}</h3>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <p style="margin: 5px 0; color: #999;">Health Score: <strong style="color: #667eea; font-size: 18px;">${a.healthScore}/100</strong></p>
            <p style="margin: 5px 0; color: #999;">Severity: <strong>${a.severity}</strong></p>
          </div>
          <div>
            <div style="
              width: 100px;
              height: 100px;
              border-radius: 50%;
              background: conic-gradient(#667eea 0% ${a.healthScore}%, #333 ${a.healthScore}% 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              color: white;
            ">
              ${a.healthScore}
            </div>
          </div>
        </div>
        ${a.issues ? `<p style="color: #ff9800; margin: 10px 0 0 0;">⚠️ ${a.issues.slice(0, 2).join(', ')}</p>` : ''}
      </div>
    `).join('');

    content.innerHTML = html;
  }

  renderCapacityReport() {
    const content = document.getElementById('capacityContent');

    if (!this.currentData.capacityReport) {
      content.innerHTML = '<p style="color: #999;">No capacity report available.</p>';
      return;
    }

    const report = this.currentData.capacityReport;
    const current = report.currentScenario || report.current_scenario;

    const html = `
      <h3 style="color: #667eea; margin-top: 0;">Current Scenario</h3>
      <div style="
        background: #0f1419;
        border: 1px solid #333;
        padding: 15px;
        border-radius: 4px;
        margin-bottom: 20px;
      ">
        <p><strong>Reports:</strong> ${current.reports || 50}</p>
        <p><strong>Health Score:</strong> ${report.reportMetadata?.avgHealthScore || 'N/A'}/100</p>
        <p><strong>Memory:</strong> ${report.reportMetadata?.totalMemoryGB || 'N/A'} GB</p>
        <p><strong>Recommended SKU:</strong> <span style="color: #ff9800; font-weight: bold;">${current.recommendedSKU}</span></p>
        <p><strong>Price:</strong> $${current.priceMonthly}/month</p>
        <p><strong>Utilization:</strong> ${current.utilization}%</p>
      </div>

      <h3 style="color: #4caf50;">Optimization Scenarios</h3>
      ${report.optimizationAnalysis?.optimizations?.map(opt => `
        <div style="
          background: #0f1419;
          border: 1px solid #333;
          padding: 15px;
          border-radius: 4px;
          margin-bottom: 15px;
        ">
          <p><strong>${opt.description}</strong></p>
          <p style="color: #4caf50;">✓ Recommended SKU: ${opt.optimizedSKU}</p>
          <p>Monthly Savings: <strong style="color: #4caf50;">$${opt.monthlySavings}</strong></p>
          <p>Annual Savings: <strong style="color: #4caf50;">$${opt.annualSavings}</strong></p>
          <p>Payback: <strong>${opt.paybackMonths} months</strong></p>
          <p style="color: #999;">Effort: ${opt.effortHours} hours</p>
        </div>
      `).join('') || '<p style="color: #999;">No optimization scenarios available.</p>'}
    `;

    content.innerHTML = html;
  }

  renderMetrics() {
    const content = document.getElementById('metricsContent');

    const stats = {
      totalAnalyses: this.currentData.analyses.length,
      averageHealth: this.currentData.analyses.length > 0
        ? Math.round(this.currentData.analyses.reduce((sum, a) => sum + a.healthScore, 0) / this.currentData.analyses.length)
        : 0,
      criticalCount: this.currentData.analyses.filter(a => a.severity === 'CRÍTICO').length,
      okCount: this.currentData.analyses.filter(a => a.severity === 'OK').length,
    };

    const html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
        <div style="background: #0f1419; border: 1px solid #333; padding: 20px; border-radius: 4px; text-align: center;">
          <p style="color: #999; margin: 0;">Total Analyses</p>
          <p style="color: #667eea; font-size: 32px; font-weight: bold; margin: 10px 0;">${stats.totalAnalyses}</p>
        </div>
        <div style="background: #0f1419; border: 1px solid #333; padding: 20px; border-radius: 4px; text-align: center;">
          <p style="color: #999; margin: 0;">Average Health</p>
          <p style="color: #667eea; font-size: 32px; font-weight: bold; margin: 10px 0;">${stats.averageHealth}/100</p>
        </div>
        <div style="background: #0f1419; border: 1px solid #333; padding: 20px; border-radius: 4px; text-align: center;">
          <p style="color: #999; margin: 0;">Critical Reports</p>
          <p style="color: #f44336; font-size: 32px; font-weight: bold; margin: 10px 0;">${stats.criticalCount}</p>
        </div>
        <div style="background: #0f1419; border: 1px solid #333; padding: 20px; border-radius: 4px; text-align: center;">
          <p style="color: #999; margin: 0;">Healthy Reports</p>
          <p style="color: #4caf50; font-size: 32px; font-weight: bold; margin: 10px 0;">${stats.okCount}</p>
        </div>
      </div>
    `;

    content.innerHTML = html;
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.style.display = 'none';
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.style.color = '#999';
      btn.style.borderBottomColor = 'transparent';
    });

    const tabElement = document.getElementById(tabName + 'Tab');
    if (tabElement) tabElement.style.display = 'block';

    const btnElement = document.querySelector(`[data-tab="${tabName}"]`);
    if (btnElement) {
      btnElement.style.color = '#667eea';
      btnElement.style.borderBottomColor = '#667eea';
    }
  }

  updateUserInfo() {
    const info = document.getElementById('userInfo');
    if (info) {
      info.textContent = `${this.client.userEmail} | Workspace: ${this.client.workspaceId.substring(0, 8)}...`;
    }
  }

  showLoading(show) {
    const indicator = document.getElementById('loadingIndicator');
    const mainContent = document.getElementById('mainContent');

    if (indicator) {
      indicator.style.display = show ? 'block' : 'none';
    }
    if (mainContent) {
      mainContent.style.display = show ? 'none' : 'block';
    }
  }
}

// Export class for use in HTML
window.HealthCheckApp = HealthCheckApp;

// Initialize app when DOM is ready (or immediately if already ready)
function initializeApp() {
  try {
    const appElement = document.getElementById('app');
    if (appElement) {
      window.app = new HealthCheckApp();
    }
  } catch (error) {
    console.error('Error initializing app:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM is already ready (scripts loaded at end of body)
  initializeApp();
}
