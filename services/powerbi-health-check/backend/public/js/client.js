/**
 * Health Check API Client
 * Handles all communication with backend API
 */

class HealthCheckClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('healthCheckToken');
    this.workspaceId = localStorage.getItem('workspaceId');
    this.userEmail = localStorage.getItem('userEmail');
  }

  /**
   * Set authentication token
   */
  setToken(token, workspaceId, userEmail) {
    this.token = token;
    this.workspaceId = workspaceId;
    this.userEmail = userEmail;

    localStorage.setItem('healthCheckToken', token);
    localStorage.setItem('workspaceId', workspaceId);
    localStorage.setItem('userEmail', userEmail);
  }

  /**
   * Clear authentication
   */
  logout() {
    this.token = null;
    this.workspaceId = null;
    this.userEmail = null;

    localStorage.removeItem('healthCheckToken');
    localStorage.removeItem('workspaceId');
    localStorage.removeItem('userEmail');
  }

  /**
   * Make authenticated API request
   */
  async request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Authentication
   */
  async getToken(workspaceId, userEmail) {
    const response = await this.request('POST', '/api/auth/token', {
      workspaceId,
      userEmail,
    });

    this.setToken(response.accessToken, workspaceId, userEmail);
    return response;
  }

  async verifyToken() {
    if (!this.token) return false;
    try {
      await this.request('GET', '/api/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extraction
   */
  async extractPowerBI(datasetIds = null) {
    return this.request('POST', '/api/extraction/extract', {
      workspaceId: this.workspaceId,
      datasetIds,
    });
  }

  async getExtractionStatus(extractionId) {
    return this.request('GET', `/api/extraction/status/${extractionId}`);
  }

  /**
   * Analysis
   */
  async analyzeHealth(datasets) {
    return this.request('POST', '/api/analysis/health', {
      datasets,
    });
  }

  async getHealthAnalyses(datasetId = null) {
    const endpoint = datasetId
      ? `/api/analysis/health/${datasetId}`
      : '/api/analysis/health';

    return this.request('GET', endpoint);
  }

  /**
   * Capacity
   */
  async calculateCapacity(healthAnalyses, reportName = null) {
    return this.request('POST', '/api/capacity/calculate', {
      healthAnalyses,
      reportName,
    });
  }

  async calculateScenario(params) {
    return this.request('POST', '/api/capacity/scenario', params);
  }

  async getCapacityReports() {
    return this.request('GET', '/api/capacity/reports');
  }

  /**
   * Metrics
   */
  async getSummary() {
    return this.request('GET', '/api/metrics/summary');
  }

  /**
   * Health check
   */
  async ping() {
    return this.request('GET', '/ping');
  }
}

// Export for use in HTML
window.HealthCheckClient = HealthCheckClient;
