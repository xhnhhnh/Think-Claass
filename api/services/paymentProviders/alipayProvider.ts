import { MockPaymentProvider } from './mockProvider.js';

export class AlipayPaymentProvider extends MockPaymentProvider {
  constructor(environment: 'mock' | 'sandbox' | 'production' = 'mock') {
    super('alipay', environment);
  }
}
