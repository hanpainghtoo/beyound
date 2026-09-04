export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  type: "platform_admin" | "tenant_user";
  tenantId?: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type PlatformAdminStatsDto = {
  totalTenants: number;
  activeTenants: number;
  pendingTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  activeUsers: number;
  monthlyMessageVolume: number;
  connectedChannels: number;
  totalRevenue: number;
  monthlyRevenue: number;
};

export type PlatformTenantDto = {
  id: string;
  tenantCode: string;
  companyName: string;
  industry?: string | null;
  businessType?: string | null;
  contactPerson?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  website?: string | null;
  address?: string | null;
  description?: string | null;
  status: string;
  subscriptionPlanId?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  customCsrLimit?: number | null;
  customChannelLimit?: number | null;
  customMessageLimit?: number | null;
  customApiLimit?: number | null;
  timezone?: string;
  language?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  statusReason?: string;
};

export type ChangeTenantSubscriptionPlanInput = {
  subscriptionPlanId: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  createBillingRecord?: boolean;
  notes?: string;
};

export type UpdatePlatformTenantInput = Partial<{
  companyName: string;
  industry: string;
  businessType: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  address: string;
  description: string;
  subscriptionPlanId: string;
  status: "pending" | "active" | "suspended" | "rejected";
}>;

export type CreatePlatformTenantInput = {
  tenantCode: string;
  companyName: string;
  industry?: string;
  businessType?: string;
  contactPerson?: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  address?: string;
  description?: string;
  subscriptionPlanId?: string;
  status?: "pending" | "active" | "suspended" | "rejected";
  ownerFullName?: string;
  ownerEmail?: string;
  /** Provision the configured trial plan on creation (Plan 14 Phase 2). */
  startWithTrial?: boolean;
};

export type CreatePlatformTenantResult = {
  tenant: PlatformTenantDto;
  inviteSent: boolean;
  temporaryPassword?: string;
};

