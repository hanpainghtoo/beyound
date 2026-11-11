import { getPublicRuntimeConfig } from "@/lib/public-runtime-config";
import type { WorkspaceRole } from "./roles";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  type: "platform_admin" | "tenant_user";
  tenantId?: string;
  phone?: string | null;
  department?: string | null;
  employeeId?: string | null;
  avatarUrl?: string | null;
  notificationPreferences?: Record<string, boolean>;
  emailVerifiedAt?: string | null;
  permissions?: Record<string, unknown>;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  emailVerificationRequired?: boolean;
  emailVerificationDelivery?: "requested" | "unavailable";
  emailVerificationExpiresAt?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  /**
   * Per-filter row counts for the inbox queue, computed server-side in one
   * aggregate query. Null when that query failed — deliberately not zeros,
   * because a chip showing a confident `0` after an error is worse than one
   * showing nothing at all.
   */
  counts?: Record<string, number> | null;
};

type ApiErrorKind = "network" | "unauthorized" | "forbidden" | "backend";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  rawMessage?: string;
  /** Machine-readable error code from the backend response body, when present. */
  code?: string;
  /** Field-level validation target from the backend response body, when present. */
  field?: string;
  /** Full structured error body from the backend, when available. */
  data?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      kind: ApiErrorKind;
      status?: number;
      rawMessage?: string;
      code?: string;
      field?: string;
      data?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.rawMessage = options.rawMessage;
    this.code = options.code;
    this.field = options.field;
    this.data = options.data;
  }
}

const DEFAULT_WORKSPACE_ERROR =
  "Unable to load workspace data. Please refresh or contact support.";

function normalizeApiErrorMessage(status: number, rawMessage?: string) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have access to this workspace area.";
  if (
    rawMessage &&
    !/failed to fetch|load failed|networkerror/i.test(rawMessage)
  )
    return rawMessage;
  return DEFAULT_WORKSPACE_ERROR;
}

const LOGIN_PATH = "/auth/login";

/**
 * Login-aware error copy. A failed sign-in is never a session expiry, so
 * login 401s keep the credential copy and never trigger the global
 * session-expired flow. Prefers the backend message when it carries real
 * detail, otherwise falls back to the standard login copy.
 */
function normalizeLoginErrorMessage(
  status: number,
  rawMessage?: string,
  code?: string,
) {
  if (status === 429 || code === "RATE_LIMITED") {
    return "Too many sign-in attempts. Please try again in a minute.";
  }
  if (status === 403 || code === "ACCOUNT_INACTIVE") {
    if (rawMessage && !/forbidden/i.test(rawMessage)) return rawMessage;
    return "This workspace is currently inactive. Contact your administrator.";
  }
  if (status === 401 || code === "INVALID_CREDENTIALS") {
    if (rawMessage && !/^unauthorized$/i.test(rawMessage)) return rawMessage;
    return "Incorrect email or password. Please try again.";
  }
  if (status === 400 || code === "VALIDATION_ERROR") {
    return rawMessage || "Please check your entries and try again.";
  }
  if (
    rawMessage &&
    !/failed to fetch|load failed|networkerror/i.test(rawMessage)
  )
    return rawMessage;
  return "Unable to sign in. Please try again.";
}

export function getApiErrorMessage(
  error: unknown,
  fallback = DEFAULT_WORKSPACE_ERROR,
) {
  if (error instanceof ApiError) return error.message;
  if (
    error instanceof TypeError &&
    /failed to fetch|load failed|networkerror/i.test(error.message)
  ) {
    return DEFAULT_WORKSPACE_ERROR;
  }
  if (
    error instanceof Error &&
    !/failed to fetch|load failed|networkerror/i.test(error.message)
  )
    return error.message;
  return fallback;
}

export type TenantAgentDto = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: WorkspaceRole;
  status: "active" | "inactive" | "suspended";
  isOnline: boolean;
  lastSeenAt?: string | null;
  avatarUrl?: string | null;
  department?: string | null;
  employeeId?: string | null;
  createdAt: string;
  deliveryDate?: string | null;
  updatedAt: string;
};

export type CreateTenantAgentInput = {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  role?: WorkspaceRole;
  status?: "active" | "inactive" | "suspended";
};

export type InviteTenantAgentInput = Omit<CreateTenantAgentInput, "password">;

export type TenantAgentInviteResult = {
  user: TenantAgentDto;
  invitation: {
    message: string;
    invitationDelivery: "requested";
    expiresAt: string;
    /** One-time accept-invite link for manual sharing (expires with the token). */
    inviteUrl?: string;
  };
};

/**
 * Direct-creation response: the member plus the outcome of the credentials
 * email (sign-in link + creator-set password). "failed" means the owner must
 * share the password with the member manually.
 */
export type CreatedTenantAgentResult = TenantAgentDto & {
  credentialsEmailDelivery?: "delivered" | "failed";
};

export type TenantInviteContext = {
  email: string;
  companyName: string;
  role: string;
  inviterName: string;
  expiresAt: string;
};

