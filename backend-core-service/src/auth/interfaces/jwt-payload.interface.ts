export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'platform_admin' | 'tenant_user';
  tokenUse: 'access' | 'refresh';
  tenantId?: string;
  iat?: number;
  exp?: number;
}