export type SubscriptionPlanDto = {
  id: string;
  name: string;
  description?: string | null;
  monthlyPrice: number | string;
  /** `business` uses calendar-month periods; `trial` uses `durationDays`. */
  planType: "business" | "trial";
  /** Whether tenants may request this plan in the business catalog (false for trial). */
  requestable: boolean;
  /** Whether the plan renews (false for trial). */
  renewable: boolean;
  /** Whether tenants may purchase top-ups against this plan (false for trial). */
  topUpAllowed: boolean;
  /** Whether a paid period skips admin activation (true for trial). */
  autoApprove: boolean;
  /** Trial length in days for trial plans; legacy value for business plans. */
  durationDays: number;
  /** @deprecated Legacy field. New plans always use independent limits. */
  messageQuotaMode: "combined" | "directional";
  maxCsrs: number;
  maxChannels: number;
  /** @deprecated Legacy aggregate cap. New enforcement uses directional limits. */
  messageLimit: number | null;
  /** Monthly inbound message limit. null = unlimited, 0 = blocked. */
  inboundMessageLimit: number | null;
  /** Monthly outbound message limit. null = unlimited, 0 = blocked. */
  outboundMessageLimit: number | null;
  allowedProviders: string[];
  apiLimit: number | null;
  storageLimitGb: number;
  features: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionAddOnComponentDto = {
  id: string;
  componentType:
    | "inbound_messages"
    | "outbound_messages"
    | "api_requests"
    | "channel_slots"
    | "storage_gb";
  quantity: number;
  unit: "messages" | "requests" | "channels" | "gb";
  displayOrder: number;
};

export type SubscriptionAddOnProductDto = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  status: "active" | "inactive" | "archived";
  version: number;
  metadata: Record<string, unknown>;
  components: SubscriptionAddOnComponentDto[];
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionAddOnPurchaseDto = {
  id: string;
  tenantId: string;
  subscriptionPeriodId: string;
  productId: string;
  billingRecordId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  purchasePrice: number;
  currency: string;
  paymentStatus: "pending" | "paid" | "failed";
  purchaseStatus: "pending" | "active" | "expired" | "cancelled";
  effectiveAt?: string | null;
  expiresAt: string;
  targetPeriod?: {
    monthStartAt?: string | null;
    monthEndAt?: string | null;
    periodStartAt?: string | null;
    periodEndAt?: string | null;
  } | null;
  components: Array<
    SubscriptionAddOnComponentDto & {
      expiresAt: string;
      componentStatus: "pending" | "active" | "expired";
    }
  >;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSubscriptionPeriodDto = {
  id: string;
  tenantId?: string;
  planId: string;
  billingRecordId?: string | null;
  periodType: "trial" | "paid";
  periodStatus: "upcoming" | "active" | "expired" | "cancelled";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  adminActivationStatus?: "pending" | "approved" | "revoked" | null;
  adminActivatedAt?: string | null;
  adminActivatedBy?: string | null;
  adminActivationReason?: string | null;
  monthStartAt?: string | null;
  monthEndAt?: string | null;
  periodStartAt?: string | null;
  periodEndAt?: string | null;
  scheduledStartAt?: string | null;
  activatedAt?: string | null;
  expiredAt?: string | null;
  startOption?: "current_month" | "next_month" | "scheduled_prepaid" | null;
  sequenceNumber: number;
};

export type SubscriptionEntitlementDto = {
  tenantId: string;
  activePeriodId: string;
  planId: string;
  periodStartAt?: string | null;
  periodEndAt?: string | null;
  activatedAt?: string | null;
  periodStatus: string;
  paymentStatus: string;
  paymentState: "paid" | "pending" | "failed" | "refunded";
  baseLimits: Record<string, number | null>;
  activeTopUpComponentTotals: Record<string, number>;
  effectiveLimits: Record<string, number | null>;
  quotaState: Record<
    string,
    {
      base: number | null;
      topUpTotal: number;
      effective: number | null;
      blocked: boolean;
    }
  >;
};

export type PlatformSubscriptionPeriodUsageDto = {
  usageSource: "period_scoped" | "not_attributed";
  periodStart: string | null;
  periodEnd: string | null;
  inboundMessages: number;
  outboundMessages: number;
  apiRequests: number;
  activeChannels: number;
  storage: {
    usedBytes: number | null;
    effectiveCapacityGb: number | null;
    overStorageLimit: boolean;
    expiresAt: string | null;
  };
};

export type PlatformSubscriptionPeriodsResponseDto = {
  tenantId: string;
  activePeriodId: string | null;
  entitlement: SubscriptionEntitlementDto | null;
  entitlementError: { code: string; message: string } | null;
  periodUsage?: PlatformSubscriptionPeriodUsageDto;
  periods: PlatformSubscriptionPeriodDto[];
};

export type ChannelRetentionSelectionInput = { selected: boolean };

export type ChannelCapacityStateDto = {
  baseCapacityGb?: number | null;
  topUpCapacityGb?: number;
  effectiveCapacityGb?: number | null;
  usedGb?: number;
  overCapacity?: boolean;
  activePeriodId?: string | null;
  expiresAt?: string | null;
};

export type ChannelTemplateDto = {
  id: string;
  channelType: "messenger" | "viber" | "telegram" | "tiktok";
  templateName: string;
  appId?: string | null;
  botToken?: string | null;
  callbackUrl?: string | null;
  webhookEvents: string[];
  defaultWelcomeMessage?: string | null;
  status: "active" | "inactive";
  configuration: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type UpdateChannelTemplateInput = Partial<{
  channelType: ChannelTemplateDto["channelType"];
  templateName: string;
  appId: string;
  botToken: string;
  callbackUrl: string;
  webhookEvents: string[];
  defaultWelcomeMessage: string;
  status: "active" | "inactive";
  configuration: Record<string, unknown>;
}>;

export type CreateChannelTemplateInput = {
  channelType: ChannelTemplateDto["channelType"];
  templateName: string;
  appId?: string;
  botToken?: string;
  callbackUrl?: string;
  webhookEvents?: string[];
  defaultWelcomeMessage?: string;
  status?: "active" | "inactive";
  configuration?: Record<string, unknown>;
};

export type PlatformSettingsDto = Record<string, unknown>;
export type PlatformFeatureTogglesDto = Record<string, unknown>;

export type PlatformLeadDto = {
  id: string;
  intent: "demo" | "sales" | "support" | "general" | "trial";
  status: "new" | "contacted" | "qualified" | "converted" | "closed";
  fullName: string;
  companyName: string;
  emailAddress: string;
  phoneNumber?: string | null;
  businessType?: string | null;
  teamSize?: string | null;
  interestedIn?: string | null;
  message?: string | null;
  source?: string | null;
  metadata: Record<string, unknown>;
  contactedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAdminDto = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: "active" | "inactive" | "suspended" | string;
  lastLoginAt?: string | null;
  createdAt: string;
};

export type TenantBillingRecordDto = {
  id: string;
  tenantId: string;
  subscriptionPlanId?: string | null;
  invoiceNumber?: string | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceStatus: "draft" | "issued" | "void";
  paymentStatus: "unpaid" | "partially_paid" | "paid" | "overdue" | "waived";
  amountDue: number | string;
  amountPaid: number | string;
  currency: string;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown> & {
    paymentMethod?: string;
    paymentReference?: string;
    paymentProof?: {
      id?: string;
      status?: "pending_review" | "approved" | "rejected" | string;
      paymentMethod?: string;
      paidAmount?: number | string;
      paidDate?: string | null;
      transactionReference?: string | null;
      mediaFileId?: string | null;
      fileName?: string | null;
      contentType?: string | null;
      note?: string | null;
      submittedAt?: string | null;
      rejectionReason?: string | null;
      reviewedAt?: string | null;
    };
    paymentProofSubmissions?: Array<Record<string, unknown>>;
    paymentHistory?: Array<{
      paidAt: string;
      receivedAmount: number;
      paymentMethod: string;
      paymentReference: string;
      internalNote?: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  tenant?: Pick<
    PlatformTenantDto,
    "id" | "tenantCode" | "companyName" | "status"
  >;
  subscriptionPlan?: Pick<
    SubscriptionPlanDto,
    "id" | "name" | "monthlyPrice"
  > | null;
  subscriptionPeriod?: PlatformSubscriptionPeriodDto | null;
  pendingUpgradeRevision?: {
    id: string;
    subscriptionPeriodId: string;
    upgradeStatus: string;
    previousPlanId: string;
    upgradedPlanId: string;
  } | null;
};

export type TenantUsageWarningDto = {
  metric: "csrs" | "channels" | "apiRequests" | "providerMessages";
  severity: "warning" | "limit_reached";
  used: number;
  limit: number;
  percentUsed: number;
};

export type TenantUsageSummaryDto = {
  tenant: Pick<
    PlatformTenantDto,
    "id" | "tenantCode" | "companyName" | "status"
  >;
  subscriptionPlan: Pick<
    SubscriptionPlanDto,
    "id" | "name" | "monthlyPrice"
  > | null;
  period: {
    start: string;
    end: string;
  };
  periodStart: string;
  periodEnd: string;
  refreshedAt: string;
  usageSource: "tenant_usage_events";
  latestUsageEventAt?: string | null;
  limits: {
    csrs: number | null;
    channels: number | null;
    apiRequests: number | null;
    providerMessages: number | null;
  };
  usage: {
    csrs: number;
    channels: number;
    apiRequests: number;
    providerMessages: number;
  };
  remaining: {
    csrs: number | null;
    channels: number | null;
    apiRequests: number | null;
    providerMessages: number | null;
  };
  metrics: Record<
    "csrs" | "channels" | "apiRequests" | "providerMessages",
    {
      key: "csrs" | "channels" | "apiRequests" | "providerMessages";
      label: string;
      used: number;
      limit: number | null;
      remaining: number | null;
      percentUsed: number | null;
      unlimited: boolean;
      available: boolean;
      warningSeverity: "warning" | "limit_reached" | null;
      refreshedAt: string;
      lastRecordedAt?: string | null;
    }
  >;
  warnings: TenantUsageWarningDto[];
  providerBreakdown: Array<{
    provider: string | null;
    channelId: string | null;
    direction: string | null;
    used: number;
  }>;
};

export type PlatformOrderDto = {
  id: string;
  tenantId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  codAmount: number;
  deliveryAssigneeName?: string | null;
  deliveryZone?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  tenant: {
    id: string;
    tenantCode: string;
    companyName: string;
  };
  channel?: {
    id: string;
    channelType?: string | null;
    channelName?: string | null;
    displayName?: string | null;
  } | null;
  customer?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
};

export type PlatformOrderPaymentSummaryDto = {
  totals: {
    orderCount: number;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    codAmount: number;
  };
  statuses: Record<
    string,
    {
      orderCount: number;
      totalAmount: number;
      paidAmount: number;
      balanceDue: number;
      codAmount: number;
    }
  >;
};

export type PlatformConversationDto = {
  id: string;
  tenantId: string;
  status: string;
  priority: string;
  subject?: string | null;
  lastMessageAt?: string | null;
  lastCustomerMessageAt?: string | null;
  lastCsrResponseAt?: string | null;
  assignedAt?: string | null;
  createdAt: string;
  messageCount: number;
  lastMessagePreview?: string | null;
  tenant: {
    id: string;
    tenantCode: string;
    companyName: string;
  };
  customer?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
    notes?: string | null;
  } | null;
  channel?: {
    id: string;
    channelType?: string | null;
    channelName?: string | null;
    displayName?: string | null;
  } | null;
  assignedCsr?: {
    id: string;
    fullName?: string | null;
  } | null;
};

export type PlatformDeliveryDto = {
  id: string;
  tenantId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  deliveryDate?: string | null;
  deliveryAssigneeName?: string | null;
  deliveryAssigneePhone?: string | null;
  deliveryZone?: string | null;
  trackingNumber?: string | null;
  codAmount: number;
  balanceDue: number;
  createdAt: string;
  tenant: {
    id: string;
    tenantCode: string;
    companyName: string;
  };
  customer?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
};

export type PlatformProductDto = {
  id: string;
  tenantId: string;
  name: string;
  sku?: string | null;
  status: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  isLowStock: boolean;
  updatedAt: string;
  tenant: {
    id: string;
    tenantCode: string;
    companyName: string;
  };
};

export type PlatformProductCatalogSummaryDto = {
  tenantId: string;
  tenantCode: string;
  companyName: string;
  productCount: number;
  activeProducts: number;
  inactiveProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  lastUpdatedAt?: string | null;
};

export type TenantChannelVisibilityDto = {
  id: string;
  tenantId: string;
  channelType: string;
  channelName: string;
  displayName?: string | null;
  status: string;
  entitlementOrigin?: "base_plan" | "top_up";
  entitlementExpiresAt?: string | null;
  retentionSelected?: boolean;
  disabledAt?: string | null;
  disabledReason?: string | null;
  credentialStatus: string;
  connectionStatus: string;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  errorMessage?: string | null;
  updatedAt: string;
};

export type PlatformChannelVisibilityDto = TenantChannelVisibilityDto & {
  tenant: {
    id: string;
    tenantCode: string;
    companyName: string;
    status: string;
  };
};

export type TenantSupportNoteDto = {
  note: string;
  updatedAt?: string | null;
};

export type PlatformTenantRateLimitDto = {
  id: string | null;
  tenantId: string;
  tenant: {
    id: string;
    tenantCode: string;
    companyName: string;
    status: string;
  };
  source: "persisted" | "default";
  messagesPerMinute: number;
  apiRequestsPerMinute: number;
  webhookEventsPerMinute: number;
  throttlingMode: string;
  graceLimitPercentage: number;
  updatedAt: string | null;
};

export type PlatformAuditLogDto = {
  id: string;
  adminId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  admin?: {
    id: string;
    email?: string;
    fullName?: string;
    role?: string;
  } | null;
};

export type UpdatePlatformSettingsInput = {
  appName?: string;
  platformName?: string;
  platformDescription?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportUrl?: string;
  defaultCurrency?: string;
  defaultTimezone?: string;
  invoiceReminderDays?: number;
  invoiceReminderSenderEnabled?: boolean;
  invoiceFooterNote?: string;
  defaultTheme?: {
    primary: string;
    secondary: string;
    warning: string;
    danger: string;
    neutral: string;
  };
  maintenanceMode?: boolean;
};

const API_BASE_URL = "/api/proxy";
const SESSION_KEY = "kme-auth-session";
export const SESSION_EXPIRED_EVENT = "zayos:session-expired";

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const rawSession = window.localStorage.getItem(SESSION_KEY);
  if (!rawSession) return null;

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function storeSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = getStoredSession();
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      message = errorBody.message || message;
    } catch {
      // Keep the status-derived fallback when an error response is not JSON.
    }
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      message = "Your session has expired. Please sign in again.";
    }
    throw new PlatformApiError(
      Array.isArray(message) ? message.join(", ") : message,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function login(
  usernameOrEmail: string,
  password: string,
): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail, password }),
  });
  storeSession(session);
  return session;
}

