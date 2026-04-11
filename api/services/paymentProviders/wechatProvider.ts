import { MockPaymentProvider } from './mockProvider.js';

export class WechatPaymentProvider extends MockPaymentProvider {
  constructor(environment: 'mock' | 'sandbox' | 'production' = 'mock') {
    super('wechat', environment);
  }
}
