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
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  emailVerificationRequired?: boolean;
  emailVerificationDelivery?: "requested" | "unavailable";
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

type ApiErrorKind = "network" | "unauthorized" | "forbidden" | "backend";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  rawMessage?: string;
  /** Machine-readable error code from the backend response body, when present. */
  code?: string;

  constructor(
    message: string,
    options: {
      kind: ApiErrorKind;
      status?: number;
      rawMessage?: string;
      code?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.rawMessage = options.rawMessage;
    this.code = options.code;
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

export type TenantCsrDto = {
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
  updatedAt: string;
};

export type CreateTenantCsrInput = {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  role?: WorkspaceRole;
  status?: "active" | "inactive" | "suspended";
};

export type InviteTenantCsrInput = Omit<CreateTenantCsrInput, "password">;

export type TenantCsrInviteResult = {
  user: TenantCsrDto;
  invitation: {
    message: string;
    invitationDelivery: "requested";
    expiresAt: string;
  };
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
    | "approved"
    | "rejected";
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
    maxCsrs: number;
    maxChannels: number;
    messageLimit: number;
    apiLimit: number;
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
        key: "csrs";
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
  apiRequests: number;
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
  apiRequests: UsageMetricDto;
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
    paymentStatus: "unpaid";
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

export type CsrCustomerDto = {
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

export type CsrChannelDto = {
  id: string;
  channelType: "messenger" | "viber" | "telegram" | "tiktok";
  displayName?: string | null;
  channelName: string;
};

export type CsrConversationDto = {
  id: string;
  customerId: string;
  channelId: string;
  assignedCsrId?: string | null;
  assignedAt?: string | null;
  subject?: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  tags: string[];
  metadata?: {
    inboxUnread?: boolean;
    inboxReadAt?: string | null;
    inboxForceUnread?: boolean;
    [key: string]: unknown;
  };
  firstMessageAt?: string | null;
  lastMessageAt?: string | null;
  lastCustomerMessageAt?: string | null;
  lastCsrResponseAt?: string | null;
  firstResponseAt?: string | null;
  slaDueAt?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
  createdAt: string;
  updatedAt: string;
  searchSnippet?: string | null;
  customer?: CsrCustomerDto | null;
  channel?: CsrChannelDto | null;
};

export type CsrMessageDto = {
  id: string;
  conversationId: string;
  senderType: "customer" | "csr" | "system";
  senderId?: string | null;
  messageType:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "location"
    | "order"
    | "invoice";
  content?: string | null;
  attachments: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  status: "sent" | "delivered" | "read" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type CsrCannedResponseDto = {
  id: string;
  title: string;
  shortcut?: string | null;
  content: string;
  tags: string[];
  visibility: "public" | "private" | "team";
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateCsrCannedResponseInput = {
  title: string;
  shortcut?: string;
  content: string;
  tags?: string[];
  visibility?: "public" | "private" | "team";
};

export type UpdateCsrCannedResponseInput =
  Partial<CreateCsrCannedResponseInput>;

export type CsrProductDto = {
  id: string;
  name: string;
  sku?: string | null;
  type?: "product" | "service";
  description?: string | null;
  shortDescription?: string | null;
  price: number | string;
  costPrice?: number | string | null;
  stockQuantity: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
  images?: string[];
  tags?: string[];
  status: "active" | "inactive" | "out_of_stock";
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
  category?: { id: string; name: string } | null;
};

export type CsrProductCategoryDto = {
  id: string;
  name: string;
  description?: string | null;
};

export type CreateCsrCustomerInput = {
  channelId: string;
  fullName: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  tags?: string[];
  notes?: string;
  status?: "active" | "blocked" | "archived";
};

export type CreateCsrProductInput = {
  name: string;
  sku?: string;
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

export type UpdateCsrProductInput = Partial<CreateCsrProductInput>;

export type CsrOrderDto = {
  id: string;
  customerId?: string | null;
  conversationId?: string | null;
  orderNumber: string;
  status:
    | "new"
    | "confirmed"
    | "preparing"
    | "packed"
    | "out_for_delivery"
    | "delivered"
    | "failed_delivery"
    | "cod_collected"
    | "cancelled"
    | "returned";
  paymentStatus:
    | "pending"
    | "partially_paid"
    | "paid"
    | "failed"
    | "refunded"
    | "cod_pending"
    | "cod_collected";
  paymentMethod?: "cod" | "online" | "bank_transfer" | null;
  subtotal: number | string;
  taxAmount: number | string;
  discountAmount: number | string;
  shippingFee: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  balanceDue: number | string;
  codAmount: number | string;
  currency: string;
  notes?: string | null;
  deliveryAssigneeName?: string | null;
  deliveryAssigneePhone?: string | null;
  deliveryZone?: string | null;
  trackingNumber?: string | null;
  paymentNotes?: string | null;
  statusHistory?: Record<string, unknown>[];
  createdAt: string;
  customer?: CsrCustomerDto | null;
};

export type CsrOrderItemDto = {
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
};

export type SendCsrMessageInput = {
  conversationId: string;
  messageType?: "text" | "image" | "video" | "audio" | "file" | "location";
  content: string;
  attachments?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  replyToMessageId?: string;
  cannedResponseId?: string;
};

export type CreateCsrOrderInput = {
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
  paidAmount?: number;
  deliveryAssigneeName?: string;
  deliveryAssigneePhone?: string;
  deliveryZone?: string;
  paymentNotes?: string;
  notes?: string;
};

export type UpdateCsrOrderDetailsInput = {
  paymentMethod?: "cod" | "online" | "bank_transfer";
  items: Array<{
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
  shippingAddress?: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
};

export type UpdateCsrOrderLifecycleInput = Partial<{
  status: CsrOrderDto["status"];
  note: string;
  deliveryAssigneeName: string;
  deliveryAssigneePhone: string;
  deliveryZone: string;
  trackingNumber: string;
  paidAmount: number;
  paymentNotes: string;
  paymentStatus: CsrOrderDto["paymentStatus"];
  deliveryDate: string;
  metadata: Record<string, unknown>;
}>;

export type CsrConversationListOptions = {
  search?: string;
  filter?:
    "all" | "unread" | "assigned" | "team" | "hot_leads" | "vip" | "overdue";
  status?: CsrConversationDto["status"];
  priority?: CsrConversationDto["priority"];
  channelType?: CsrChannelDto["channelType"];
  slaState?: "normal" | "due_soon" | "overdue";
};

export type UpdateCsrConversationInput = Partial<{
  status: CsrConversationDto["status"];
  priority: CsrConversationDto["priority"];
  assignedCsrId: string;
  subject: string;
  tags: string[];
  closeReason: string;
}>;

export type CsrOrderListOptions = {
  search?: string;
  status?: CsrOrderDto["status"] | "all";
  paymentStatus?: CsrOrderDto["paymentStatus"] | "all";
  customerId?: string;
  channelId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CsrTimelineEventDto = {
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

export type CsrNotificationDto = {
  id: string;
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  actionUrl?: string | null;
  isRead: boolean;
  expiresAt?: string | null;
  createdAt: string;
};

export type CsrMediaFileDto = {
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

export type CsrMediaUploadDto = {
  file: CsrMediaFileDto;
  upload: {
    driver: string;
    method: "PUT";
    url: string;
    objectKey: string;
    expiresAt: string;
    headers?: Record<string, string>;
  };
};

export type CsrPerformanceDto = {
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
  csrId: string;
  fullName: string;
  role: string;
  conversationsHandled: number;
  resolutionRate: number;
  avgResponseTimeSeconds: number;
  customerSatisfactionAvg: number;
};

export type UpdateCsrCustomerInput = Partial<{
  fullName: string;
  email: string;
  phone: string;
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
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new ApiError(DEFAULT_WORKSPACE_ERROR, {
      kind: "network",
      rawMessage: error instanceof Error ? error.message : undefined,
    });
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let errorCode: string | undefined;
    try {
      const errorBody = await response.json();
      message = errorBody.message || message;
      if (typeof errorBody.code === "string") errorCode = errorBody.code;
    } catch {
      // Ignore invalid error bodies and fall back to the HTTP status message.
    }
    const rawMessage = Array.isArray(message) ? message.join(", ") : message;
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(normalizeApiErrorMessage(response.status, rawMessage), {
      kind:
        response.status === 401
          ? "unauthorized"
          : response.status === 403
            ? "forbidden"
            : "backend",
      status: response.status,
      rawMessage,
      code: errorCode,
    });
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

export function requestEmailVerification(email: string) {
  return apiRequest<{ message: string }>("/auth/email-verification/resend", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmEmailVerification(token: string) {
  return apiRequest<{ message: string }>("/auth/email-verification/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export const tenantCsrsApi = {
  list: async () => {
    const response = await apiRequest<PaginatedResponse<TenantCsrDto>>(
      "/tenant/csrs?limit=100",
    );
    return response.data;
  },
  create: (data: CreateTenantCsrInput) =>
    apiRequest<TenantCsrDto>("/tenant/csrs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  invite: (data: InviteTenantCsrInput) =>
    apiRequest<TenantCsrInviteResult>("/tenant/csrs/invite", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Omit<CreateTenantCsrInput, "password">>) =>
    apiRequest<TenantCsrDto>(`/tenant/csrs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<{ message: string }>(`/tenant/csrs/${id}`, {
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
  ) =>
    apiRequest<SubscriptionPurchaseRequestResult>(
      "/tenant/billing/purchase-requests",
      {
        method: "POST",
        body: JSON.stringify({ startOption, idempotencyKey, subscriptionPlanId }),
      },
    ),
  listAddOnProducts: () =>
    apiRequest<TenantAddOnProductDto[]>("/tenant/add-on-products"),
  listAddOnPurchases: () =>
    apiRequest<TenantAddOnPurchaseDto[]>("/tenant/add-on-purchases?activeOnly=true"),
  createAddOnPurchase: (productId: string, idempotencyKey: string) =>
    apiRequest<TenantAddOnPurchaseDto>("/tenant/add-on-purchases", {
      method: "POST",
      body: JSON.stringify({ productId, idempotencyKey }),
    }),
  listPlanChangeRequests: () =>
    apiRequest<TenantPlanChangeRequestDto[]>(
      "/tenant/billing/plan-change-requests",
    ),
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
};

export const tenantAuditLogsApi = {
  list: async (options: { search?: string; limit?: number } = {}) => {
    const params = new URLSearchParams({ limit: String(options.limit || 100) });
    if (options.search) params.set("search", options.search);
    const response = await apiRequest<PaginatedResponse<TenantAuditLogDto>>(
      `/tenant/audit-logs?${params}`,
    );
    return response.data;
  },
};

export type ValidateTelegramTokenResult = {
  ok: boolean;
  botId?: string;
  username?: string;
  firstName?: string;
  error?: string;
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
  validateTelegramToken: (botToken: string) =>
    apiRequest<ValidateTelegramTokenResult>(
      "/tenant/channels/validate-telegram-token",
      {
        method: "POST",
        body: JSON.stringify({ botToken }),
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

export const tenantTelegramManagedBotApi = {
  initiate: (data: InitiateTelegramManagedBotInput) =>
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
};

export const csrConversationsApi = {
  get: (id: string) =>
    apiRequest<CsrConversationDto>(`/csr/conversations/${id}`),
  list: async (options: string | CsrConversationListOptions = {}) => {
    const params = new URLSearchParams({ limit: "100" });
    const normalizedOptions =
      typeof options === "string" ? { search: options } : options;
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
    const response = await apiRequest<PaginatedResponse<CsrConversationDto>>(
      `/csr/conversations?${params}`,
    );
    return response.data;
  },
  messages: (conversationId: string) =>
    apiRequest<CsrMessageDto[]>(
      `/csr/conversations/${conversationId}/messages`,
    ),
  sendMessage: (data: SendCsrMessageInput) =>
    apiRequest<CsrMessageDto>("/csr/conversations/messages", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  assign: (conversationId: string, csrId: string) =>
    apiRequest<CsrConversationDto>(
      `/csr/conversations/${conversationId}/assign`,
      {
        method: "POST",
        body: JSON.stringify({ csrId }),
      },
    ),
  update: (conversationId: string, data: UpdateCsrConversationInput) =>
    apiRequest<CsrConversationDto>(`/csr/conversations/${conversationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  setReadState: (conversationId: string, unread: boolean) =>
    apiRequest<CsrConversationDto>(
      `/csr/conversations/${conversationId}/read-state`,
      {
        method: "PUT",
        body: JSON.stringify({ unread }),
      },
    ),
  search: (query: string) =>
    apiRequest<CsrConversationDto[]>(
      `/csr/search/conversations?q=${encodeURIComponent(query)}`,
    ),
};

export const csrDashboardApi = {
  stats: () => apiRequest<CommerceWorkspaceStatsDto>("/csr/dashboard/stats"),
};

export const csrNotificationsApi = {
  list: () => apiRequest<CsrNotificationDto[]>("/csr/notifications"),
  markRead: (id: string) =>
    apiRequest<CsrNotificationDto>(`/csr/notifications/${id}/read`, {
      method: "POST",
    }),
  markAllRead: () =>
    apiRequest<{ message: string }>("/csr/notifications/read-all", {
      method: "POST",
    }),
  delete: (id: string) =>
    apiRequest<{ message: string }>(`/csr/notifications/${id}`, {
      method: "DELETE",
    }),
};

export const csrMediaApi = {
  list: (
    options: { search?: string; contentType?: string; purpose?: string } = {},
  ) => {
    const params = new URLSearchParams({ limit: "100" });
    if (options.search) params.set("search", options.search);
    if (options.contentType) params.set("contentType", options.contentType);
    if (options.purpose) params.set("purpose", options.purpose);
    return apiRequest<PaginatedResponse<CsrMediaFileDto>>(`/media?${params}`);
  },
  createUpload: (file: File, purpose = "media-library") =>
    apiRequest<CsrMediaUploadDto>(
      purpose === "billing-payment-proof"
        ? "/media/uploads/billing-proof"
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
    const signed = await csrMediaApi.createUpload(file, purpose);
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
    return csrMediaApi.download(signed.file.id, purpose);
  },
  download: (id: string, purpose = "media-library") =>
    apiRequest<{
      file: CsrMediaFileDto;
      download: NonNullable<CsrMediaFileDto["download"]>;
    }>(
      purpose === "billing-payment-proof"
        ? `/media/billing-proof/${id}/download-url`
        : `/media/${id}/download-url`,
    ),
  archive: (id: string) =>
    apiRequest<CsrMediaFileDto>(`/media/${id}`, { method: "DELETE" }),
};

export const csrPerformanceApi = {
  get: (days: number) =>
    apiRequest<CsrPerformanceDto>(`/csr/performance?days=${days}`),
  team: (days: number) =>
    apiRequest<TeamPerformanceDto[]>(`/csr/performance/team?days=${days}`),
};

export const csrCannedResponsesApi = {
  list: async () => {
    const response = await apiRequest<PaginatedResponse<CsrCannedResponseDto>>(
      "/tenant/canned-responses?limit=100",
    );
    return response.data;
  },
  create: (data: CreateCsrCannedResponseInput) =>
    apiRequest<CsrCannedResponseDto>("/tenant/canned-responses", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateCsrCannedResponseInput) =>
    apiRequest<CsrCannedResponseDto>(`/tenant/canned-responses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<{ message: string }>(`/tenant/canned-responses/${id}`, {
      method: "DELETE",
    }),
};

export const csrProductsApi = {
  list: async () => {
    const response = await apiRequest<PaginatedResponse<CsrProductDto>>(
      "/tenant/products?limit=100",
    );
    return response.data;
  },
  categories: () =>
    apiRequest<CsrProductCategoryDto[]>("/tenant/products/categories"),
  create: (data: CreateCsrProductInput) =>
    apiRequest<CsrProductDto>("/tenant/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateCsrProductInput) =>
    apiRequest<CsrProductDto>(`/tenant/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  createCategory: (name: string, description?: string) =>
    apiRequest<CsrProductCategoryDto>("/tenant/products/categories", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
};

export const csrOrdersApi = {
  list: async (options: CsrOrderListOptions = {}) => {
    const params = new URLSearchParams({ limit: "100" });
    if (options.search) params.set("search", options.search);
    if (options.status && options.status !== "all")
      params.set("status", options.status);
    if (options.paymentStatus && options.paymentStatus !== "all")
      params.set("paymentStatus", options.paymentStatus);
    if (options.customerId) params.set("customerId", options.customerId);
    if (options.channelId) params.set("channelId", options.channelId);
    if (options.dateFrom) params.set("dateFrom", options.dateFrom);
    if (options.dateTo) params.set("dateTo", options.dateTo);
    const response = await apiRequest<PaginatedResponse<CsrOrderDto>>(
      `/orders?${params}`,
    );
    return response.data;
  },
  get: (id: string) => apiRequest<CsrOrderDto>(`/orders/${id}`),
  items: (id: string) => apiRequest<CsrOrderItemDto[]>(`/orders/${id}/items`),
  create: (data: CreateCsrOrderInput) =>
    apiRequest<CsrOrderDto>("/csr/orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateDetails: (id: string, data: UpdateCsrOrderDetailsInput) =>
    apiRequest<CsrOrderDto>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateLifecycle: (id: string, data: UpdateCsrOrderLifecycleInput) =>
    apiRequest<CsrOrderDto>(`/orders/${id}/lifecycle`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateStatus: (id: string, status: string, note?: string) =>
    apiRequest<CsrOrderDto>(`/orders/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, note }),
    }),
};

export const csrCustomersApi = {
  list: async (search?: string) => {
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);
    const response = await apiRequest<PaginatedResponse<CsrCustomerDto>>(
      `/csr/customers?${params}`,
    );
    return response.data;
  },
  create: (data: CreateCsrCustomerInput) =>
    apiRequest<CsrCustomerDto>("/csr/customers", {
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
  get: (id: string) => apiRequest<CsrCustomerDto>(`/csr/customers/${id}`),
  update: (id: string, data: UpdateCsrCustomerInput) =>
    apiRequest<CsrCustomerDto>(`/csr/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  timeline: (id: string) =>
    apiRequest<CsrTimelineEventDto[]>(
      `/domain-events/customers/${id}/timeline`,
    ),
};
