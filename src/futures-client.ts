import crypto from 'node:crypto';

export interface FuturesConfig {
  apiKey: string;
  secretKey: string;
}

export class FuturesClient {
  private config: FuturesConfig;
  private baseUrl = 'https://fapi.binance.com';

  constructor(config: FuturesConfig) {
    this.config = config;
  }

  private buildQueryString(params: Record<string, unknown>): string {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)] as [string, string]);
    return new URLSearchParams(entries).toString();
  }

  private async signedRequest<T>(method: string, endpoint: string, params?: Record<string, unknown>): Promise<T> {
    const allParams: Record<string, unknown> = {
      ...params,
      timestamp: Date.now(),
      recvWindow: (params?.recvWindow as number) || 5000,
    };
    const queryString = this.buildQueryString(allParams);
    const signature = crypto.createHmac('sha256', this.config.secretKey).update(queryString).digest('hex');
    const signedQs = `${queryString}&signature=${signature}`;

    const url = method === 'GET' || method === 'DELETE'
      ? `${this.baseUrl}${endpoint}?${signedQs}`
      : `${this.baseUrl}${endpoint}`;

    const fetchOpts: RequestInit = {
      method,
      headers: { 'X-MBX-APIKEY': this.config.apiKey },
    };

    if (method === 'POST') {
      fetchOpts.headers = { ...fetchOpts.headers, 'Content-Type': 'application/x-www-form-urlencoded' };
      fetchOpts.body = signedQs;
    }

    const response = await fetch(url, fetchOpts);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Futures API Error ${response.status}: ${(error as any).msg || (error as any).code || response.statusText}`);
    }
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  async getBalance(params?: Record<string, unknown>) {
    return this.signedRequest('GET', '/fapi/v2/balance', params);
  }
  async getAccountInfo(params?: Record<string, unknown>) {
    return this.signedRequest('GET', '/fapi/v2/account', params);
  }
  async getPositionRisk(params?: Record<string, unknown>) {
    return this.signedRequest('GET', '/fapi/v2/positionRisk', params);
  }
  async getIncome(params?: Record<string, unknown>) {
    return this.signedRequest('GET', '/fapi/v1/income', params);
  }
  async getOpenOrders(params?: Record<string, unknown>) {
    return this.signedRequest('GET', '/fapi/v1/openOrders', params);
  }
  async getAllOrders(params: Record<string, unknown>) {
    return this.signedRequest('GET', '/fapi/v1/allOrders', params);
  }
  async newOrder(params: Record<string, unknown>) {
    return this.signedRequest('POST', '/fapi/v1/order', params);
  }
  async cancelOrder(params: Record<string, unknown>) {
    return this.signedRequest('DELETE', '/fapi/v1/order', params);
  }
  async cancelAllOrders(params: Record<string, unknown>) {
    return this.signedRequest('DELETE', '/fapi/v1/allOpenOrders', params);
  }
  async changeLeverage(params: Record<string, unknown>) {
    return this.signedRequest('POST', '/fapi/v1/leverage', params);
  }
  async changeMarginType(params: Record<string, unknown>) {
    return this.signedRequest('POST', '/fapi/v1/marginType', params);
  }
  async getPositionMode() {
    return this.signedRequest('GET', '/fapi/v1/positionSide/dual');
  }
}