export function requestPasswordReset(
  email: string,
  userType: "tenant_user" | "platform_admin" = "platform_admin",
) {
  return apiRequest<{ message: string }>("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email, userType }),
  });
}

export function confirmPasswordReset(token: string, newPassword: string) {
  return apiRequest<{ message: string }>("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function getPlatformDashboardStats() {
  return apiRequest<PlatformAdminStatsDto>("/platform-admin/dashboard/stats");
}

export async function getPlatformTenants(
  options: { search?: string; page?: number; limit?: number } = {},
) {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    limit: String(options.limit || 100),
    sortBy: "createdAt",
    sortOrder: "DESC",
  });

  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }

  return apiRequest<PaginatedResult<PlatformTenantDto>>(
    `/platform-admin/tenants?${params.toString()}`,
  );
}

export async function getPlatformTenant(id: string) {
  return apiRequest<PlatformTenantDto>(`/platform-admin/tenants/${id}`);
}

export async function suspendPlatformTenant(id: string, reason: string) {
  return apiRequest<PlatformTenantDto>(
    `/platform-admin/tenants/${id}/suspend`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export async function reactivatePlatformTenant(id: string, reason: string) {
  return apiRequest<PlatformTenantDto>(
    `/platform-admin/tenants/${id}/reactivate`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export async function deletePlatformTenant(id: string) {
  return apiRequest<{ message: string }>(`/platform-admin/tenants/${id}`, {
    method: "DELETE",
  });
}

export async function updatePlatformTenant(
  id: string,
  data: UpdatePlatformTenantInput,
) {
  return apiRequest<PlatformTenantDto>(`/platform-admin/tenants/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function createPlatformTenant(data: CreatePlatformTenantInput) {
  return apiRequest<CreatePlatformTenantResult>("/platform-admin/tenants", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type TenantUserDto = {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

export async function getPlatformTenantUsers(tenantId: string) {
  return apiRequest<TenantUserDto[]>(
    `/platform-admin/tenants/${tenantId}/users`,
  );
}

export type InviteTenantUserInput = {
  fullName: string;
  email: string;
  role?: string;
};

export async function invitePlatformTenantUser(
  tenantId: string,
  data: InviteTenantUserInput,
) {
  return apiRequest<{
    user: TenantUserDto;
    invitation: {
      message: string;
      invitationDelivery: string;
      expiresAt: string;
    };
  }>(`/platform-admin/tenants/${tenantId}/users/invite`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function resendPlatformTenantUserInvite(
  tenantId: string,
  userId: string,
) {
  return apiRequest<{
    message: string;
    invitationDelivery: string;
    expiresAt: string;
  }>(`/platform-admin/tenants/${tenantId}/users/${userId}/resend-invite`, {
    method: "POST",
  });
}

export type ApproveTenantInput = {
  action: "approved" | "rejected";
  subscriptionPlanId?: string;
};

export async function approvePlatformTenant(
  id: string,
  data: ApproveTenantInput,
) {
  return apiRequest<PlatformTenantDto>(
    `/platform-admin/tenants/${id}/approve`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function getSubscriptionPlans() {
  return apiRequest<SubscriptionPlanDto[]>(
    "/platform-admin/subscription-plans",
  );
}

export async function getPlatformAddOnProducts() {
  return apiRequest<SubscriptionAddOnProductDto[]>(
    "/platform-admin/add-on-products",
  );
}

export async function createPlatformAddOnProduct(data: {
  code: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  components: Array<{
    componentType: SubscriptionAddOnComponentDto["componentType"];
    quantity: number;
    unit?: SubscriptionAddOnComponentDto["unit"];
    displayOrder?: number;
  }>;
}) {
  return apiRequest<SubscriptionAddOnProductDto>(
    "/platform-admin/add-on-products",
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updatePlatformAddOnProduct(
  id: string,
  data: Partial<Parameters<typeof createPlatformAddOnProduct>[0]>,
) {
  return apiRequest<SubscriptionAddOnProductDto>(
    `/platform-admin/add-on-products/${id}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
}

export async function publishPlatformAddOnProduct(id: string) {
  return apiRequest<SubscriptionAddOnProductDto>(
    `/platform-admin/add-on-products/${id}/publish`,
    { method: "POST" },
  );
}

export async function archivePlatformAddOnProduct(id: string) {
  return apiRequest<SubscriptionAddOnProductDto>(
    `/platform-admin/add-on-products/${id}/archive`,
    { method: "POST" },
  );
}

export async function deletePlatformAddOnProduct(id: string) {
  return apiRequest<{ message: string }>(
    `/platform-admin/add-on-products/${id}`,
    { method: "DELETE" },
  );
}

export async function getPlatformAddOnPurchases(tenantId?: string) {
  const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return apiRequest<SubscriptionAddOnPurchaseDto[]>(
    `/platform-admin/add-on-purchases${query}`,
  );
}

export async function getTenantSubscriptionPeriods(tenantId: string) {
  return apiRequest<PlatformSubscriptionPeriodsResponseDto>(
    `/platform-admin/subscription/periods?tenantId=${encodeURIComponent(tenantId)}`,
  );
}

export type AdminActivatePeriodInput = {
  reason?: string;
};

export type AdminActivatePeriodResult = {
  id: string;
  tenantId: string;
  planId: string;
  billingRecordId?: string | null;
  periodType: string;
  periodStatus: string;
  paymentStatus: string;
  adminActivationStatus: string;
  adminActivatedAt?: string | null;
  adminActivatedBy?: string | null;
  adminActivationReason?: string | null;
  monthStartAt?: string | null;
  monthEndAt?: string | null;
  operational: boolean;
};

export async function adminActivatePeriod(
  tenantId: string,
  periodId: string,
  input: AdminActivatePeriodInput = {},
) {
  return apiRequest<AdminActivatePeriodResult>(
    `/platform-admin/tenants/${encodeURIComponent(tenantId)}/subscription-periods/${encodeURIComponent(periodId)}/admin-activate`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export type PlatformUpgradeRevisionDto = {
  id: string;
  subscriptionPeriodId: string;
  tenantId: string;
  billingRecordId: string | null;
  previousPlanId: string;
  upgradedPlanId: string;
  previousPlanName?: string | null;
  upgradedPlanName?: string | null;
  previousPlanPrice?: number | null;
  upgradedPlanPrice?: number | null;
  kind: "upgrade" | "trial_conversion";
  upgradeStatus:
    | "requested"
    | "pending_payment"
    | "pending_approval"
    | "approved"
    | "rejected"
    | "stale"
    | "cancelled";
  upgradeRequestedAt?: string | null;
  upgradeEffectiveAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectionReason?: string | null;
  carryover: {
    inboundMessages: number | null;
    outboundMessages: number | null;
    apiRequests: number | null;
  };
  previousPlanSnapshot: Record<string, unknown>;
  upgradedPlanSnapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export async function getTenantUpgradeRevisions(tenantId: string) {
  return apiRequest<PlatformUpgradeRevisionDto[]>(
    `/platform-admin/tenants/${encodeURIComponent(tenantId)}/upgrade-revisions`,
  );
}

export async function approveUpgradeRevision(
  tenantId: string,
  periodId: string,
  revisionId: string,
  input: { reason?: string } = {},
) {
  return apiRequest<PlatformUpgradeRevisionDto>(
    `/platform-admin/tenants/${encodeURIComponent(tenantId)}/subscription-periods/${encodeURIComponent(periodId)}/upgrade-revisions/${encodeURIComponent(revisionId)}/approve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function rejectUpgradeRevision(
  tenantId: string,
  periodId: string,
  revisionId: string,
  input: { reason?: string },
) {
  return apiRequest<PlatformUpgradeRevisionDto>(
    `/platform-admin/tenants/${encodeURIComponent(tenantId)}/subscription-periods/${encodeURIComponent(periodId)}/upgrade-revisions/${encodeURIComponent(revisionId)}/reject`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export type PlatformPeriodEventDto = {
  id: string;
  eventType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  source?: string | null;
  reason?: string | null;
  createdAt: string;
};

export type PlatformPeriodEventsResponseDto = {
  periodId: string;
  tenantId: string;
  events: PlatformPeriodEventDto[];
};

export async function getPlatformPeriodEvents(tenantId: string, periodId: string) {
  return apiRequest<PlatformPeriodEventsResponseDto>(
    `/platform-admin/subscription/periods/${encodeURIComponent(periodId)}/events?tenantId=${encodeURIComponent(tenantId)}`,
  );
}

export async function getPlatformTenantSubscriptionPeriods(tenantId: string) {
  return apiRequest<PlatformSubscriptionPeriodsResponseDto>(
    `/platform-admin/subscription/periods?tenantId=${encodeURIComponent(tenantId)}`,
  );
}

export async function getPlatformBillingRecords() {
  return apiRequest<TenantBillingRecordDto[]>(
    "/platform-admin/billing-records",
  );
}

export type ConfirmPlatformPaymentInput = {
  paymentDate: string;
  receivedAmount: number;
  paymentMethod: string;
  paymentReference?: string;
  internalNote?: string;
};

export type ReviewPlatformPaymentProofInput = {
  outcome: "approved" | "rejected";
  safeReason?: string;
  amountPaid?: number;
  paidAt?: string;
};

export async function reviewPlatformPaymentProof(
  record: TenantBillingRecordDto,
  input: ReviewPlatformPaymentProofInput,
) {
  return apiRequest<TenantBillingRecordDto>(
    `/platform-admin/tenants/${record.tenantId}/billing-records/${record.id}/payment-proof-review`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getPlatformPaymentProofDownloadUrl(
  record: TenantBillingRecordDto,
) {
  return apiRequest<{
    file: Record<string, unknown>;
    download: { url: string; expiresAt?: string };
  }>(
    `/platform-admin/tenants/${record.tenantId}/billing-records/${record.id}/payment-proof-download`,
  );
}

export async function confirmPlatformBillingPayment(
  record: TenantBillingRecordDto,
  input: ConfirmPlatformPaymentInput,
) {
  const amountPaid = Number(record.amountPaid || 0) + input.receivedAmount;
  const paymentStatus =
    amountPaid >= Number(record.amountDue || 0) ? "paid" : "partially_paid";
  const paymentEntry = {
    paidAt: input.paymentDate,
    receivedAmount: input.receivedAmount,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference?.trim() || undefined,
    internalNote: input.internalNote || undefined,
  };

  return apiRequest<TenantBillingRecordDto>(
    `/platform-admin/tenants/${record.tenantId}/billing-records/${record.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        amountPaid,
        paymentStatus,
        paidAt: input.paymentDate,
        notes: input.internalNote || record.notes || undefined,
        metadata: {
          ...(record.metadata || {}),
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference?.trim() || undefined,
          paymentHistory: [
            ...(record.metadata?.paymentHistory || []),
            paymentEntry,
          ],
        },
      }),
    },
  );
}

export async function markPlatformBillingOverdue(
  record: TenantBillingRecordDto,
  note: string,
) {
  return apiRequest<TenantBillingRecordDto>(
    `/platform-admin/tenants/${record.tenantId}/billing-records/${record.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        paymentStatus: "overdue",
        notes: note || record.notes || undefined,
        metadata: {
          ...(record.metadata || {}),
          overdueMarkedAt: new Date().toISOString(),
        },
      }),
    },
  );
}

export type SendPlatformBillingReminderInput = {
  note?: string;
  markOverdue?: boolean;
  suspendTenant?: boolean;
};

export type SendPlatformBillingReminderResult = {
  billingRecord: TenantBillingRecordDto;
  reminder: {
    sentAt: string;
    level: "due" | "overdue";
    note?: string | null;
    outstandingAmount: number;
    dueDate?: string | null;
    suspendedTenant: boolean;
    recipientCount: number;
  };
  notificationsCreated: number;
  tenantStatus: string;
};

export async function sendPlatformBillingReminder(
  record: TenantBillingRecordDto,
  input: SendPlatformBillingReminderInput,
) {
  return apiRequest<SendPlatformBillingReminderResult>(
    `/platform-admin/tenants/${record.tenantId}/billing-records/${record.id}/send-reminder`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getPlatformUsageWarnings() {
  return apiRequest<TenantUsageSummaryDto[]>(
    "/platform-admin/usage/tenant-limits",
  );
}

export async function getPlatformChannels() {
  return apiRequest<PlatformChannelVisibilityDto[]>("/platform-admin/channels");
}

export async function getPlatformRateLimits() {
  return apiRequest<PlatformTenantRateLimitDto[]>(
    "/platform-admin/rate-limits",
  );
}

export async function getTenantBillingRecords(tenantId: string) {
  return apiRequest<TenantBillingRecordDto[]>(
    `/platform-admin/tenants/${tenantId}/billing-records`,
  );
}

export async function getTenantUsageSummary(tenantId: string) {
  return apiRequest<TenantUsageSummaryDto>(
    `/platform-admin/tenants/${tenantId}/usage`,
  );
}

export async function changeTenantSubscriptionPlan(
  tenantId: string,
  data: ChangeTenantSubscriptionPlanInput,
) {
  return apiRequest<{
    tenant: PlatformTenantDto;
    previousPlanId: string | null;
    subscriptionPlan: SubscriptionPlanDto;
    billingRecord: TenantBillingRecordDto | null;
  }>(`/platform-admin/tenants/${tenantId}/subscription-plan`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getPlatformOrders(
  options: {
    search?: string;
    tenantId?: string;
    status?: string;
    paymentStatus?: string;
    channelType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    limit: String(options.limit || 100),
    sortBy: "createdAt",
    sortOrder: "DESC",
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.tenantId) params.set("tenantId", options.tenantId);
  if (options.status && options.status !== "all")
    params.set("status", options.status);
  if (options.paymentStatus && options.paymentStatus !== "all")
    params.set("paymentStatus", options.paymentStatus);
  if (options.channelType && options.channelType !== "all")
    params.set("channelType", options.channelType);
  if (options.dateFrom)
    params.set(
      "dateFrom",
      new Date(`${options.dateFrom}T00:00:00.000Z`).toISOString(),
    );
  if (options.dateTo)
    params.set(
      "dateTo",
      new Date(`${options.dateTo}T23:59:59.999Z`).toISOString(),
    );
  return apiRequest<PaginatedResult<PlatformOrderDto>>(
    `/platform-admin/orders?${params.toString()}`,
  );
}

export async function getPlatformOrderPaymentSummary(tenantId?: string) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<PlatformOrderPaymentSummaryDto>(
    `/platform-admin/orders/payment-summary${suffix}`,
  );
}

export async function getPlatformConversations(
  options: {
    search?: string;
    tenantId?: string;
    status?: string;
    channelType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    limit: String(options.limit || 100),
    sortBy: "lastMessageAt",
    sortOrder: "DESC",
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.tenantId) params.set("tenantId", options.tenantId);
  if (options.status && options.status !== "all")
    params.set("status", options.status);
  if (options.channelType && options.channelType !== "all")
    params.set("channelType", options.channelType);
  if (options.dateFrom)
    params.set(
      "dateFrom",
      new Date(`${options.dateFrom}T00:00:00.000Z`).toISOString(),
    );
  if (options.dateTo)
    params.set(
      "dateTo",
      new Date(`${options.dateTo}T23:59:59.999Z`).toISOString(),
    );
  return apiRequest<PaginatedResult<PlatformConversationDto>>(
    `/platform-admin/conversations?${params.toString()}`,
  );
}

export async function getPlatformDeliveries(
  options: {
    search?: string;
    tenantId?: string;
    status?: string;
    paymentStatus?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    limit: String(options.limit || 100),
    sortBy: "deliveryDate",
    sortOrder: "DESC",
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.tenantId) params.set("tenantId", options.tenantId);
  if (options.status && options.status !== "all")
    params.set("status", options.status);
  if (options.paymentStatus && options.paymentStatus !== "all")
    params.set("paymentStatus", options.paymentStatus);
  if (options.dateFrom)
    params.set(
      "dateFrom",
      new Date(`${options.dateFrom}T00:00:00.000Z`).toISOString(),
    );
  if (options.dateTo)
    params.set(
      "dateTo",
      new Date(`${options.dateTo}T23:59:59.999Z`).toISOString(),
    );
  return apiRequest<PaginatedResult<PlatformDeliveryDto>>(
    `/platform-admin/deliveries?${params.toString()}`,
  );
}

export async function getPlatformProducts(
  options: {
    search?: string;
    tenantId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    limit: String(options.limit || 100),
    sortBy: "updatedAt",
    sortOrder: "DESC",
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.tenantId) params.set("tenantId", options.tenantId);
  if (options.status && options.status !== "all")
    params.set("status", options.status);
  return apiRequest<PaginatedResult<PlatformProductDto>>(
    `/platform-admin/products?${params.toString()}`,
  );
}

export async function getPlatformProductCatalogSummary(search = "") {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<PlatformProductCatalogSummaryDto[]>(
    `/platform-admin/products/catalog-summary${suffix}`,
  );
}

export async function getTenantChannels(tenantId: string) {
  return apiRequest<TenantChannelVisibilityDto[]>(
    `/platform-admin/tenants/${tenantId}/channels`,
  );
}

export async function getPlatformAddOnPurchasesForTenant(tenantId: string) {
  return getPlatformAddOnPurchases(tenantId);
}

export async function getTenantSupportNote(tenantId: string) {
  return apiRequest<TenantSupportNoteDto>(
    `/platform-admin/tenants/${tenantId}/support-note`,
  );
}

export async function updateTenantSupportNote(tenantId: string, note: string) {
  return apiRequest<TenantSupportNoteDto>(
    `/platform-admin/tenants/${tenantId}/support-note`,
    {
      method: "PUT",
      body: JSON.stringify({ note }),
    },
  );
}

export async function getPlatformAuditLogs(search = "") {
  const params = new URLSearchParams({
    page: "1",
    limit: "50",
    sortBy: "createdAt",
    sortOrder: "DESC",
  });
  if (search.trim()) params.set("search", search.trim());
  return apiRequest<PaginatedResult<PlatformAuditLogDto>>(
    `/audit-logs/platform?${params.toString()}`,
  );
}

export async function updateSubscriptionPlan(
  id: string,
  data: Partial<SubscriptionPlanDto>,
) {
  return apiRequest<SubscriptionPlanDto>(
    `/platform-admin/subscription-plans/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

export async function createSubscriptionPlan(data: {
  name: string;
  description?: string;
  monthlyPrice: number;
  planType?: "business" | "trial";
  requestable?: boolean;
  renewable?: boolean;
  topUpAllowed?: boolean;
  autoApprove?: boolean;
  /** Trial length in days for trial plans; legacy value for business plans. */
  durationDays?: number;
  /** @deprecated Legacy field. New plans always use independent limits. */
  messageQuotaMode?: "combined" | "directional";
  maxCsrs: number;
  maxChannels: number;
  /** @deprecated Legacy aggregate cap. Use directional limits instead. */
  messageLimit?: number | null;
  /** Monthly inbound message limit. null = unlimited, 0 = blocked. */
  inboundMessageLimit?: number | null;
  /** Monthly outbound message limit. null = unlimited, 0 = blocked. */
  outboundMessageLimit?: number | null;
  allowedProviders?: string[];
  apiLimit?: number | null;
  storageLimitGb: number;
  features?: Record<string, unknown>;
  status?: string;
}) {
  return apiRequest<SubscriptionPlanDto>("/platform-admin/subscription-plans", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteSubscriptionPlan(id: string) {
  return apiRequest<{ message: string }>(
    `/platform-admin/subscription-plans/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getChannelTemplates() {
  return apiRequest<ChannelTemplateDto[]>(
    "/platform-console/channel-templates",
  );
}

export async function createChannelTemplate(data: CreateChannelTemplateInput) {
  return apiRequest<ChannelTemplateDto>("/platform-console/channel-templates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateChannelTemplate(
  id: string,
  data: UpdateChannelTemplateInput,
) {
  return apiRequest<ChannelTemplateDto>(
    `/platform-console/channel-templates/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

export async function deleteChannelTemplate(id: string) {
  return apiRequest<{ message: string }>(
    `/platform-console/channel-templates/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function getPlatformSettings() {
  return apiRequest<PlatformSettingsDto>("/platform-admin/settings");
}

export async function updatePlatformSettings(
  data: UpdatePlatformSettingsInput,
) {
  return apiRequest<PlatformSettingsDto>("/platform-admin/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getPlatformLeads(
  options: { status?: string; intent?: string; search?: string } = {},
) {
  const params = new URLSearchParams({ page: "1", limit: "100" });
  if (options.status && options.status !== "all")
    params.set("status", options.status);
  if (options.intent && options.intent !== "all")
    params.set("intent", options.intent);
  if (options.search?.trim()) params.set("search", options.search.trim());
  return apiRequest<PaginatedResult<PlatformLeadDto>>(
    `/platform-admin/leads?${params.toString()}`,
  );
}

export function updatePlatformLead(
  id: string,
  data: Partial<Pick<PlatformLeadDto, "status">> & { note?: string },
) {
  return apiRequest<PlatformLeadDto>(`/platform-admin/leads/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function approvePlatformPlanChangeRequest(id: string, note?: string) {
  return apiRequest<PlatformLeadDto>(
    `/platform-admin/leads/${id}/approve-plan-change`,
    {
      method: "POST",
      body: JSON.stringify(note ? { note } : {}),
    },
  );
}

export function rejectPlatformPlanChangeRequest(id: string, note?: string) {
  return apiRequest<PlatformLeadDto>(
    `/platform-admin/leads/${id}/reject-plan-change`,
    {
      method: "POST",
      body: JSON.stringify(note ? { note } : {}),
    },
  );
}

export async function getPlatformFeatureToggles() {
  return apiRequest<PlatformFeatureTogglesDto>(
    "/platform-admin/feature-toggles",
  );
}

export async function updatePlatformFeatureToggles(
  data: PlatformFeatureTogglesDto,
) {
  return apiRequest<PlatformFeatureTogglesDto>(
    "/platform-admin/feature-toggles",
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

export async function getPlatformAdmins() {
  return apiRequest<PlatformAdminDto[]>("/platform-admin/admins");
}

export async function updatePlatformAdminStatus(id: string, status: string) {
  return apiRequest<PlatformAdminDto>(`/platform-admin/admins/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}
