import { SetMetadata } from '@nestjs/common';

export const ALLOW_EXPIRED_ACCESS_KEY = 'allowExpiredTenantAccess';

export const AllowExpiredAccess = () =>
  SetMetadata(ALLOW_EXPIRED_ACCESS_KEY, true);
