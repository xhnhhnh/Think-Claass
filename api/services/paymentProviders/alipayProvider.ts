import { MockPaymentProvider } from './mockProvider.js';
import type { PaymentEnvironment, PaymentProviderConfig } from './index.js';

export class AlipayPaymentProvider extends MockPaymentProvider {
  constructor(environment: PaymentEnvironment = 'mock', _config: PaymentProviderConfig = {}) {
    super('alipay', environment);
  }
}
