import { Module } from '@nestjs/common';

import { PaymentController } from './platform.controllers.js';
import { PlatformService } from './platform.service.js';

/**
 * Payment infrastructure.
 *
 * `ParentBuffController` left in P4.3b.5d when the parent-blessing action became
 * `plugins/parent-buff`. This module is now payment-only, and it is the last thing in
 * `api/modules/**` that drives Prisma *and* imports from `api/services/**` - which is why it
 * has not been turned into a plugin yet: doing so would migrate infrastructure as if it were
 * a domain. See HANDOFF §8.9.
 */
@Module({
  controllers: [PaymentController],
  providers: [PlatformService],
})
export class PlatformModule {}