export type TenantChannelDto = {
  id: string;
  channelType: "messenger" | "viber" | "telegram" | "tiktok";
  channelName: string;
  displayName?: string | null;
  status: "active" | "inactive" | "error" | "pending" | "disabled";
  configuration: Record<string, unknown>;
  credentials: Record<string, unknown>;
  credentialSchema?: Array<{
    key: string;
    label: string;
    required: boolean;
    secret: boolean;
    description?: string;
  }>;
  credentialStatus?: "missing_required" | "configured" | "encrypted";
  entitlementOrigin?: "base_plan" | "top_up";
  entitlementExpiresAt?: string | null;
  retentionSelected?: boolean;
  disabledAt?: string | null;
  disabledReason?: string | null;
  connectionStatus?:
    | "pending_configuration"
    | "credentials_verified"
    | "webhook_registering"
    | "awaiting_first_event"
    | "ready"
    | "connected"
    | "error"
    | "disabled";
  connectedAt?: string | null;
  credentialLastUpdatedAt?: string | null;
  credentialsVerifiedAt?: string | null;
  lastConnectionTestAt?: string | null;
  errorMessage?: string | null;
  rateLimitMetadata?: Record<string, unknown>;
  webhookUrl?: string | null;
  webhookRegistrationStatus?:
    "pending" | "registered" | "failed" | string | null;
  welcomeMessage?: string | null;
  autoReplyEnabled: boolean;
  assignmentRule: "round_robin" | "least_busy" | "manual";
  lastSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTenantChannelInput = {
  channelType: TenantChannelDto["channelType"];
  channelName: string;
  displayName?: string;
  configuration?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  connectionStatus?: TenantChannelDto["connectionStatus"];
  rateLimitMetadata?: Record<string, unknown>;
  welcomeMessage?: string;
  autoReplyEnabled?: boolean;
  assignmentRule?: TenantChannelDto["assignmentRule"];
};

export type TenantChannelConnectionTestDto = {
  ok: boolean;
  channel: TenantChannelDto;
  provider: TenantChannelDto["channelType"];
  connectionStatus: NonNullable<TenantChannelDto["connectionStatus"]>;
  credentialStatus: NonNullable<TenantChannelDto["credentialStatus"]>;
  errors: string[];
  testedAt: string;
};

export type TelegramManagedBotRequestDto = {
  requestId: string;
  telegramUrl?: string;
  status:
    | "pending"
    | "telegram_started"
    | "awaiting_creation"
    | "provisioning"
    | "connected"
    | "failed"
    | "expired"
    | "cancelled";
  expiresAt: string;
  suggestedName?: string;
  suggestedUsername?: string;
  createdBotUsername?: string | null;
  channelConnectionId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  completedAt?: string | null;
  connectedChannel?: {
    id: string;
    displayName?: string | null;
    username?: string | null;
    connectedAt?: string | null;
    status?: string;
    connectionStatus?: string;
    webhookRegistrationStatus?: string | null;
  };
};

export type InitiateTelegramManagedBotInput = {
  displayName: string;
  suggestedUsername: string;
};

// Plan 55: per-tenant feature toggles.
export type TenantFeatureDto = {
  key: string;
  displayName: string;
  description?: string | null;
  isEnabled: boolean;
  isLockable: boolean;
  dependsOn?: string | null;
  displayOrder: number;
  /** False while a required dependency is disabled. */
  canDisable: boolean;
};

export type TenantFeatureListDto = {
  features: TenantFeatureDto[];
};

export const tenantFeaturesApi = {
  list: () => apiRequest<TenantFeatureListDto>("/tenant/features"),
  setEnabled: (key: string, isEnabled: boolean) =>
    apiRequest<TenantFeatureListDto>(`/tenant/features/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled }),
    }),
};

export type TenantSettingsDto = {
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
  logoUrl?: string | null;
  description?: string | null;
  timezone: string;
  language: string;
  featureFlags?: Record<string, unknown>;
  aiSettings?: Record<string, unknown>;
};

export type TenantBillingProofDto = {
  id: string;
  status:
    | "pending_review"
    | "proof_submitted"
    | "under_review"
    | "confirmed"
    | "rejected"
    | "cancelled";
  paymentMethod: "bank_transfer" | "kbzpay" | "wavepay" | "cash";
  paidAmount: number;
  paidDate: string;
  transactionReference?: string | null;
  mediaFileId: string;
  fileName: string;
  note?: string | null;
  submittedAt: string;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
};

export type TenantBillingRecordDto = {
  id: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  reviewStatus: "in_review" | "confirm" | "reject" | "cancelled";
  invoiceNo?: string | null;
  paymentProofFileId?: string | null;
  actionBy?: string | null;
  actionDate?: string | null;
  issueDate?: string | null;
  amountDue: number | string;
  amountPaid: number | string;
  currency: string;
  paidAt?: string | null;
  notes?: string | null;
  metadata?: {
    paymentProof?: TenantBillingProofDto;
    paymentProofSubmissions?: TenantBillingProofDto[];
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  subscriptionPlan?: {
    id: string;
    name: string;
    monthlyPrice: number | string;
  } | null;
};

// Plan 56: `reject` = admin decision, `cancelled` = tenant-withdrawn. Both
// are dead invoices that free the billing month — never pending, never
// actionable. Use this instead of comparing against a single status so the
// next review status cannot leave stale filters behind again.
export function isDeadInvoiceRecord(
  record: Pick<TenantBillingRecordDto, "reviewStatus">,
) {
  return record.reviewStatus === "reject" || record.reviewStatus === "cancelled";
}

export type TenantUpgradeOverviewDto = {
  kind: "upgrade" | "trial_conversion";
  upgradeRevisionId: string;
  upgradeStatus: string;
  previousPlanId?: string | null;
  previousPlanName?: string | null;
  targetPlanId?: string | null;
  targetPlanName?: string | null;
  billingRecordId?: string | null;
  requestedAt?: string | null;
  upgradeEffectiveAt?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  carryover?: Record<string, number | null>;
};

export type TenantBillingOverviewDto = {
  tenant: {
    companyName: string;
    status: string;
    subscriptionStartDate?: string | null;
    subscriptionEndDate?: string | null;
    renewalDate?: string | null;
    storageCapacityState?: {
      activePeriodId?: string | null;
      expiresAt?: string | null;
      baseCapacityGb?: number | null;
      topUpCapacityGb?: number;
      effectiveCapacityGb?: number | null;
      usedBytes?: number;
      projectedBytes?: number;
      overStorageLimit?: boolean;
      lastEvaluatedAt?: string | null;
    };
  };
  currentPeriod?: {
    id: string;
    planId: string;
    periodStatus: string;
    paymentStatus: string;
    adminActivationStatus?: "pending" | "approved" | "revoked" | null;
    adminActivatedAt?: string | null;
    monthStartAt?: string | null;
    monthEndAt?: string | null;
  } | null;
  // top-level trial, upgrade, upgradeHistory – as per backend contract
  trial?: {
    id: string;
    planId: string;
    periodStatus: string;
    paymentStatus: string;
    adminActivationStatus?: string | null;
    periodStartAt?: string | null;
    periodEndAt?: string | null;
  } | null;
  upgrade?: TenantUpgradeOverviewDto | null;
  upgradeHistory?: TenantUpgradeOverviewDto[];
  plan: {
    id: string;
    name: string;
    monthlyPrice: number | string;
    currency: string;
    maxAgents: number;
    maxChannels: number;
    messageLimit: number;
    storageLimitGb: number;
  } | null;
  entitlement?: {
    state:
      | "trial_active"
      | "trial_grace"
      | "paid_active"
      | "payment_grace"
      | "suspended"
      | "expired"
      | "cancelled"
      | "reactivation_pending";
    trialStartsAt?: string | null;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    paidPeriodStartsAt?: string | null;
    paidPeriodEndsAt?: string | null;
    suspendedAt?: string | null;
    suspensionReason?: string | null;
    cancelledAt?: string | null;
    cancellationReason?: string | null;
  } | null;
  usage: {
    periodStart: string;
    periodEnd: string;
    refreshedAt: string;
    latestUsageEventAt?: string | null;
    source: "tenant_usage_events";
    monthlyMessages: number;
    teamMembers: number;
    connectedChannels: number;
    metrics: {
      monthlyMessages: {
        key: "providerMessages";
        label: string;
        used: number;
        limit: number | null;
        remaining: number | null;
        percentUsed: number | null;
        unlimited: boolean;
        available: boolean;
        refreshedAt: string;
        lastRecordedAt?: string | null;
      };
      teamMembers: {
        key: "agents";
        label: string;
        used: number;
        limit: number | null;
        remaining: number | null;
        percentUsed: number | null;
        unlimited: boolean;
        available: boolean;
        refreshedAt: string;
        lastRecordedAt?: string | null;
      };
      connectedChannels: {
        key: "channels";
        label: string;
        used: number;
        limit: number | null;
        remaining: number | null;
        percentUsed: number | null;
        unlimited: boolean;
        available: boolean;
        refreshedAt: string;
        lastRecordedAt?: string | null;
      };
    };
  };
  records: TenantBillingRecordDto[];
};

export type TenantAddOnComponentDto = {
  id: string;
  componentType:
    | "inbound_messages"
    | "outbound_messages"
    | "api_requests"
    | "channel_slots"
    | "storage_gb";
  quantity: number;
  unit: "messages" | "requests" | "channels" | "gb";
  displayOrder?: number;
  expiresAt?: string;
  componentStatus?: "pending" | "active" | "expired";
};

export type TenantAddOnProductDto = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  status: "active" | "inactive" | "archived";
  version: number;
  metadata: Record<string, unknown>;
  components: TenantAddOnComponentDto[];
  createdAt: string;
  updatedAt: string;
};

export type TenantAddOnPurchaseDto = {
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
  components: TenantAddOnComponentDto[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TenantSubscriptionPeriodDto = {
  id: string;
  planId: string;
  billingRecordId?: string | null;
  periodType: "trial" | "paid";
  periodStatus: "upcoming" | "active" | "expired" | "cancelled";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  monthStartAt?: string | null;
  monthEndAt?: string | null;
  periodStartAt?: string | null;
  periodEndAt?: string | null;
  scheduledStartAt?: string | null;
  activatedAt?: string | null;
  expiredAt?: string | null;
  startOption?: "current_month" | "next_month" | "scheduled_prepaid" | null;
  sequenceNumber: number;
  adminActivationStatus?: "pending" | "approved" | "revoked" | null;
};

export type TenantResolvedEntitlementDto = {
  tenantId: string;
  activePeriodId: string;
  planId: string;
  periodStartAt?: string | null;
  periodEndAt?: string | null;
  activatedAt?: string | null;
  periodStatus: string;
  paymentStatus: string;
  paymentState: "paid" | "pending" | "failed" | "refunded";
  periodType: "trial" | "paid";
  baseLimits: Record<string, number | null>;
  activeTopUpComponentTotals: Record<string, number>;
  carryover?: Record<string, number | null> | null;
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

export type TenantSubscriptionPeriodUsageDto = {
  usageSource: "period_scoped" | "not_attributed";
  periodStart: string | null;
  periodEnd: string | null;
  inboundMessages: number;
  outboundMessages: number;
  activeChannels: number;
  activeTeamMembers: number;
  storage: {
    usedBytes: number | null;
    effectiveCapacityGb: number | null;
    overStorageLimit: boolean;
    expiresAt: string | null;
  };
};

export type TenantSubscriptionPeriodsResponseDto = {
  tenantId: string;
  activePeriodId: string | null;
  entitlement: TenantResolvedEntitlementDto | null;
  entitlementError: { code: string; message: string } | null;
  periodUsage?: TenantSubscriptionPeriodUsageDto;
  periods: TenantSubscriptionPeriodDto[];
};

export type UsageMetricDto = {
  used: number;
  limit: number | null;
  remaining: number | null;
  limitReached: boolean;
};

export type TenantUsageSummaryDto = {
  tenantId: string;
  scope: "period_scoped";
  activePeriodId: string;
  planId: string;
  periodStart: string | null;
  periodEnd: string | null;
  baseLimits: Record<string, number | null>;
  activeTopUpComponentTotals: Record<string, number>;
  effectiveLimits: Record<string, number | null>;
  inboundMessages: UsageMetricDto;
  outboundMessages: UsageMetricDto;
};

export type TenantPlanChangeRequestDto = {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedAt: string;
  resolvedAt?: string | null;
  currentPlan: { id: string; name: string } | null;
  desiredPlan: { id: string; name: string };
  note?: string | null;
};

export type TenantAuditLogDto = {
  id: string;
  tenantId: string;
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: {
    id: string;
    fullName?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
};

export type SubscriptionPurchaseStartOption = "current_month" | "next_month" | "after_trial";

export type CreateSubscriptionPurchaseRequestInput = {
  startOption: SubscriptionPurchaseStartOption;
  idempotencyKey: string;
  subscriptionPlanId?: string;
};

export type SubscriptionPurchaseRequestResult = {
  billingRecord: TenantBillingRecordDto;
  purchase: {
    startOption: SubscriptionPurchaseStartOption;
    monthStartAt: string;
    monthEndAt: string;
    amountDue: number;
    currency: string;
    reviewStatus: "in_review";
    periodStatus: "pending_activation" | "upcoming";
    scheduledStartAt?: string;
  };
};

export type SubmitTenantPaymentProofInput = {
  paymentMethod: TenantBillingProofDto["paymentMethod"];
  paidAmount: number;
  paidDate: string;
  transactionReference?: string;
  mediaFileId: string;
  fileName: string;
  /** Development-only client contract until trusted server-side scanning is added. */
  mediaScanStatus: "clean";
  note?: string;
};

export type UpdateTenantSettingsInput = Partial<
  Pick<
    TenantSettingsDto,
    | "companyName"
    | "industry"
    | "businessType"
    | "contactPerson"
    | "contactEmail"
    | "contactPhone"
    | "website"
    | "address"
    | "logoUrl"
    | "description"
    | "timezone"
    | "language"
    | "featureFlags"
    | "aiSettings"
  >
>;

export type AgentCustomerDto = {
  id: string;
  channelId?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  location?: Record<string, unknown> | null;
  tags: string[];
  notes?: string | null;
  status: "active" | "blocked" | "archived";
  firstContactAt?: string | null;
  lastContactAt?: string | null;
  totalConversations: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentChannelDto = {
  id: string;
  channelType: "messenger" | "viber" | "telegram" | "tiktok";
  displayName?: string | null;
  channelName: string;
};

export type AgentConversationLatestOrderDto = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: string | Date;
  totalAmount?: number | string;
};

export type AgentConversationDto = {
  id: string;
  customerId: string;
  channelId: string;
  assignedAgentId?: string | null;
  assignedAt?: string | null;
  subject?: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  tags: string[];
  /**
   * Newest linked order, selected server-side by persisted createdAt. All
   * order/delivery/payment indicators on the chat head read this ONE row so
   * they can never describe different orders.
   */
  latestOrder?: AgentConversationLatestOrderDto | null;
  /**
   * Queue classification, resolved server-side so the card renders a decision
   * the API already made. The dashboard previously classified these itself,
   * which meant the filter and the card could disagree.
   */
  intent?: "payment_review" | "complaints" | "delivery" | "order_intent" | "follow_up" | "general";
  urgency?: "danger" | "warning" | "neutral";
  score?: number;
  metadata?: {
    inboxUnread?: boolean;
    inboxReadAt?: string | null;
    inboxForceUnread?: boolean;
    shoppingStage?: "browsing" | "checkout" | null;
    shoppingStageUpdatedAt?: string | null;
    needsAttention?: boolean;
    attentionReason?: string | null;
    attentionAt?: string | null;
    lastShoppingActivityAt?: string | null;
    newShoppingActivity?: boolean;
    [key: string]: unknown;
  };
  firstMessageAt?: string | null;
  lastMessageAt?: string | null;
  lastCustomerMessageAt?: string | null;
  lastAgentResponseAt?: string | null;
  firstResponseAt?: string | null;
  slaDueAt?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
  createdAt: string;
  updatedAt: string;
  searchSnippet?: string | null;
  /** Sender of the latest message, so the card can prefix "You:". */
  latestSenderType?: "customer" | "agent" | "system" | null;
  customer?: AgentCustomerDto | null;
  channel?: AgentChannelDto | null;
};

export type AgentMessageDto = {
  id: string;
  conversationId: string;
  senderType: "customer" | "agent" | "system";
  senderId?: string | null;
  messageType:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "location"
    | "order"
    | "invoice"
    | "system_event";
  content?: string | null;
  attachments: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  status: "sent" | "delivered" | "read" | "failed" | "delivery_unknown";
  createdAt: string;
  updatedAt: string;
};

export type AgentCannedResponseDto = {
  id: string;
  title: string;
  shortcut?: string | null;
  content: string;
  tags: string[];
  visibility: "public" | "private" | "team";
  usageCount: number;
  /** Photo id in the file-storage service; resolved to a signed URL on demand. */
  imageMediaId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentCannedResponseInput = {
  title: string;
  shortcut?: string;
  content: string;
  tags?: string[];
  visibility?: "public" | "private" | "team";
  /** `null` clears the photo; omitting the key leaves the stored one untouched. */
  imageMediaId?: string | null;
};

export type UpdateAgentCannedResponseInput =
  Partial<CreateAgentCannedResponseInput>;

export type AgentProductDto = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  type?: "product" | "service";
  description?: string | null;
  shortDescription?: string | null;
  price: number | string;
  costPrice?: number | string | null;
  stockQuantity: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
  images?: string[];
  imageUrls?: string[];
  primaryImageUrl?: string | null;
  tags?: string[];
  status: "active" | "inactive" | "out_of_stock";
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
  category?: { id: string; name: string } | null;
};

export type AgentProductCategoryDto = {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
};

export type CreateAgentCustomerInput = {
  channelId?: string;
  fullName: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  tags?: string[];
  notes?: string;
  status?: "active" | "blocked" | "archived";
};

export type CreateAgentProductInput = {
  name: string;
  sku?: string;
  barcode?: string;
  type?: "product" | "service";
  description?: string;
  shortDescription?: string;
  price: number;
  costPrice?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
  images?: string[];
  tags?: string[];
  status?: "active" | "inactive" | "out_of_stock";
  isFeatured?: boolean;
  categoryId?: string;
};

export type UpdateAgentProductInput = Partial<CreateAgentProductInput>;

export type OrderStatus = "pending" | "confirmed" | "rejected" | "cancelled";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid";
export type DeliveryStatus = "packed" | "out_for_delivery" | "delivered" | "failed_delivery" | "returned";

export type AgentOrderStatusHistoryEntryDto = {
  type?: string | null;
  field?: string | null;
  status?: string | null;
  previousStatus?: string | null;
  note?: string | null;
  reason?: string | null;
  source?: string | null;
  timestamp?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
  customerName?: string | null;
  customerAvatarUrl?: string | null;
  messageText?: string | null;
  products?: Array<{
    name?: string | null;
    sku?: string | null;
    quantity?: number | string | null;
  }> | null;
  metadata?: Record<string, unknown> | null;
  attachmentReference?: string | null;
  event?: string | null;
};

export type AgentOrderPaymentTransactionDto = {
  id: string;
  type: "payment" | "reversal" | "status_change";
  amount: number;
  currency?: string;
  proofFileId?: string | null;
  proofContentType?: string | null;
  proofSizeBytes?: number | null;
  previousPaymentStatus?: string | null;
  newPaymentStatus?: string | null;
  reason?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  timestamp?: string | null;
};

export type AgentOrderDto = {
  id: string;
  customerId?: string | null;
  conversationId?: string | null;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  paymentMethod?: "cod" | "online" | "bank_transfer" | null;
  subtotal: number | string;
  taxAmount: number | string;
  discountAmount: number | string;
  shippingFee: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  remainingAmount?: number | string;
  currency: string;
  notes?: string | null;
  shippingAddress?: string | null;
  paymentNotes?: string | null;
  deliveryAssigneeName?: string | null;
  deliveryAssigneePhone?: string | null;
  deliveryDate?: string | null;
  paymentSubmittedAt?: string | null;
  paymentProofSubmitted?: boolean;
  attachments?: Array<Record<string, unknown>>;
  paymentTransactions?: AgentOrderPaymentTransactionDto[];
  statusHistory?: AgentOrderStatusHistoryEntryDto[];
  createdAt: string;
  customer?: AgentCustomerDto | null;
};

export type AgentDeliveryDto = {
  id: string;
  orderNumber: string;
  status: DeliveryStatus;
  createdAt: string;
  deliveryDate?: string | null;
  deliveryAssigneeName?: string | null;
  deliveryAssigneePhone?: string | null;
  shippingAddress?: string | null;
  statusHistory?: AgentOrderStatusHistoryEntryDto[];
  customer?: {
    id: string;
    fullName: string | null;
    phone: string | null;
    location?: string | null;
  } | null;
};

export type AgentOrderItemDto = {
  id: string;
  orderId: string;
  productId?: string | null;
  productName: string;
  productSku?: string | null;
  productSnapshot?: Record<string, unknown>;
  variationSnapshot?: Record<string, unknown>;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  notes?: string | null;
  product?: { id?: string; name?: string; sku?: string | null; barcode?: string | null } | null;
};

export type SendAgentMessageInput = {
  conversationId: string;
  messageType?: "text" | "image" | "video" | "audio" | "file" | "location";
  content: string;
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  replyToMessageId?: string;
  cannedResponseId?: string;
};

export type CreateAgentOrderInput = {
  conversationId?: string;
  customerId: string;
  paymentMethod?: "cod" | "online" | "bank_transfer";
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  taxAmount?: number;
  discountAmount?: number;
  shippingFee?: number;
  deliveryAssigneeName?: string;
  deliveryAssigneePhone?: string;
  shippingAddress?: string;
  notes?: string;
};

export type UpdateAgentOrderDetailsInput = {
  paymentMethod?: "cod" | "online" | "bank_transfer";
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    variation?: Record<string, unknown>;
  }>;
  taxAmount?: number;
  discountAmount?: number;
  shippingFee?: number;
  notes?: string;
  shippingAddress?: string;
};

export type SubmitOrderPaymentInput = {
  amount: number;
  proofFileId?: string;
  reason?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type AgentConversationListOptions = {
  search?: string;
  filter?:
    "all" | "unread" | "assigned" | "team" | "hot_leads" | "vip" | "overdue";
  status?: AgentConversationDto["status"];
  priority?: AgentConversationDto["priority"];
  channelType?: AgentChannelDto["channelType"];
  slaState?: "normal" | "due_soon" | "overdue";
  /** ISO date. Rows with activity on or after this instant. */
  dateFrom?: string;
  /** ISO date. Rows with activity on or before this instant. */
  dateTo?: string;
  /** Resolved OR closed in one request — `status` is single-valued. */
  resolvedOnly?: boolean;
  /** Conversations with no assigned agent. */
  unassigned?: boolean;
  /** Intent bucket, classified server-side. */
  intent?:
    | "payment_review"
    | "complaints"
    | "delivery"
    | "order_intent"
    | "follow_up"
    | "general";
  /**
   * Latest-linked-order facets. Applied server-side against the newest order
   * for the conversation, matching what the inbox chat head displays.
   */
  orderStatus?: OrderStatus;
  deliveryStatus?: DeliveryStatus;
  paymentStatus?: PaymentStatus;
  page?: number;
  limit?: number;
  /** One connected channel. A scope like search, not a chip bucket. */
  channelId?: string;
  /** The caller's own id. Powers the Mine chip. */
  assignedAgentId?: string;
};

export type UpdateAgentConversationInput = Partial<{
  status: AgentConversationDto["status"];
  priority: AgentConversationDto["priority"];
  assignedAgentId: string;
  subject: string;
  tags: string[];
  closeReason: string;
}>;

export type AgentOrderListOptions = {
  search?: string;
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  status?: OrderStatus | "all";
  paymentStatus?: PaymentStatus | "all";
  deliveryStatus?: DeliveryStatus | "all";
  proofSubmitted?: "true" | "false";
  customerId?: string;
  channelId?: string;
  /** Orders linked to one conversation (Plan 72: inbox Order List tab). */
  conversationId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AgentCustomerListOptions = {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  status?: string;
};

export type AgentProductListOptions = {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  status?: string;
  /** Category id to filter by, or "uncategorized" for products with no category. */
  categoryId?: string;
};

export type AgentConversationNoteDto = {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorName: string | null;
  content: string;
  isPinned: boolean;
  isResolved: boolean;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateConversationNoteInput = {
  content: string;
};

export type UpdateConversationNoteInput = {
  content?: string;
  isPinned?: boolean;
  isResolved?: boolean;
};

export type AgentTimelineEventDto = {
  id: string;
  tenantId: string;
  actorId?: string | null;
  actorType?: string | null;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
  source?: string | null;
  createdAt: string;
};

export type CommerceWorkspaceStatsDto = {
  assignedConversations: number;
  unreadConversations: number;
  todayChatsHandled: number;
  avgResponseTime: number;
  resolutionRate: number;
  customerSatisfactionAvg: number | string;
  onlineTime: number;
  activeCampaigns: number;
};

export type AgentNotificationDto = {
  id: string;
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  actionUrl?: string | null;
  isRead: boolean;
  expiresAt?: string | null;
  createdAt: string;
};

export type AgentMediaFileDto = {
  id: string;
  tenantId: string;
  ownerId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  purpose?: string;
  metadata?: Record<string, unknown>;
  storageDriver: string;
  objectKey: string;
  status: "registered" | "archived";
  createdAt: string;
  uploadedAt?: string;
  archivedAt?: string;
  download?: {
    driver: string;
    method: "GET";
    url: string;
    objectKey: string;
    expiresAt: string;
  };
};

export type AgentMediaUploadDto = {
  file: AgentMediaFileDto;
  upload: {
    driver: string;
    method: "PUT";
    url: string;
    objectKey: string;
    expiresAt: string;
    headers?: Record<string, string>;
  };
};

export type AgentPerformanceDto = {
  days: number;
  conversationsHandled: number;
  resolvedConversations: number;
  resolutionRate: number;
  messagesSent: number;
  avgResponseTimeSeconds: number;
  avgResolutionTimeSeconds: number;
  customerSatisfactionAvg: number;
  onlineTimeMinutes: number;
  daily: Array<{
    date: string;
    conversationsHandled: number;
    messagesSent: number;
    avgResponseTimeSeconds: number;
    customerSatisfactionAvg: number;
  }>;
};

export type TeamPerformanceDto = {
  agentId: string;
  fullName: string;
  role: string;
  conversationsHandled: number;
  resolutionRate: number;
  avgResponseTimeSeconds: number;
  customerSatisfactionAvg: number;
};

export type UpdateAgentCustomerInput = Partial<{
  fullName: string;
  email: string;
  phone: string;
  channelId: string | null;
  location: Record<string, unknown> | null;
  tags: string[];
  notes: string;
  status: "active" | "blocked" | "archived";
}>;

const API_BASE_URL = "/api/proxy";
const SESSION_KEY = "kme-auth-session";
export const SESSION_EXPIRED_EVENT = "zayos:session-expired";

export function getSocketBaseUrl() {
  const socketBaseUrl = getPublicRuntimeConfig().socketBaseUrl?.replace(
    /\/$/,
    "",
  );
  if (socketBaseUrl) return socketBaseUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
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

export function updateStoredUser(user: AuthUser) {
  const session = getStoredSession();
  if (!session) return;
  storeSession({ ...session, user: { ...session.user, ...user } });
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

// Plan 31: public billing-account catalog shapes (mirror backend
// PublicBillingAccountGroupDto). Fetched through the generic API proxy.
export type PublicBillingAccountItem = {
  id: string;
  icon?: string | null;
  account_name: string;
  account_no?: string | null;
  ph_no?: string | null;
  qr?: string | null;
};

export type PublicBillingAccountGroup = {
  type: "bank_account" | "digital_wallet";
  name: "Bank Account" | "Digital Wallet";
  items: PublicBillingAccountItem[];
};

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

  let response: Response;
  const controller = new AbortController();
  const DEFAULT_API_TIMEOUT_MS = 30_000;
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_API_TIMEOUT_MS);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as { name?: string } | null)?.name === "AbortError") {
      throw new ApiError("Request timed out. Please check your network and try again.", {
        kind: "network",
        rawMessage: error instanceof Error ? error.message : undefined,
      });
    }
    throw new ApiError(DEFAULT_WORKSPACE_ERROR, {
      kind: "network",
      rawMessage: error instanceof Error ? error.message : undefined,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let hasBodyMessage = false;
    let errorCode: string | undefined;
    let errorField: string | undefined;
    let errorData: Record<string, unknown> | undefined;
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        message = errorBody.message;
        hasBodyMessage = true;
      }
      if (typeof errorBody.code === "string") errorCode = errorBody.code;
      if (typeof errorBody.field === "string") errorField = errorBody.field;
      errorData = errorBody;
    } catch {
      // Ignore invalid error bodies and fall back to the HTTP status message.
    }
    const rawMessage = Array.isArray(message) ? message.join(", ") : message;
    const isLoginRequest = path === LOGIN_PATH;
    if (response.status === 401 && !isLoginRequest) {
      clearSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      isLoginRequest
        ? normalizeLoginErrorMessage(
            response.status,
            hasBodyMessage ? rawMessage : undefined,
            errorCode,
          )
        : normalizeApiErrorMessage(response.status, rawMessage),
      {
        kind:
          response.status === 401
            ? "unauthorized"
            : response.status === 403
              ? "forbidden"
              : "backend",
        status: response.status,
        rawMessage,
        code: errorCode,
        field: errorField,
        data: errorData,
      },
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type EffectiveChannelSettingsDto = {
  facebook: { mode: "platform_one_click" | "byo_app"; appId: string | null; status: string; loginConfigId: string | null };
  telegram: { template: "commerce" | null };
};

export function getEffectiveChannelSettings() {
  return apiRequest<EffectiveChannelSettingsDto>("/tenant/channel-settings/effective");
}

export type MetaOAuthStateDto = {
  state: string;
  redirectUri: string;
  expiresIn: number;
};

export function createMetaOAuthState() {
  return apiRequest<MetaOAuthStateDto>("/tenant/channels/meta/state", {
    method: "POST",
  });
}

export type MetaOAuthExchangeInput = {
  code?: string;
  redirectUri?: string;
  state?: string;
  pageId?: string;
  selectionToken?: string;
};

export type MetaOAuthExchangeResult = {
  ok?: boolean;
  channel?: { id: string };
  page?: { id: string; name?: string };
  errors?: string[];
  needsPageSelection?: boolean;
  selectionToken?: string;
  pages?: Array<{ id: string; name?: string; category?: string }>;
};

export function exchangeMetaOAuthCode(body: MetaOAuthExchangeInput) {
  return apiRequest<MetaOAuthExchangeResult>("/tenant/channels/meta/exchange", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function login(
  usernameOrEmail: string,
  password: string,
): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: usernameOrEmail, password }),
  });
  storeSession(session);
  return session;
}

export function requestPasswordReset(
  email: string,
  userType: "tenant_user" | "platform_admin" = "tenant_user",
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

export function getTenantInviteContext(token: string) {
  return apiRequest<TenantInviteContext>(
    `/auth/invites/${encodeURIComponent(token)}`,
  );
}

export function requestEmailVerification(email: string) {
  return apiRequest<{
    message: string;
    expiresAt?: string;
    expiresInSeconds?: number;
    resendAvailableAt?: string;
  }>("/auth/email-verification/resend", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyEmailWithOtp(email: string, code: string) {
  return apiRequest<AuthSession>("/auth/email-verification/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function checkEmailExists(email: string) {
  return apiRequest<{ exists: boolean; message: string }>(
    `/auth/email-verification/check?email=${encodeURIComponent(email)}`,
    { method: "GET" },
  );
}

export function validateRealEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return { valid: false, status: "invalid", message: "Please enter a valid email address." };
  }
  const domainParts = normalizedEmail.split("@")[1];
  if (!domainParts || domainParts.split(".").length < 2) {
    return { valid: false, status: "invalid", message: "Please enter a complete email address with a valid domain." };
  }
  return { valid: true, status: "deliverable", message: "Email appears to be deliverable." };
}

export type OtpLoginResponse = AuthSession;

export function otpLogin(email: string, code: string) {
  return apiRequest<OtpLoginResponse>("/auth/otp-login", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export type GenerateOtpResponse = { message: string };

export function generateOtp(email: string, purpose?: string, paymentId?: string) {
  return apiRequest<GenerateOtpResponse>("/otp/generate", {
    method: "POST",
    body: JSON.stringify({ email, purpose: purpose || "otp_login", paymentId }),
  });
}

export const tenantAgentsApi = {
  list: async () => {
    const response = await apiRequest<PaginatedResponse<TenantAgentDto>>(
      "/tenant/agents?limit=100",
    );
    return response.data;
  },
  get: (id: string) =>
    apiRequest<TenantAgentDto>(`/tenant/agents/${id}`),
  create: (data: CreateTenantAgentInput) =>
    apiRequest<CreatedTenantAgentResult>("/tenant/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  invite: (data: InviteTenantAgentInput) =>
    apiRequest<TenantAgentInviteResult>("/tenant/agents/invite", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resendInvite: (id: string) =>
    apiRequest<{
      message: string;
      invitationDelivery: "requested";
      expiresAt: string;
      /** One-time accept-invite link for manual sharing. */
      inviteUrl?: string;
    }>(
      `/tenant/agents/${id}/resend-invite`,
      { method: "POST" }
    ),
  update: (id: string, data: Partial<Omit<CreateTenantAgentInput, "password">>) =>
    apiRequest<TenantAgentDto>(`/tenant/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<{ message: string }>(`/tenant/agents/${id}`, {
      method: "DELETE",
    }),
};

export const tenantSettingsApi = {
  get: () => apiRequest<TenantSettingsDto>("/tenant/settings"),
  update: (data: UpdateTenantSettingsInput) =>
    apiRequest<TenantSettingsDto>("/tenant/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateOnboardingState: (data: {
    dismissedAt?: string | null;
    completedAt?: string | null;
  }) =>
    apiRequest<TenantSettingsDto>("/tenant/onboarding-state", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export type WorkspacePaymentMethod = {
  id?: string;
  kind: "kbzpay" | "aya_pay" | "other";
  name?: string;
  enabled: boolean;
  displayOrder: number;
  accountName: string;
  accountNumber: string;
  qrMediaId?: string | null;
  image?: { fileId: string; downloadUrl: string; expiresAt: string } | null;
  hasImage?: boolean;
  metadata?: Record<string, unknown>;
};
export type WorkspacePaymentSettings = { version: number | null; publishedAt?: string; publishedBy?: string | null; methods: WorkspacePaymentMethod[]; canEdit?: boolean };
export type WorkspacePaymentImageUpload = {
  fileId: string;
  downloadUrl: string | null;
  expiresAt: string;
  upload: { url: string; headers?: Record<string, string>; expiresAt: string };
};
export const tenantPaymentMethodsApi = {
  get: () => apiRequest<WorkspacePaymentSettings>("/tenant/payment-methods"),
  save: (data: { expectedVersion: number | null; methods: WorkspacePaymentMethod[] }) => apiRequest<WorkspacePaymentSettings>("/tenant/payment-methods", { method: "POST", body: JSON.stringify(data) }),
  createImageUpload: (file: File) => apiRequest<WorkspacePaymentImageUpload>("/tenant/payment-methods/image-upload", { method: "POST", body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size }) }),
  uploadImage: async (file: File) => {
    const registration = await tenantPaymentMethodsApi.createImageUpload(file);
    const response = await fetch(registration.upload.url, { method: "PUT", headers: registration.upload.headers, body: file });
    if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
    return registration;
  },
};

export const tenantBillingApi = {
  get: () => apiRequest<TenantBillingOverviewDto>("/tenant/billing"),
  getPeriods: () =>
    apiRequest<TenantSubscriptionPeriodsResponseDto>(
      "/tenant/subscription/periods",
    ),
  getUsageSummary: () =>
    apiRequest<TenantUsageSummaryDto>("/tenant/usage-summary"),
  createSubscriptionPurchaseRequest: (
    startOption: SubscriptionPurchaseStartOption,
    idempotencyKey: string,
    subscriptionPlanId?: string,
    extras?: {
      paymentMethod?: string
      paymentAccount?: string
      paymentAccountId?: string
      note?: string
    },
  ) =>
    apiRequest<SubscriptionPurchaseRequestResult>(
      "/tenant/billing/purchase-requests",
      {
        method: "POST",
        body: JSON.stringify({
          startOption,
          idempotencyKey,
          subscriptionPlanId,
          paymentMethod: extras?.paymentMethod || undefined,
          paymentAccount: extras?.paymentAccount || undefined,
          paymentAccountId: extras?.paymentAccountId || undefined,
          note: extras?.note || undefined,
        }),
      },
    ),
  listAddOnProducts: () =>
    apiRequest<TenantAddOnProductDto[]>("/tenant/add-on-products"),
  listAddOnPurchases: () =>
    apiRequest<TenantAddOnPurchaseDto[]>("/tenant/add-on-purchases?activeOnly=true"),
  createAddOnPurchase: (
    productId: string,
    idempotencyKey: string,
    extras?: {
      paymentMethod?: string
      paymentAccount?: string
      paymentAccountId?: string
      note?: string
    },
  ) =>
    apiRequest<TenantAddOnPurchaseDto>("/tenant/add-on-purchases", {
      method: "POST",
      body: JSON.stringify({
        productId,
        idempotencyKey,
        paymentMethod: extras?.paymentMethod || undefined,
        paymentAccount: extras?.paymentAccount || undefined,
        paymentAccountId: extras?.paymentAccountId || undefined,
        note: extras?.note || undefined,
      }),
    }),
  listPlanChangeRequests: () =>
    apiRequest<TenantPlanChangeRequestDto[]>(
      "/tenant/billing/plan-change-requests",
    ),
  listPublicBillingAccounts: () =>
    apiRequest<PublicBillingAccountGroup[]>("/public/billing-accounts"),
  submitPaymentProof: (recordId: string, data: SubmitTenantPaymentProofInput) =>
    apiRequest<{
      message: string;
      billingRecordId: string;
      paymentStatus: string;
      proof: TenantBillingProofDto;
    }>(`/tenant/billing/${recordId}/payment-proof`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  requestPlanChange: (desiredPlanId: string, note?: string) =>
    apiRequest<TenantPlanChangeRequestDto>(
      "/tenant/billing/plan-change-requests",
      {
        method: "POST",
        body: JSON.stringify({ desiredPlanId, note }),
      },
    ),
  cancelPlanChangeRequest: (requestId: string) =>
    apiRequest<TenantPlanChangeRequestDto>(
      `/tenant/billing/plan-change-requests/${requestId}/cancel`,
      {
        method: "POST",
      },
    ),
  cancelUpgradeRevision: (revisionId: string) =>
    apiRequest<{ id: string; upgradeStatus: string; cancelledAt: string }>(
      `/tenant/billing/upgrade-revisions/${revisionId}/cancel`,
      {
        method: "POST",
      },
    ),
  cancelSubscriptionBillingRecord: (recordId: string) =>
    apiRequest<TenantBillingRecordDto>(
      `/tenant/billing/${recordId}/cancel`,
      {
        method: "POST",
      },
    ),
};

export type TenantAuditUserSummaryDto = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  eventCount: number;
  lastActivity: string | null;
};

export type TenantAuditSummaryResponse = PaginatedResponse<TenantAuditUserSummaryDto> & {
  /** True event count for the whole tenant, independent of member paging. */
  totalEvents: number;
};

export const tenantAuditLogsApi = {
  list: async (
    options: {
      search?: string;
      limit?: number;
      userId?: string;
      page?: number;
      sortBy?: string;
      sortOrder?: "ASC" | "DESC";
    } = {},
  ): Promise<PaginatedResponse<TenantAuditLogDto>> => {
    // `limit` only, no `offset`: the backend validates query params with
    // forbidNonWhitelisted, so offset would be rejected with a 400.
    const params = new URLSearchParams({
      limit: String(options.limit || 20),
      page: String(options.page || 1),
    });
    if (options.search) params.set("search", options.search);
    if (options.userId) params.set("userId", options.userId);
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.sortOrder) params.set("sortOrder", options.sortOrder);
    // The full envelope is returned, not just `.data`: callers need
    // total/totalPages/hasNext to paginate instead of silently truncating.
    return apiRequest<PaginatedResponse<TenantAuditLogDto>>(
      `/tenant/audit-logs?${params}`,
    );
  },

  /**
   * Per-member rollup aggregated server-side. Replaces the old client-side
   * bucket of a fixed row window, which truncated both the per-member event
   * counts and the headline total.
   */
  summary: async (options: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<TenantAuditSummaryResponse> => {
    const params = new URLSearchParams({
      limit: String(options.limit || 20),
      page: String(options.page || 1),
    });
    if (options.search) params.set("search", options.search);
    if (options.role && options.role !== "all") params.set("role", options.role);
    if (options.status && options.status !== "all") {
      params.set("status", options.status);
    }
    return apiRequest<TenantAuditSummaryResponse>(
      `/tenant/audit-logs/summary?${params}`,
    );
  },
};

export type ValidateTelegramTokenResult = {
  ok: boolean;
  botId?: string;
  username?: string;
  firstName?: string;
  error?: string;
};

export type TelegramWebhookHealthDto = {
  channelId: string;
  tokenOk: boolean;
  tokenUsername: string | null;
  webhookUrl: string | null;
  connectionStatus: string | null;
  webhookRegistrationStatus: string | null;
  webhook: {
    url: string | null;
    urlMatches: boolean;
    allowedUpdates: string[] | null;
    hasCallbackQuery: boolean;
    pendingUpdateCount: number | null;
    lastErrorMessage: string | null;
  } | null;
  webhookError: string | null;
  checkedAt: string;
};

export const tenantChannelsApi = {
  list: () => apiRequest<TenantChannelDto[]>("/tenant/channels"),
  create: (data: CreateTenantChannelInput) =>
    apiRequest<TenantChannelDto>("/tenant/channels", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<CreateTenantChannelInput>) =>
    apiRequest<TenantChannelDto>(`/tenant/channels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testConnection: (id: string) =>
    apiRequest<TenantChannelConnectionTestDto>(
      `/tenant/channels/${id}/test-connection`,
      {
        method: "POST",
      },
    ),
  telegramHealth: (id: string) =>
    apiRequest<TelegramWebhookHealthDto>(
      `/tenant/channels/${id}/telegram-health`,
    ),
  setShopSettings: (
    id: string,
    data: { shopEnabled?: boolean; orderingEnabled?: boolean },
  ) =>
    apiRequest<ChannelTemplateSelectionDto>(
      `/tenant/channels/${id}/shop-settings`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),
  validateTelegramToken: (botToken: string, expectedUsername?: string) =>
    apiRequest<ValidateTelegramTokenResult>(
      "/tenant/channels/validate-telegram-token",
      {
        method: "POST",
        body: JSON.stringify({ botToken, expectedUsername }),
      },
    ),
  updateTelegramSettings: (
    id: string,
    data: {
      channelName?: string;
      displayName?: string;
      credentials?: Record<string, unknown>;
    },
  ) =>
    apiRequest<TenantChannelDto>(
      `/tenant/channels/${id}/telegram-settings`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),
  disconnect: (id: string) =>
    apiRequest<TenantChannelDto>(`/tenant/channels/${id}/disconnect`, {
      method: "POST",
    }),
  setRetention: (id: string, selected: boolean) =>
    apiRequest<TenantChannelDto>(`/tenant/channels/${id}/retention`, {
      method: "PUT",
      body: JSON.stringify({ selected }),
    }),
  reactivate: (id: string) =>
    apiRequest<TenantChannelDto>(`/tenant/channels/${id}/reactivate`, {
      method: "POST",
    }),
  delete: (id: string) =>
    apiRequest<{ message: string }>(`/tenant/channels/${id}`, {
      method: "DELETE",
    }),
};

export const tenantAllowedProvidersApi = {
  allowed: () => apiRequest<{ hasActivePeriod: boolean; allowedProviders: string[] }>('/tenant/providers/allowed'),
};

export const tenantTelegramManagedBotApi = {  initiate: (data: InitiateTelegramManagedBotInput) =>
    apiRequest<TelegramManagedBotRequestDto>(
      "/tenant/channel-connections/telegram/managed/initiate",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  getRequest: (requestId: string) =>
    apiRequest<TelegramManagedBotRequestDto>(
      `/tenant/channel-connections/telegram/managed/requests/${requestId}`,
    ),
  cancel: (requestId: string) =>
    apiRequest<TelegramManagedBotRequestDto>(
      `/tenant/channel-connections/telegram/managed/requests/${requestId}/cancel`,
      {
        method: "POST",
      },
    ),
};

export type BotTemplateFieldDto = {
  id?: string;
  key: string;
  sort: number;
  layout: string;
  visible: boolean;
  condition: string | null;
  value: Record<string, unknown>;
};

export type BotTemplateDto = {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  fields: BotTemplateFieldDto[];
};

export type BotTemplateFieldInput = {
  key: string;
  layout?: string;
  visible?: boolean;
  condition?: string | null;
  value?: Record<string, unknown>;
};

export type ChannelTemplateSelectionDto = {
  channelId: string;
  templateId: string | null;
  useBotTemplate: boolean;
};

/** PUT /channels/:id/bot-template wraps the selection with its side effects. */
export type ChannelTemplateApplyDto = {
  selection: ChannelTemplateSelectionDto;
  webhook: {
    webhookRegistrationStatus: string | null;
    connectionStatus: string | null;
    webhookUrl: string | null;
  } | null;
  /** Plan 76: false when Telegram refused (or we could not) the command list. */
  commandsRegistered: boolean;
};

/** Plan 78: read-only view of the platform commerce switch. */
export type TenantChannelSettingsDto = {
  telegramBotTemplate: "commerce" | null;
};

export const tenantChannelSettingsApi = {
  get: () =>
    apiRequest<TenantChannelSettingsDto>("/tenant/channel-settings"),
};

// Plan 73/74: tenant bot template client surface.
export const botTemplatesApi = {
  list: () => apiRequest<BotTemplateDto[]>("/tenant/bot-templates"),
  get: (id: string) => apiRequest<BotTemplateDto>(`/tenant/bot-templates/${id}`),
  create: (data: { name: string; fields: BotTemplateFieldInput[] }) =>
    apiRequest<BotTemplateDto>("/tenant/bot-templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; fields?: BotTemplateFieldInput[] }) =>
    apiRequest<BotTemplateDto>(`/tenant/bot-templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiRequest<void>(`/tenant/bot-templates/${id}`, {
      method: "DELETE",
    }),
  getChannelSelection: (channelId: string) =>
    apiRequest<ChannelTemplateSelectionDto>(
      `/tenant/channels/${channelId}/bot-template`,
    ),
  setChannelSelection: (
    channelId: string,
    data: { templateId?: string | null; useBotTemplate: boolean },
  ) =>
    apiRequest<ChannelTemplateApplyDto>(
      `/tenant/channels/${channelId}/bot-template`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),
};

export const profileApi = {
  get: () => apiRequest<AuthUser>("/auth/profile"),
  update: (data: Partial<AuthUser>) =>
    apiRequest<AuthUser>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateProfileImage: (userId: string, fileId: string) =>
    apiRequest<{ userId: string; avatarUrl: string | null }>(
      `/tenant/users/${userId}/profile-image`,
      {
        method: "PUT",
        body: JSON.stringify({ fileId }),
      },
    ),
  getProfileImageDownloadUrl: (userId: string) =>
    apiRequest<{ fileId: string | null; downloadUrl: string | null }>(
      `/tenant/users/${userId}/profile-image/download-url`,
    ),
};

/**
 * One newest-first thread page. `nextCursor` is the oldest `createdAt` on the
 * page (exclusive) — pass it as `before` for the next older page. `null`
 * means the thread is exhausted.
 */
export type AgentMessagePageDto = {
  data: AgentMessageDto[];
  hasMore: boolean;
  nextCursor: string | null;
};

export const agentConversationsApi = {
  get: (id: string) =>
    apiRequest<AgentConversationDto>(`/agent/conversations/${id}`),
  /**
   * Returns the full paginated envelope so callers can tell how many rows
   * exist in total. Prefer this over `list` for any UI that renders a queue —
   * dropping the envelope silently hides rows past `limit`.
   */
  listPaginated: async (
    options: string | AgentConversationListOptions = {},
  ): Promise<PaginatedResponse<AgentConversationDto>> => {
    const normalizedOptions =
      typeof options === "string" ? { search: options } : options;
    const params = new URLSearchParams({
      limit: String(normalizedOptions.limit ?? 100),
    });
    if (normalizedOptions.search)
      params.set("search", normalizedOptions.search);
    if (normalizedOptions.filter && normalizedOptions.filter !== "all")
      params.set("filter", normalizedOptions.filter);
    if (normalizedOptions.status)
      params.set("status", normalizedOptions.status);
    if (normalizedOptions.priority)
      params.set("priority", normalizedOptions.priority);
    if (normalizedOptions.channelType)
      params.set("channelType", normalizedOptions.channelType);
    if (normalizedOptions.slaState)
      params.set("slaState", normalizedOptions.slaState);
    if (normalizedOptions.dateFrom)
      params.set("dateFrom", normalizedOptions.dateFrom);
    if (normalizedOptions.dateTo)
      params.set("dateTo", normalizedOptions.dateTo);
    if (normalizedOptions.resolvedOnly)
      params.set("resolvedOnly", "true");
    if (normalizedOptions.unassigned) params.set("unassigned", "true");
    if (normalizedOptions.intent) params.set("intent", normalizedOptions.intent);
    // New filters MUST be added here: anything absent is silently dropped and
    // the queue renders unfiltered rows under filtered counts. That exact
    // failure hid the channel filter (and Mine) until a live trace caught it.
    if (normalizedOptions.channelId)
      params.set("channelId", normalizedOptions.channelId);
    if (normalizedOptions.orderStatus)
      params.set("orderStatus", normalizedOptions.orderStatus);
    if (normalizedOptions.deliveryStatus)
      params.set("deliveryStatus", normalizedOptions.deliveryStatus);
    if (normalizedOptions.paymentStatus)
      params.set("paymentStatus", normalizedOptions.paymentStatus);
    if (normalizedOptions.assignedAgentId)
      params.set("assignedAgentId", normalizedOptions.assignedAgentId);
    if (normalizedOptions.page) params.set("page", String(normalizedOptions.page));
    return apiRequest<PaginatedResponse<AgentConversationDto>>(
      `/agent/conversations?${params}`,
    );
  },
  /** Rows only. Discards the pagination envelope — see `listPaginated`. */
  list: async (options: string | AgentConversationListOptions = {}) => {
    const response = await agentConversationsApi.listPaginated(options);
    return response.data;
  },
  messages: (
    conversationId: string,
    options: { limit?: number; before?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.before) params.set("before", options.before);
    const query = params.toString();
    return apiRequest<AgentMessagePageDto>(
      `/agent/conversations/${conversationId}/messages${query ? `?${query}` : ""}`,
    );
  },
  sendMessage: (data: SendAgentMessageInput) =>
    apiRequest<AgentMessageDto>("/agent/conversations/messages", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  retryMessage: (messageId: string) =>
    apiRequest<AgentMessageDto>(`/agent/messages/${messageId}/retry`, {
      method: "POST",
    }),
  assign: (conversationId: string, agentId: string | null) =>
    apiRequest<AgentConversationDto>(
      `/agent/conversations/${conversationId}/assign`,
      {
        method: "POST",
        // Explicit null clears the assignment (back to the pool). Absent is
        // still rejected server-side, so this never unassigns by accident.
        body: JSON.stringify({ agentId }),
      },
    ),
  update: (conversationId: string, data: UpdateAgentConversationInput) =>
    apiRequest<AgentConversationDto>(`/agent/conversations/${conversationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  setReadState: (conversationId: string, unread: boolean) =>
    apiRequest<AgentConversationDto>(
      `/agent/conversations/${conversationId}/read-state`,
      {
        method: "PUT",
        body: JSON.stringify({ unread }),
      },
    ),
  search: (query: string) =>
    apiRequest<AgentConversationDto[]>(
      `/agent/search/conversations?q=${encodeURIComponent(query)}`,
    ),
};

export const agentDashboardApi = {
  stats: () => apiRequest<CommerceWorkspaceStatsDto>("/agent/dashboard/stats"),
};

export const agentNotificationsApi = {
  list: () => apiRequest<AgentNotificationDto[]>("/agent/notifications"),
  markRead: (id: string) =>
    apiRequest<AgentNotificationDto>(`/agent/notifications/${id}/read`, {
      method: "POST",
    }),
  markAllRead: () =>
    apiRequest<{ message: string }>("/agent/notifications/read-all", {
      method: "POST",
    }),
  delete: (id: string) =>
    apiRequest<{ message: string }>(`/agent/notifications/${id}`, {
      method: "DELETE",
    }),
};

export const agentMediaApi = {
  list: (
    options: { search?: string; contentType?: string; purpose?: string } = {},
  ) => {
    const params = new URLSearchParams({ limit: "100" });
    if (options.search) params.set("search", options.search);
    if (options.contentType) params.set("contentType", options.contentType);
    if (options.purpose) params.set("purpose", options.purpose);
    return apiRequest<PaginatedResponse<AgentMediaFileDto>>(`/media?${params}`);
  },
  createUpload: (file: File, purpose = "media-library") =>
    apiRequest<AgentMediaUploadDto>(
      purpose === "billing-payment-proof"
        ? "/media/uploads/billing-proof"
        : purpose === "order-payment-proof"
          ? "/media/uploads/order-payment-proof"
        : "/media/uploads",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          purpose,
        }),
      },
    ),
  upload: async (file: File, purpose = "media-library") => {
    const signed = await agentMediaApi.createUpload(file, purpose);
    let response: Response;
    try {
      response = await fetch(signed.upload.url, {
        method: "PUT",
        headers: signed.upload.headers,
        body: file,
      });
    } catch (error) {
      throw new ApiError(
        "Unable to upload media. Please refresh or contact support.",
        {
          kind: "network",
          rawMessage: error instanceof Error ? error.message : undefined,
        },
      );
    }
    if (!response.ok)
      throw new Error(`Upload failed with status ${response.status}`);
    return agentMediaApi.download(signed.file.id, purpose);
  },
  download: (id: string, purpose = "media-library") =>
    apiRequest<{
      file: AgentMediaFileDto;
      download: NonNullable<AgentMediaFileDto["download"]>;
    }>(
      purpose === "billing-payment-proof"
        ? `/media/billing-proof/${id}/download-url`
        : purpose === "order-payment-proof"
          ? `/media/order-payment-proof/${id}/download-url`
          : `/media/${id}/download-url`,
    ),
  archive: (id: string) =>
    apiRequest<AgentMediaFileDto>(`/media/${id}`, { method: "DELETE" }),
};

/**
 * Authenticated binary fetch for one message attachment. Plain <img>/<audio>
 * tags cannot send the bearer token, and persisted attachment URLs rot
 * (signed, expiring), so binaries always load through here as object URLs.
 * See `useMessageAttachmentUrl` for caching and revocation.
 */
export async function fetchMessageAttachmentBlob(
  messageId: string,
  index: number,
): Promise<Blob> {
  const session = getStoredSession();
  const headers = new Headers();
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  const response = await fetch(
    `${API_BASE_URL}/agent/messages/${messageId}/attachments/${index}/content`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(`Attachment load failed with status ${response.status}`);
  }
  return response.blob();
}

export const agentPerformanceApi = {
  get: (days: number) =>
    apiRequest<AgentPerformanceDto>(`/agent/performance?days=${days}`),
  team: (days: number) =>
    apiRequest<TeamPerformanceDto[]>(`/agent/performance/team?days=${days}`),
};

export const agentCannedResponsesApi = {
  list: async () => {
    const response = await apiRequest<PaginatedResponse<AgentCannedResponseDto>>(
      "/tenant/canned-responses?limit=100",
    );
    return response.data;
  },
  create: (data: CreateAgentCannedResponseInput) =>
    apiRequest<AgentCannedResponseDto>("/tenant/canned-responses", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateAgentCannedResponseInput) =>
    apiRequest<AgentCannedResponseDto>(`/tenant/canned-responses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<{ message: string }>(`/tenant/canned-responses/${id}`, {
      method: "DELETE",
    }),
};

export const agentProductsApi = {
  list: async (options: AgentProductListOptions = {}) => {
    const params = new URLSearchParams({
      limit: String(Math.min(options.limit ?? 100, 100)),
    });
    if (options.search) params.set("search", options.search);
    if (options.page) params.set("page", String(options.page));
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.sortOrder) params.set("sortOrder", options.sortOrder);
    if (options.status && options.status !== "all")
      params.set("status", options.status);
    if (options.categoryId) params.set("categoryId", options.categoryId);
    return apiRequest<PaginatedResponse<AgentProductDto>>(
      `/tenant/products?${params}`,
    );
  },
  categories: () =>
    apiRequest<AgentProductCategoryDto[]>("/tenant/products/categories"),
  categoriesIncludingInactive: () =>
    apiRequest<AgentProductCategoryDto[]>(
      "/tenant/products/categories?includeInactive=true",
    ),
  create: (data: CreateAgentProductInput) =>
    apiRequest<AgentProductDto>("/tenant/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateAgentProductInput) =>
    apiRequest<AgentProductDto>(`/tenant/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  createCategory: (name: string, description?: string) =>
    apiRequest<AgentProductCategoryDto>("/tenant/products/categories", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
  updateCategory: (
    id: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
    },
  ) =>
    apiRequest<AgentProductCategoryDto>(
      `/tenant/products/categories/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    ),
  deleteCategory: (id: string) =>
    apiRequest<{ message: string }>(`/tenant/products/categories/${id}`, {
      method: "DELETE",
    }),
};

export const agentOrdersApi = {
  list: async (options: AgentOrderListOptions = {}) => {
    // Backend PaginationDto caps limit at 100 — clamp so bulk loads never 400.
    const params = new URLSearchParams({ limit: String(Math.min(options.limit ?? 100, 100)) });
    if (options.search) params.set("search", options.search);
    if (options.page) params.set("page", String(options.page));
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.sortOrder) params.set("sortOrder", options.sortOrder);
    if (options.status && options.status !== "all")
      params.set("status", options.status);
    if (options.paymentStatus && options.paymentStatus !== "all")
      params.set("paymentStatus", options.paymentStatus);
    if (options.deliveryStatus && options.deliveryStatus !== "all")
      params.set("deliveryStatus", options.deliveryStatus);
    if (options.proofSubmitted) params.set("proofSubmitted", options.proofSubmitted);
    if (options.customerId) params.set("customerId", options.customerId);
    if (options.channelId) params.set("channelId", options.channelId);
    if (options.conversationId) params.set("conversationId", options.conversationId);
    if (options.dateFrom) params.set("dateFrom", options.dateFrom);
    if (options.dateTo) params.set("dateTo", options.dateTo);
    return apiRequest<PaginatedResponse<AgentOrderDto>>(
      `/orders?${params}`,
    );
  },
  get: (id: string) => apiRequest<AgentOrderDto>(`/orders/${id}`),
  items: (id: string) => apiRequest<AgentOrderItemDto[]>(`/orders/${id}/items`),
  create: (data: CreateAgentOrderInput) =>
    apiRequest<AgentOrderDto>("/agent/orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateDetails: (id: string, data: UpdateAgentOrderDetailsInput) =>
    apiRequest<AgentOrderDto>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  linkAttachment: (id: string, fileId: string) =>
    apiRequest<AgentOrderDto>(`/orders/${id}/attachments`, {
      method: "PUT",
      body: JSON.stringify({ fileId, role: "payment_proof" }),
    }),
  updateStatus: (id: string, status: OrderStatus, reason?: string) =>
    apiRequest<AgentOrderDto>(`/orders/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, reason }),
    }),
  updatePaymentStatus: (id: string, status: PaymentStatus, reason?: string, attachmentReference?: string) =>
    apiRequest<AgentOrderDto>(`/orders/${id}/payment-status`, {
      method: "PUT",
      body: JSON.stringify({ status, reason, attachmentReference }),
    }),
  listPayments: (id: string) =>
    apiRequest<AgentOrderPaymentTransactionDto[]>(`/orders/${id}/payments`),
  submitPayment: (id: string, input: SubmitOrderPaymentInput) =>
    apiRequest<AgentOrderDto>(`/orders/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  markUnpaid: (id: string, reason: string, idempotencyKey?: string) =>
    apiRequest<AgentOrderDto>(`/orders/${id}/payments/mark-unpaid`, {
      method: "POST",
      body: JSON.stringify({ reason, idempotencyKey }),
    }),
  updateDeliveryStatus: (id: string, status: DeliveryStatus, reason?: string) =>
    apiRequest<AgentOrderDto>(`/orders/${id}/delivery-status`, {
      method: "PUT",
      body: JSON.stringify({ status, reason }),
    }),
};

export type AgentDeliveryListOptions = {
  search?: string;
  status?: DeliveryStatus | "all";
  assignee?: string;
  /** Deliveries linked to one conversation (Plan 72: inbox Delivery List tab). */
  conversationId?: string;
  /** Deliveries for one customer, via the order (Plan 72 re-scope). */
  customerId?: string;
  sortBy?:
    | "createdAt"
    | "updatedAt"
    | "orderNumber"
    | "deliveryDate"
    | "status"
    | "deliveryAssigneeName";
  sortOrder?: "ASC" | "DESC";
  page?: number;
  limit?: number;
};

export const agentDeliveriesApi = {
  update: (id: string, data: { status?: DeliveryStatus; reason?: string; deliveryAssigneeName?: string; deliveryAssigneePhone?: string; deliveryDate?: string }) =>
    apiRequest<AgentDeliveryDto>(`/deliveries/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  list: async (options: AgentDeliveryListOptions = {}) => {
    // Backend PaginationDto caps limit at 100 — clamp so bulk loads never 400.
    const params = new URLSearchParams({ limit: String(Math.min(options.limit ?? 100, 100)) });
    if (options.search) params.set("search", options.search);
    if (options.status && options.status !== "all")
      params.set("status", options.status);
    if (options.assignee) params.set("assignee", options.assignee);
    if (options.conversationId) params.set("conversationId", options.conversationId);
    if (options.customerId) params.set("customerId", options.customerId);
    if (options.sortBy) params.set("sortBy", options.sortBy);
    if (options.sortOrder) params.set("sortOrder", options.sortOrder);
    if (options.page) params.set("page", String(options.page));
    return apiRequest<PaginatedResponse<AgentDeliveryDto>>(
      `/deliveries?${params}`,
    );
  },
  get: (id: string) => apiRequest<AgentDeliveryDto>(`/deliveries/${id}`),
};

export const agentNotesApi = {
  /** Pinned first, then newest — one list, so page counts stay consistent. */
  list: (conversationId: string, options: { page?: number; limit?: number } = {}) => {
    const params = new URLSearchParams({
      limit: String(Math.min(options.limit ?? 15, 100)),
    });
    if (options.page) params.set("page", String(options.page));
    return apiRequest<PaginatedResponse<AgentConversationNoteDto>>(
      `/agent/conversations/${conversationId}/notes?${params}`,
    );
  },
  create: (conversationId: string, data: CreateConversationNoteInput) =>
    apiRequest<AgentConversationNoteDto>(
      `/agent/conversations/${conversationId}/notes`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  update: (noteId: string, data: UpdateConversationNoteInput) =>
    apiRequest<AgentConversationNoteDto>(`/agent/conversations/notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (noteId: string) =>
    apiRequest<void>(`/agent/conversations/notes/${noteId}`, {
      method: "DELETE",
    }),
};

export const agentCustomersApi = {
  list: async (options: string | AgentCustomerListOptions = {}) => {
    const params = new URLSearchParams({
      limit: "100",
    });
    const normalizedOptions =
      typeof options === "string" ? { search: options } : options;
    if (normalizedOptions.limit)
      params.set("limit", String(Math.min(normalizedOptions.limit, 100)));
    if (normalizedOptions.search) params.set("search", normalizedOptions.search);
    if (normalizedOptions.page)
      params.set("page", String(normalizedOptions.page));
    if (normalizedOptions.sortBy)
      params.set("sortBy", normalizedOptions.sortBy);
    if (normalizedOptions.sortOrder)
      params.set("sortOrder", normalizedOptions.sortOrder);
    if (normalizedOptions.status && normalizedOptions.status !== "all")
      params.set("status", normalizedOptions.status);
    return apiRequest<PaginatedResponse<AgentCustomerDto>>(
      `/agent/customers?${params}`,
    );
  },
  create: (data: CreateAgentCustomerInput) =>
    apiRequest<AgentCustomerDto>("/agent/customers", {
      method: "POST",
      body: JSON.stringify({
        channelId: data.channelId,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        location:
          data.city?.trim() || data.country?.trim()
            ? {
                city: data.city?.trim() || undefined,
                country: data.country?.trim() || undefined,
              }
            : undefined,
        tags: data.tags || [],
        notes: data.notes,
        status: data.status || "active",
      }),
    }),
  get: (id: string) => apiRequest<AgentCustomerDto>(`/agent/customers/${id}`),
  update: (id: string, data: UpdateAgentCustomerInput) =>
    apiRequest<AgentCustomerDto>(`/agent/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  timeline: (id: string, options: { page?: number; limit?: number } = {}) =>
    apiRequest<PaginatedResponse<AgentTimelineEventDto>>(
      `/domain-events/customers/${id}/timeline?page=${options.page ?? 1}&limit=${options.limit ?? 20}`,
    ),
};

/** Tenant-scoped customer tag vocabulary ("Manage Tag" + new-customer picker). */
export type CustomerTagDto = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
};

export const agentCustomerTagsApi = {
  list: () => apiRequest<CustomerTagDto[]>("/customer-tags"),
  create: (name: string) =>
    apiRequest<CustomerTagDto>("/customer-tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    apiRequest<CustomerTagDto>(`/customer-tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    apiRequest<void>(`/customer-tags/${id}`, { method: "DELETE" }),
};

export type ReportPeriod = "weekly" | "monthly" | "yearly";

export type ReportDateRange = { startDate?: string; endDate?: string };

export type RevenueReport = {
  period: string;
  startDate: string;
  endDate: string;
  summary: {
    totalRevenue: number;
    totalPaid: number;
    returnedRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
  };
  byChannel: { channelName: string; channelType: string; revenue: number; orderCount: number }[];
  byAgent: { agentName: string; revenue: number; orderCount: number }[];
  byProduct: { productName: string; revenue: number; totalSold: number; orderCount: number }[];
};

export type TeamPerformanceReport = {
  period: string;
  startDate: string;
  endDate: string;
  agents: {
    id: string;
    name: string;
    role: string;
    totalOrders: number;
    paidOrders: number;
    totalRevenue: number;
    totalCollected: number;
    totalConversations: number;
    messagesSent: number;
  }[];
};

export type CustomerReport = {
  period: string;
  startDate: string;
  endDate: string;
  totalCustomers: number;
  newCustomers: number;
  segments: { cold: number; warm: number; hot: number };
  boughtRate: { label: string; customers: number }[];
  byChannel: { channelName: string; channelType: string; customerCount: number }[];
};

export type ProductReport = {
  period: string;
  startDate: string;
  endDate: string;
  products: {
    productName: string;
    productId: string;
    totalSold: number;
    totalRevenue: number;
    orderCount: number;
    orderRate: string;
  }[];
  stockHealth: { total: number; outOfStock: number; lowStock: number };
};

export type ChannelReport = {
  period: string;
  startDate: string;
  endDate: string;
  channels: {
    id: string;
    channelName: string;
    channelType: string;
    inbound: number;
    outbound: number;
    customers: number;
    revenue: number;
  }[];
};

function buildReportParams(period: ReportPeriod, dateRange?: ReportDateRange) {
  const params = new URLSearchParams({ period });
  if (dateRange?.startDate) params.set("startDate", dateRange.startDate);
  if (dateRange?.endDate) params.set("endDate", dateRange.endDate);
  return params.toString();
}

export const reportsApi = {
  revenue: (period: ReportPeriod = "monthly", dateRange?: ReportDateRange) =>
    apiRequest<RevenueReport>(`/reports/revenue?${buildReportParams(period, dateRange)}`),
  teamPerformance: (period: ReportPeriod = "monthly", dateRange?: ReportDateRange) =>
    apiRequest<TeamPerformanceReport>(`/reports/team-performance?${buildReportParams(period, dateRange)}`),
  customers: (period: ReportPeriod = "monthly", dateRange?: ReportDateRange) =>
    apiRequest<CustomerReport>(`/reports/customers?${buildReportParams(period, dateRange)}`),
  products: (period: ReportPeriod = "monthly", dateRange?: ReportDateRange) =>
    apiRequest<ProductReport>(`/reports/products?${buildReportParams(period, dateRange)}`),
  channels: (period: ReportPeriod = "monthly", dateRange?: ReportDateRange) =>
    apiRequest<ChannelReport>(`/reports/channels?${buildReportParams(period, dateRange)}`),
};

export async function fetchSenderAvatar(
  conversationId: string,
): Promise<string | null> {
  const session = getStoredSession();
  const headers = new Headers();
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  const response = await fetch(
    `${API_BASE_URL}/agent/conversations/${conversationId}/sender-avatar`,
    { headers },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Avatar load failed with status ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
