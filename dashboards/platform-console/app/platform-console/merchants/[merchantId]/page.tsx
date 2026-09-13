"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  PlayCircle,
  RefreshCw,
  Save,
} from "lucide-react";

import {
  BusinessBadge,
  FoundationNote,
} from "@/components/business-ops-foundation";
import {
  ConsoleHeader,
  ConsolePage,
  ConsoleSection,
  ConsoleStatCard,
} from "@/components/platform-console-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  getPlatformTenant,
  getPlatformOrders,
  getPlatformOrderPaymentSummary,
  getPlatformConversations,
  getPlatformDeliveries,
  getPlatformProducts,
  getPlatformTenantUsers,
  invitePlatformTenantUser,
  resendPlatformTenantUserInvite,
  getStoredSession,
  getSubscriptionPlans,
  getTenantChannels,
  getTenantBillingRecords,
  getTenantSupportNote,
  getTenantUsageSummary,
  getPlatformTenantSubscriptionPeriods,
  getPlatformAddOnPurchasesForTenant,
  PlatformApiError,
  changeTenantSubscriptionPlan,
  reactivatePlatformTenant,
  suspendPlatformTenant,
  approvePlatformTenant,
  updateTenantSupportNote,
  reviewPlatformPaymentProof,
  getPlatformPaymentProofDownloadUrl,
  adminActivatePeriod,
  getTenantUpgradeRevisions,
  approveUpgradeRevision,
  rejectUpgradeRevision,
  getPlatformPeriodEvents,
  type InviteTenantUserInput,
  type PlatformConversationDto,
  type PlatformDeliveryDto,
  type PlatformOrderDto,
  type PlatformOrderPaymentSummaryDto,
  type PlatformProductDto,
  type PlatformTenantDto,
  type SubscriptionPlanDto,
  type TenantChannelVisibilityDto,
  type TenantBillingRecordDto,
  type PlatformSubscriptionPeriodsResponseDto,
  type SubscriptionAddOnPurchaseDto,
  type TenantSupportNoteDto,
  type TenantUsageSummaryDto,
  type TenantUserDto,
  type ReviewPlatformPaymentProofInput,
  type PlatformPeriodEventDto,
  type PlatformUpgradeRevisionDto,
} from "@/lib/api";

const canManageMerchants = (role?: string) =>
  role === "super_admin" || role === "ops_admin";
const messageFor = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Yangon",
      })
    : "Not recorded";
const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Yangon",
      })
    : "Not recorded";
const daysUntil = (value?: string | null) => {
  if (!value) return null;
  const target = new Date(value).getTime();
  return Number.isNaN(target)
    ? null
    : Math.ceil((target - Date.now()) / 86_400_000);
};
const formatMoney = (value: number | string, currency = "MMK") =>
  `${currency} ${Number(value || 0).toLocaleString()}`;
const yangonMonthInput = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
};
const nextMonthDate = (monthInput: string) => {
  const [year, month] = monthInput.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return "";
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

export default function MerchantDetailPage() {
  const merchantId = useParams<{ merchantId: string }>().merchantId;
  const [merchant, setMerchant] = useState<PlatformTenantDto | null>(null);
  const [usage, setUsage] = useState<TenantUsageSummaryDto | null>(null);
  const [billing, setBilling] = useState<TenantBillingRecordDto[]>([]);
  const [periodData, setPeriodData] =
    useState<PlatformSubscriptionPeriodsResponseDto | null>(null);
  const [addOnPurchases, setAddOnPurchases] = useState<
    SubscriptionAddOnPurchaseDto[]
  >([]);
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([]);
  const [orders, setOrders] = useState<PlatformOrderDto[]>([]);
  const [channels, setChannels] = useState<TenantChannelVisibilityDto[]>([]);
  const [conversations, setConversations] = useState<PlatformConversationDto[]>(
    [],
  );
  const [deliveries, setDeliveries] = useState<PlatformDeliveryDto[]>([]);
  const [products, setProducts] = useState<PlatformProductDto[]>([]);
  const [paymentSummary, setPaymentSummary] =
    useState<PlatformOrderPaymentSummaryDto | null>(null);
  const [supportNote, setSupportNote] = useState<TenantSupportNoteDto>({
    note: "",
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [billingError, setBillingError] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [channelsError, setChannelsError] = useState("");
  const [conversationsError, setConversationsError] = useState("");
  const [deliveriesError, setDeliveriesError] = useState("");
  const [productsError, setProductsError] = useState("");
  const [supportNoteError, setSupportNoteError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [users, setUsers] = useState<TenantUserDto[]>([]);
  const [usersError, setUsersError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteTenantUserInput>({
    fullName: "",
    email: "",
    role: "csr",
  });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [statusError, setStatusError] = useState("");
  const [planError, setPlanError] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingSupportNote, setSavingSupportNote] = useState(false);
  const [role, setRole] = useState<string>();
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planMonth, setPlanMonth] = useState(yangonMonthInput());
  const [planNote, setPlanNote] = useState("");
  const [activating, setActivating] = useState(false);
  const [proofReviewOpen, setProofReviewOpen] = useState(false);
  const [reviewRecord, setReviewRecord] = useState<TenantBillingRecordDto | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewAmount, setReviewAmount] = useState("");
  const [activatingPeriodId, setActivatingPeriodId] = useState<string | null>(
    null,
  );
  const [periodActionError, setPeriodActionError] = useState("");
  const [periodEvents, setPeriodEvents] = useState<Record<
    string,
    PlatformPeriodEventDto[]
  >>({});
  const [eventsError, setEventsError] = useState("");
  const [upgradeRevisions, setUpgradeRevisions] = useState<
    PlatformUpgradeRevisionDto[]
  >([]);
  const [upgradeRevisionsError, setUpgradeRevisionsError] = useState("");
  const [approvingRevisionId, setApprovingRevisionId] = useState<string | null>(
    null,
  );
  const [upgradeActionError, setUpgradeActionError] = useState("");
  const [rejectRevision, setRejectRevision] =
    useState<PlatformUpgradeRevisionDto | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const canManage = canManageMerchants(role);
  // Admin approval/activation shares the same platform finance boundary as
  // payment proof review (super_admin, ops_admin, finance_viewer).
  const canActivatePeriod =
    role === "super_admin" || role === "ops_admin" || role === "finance_viewer";

  const loadPeriodEvents = useCallback(async (periodId: string) => {
    if (!merchantId) return;
    setEventsError("");
    try {
      const result = await getPlatformPeriodEvents(merchantId, periodId);
      setPeriodEvents((prev) => ({ ...prev, [periodId]: result.events }));
    } catch (requestError) {
      setEventsError(messageFor(requestError));
    }
  }, [merchantId]);

  const load = useCallback(async () => {
    if (!merchantId) return;
    setLoading(true);
    setError("");
    setUsageError("");
    setBillingError("");
    setPeriodError("");
    setOrdersError("");
    setChannelsError("");
    setConversationsError("");
    setDeliveriesError("");
    setProductsError("");
    setSupportNoteError("");
    setPermissionDenied(false);
    try {
      const tenant = await getPlatformTenant(merchantId);
      setMerchant(tenant);
      const [
        usageResult,
        billingResult,
        periodResult,
        addOnResult,
        ordersResult,
        paymentSummaryResult,
        channelsResult,
        conversationsResult,
        deliveriesResult,
        productsResult,
        supportNoteResult,
        plansResult,
        usersResult,
        upgradeRevisionsResult,
      ] = await Promise.allSettled([
        getTenantUsageSummary(merchantId),
        getTenantBillingRecords(merchantId),
        getPlatformTenantSubscriptionPeriods(merchantId),
        getPlatformAddOnPurchasesForTenant(merchantId),
        getPlatformOrders({ tenantId: merchantId, limit: 20 }),
        getPlatformOrderPaymentSummary(merchantId),
        getTenantChannels(merchantId),
        getPlatformConversations({ tenantId: merchantId, limit: 20 }),
        getPlatformDeliveries({ tenantId: merchantId, limit: 20 }),
        getPlatformProducts({ tenantId: merchantId, limit: 20 }),
        getTenantSupportNote(merchantId),
        getSubscriptionPlans(),
        getPlatformTenantUsers(merchantId),
        getTenantUpgradeRevisions(merchantId),
      ]);
      if (usageResult.status === "fulfilled") setUsage(usageResult.value);
      else {
        setUsage(null);
        setUsageError(messageFor(usageResult.reason));
      }
      if (billingResult.status === "fulfilled") setBilling(billingResult.value);
      else {
        setBilling([]);
        setBillingError(messageFor(billingResult.reason));
      }
      if (periodResult.status === "fulfilled") {
        setPeriodData(periodResult.value);
        for (const period of periodResult.value.periods) {
          void loadPeriodEvents(period.id);
        }
      } else {
        setPeriodData(null);
        setPeriodError(messageFor(periodResult.reason));
      }
      if (addOnResult.status === "fulfilled")
        setAddOnPurchases(addOnResult.value);
      else setAddOnPurchases([]);
      if (ordersResult.status === "fulfilled")
        setOrders(ordersResult.value.data);
      else {
        setOrders([]);
        setOrdersError(messageFor(ordersResult.reason));
      }
      if (paymentSummaryResult.status === "fulfilled")
        setPaymentSummary(paymentSummaryResult.value);
      else setPaymentSummary(null);
      if (channelsResult.status === "fulfilled")
        setChannels(channelsResult.value);
      else {
        setChannels([]);
        setChannelsError(messageFor(channelsResult.reason));
      }
      if (conversationsResult.status === "fulfilled")
        setConversations(conversationsResult.value.data);
      else {
        setConversations([]);
        setConversationsError(messageFor(conversationsResult.reason));
      }
      if (deliveriesResult.status === "fulfilled")
        setDeliveries(deliveriesResult.value.data);
      else {
        setDeliveries([]);
        setDeliveriesError(messageFor(deliveriesResult.reason));
      }
      if (productsResult.status === "fulfilled")
        setProducts(productsResult.value.data);
      else {
        setProducts([]);
        setProductsError(messageFor(productsResult.reason));
      }
      if (supportNoteResult.status === "fulfilled")
        setSupportNote(supportNoteResult.value);
      else {
        setSupportNote({ note: "", updatedAt: null });
        setSupportNoteError(messageFor(supportNoteResult.reason));
      }
      if (plansResult.status === "fulfilled") setPlans(plansResult.value);
      else setPlans([]);
      if (usersResult.status === "fulfilled") setUsers(usersResult.value);
      else {
        setUsers([]);
        setUsersError(messageFor(usersResult.reason));
      }
      if (upgradeRevisionsResult.status === "fulfilled")
        setUpgradeRevisions(upgradeRevisionsResult.value);
      else {
        setUpgradeRevisions([]);
        setUpgradeRevisionsError(messageFor(upgradeRevisionsResult.reason));
      }
    } catch (requestError) {
      if (
        requestError instanceof PlatformApiError &&
        requestError.status === 403
      )
        setPermissionDenied(true);
      setError(messageFor(requestError));
      setMerchant(null);
    } finally {
      setLoading(false);
    }
  }, [merchantId, loadPeriodEvents]);

  useEffect(() => {
    setRole(getStoredSession()?.user.role);
    void load();
  }, [load]);

  const changeStatus = async () => {
    if (!merchant || reason.trim().length < 3) {
      setStatusError("Enter a reason of at least 3 characters.");
      return;
    }
    setSavingStatus(true);
    setStatusError("");
    try {
      const updated =
        merchant.status === "suspended"
          ? await reactivatePlatformTenant(merchant.id, reason.trim())
          : await suspendPlatformTenant(merchant.id, reason.trim());
      setMerchant(updated);
      setReason("");
      setStatusOpen(false);
    } catch (requestError) {
      setStatusError(messageFor(requestError));
    } finally {
      setSavingStatus(false);
    }
  };

  const handleActivate = async () => {
    if (!merchant) return;
    setActivating(true);
    try {
      const updated = await approvePlatformTenant(merchant.id, {
        action: "approved",
      });
      setMerchant(updated);
    } catch {
      // Silently fail — available status details handle error display
    } finally {
      setActivating(false);
    }
  };

  const handleResendInvite = async (userId: string) => {
    if (!merchant) return;
    try {
      await resendPlatformTenantUserInvite(merchant.id, userId);
    } catch {
      // Silently fail — user can retry from the UI
    }
  };

  const handleInviteUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!merchant) return;
    setInviting(true);
    setInviteResult("");
    try {
      await invitePlatformTenantUser(merchant.id, inviteForm);
      setUsers((prev) => [
        ...prev,
        {
          id: "",
          tenantId: merchant.id,
          fullName: inviteForm.fullName,
          email: inviteForm.email,
          role: inviteForm.role || "csr",
          status: "inactive",
          isOnline: false,
          lastSeenAt: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setInviteOpen(false);
      setInviteForm({ fullName: "", email: "", role: "csr" });
    } catch (err) {
      setInviteResult(messageFor(err));
    } finally {
      setInviting(false);
    }
  };

  const saveSupportNote = async () => {
    if (!merchant || !canManage) return;
    setSavingSupportNote(true);
    setSupportNoteError("");
    try {
      const updated = await updateTenantSupportNote(
        merchant.id,
        supportNote.note.trim(),
      );
      setSupportNote(updated);
    } catch (requestError) {
      setSupportNoteError(messageFor(requestError));
    } finally {
      setSavingSupportNote(false);
    }
  };

  const submitPlanChange = async () => {
    if (!merchant || !selectedPlanId) {
      setPlanError("Select a target subscription plan.");
      return;
    }
    setSavingPlan(true);
    setPlanError("");
    try {
      const monthStartDate = `${planMonth}-01`;
      const monthEndDate = nextMonthDate(planMonth);
      const result = await changeTenantSubscriptionPlan(merchant.id, {
        subscriptionPlanId: selectedPlanId,
        subscriptionStartDate: `${monthStartDate}T00:00:00.000Z`,
        subscriptionEndDate: `${monthEndDate}T00:00:00.000Z`,
        notes: planNote.trim() || undefined,
      });
      setMerchant(result.tenant);
      setBilling((current) =>
        result.billingRecord ? [result.billingRecord, ...current] : current,
      );
      setSelectedPlanId(result.subscriptionPlan.id);
      setPlanOpen(false);
      setPlanNote("");
      await load();
    } catch (requestError) {
      setPlanError(messageFor(requestError));
    } finally {
      setSavingPlan(false);
    }
  };

  const openProofReview = (record: TenantBillingRecordDto) => {
    setReviewRecord(record);
    const proof = record.metadata?.paymentProof;
    setReviewAmount(
      String(proof?.paidAmount ?? record.amountDue ?? ""),
    );
    setReviewError("");
    setProofReviewOpen(true);
  };

  const submitProofReview = async (
    outcome: ReviewPlatformPaymentProofInput["outcome"],
  ) => {
    if (!reviewRecord) return;
    setReviewing(true);
    setReviewError("");
    try {
      const input: ReviewPlatformPaymentProofInput = { outcome };
      if (outcome === "approved") {
        // Send an explicit 0 for zero-amount invoices; empty stays undefined so
        // the backend falls back to the recorded amount due.
        const parsedAmount = Number(reviewAmount);
        input.amountPaid =
          reviewAmount.trim() !== "" && Number.isFinite(parsedAmount)
            ? parsedAmount
            : undefined;
      }
      await reviewPlatformPaymentProof(reviewRecord, input);
      setProofReviewOpen(false);
      setReviewRecord(null);
      await load();
    } catch (requestError) {
      setReviewError(messageFor(requestError));
    } finally {
      setReviewing(false);
    }
  };

  const handlePeriodActivate = async (periodId: string) => {
    if (!merchant) return;
    setActivatingPeriodId(periodId);
    setPeriodActionError("");
    try {
      await adminActivatePeriod(merchant.id, periodId, {});
      await load();
    } catch (requestError) {
      setPeriodActionError(messageFor(requestError));
    } finally {
      setActivatingPeriodId(null);
    }
  };

  const handleApproveRevision = async (revision: PlatformUpgradeRevisionDto) => {
    if (!merchant) return;
    setApprovingRevisionId(revision.id);
    setUpgradeActionError("");
    try {
      await approveUpgradeRevision(
        merchant.id,
        revision.subscriptionPeriodId,
        revision.id,
        {},
      );
      await load();
    } catch (requestError) {
      setUpgradeActionError(messageFor(requestError));
    } finally {
      setApprovingRevisionId(null);
    }
  };

  const handleRejectRevision = async (
    revision: PlatformUpgradeRevisionDto,
    reasonText: string,
  ) => {
    if (!merchant) return;
    const safeReason = reasonText.trim();
    if (!safeReason) {
      setUpgradeActionError("A reason is required to reject an upgrade.");
      return;
    }
    setApprovingRevisionId(revision.id);
    setUpgradeActionError("");
    try {
      await rejectUpgradeRevision(
        merchant.id,
        revision.subscriptionPeriodId,
        revision.id,
        { reason: safeReason },
      );
      setRejectRevision(null);
      setRejectReason("");
      await load();
    } catch (requestError) {
      setUpgradeActionError(messageFor(requestError));
    } finally {
      setApprovingRevisionId(null);
    }
  };

  const openRejectRevision = (revision: PlatformUpgradeRevisionDto) => {
    setRejectRevision(revision);
    setRejectReason("");
    setUpgradeActionError("");
  };

  const viewReceipt = async (record: TenantBillingRecordDto) => {
    try {
      const result = await getPlatformPaymentProofDownloadUrl(record);
      window.open(result.download.url, "_blank", "noopener,noreferrer");
    } catch {
      // Fail silently — the receipt view button is best-effort
    }
  };

  if (loading)
    return (
      <>
        <ConsoleHeader
          eyebrow="Merchant Detail"
          title="Loading merchant..."
          description="Retrieving live profile, usage, limits, and billing data."
        />
        <ConsolePage>
          <StateMessage
            title="Loading live merchant data"
            message="This page does not substitute seed records while the API responds."
          />
        </ConsolePage>
      </>
    );
  if (!merchant)
    return (
      <>
        <ConsoleHeader
          eyebrow="Merchant Detail"
          title={
            permissionDenied ? "Permission required" : "Merchant unavailable"
          }
          description={error || "The merchant could not be found."}
          actions={
            <Button
              asChild
              variant="outline"
              className="border-white/10 bg-white/5 text-white"
            >
              <Link href="/platform-console/merchants">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Merchant list
              </Link>
            </Button>
          }
        />
        <ConsolePage>
          <StateMessage
            title={
              permissionDenied
                ? "You cannot view this merchant"
                : "Unable to load merchant"
            }
            message={error || "Refresh the list and try again."}
            destructive
          />
        </ConsolePage>
      </>
    );

  const changingToActive = merchant.status === "suspended";
  const statusLabel = changingToActive ? "Reactivate" : "Suspend";

  return (
    <>
      <ConsoleHeader
        eyebrow="Merchant Detail"
        title={merchant.companyName}
        description={`${merchant.tenantCode} · ${merchant.contactEmail}`}
        actions={
          <>
            <BusinessBadge value={merchant.status} />
            <Button
              variant="outline"
              onClick={() => void load()}
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPlanId(usage?.subscriptionPlan?.id || "");
                setPlanOpen(true);
              }}
              disabled={!canManage}
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              Change plan
            </Button>
            {merchant.status === "pending" && canManage ? (
              <Button
                onClick={() => void handleActivate()}
                disabled={activating}
                className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              >
                {activating ? "Activating..." : "Activate"}
              </Button>
            ) : null}
            <Button
              onClick={() => setStatusOpen(true)}
              disabled={
                !canManage || !["active", "suspended"].includes(merchant.status)
              }
              className={
                changingToActive
                  ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  : "bg-rose-500 text-white hover:bg-rose-400"
              }
            >
              {changingToActive ? (
                <PlayCircle className="mr-2 h-4 w-4" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              {statusLabel}
            </Button>
          </>
        }
      />
      <ConsolePage>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-sky-200 hover:bg-white/10 hover:text-white"
        >
          <Link href="/platform-console/merchants">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to merchants
          </Link>
        </Button>
        {!canManage ? (
          <StateMessage
            title="Read-only access"
            message="Your platform role can inspect this merchant but cannot suspend or reactivate it."
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard
            label="Plan"
            value={usage?.subscriptionPlan?.name || "No plan"}
            note={
              usage?.subscriptionPlan
                ? formatMoney(usage.subscriptionPlan.monthlyPrice)
                : "No subscription assigned"
            }
            tone="emerald"
          />
          <ConsoleStatCard
            label="Team members"
            value={usage ? usage.usage.csrs : "Unavailable"}
            note={limitNote(usage?.usage.csrs, usage?.limits.csrs)}
            tone="blue"
          />
          <ConsoleStatCard
            label="Channels"
            value={usage ? usage.usage.channels : "Unavailable"}
            note={limitNote(usage?.usage.channels, usage?.limits.channels)}
            tone="cyan"
          />
          <ConsoleStatCard
            label="Billing records"
            value={billingError ? "Unavailable" : billing.length}
            note="Real invoice records"
            tone="slate"
          />
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="h-auto flex-wrap gap-2 border border-white/10 bg-white/5 p-2 text-slate-300">
            <TabsTrigger value="profile">Business profile</TabsTrigger>
            <TabsTrigger value="usage">Usage & limits</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="support">Support notes</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ConsoleSection
              title="Business profile"
              description="Live tenant identity and subscription dates from the platform-admin API."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Contact person", merchant.contactPerson || "Not recorded"],
                  ["Contact phone", merchant.contactPhone || "Not recorded"],
                  ["Industry", merchant.industry || "Not recorded"],
                  ["Business type", merchant.businessType || "Not recorded"],
                  ["Address", merchant.address || "Not recorded"],
                  ["Created", formatDate(merchant.createdAt)],
                  [
                    "Subscription starts",
                    formatDate(merchant.subscriptionStartDate),
                  ],
                  [
                    "Subscription ends",
                    formatDate(merchant.subscriptionEndDate),
                  ],
                ].map(([label, value]) => (
                  <Detail key={label} label={label} value={value} />
                ))}
              </div>
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="usage">
            <ConsoleSection
              title="Usage and plan limits"
              description="Current monthly usage and effective tenant or plan limits."
            >
              {usageError ? (
                <StateMessage
                  title="Usage unavailable"
                  message={usageError}
                  destructive
                />
              ) : usage ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
                    <p>
                      Usage period:{" "}
                      <strong className="text-white">
                        {formatDate(usage.period.start)}
                      </strong>{" "}
                      -{" "}
                      <strong className="text-white">
                        {formatDate(usage.period.end)}
                      </strong>
                    </p>
                    <p className="mt-2">
                      Refreshed:{" "}
                      <strong className="text-white">
                        {formatDateTime(usage.refreshedAt)}
                      </strong>{" "}
                      · Latest recorded usage:{" "}
                      <strong className="text-white">
                        {formatDateTime(usage.latestUsageEventAt)}
                      </strong>
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {(
                      [
                        "csrs",
                        "channels",
                        "apiRequests",
                        "providerMessages",
                      ] as const
                    ).map((metric) => (
                      <UsageMeter
                        key={metric}
                        label={metricLabel(metric)}
                        metric={usage.metrics[metric]}
                      />
                    ))}
                  </div>
                  {usage.warnings.length ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-white">
                        Limit warnings
                      </p>
                      {usage.warnings.map((warning) => (
                        <div
                          key={warning.metric}
                          className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                        >
                          <span>{metricLabel(warning.metric)}</span>
                          <span>
                            {warning.percentUsed}% used ·{" "}
                            {warning.severity.replaceAll("_", " ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-emerald-200">
                      <CheckCircle2 className="h-4 w-4" />
                      No usage warnings for the current period.
                    </div>
                  )}
                </div>
              ) : (
                <StateMessage
                  title="No usage summary"
                  message="The API returned no usage summary for this merchant."
                />
              )}
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="channels">
            <ConsoleSection
              title="Connected channels"
              description="Live merchant channels visible to platform operators for support and setup context."
            >
              {channelsError ? (
                <StateMessage
                  title="Channels unavailable"
                  message={channelsError}
                  destructive
                />
              ) : (
                <div className="space-y-4">
                  {periodData?.entitlement ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <p className="font-medium">Channel expiry preview</p>
                      <p className="mt-1 text-amber-100/80">
                        Base capacity retains selected/base-plan channels first.
                        Excess top-up channels are disabled at the Yangon month
                        boundary without deletion.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Detail
                          label="Base channel capacity"
                          value={
                            periodData.entitlement.baseLimits.channel_slots ===
                            null
                              ? "Unlimited"
                              : String(
                                  periodData.entitlement.baseLimits
                                    .channel_slots ?? 0,
                                )
                          }
                        />
                        <Detail
                          label="Active channels"
                          value={String(
                            channels.filter(
                              (channel) => channel.status === "active",
                            ).length,
                          )}
                        />
                        <Detail
                          label="Month boundary"
                          value={formatDate(periodData.entitlement.periodEndAt)}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <Table>
                      <TableHeader className="bg-slate-950/70">
                        <TableRow className="border-white/10">
                          <TableHead className="text-slate-300">
                            Channel
                          </TableHead>
                          <TableHead className="text-slate-300">Type</TableHead>
                          <TableHead className="text-slate-300">
                            Status
                          </TableHead>
                          <TableHead className="text-slate-300">
                            Connection
                          </TableHead>
                          <TableHead className="text-slate-300">
                            Updated
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white/[0.03]">
                        {channels.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="py-12 text-center text-slate-400"
                            >
                              No channels exist for this merchant.
                            </TableCell>
                          </TableRow>
                        ) : (
                          channels.map((channel) => (
                            <TableRow
                              key={channel.id}
                              className="border-white/10"
                            >
                              <TableCell className="font-medium text-white">
                                {channel.displayName || channel.channelName}
                              </TableCell>
                              <TableCell className="text-slate-300">
                                <div>
                                  <p>{channel.channelType}</p>
                                  <p className="text-xs text-slate-500">
                                    {channel.entitlementOrigin === "top_up"
                                      ? "Top-up capacity"
                                      : "Base plan capacity"}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <BusinessBadge value={channel.status} />
                                  {channel.status === "active" &&
                                  periodData?.entitlement?.baseLimits
                                    .channel_slots !== null &&
                                  channels.filter(
                                    (item) => item.status === "active",
                                  ).length >
                                    Number(
                                      periodData?.entitlement?.baseLimits
                                        .channel_slots || 0,
                                    ) &&
                                  channel.entitlementOrigin === "top_up" ? (
                                    <p className="text-xs text-amber-200">
                                      Candidate for expiry disablement
                                    </p>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <BusinessBadge
                                    value={channel.connectionStatus}
                                  />
                                  <p className="text-xs text-slate-400">
                                    {channel.credentialStatus}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {formatDate(channel.updatedAt)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="billing">
            <ConsoleSection
              title="Subscription and billing"
              description="Current Yangon period, queued prepaid months, active top-ups, and invoice records for this merchant."
            >
              {periodError ? (
                <StateMessage
                  title="Subscription period data unavailable"
                  message={periodError}
                  destructive
                />
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <Detail
                  label="Active month"
                  value={
                    periodData?.entitlement?.periodStartAt
                      ? `${formatDate(periodData.entitlement.periodStartAt)} – ${formatDate(periodData.entitlement.periodEndAt)}`
                      : "No active paid period"
                  }
                />
                <Detail
                  label="Activation"
                  value={formatDateTime(periodData?.entitlement?.activatedAt)}
                />
                <Detail
                  label="Payment state"
                  value={
                    periodData?.entitlement
                      ? `${periodData.entitlement.paymentState} · ${periodData.entitlement.periodStatus}`
                      : "Unavailable"
                  }
                />
                <Detail
                  label="Admin approval"
                  value={
                    (() => {
                      const active = periodData?.periods.find(
                        (period) => period.periodStatus === "active",
                      );
                      if (!active) return "—";
                      const status = active.adminActivationStatus ?? "approved";
                      return status === "approved"
                        ? "Approved"
                        : status === "pending"
                          ? "Awaiting activation"
                          : status;
                    })()
                  }
                />
                <Detail
                  label="Upcoming months"
                  value={String(
                    periodData?.periods.filter(
                      (period) => period.periodStatus === "upcoming",
                    ).length || 0,
                  )}
                />
              </div>
              {periodActionError ? (
                <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">
                  {periodActionError}
                </div>
              ) : null}
              {periodData?.entitlement ? (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
                  <p className="font-medium">Effective limits</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {Object.entries(periodData.entitlement.effectiveLimits).map(
                      ([dimension, value]) => (
                        <div key={dimension}>
                          <p className="text-xs text-sky-200/70">
                            {dimension.replaceAll("_", " ")}
                          </p>
                          <p className="font-semibold">
                            {value === null
                              ? "Unlimited"
                              : value.toLocaleString()}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="font-medium text-white">
                  Trial & upgrade review
                </p>
                {upgradeRevisionsError ? (
                  <p className="mt-2 text-sm text-rose-200">
                    {upgradeRevisionsError}
                  </p>
                ) : null}
                {upgradeActionError ? (
                  <p className="mt-2 text-sm text-rose-200">
                    {upgradeActionError}
                  </p>
                ) : null}
                {(() => {
                  const trialPeriod = (periodData?.periods || []).find(
                    (period) => period.periodType === "trial",
                  );
                  return trialPeriod ? (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Trial{" "}
                      <BusinessBadge value={trialPeriod.periodStatus} />
                      {trialPeriod.periodStatus === "active"
                        ? ` — ends ${formatDateTime(trialPeriod.periodEndAt)}`
                        : ` — ended ${formatDateTime(trialPeriod.periodEndAt)}`}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">
                      No trial period recorded.
                    </p>
                  );
                })()}
                {upgradeRevisions.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">
                    No upgrade requests recorded.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {upgradeRevisions.map((revision) => (
                      <div
                        key={revision.id}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-white">
                              {revision.kind === "trial_conversion"
                                ? "Trial upgrade"
                                : "Upgrade"}
                              :{" "}
                              {revision.previousPlanName ||
                                revision.previousPlanId}{" "}
                              →{" "}
                              {revision.upgradedPlanName ||
                                revision.upgradedPlanId}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Requested {formatDateTime(revision.upgradeRequestedAt)}
                              {revision.upgradeEffectiveAt
                                ? ` · effective ${formatDateTime(revision.upgradeEffectiveAt)}`
                                : ""}
                            </p>
                            {revision.rejectionReason ? (
                              <p className="mt-1 text-xs text-rose-200">
                                Reason: {revision.rejectionReason}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-slate-400">
                              Carryover — inbound{" "}
                              {revision.carryover.inboundMessages ?? "—"} ·
                              outbound {revision.carryover.outboundMessages ?? "—"}{" "}
                              · API {revision.carryover.apiRequests ?? "—"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <BusinessBadge value={revision.upgradeStatus} />
                            {revision.upgradeStatus === "pending_approval" &&
                            canActivatePeriod ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-emerald-200 hover:bg-white/10 hover:text-white"
                                  disabled={approvingRevisionId !== null}
                                  onClick={() =>
                                    void handleApproveRevision(revision)
                                  }
                                >
                                  {approvingRevisionId === revision.id
                                    ? "Approving..."
                                    : "Approve"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-rose-200 hover:bg-white/10 hover:text-white"
                                  disabled={approvingRevisionId !== null}
                                  onClick={() =>
                                    openRejectRevision(revision)
                                  }
                                >
                                  Reject
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="font-medium text-white">
                  Upcoming prepaid months
                </p>
                {(periodData?.periods || []).filter(
                  (period) => period.periodStatus === "upcoming",
                ).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">
                    No prepaid month is queued.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {(periodData?.periods || [])
                      .filter((period) => period.periodStatus === "upcoming")
                      .map((period) => {
                        const adminStatus =
                          period.adminActivationStatus ?? "approved";
                        return (
                          <div
                            key={period.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-200">
                                {formatDate(period.monthStartAt)} –{" "}
                                {formatDate(period.monthEndAt)}
                              </span>
                              <BusinessBadge
                                value={
                                  adminStatus === "pending"
                                    ? `${period.paymentStatus} · awaiting approval`
                                    : `${period.paymentStatus} · approved · scheduled`
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-white">
                    Top-up purchase history
                  </p>
                  <span className="text-xs text-slate-400">
                    {addOnPurchases.length} purchases
                  </span>
                </div>
                {addOnPurchases.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">
                    No top-up purchases recorded.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {addOnPurchases.map((purchase) => (
                      <div
                        key={purchase.id}
                        className="flex flex-col gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-slate-200">
                            {purchase.productName ||
                              purchase.productCode ||
                              "Top-up"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {purchase.components
                              .map(
                                (component) =>
                                  `${component.quantity.toLocaleString()} ${component.unit}`,
                              )
                              .join(" · ")}{" "}
                            · expires {formatDate(purchase.expiresAt)}
                          </p>
                          {(() => {
                            const remainingDays = daysUntil(purchase.expiresAt);
                            if (remainingDays === null || remainingDays > 3)
                              return null;
                            return (
                              <p
                                className={`mt-1 text-xs font-medium ${remainingDays <= 0 ? "text-rose-200" : "text-amber-200"}`}
                              >
                                {remainingDays < 0
                                  ? "Expired; excluded from effective limits."
                                  : remainingDays === 0
                                    ? "Expires at the Yangon month boundary today."
                                    : `Expires in ${remainingDays} day${remainingDays === 1 ? "" : "s"} in Yangon.`}
                              </p>
                            );
                          })()}
                        </div>
                        <BusinessBadge
                          value={`${purchase.paymentStatus} · ${purchase.purchaseStatus}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="font-medium text-white">
                  Period audit history
                </p>
                {eventsError ? (
                  <p className="mt-2 text-sm text-rose-200">{eventsError}</p>
                ) : null}
                {(periodData?.periods || []).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">
                    No subscription periods recorded.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {(periodData?.periods || []).map((period) => {
                      const events = periodEvents[period.id] || [];
                      return (
                        <details
                          key={period.id}
                          className="rounded-xl border border-white/10 px-3 py-2 text-sm"
                        >
                          <summary className="flex cursor-pointer items-center justify-between text-slate-200">
                            <span>
                              {formatDate(period.monthStartAt)} –{" "}
                              {formatDate(period.monthEndAt)}
                            </span>
                            <span className="text-xs text-slate-400">
                              {events.length} events
                            </span>
                          </summary>
                          {events.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-400">
                              No audit events recorded for this period.
                            </p>
                          ) : (
                            <ul className="mt-2 space-y-1.5">
                              {events.map((event) => (
                                <li
                                  key={event.id}
                                  className="flex items-start justify-between gap-2 text-xs"
                                >
                                  <div>
                                    <p className="font-medium text-slate-200">
                                      {event.eventType.replaceAll("_", " ")}
                                    </p>
                                    <p className="text-slate-400">
                                      {event.reason || "—"}
                                      {event.actorType
                                        ? ` · by ${event.actorType}${event.actorId ? ` (${event.actorId})` : ""}`
                                        : ""}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-slate-400">
                                    {formatDateTime(event.createdAt)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
              {billingError ? (
                <StateMessage
                  title="Billing unavailable"
                  message={billingError}
                  destructive
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <Table>
                    <TableHeader className="bg-slate-950/70">
                      <TableRow className="border-white/10">
                        <TableHead className="text-slate-300">Invoice</TableHead>
                        <TableHead className="text-slate-300">Plan / Item</TableHead>
                        <TableHead className="text-slate-300">Period</TableHead>
                        <TableHead className="text-slate-300">Due</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="text-slate-300">Due date</TableHead>
                        <TableHead className="text-right text-slate-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-white/[0.03]">
                      {billing.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="py-12 text-center text-slate-400"
                          >
                            No billing records exist for this merchant.
                          </TableCell>
                        </TableRow>
                      ) : (
                        billing.map((record) => {
                          const proof = record.metadata?.paymentProof;
                          const proofPending =
                            proof?.status === "pending_review";
                          const proofApproved = proof?.status === "approved";
                          const proofRejected = proof?.status === "rejected";
                          const isUnpaid = ![
                            "paid",
                            "waived",
                          ].includes(record.paymentStatus);
                          const combinedStatus = proofApproved
                            ? "paid · proof approved"
                            : proofRejected
                              ? `${record.paymentStatus} · proof rejected`
                              : proofPending
                                ? `${record.paymentStatus} · proof pending`
                                : record.paymentStatus;
                          // Plan 13 Phase 4: the activation/approval action
                          // lives on the invoice row whose period is awaiting
                          // Platform Admin action, so operators act on the
                          // exact invoice instead of a separate card.
                          const recordPeriod = periodData?.periods.find(
                            (period) =>
                              period.billingRecordId === record.id,
                          );
                          const periodAwaitingActivation = Boolean(
                            recordPeriod &&
                              recordPeriod.periodStatus === "active" &&
                              recordPeriod.paymentStatus === "paid" &&
                              (recordPeriod.adminActivationStatus ?? "approved") ===
                                "pending",
                          );
                          const periodAwaitingApproval = Boolean(
                            recordPeriod &&
                              recordPeriod.periodStatus === "upcoming" &&
                              recordPeriod.paymentStatus === "paid" &&
                              (recordPeriod.adminActivationStatus ?? "approved") ===
                                "pending",
                          );
                          // A business→business upgrade never creates a
                          // period, so its approval action is surfaced inline
                          // on the invoice row; the revision is the authority.
                          const recordUpgradeRevision = upgradeRevisions.find(
                            (revision) =>
                              revision.billingRecordId === record.id,
                          );
                          const upgradeAwaitingApproval = Boolean(
                            recordUpgradeRevision &&
                              recordUpgradeRevision.upgradeStatus ===
                                "pending_approval" &&
                              record.metadata?.purchaseRequestType ===
                                "upgrade",
                          );
                          return (
                            <TableRow key={record.id} className="border-white/10">
                              <TableCell className="font-medium text-white">
                                {record.invoiceNumber ||
                                  (record.invoiceStatus === "draft"
                                    ? "Draft invoice"
                                    : "Invoice pending")}
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {record.subscriptionPlan?.name ||
                                  (typeof record.metadata?.selectedPlanName ===
                                  "string"
                                    ? record.metadata.selectedPlanName
                                    : typeof record.metadata?.productName ===
                                        "string"
                                      ? record.metadata.productName
                                      : "—")}
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {formatDate(record.billingPeriodStart)} –{" "}
                                {formatDate(record.billingPeriodEnd)}
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {formatMoney(record.amountDue, record.currency)}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <BusinessBadge value={combinedStatus} />
                                  {proofPending ? (
                                    <p className="text-xs text-amber-200">
                                      Awaiting review
                                    </p>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {formatDate(record.dueDate)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {proofPending && canManage ? (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-emerald-200 hover:bg-white/10 hover:text-white"
                                        onClick={() => openProofReview(record)}
                                      >
                                        Review proof
                                      </Button>
                                    </>
                                  ) : null}
                                  {proof?.mediaFileId ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-sky-200 hover:bg-white/10 hover:text-white"
                                      onClick={() => void viewReceipt(record)}
                                    >
                                      View receipt
                                    </Button>
                                  ) : null}
                                  {isUnpaid &&
                                  !proofPending &&
                                  canManage ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-sky-200 hover:bg-white/10 hover:text-white"
                                      onClick={() => openProofReview(record)}
                                    >
                                      Record payment
                                    </Button>
                                  ) : null}
                                  {(periodAwaitingActivation ||
                                    periodAwaitingApproval) &&
                                  canActivatePeriod ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-amber-200 hover:bg-white/10 hover:text-white"
                                      disabled={activatingPeriodId !== null}
                                      onClick={() =>
                                        recordPeriod
                                          ? void handlePeriodActivate(
                                              recordPeriod.id,
                                            )
                                          : undefined
                                      }
                                    >
                                      {activatingPeriodId === recordPeriod?.id
                                        ? "Activating..."
                                        : periodAwaitingActivation
                                          ? "Activate period"
                                          : "Approve upcoming"}
                                    </Button>
                                  ) : null}
                                  {upgradeAwaitingApproval &&
                                  canActivatePeriod ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-amber-200 hover:bg-white/10 hover:text-white"
                                      disabled={approvingRevisionId !== null}
                                      onClick={() =>
                                        recordUpgradeRevision
                                          ? void handleApproveRevision(
                                              recordUpgradeRevision,
                                            )
                                          : undefined
                                      }
                                    >
                                      {approvingRevisionId ===
                                      recordUpgradeRevision?.id
                                        ? "Approving..."
                                        : "Approve upgrade"}
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="orders">
            <ConsoleSection
              title="Merchant orders"
              description="Cross-tenant platform visibility for this merchant's orders and payment/COD state."
            >
              {ordersError ? (
                <StateMessage
                  title="Orders unavailable"
                  message={ordersError}
                  destructive
                />
              ) : (
                <div className="space-y-4">
                  {paymentSummary ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <ConsoleStatCard
                        label="Orders"
                        value={paymentSummary.totals.orderCount}
                        note="Merchant-wide order count"
                        tone="blue"
                      />
                      <ConsoleStatCard
                        label="Paid"
                        value={paymentSummary.statuses.paid.orderCount}
                        note={formatMoney(
                          paymentSummary.statuses.paid.paidAmount,
                        )}
                        tone="emerald"
                      />
                      <ConsoleStatCard
                        label="COD pending"
                        value={paymentSummary.statuses.cod_pending.orderCount}
                        note={formatMoney(
                          paymentSummary.statuses.cod_pending.codAmount,
                        )}
                        tone="amber"
                      />
                      <ConsoleStatCard
                        label="Balance due"
                        value={formatMoney(paymentSummary.totals.balanceDue)}
                        note="Across visible orders"
                        tone="rose"
                      />
                    </div>
                  ) : null}
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <Table>
                      <TableHeader className="bg-slate-950/70">
                        <TableRow className="border-white/10">
                          <TableHead className="text-slate-300">
                            Order
                          </TableHead>
                          <TableHead className="text-slate-300">
                            Customer
                          </TableHead>
                          <TableHead className="text-slate-300">
                            Amount
                          </TableHead>
                          <TableHead className="text-slate-300">
                            Payment
                          </TableHead>
                          <TableHead className="text-slate-300">
                            Delivery
                          </TableHead>
                          <TableHead className="text-slate-300">
                            Created
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white/[0.03]">
                        {orders.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="py-12 text-center text-slate-400"
                            >
                              No orders exist for this merchant.
                            </TableCell>
                          </TableRow>
                        ) : (
                          orders.map((order) => (
                            <TableRow
                              key={order.id}
                              className="border-white/10"
                            >
                              <TableCell className="font-medium text-white">
                                {order.orderNumber}
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {order.customer?.fullName ||
                                  "Customer not linked"}
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {formatMoney(order.totalAmount)}
                              </TableCell>
                              <TableCell>
                                <BusinessBadge value={order.paymentStatus} />
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {order.trackingNumber ||
                                  order.deliveryZone ||
                                  order.deliveryAssigneeName ||
                                  "Not assigned"}
                              </TableCell>
                              <TableCell className="text-slate-300">
                                {formatDate(order.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="conversations">
            <ConsoleSection
              title="Merchant conversations"
              description="Recent live conversations for this merchant with channel, assignee, and last-message context."
            >
              {conversationsError ? (
                <StateMessage
                  title="Conversations unavailable"
                  message={conversationsError}
                  destructive
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <Table>
                    <TableHeader className="bg-slate-950/70">
                      <TableRow className="border-white/10">
                        <TableHead className="text-slate-300">
                          Conversation
                        </TableHead>
                        <TableHead className="text-slate-300">
                          Customer
                        </TableHead>
                        <TableHead className="text-slate-300">
                          Channel
                        </TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="text-slate-300">
                          Last message
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-white/[0.03]">
                      {conversations.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-12 text-center text-slate-400"
                          >
                            No conversations exist for this merchant.
                          </TableCell>
                        </TableRow>
                      ) : (
                        conversations.map((conversation) => (
                          <TableRow
                            key={conversation.id}
                            className="border-white/10"
                          >
                            <TableCell className="font-medium text-white">
                              {conversation.subject || conversation.id}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {conversation.customer?.fullName ||
                                "Customer not linked"}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {conversation.channel?.displayName ||
                                conversation.channel?.channelName ||
                                conversation.channel?.channelType ||
                                "Unknown"}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <BusinessBadge value={conversation.status} />
                                {conversation.assignedCsr?.fullName ? (
                                  <p className="text-xs text-slate-400">
                                    Assigned to{" "}
                                    {conversation.assignedCsr.fullName}
                                  </p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-300">
                              <div className="space-y-1">
                                <p>{formatDate(conversation.lastMessageAt)}</p>
                                <p className="max-w-xs truncate text-xs text-slate-400">
                                  {conversation.lastMessagePreview ||
                                    "No message preview available"}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="deliveries">
            <ConsoleSection
              title="Merchant deliveries"
              description="Real delivery visibility derived from this merchant's orders."
            >
              {deliveriesError ? (
                <StateMessage
                  title="Deliveries unavailable"
                  message={deliveriesError}
                  destructive
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <Table>
                    <TableHeader className="bg-slate-950/70">
                      <TableRow className="border-white/10">
                        <TableHead className="text-slate-300">
                          Tracking / order
                        </TableHead>
                        <TableHead className="text-slate-300">
                          Customer
                        </TableHead>
                        <TableHead className="text-slate-300">
                          Assignee
                        </TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="text-slate-300">
                          COD / due
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-white/[0.03]">
                      {deliveries.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-12 text-center text-slate-400"
                          >
                            No delivery rows exist for this merchant.
                          </TableCell>
                        </TableRow>
                      ) : (
                        deliveries.map((delivery) => (
                          <TableRow
                            key={delivery.id}
                            className="border-white/10"
                          >
                            <TableCell className="font-medium text-white">
                              {delivery.trackingNumber || delivery.orderNumber}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {delivery.customer?.fullName ||
                                "Customer not linked"}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {delivery.deliveryAssigneeName ||
                                delivery.deliveryZone ||
                                "Not assigned"}
                            </TableCell>
                            <TableCell>
                              <BusinessBadge value={delivery.status} />
                            </TableCell>
                            <TableCell className="text-slate-300">
                              <div className="space-y-1">
                                <BusinessBadge value={delivery.paymentStatus} />
                                {delivery.paymentStatus === "cod_pending" ? (
                                  <p className="text-xs text-slate-400">
                                    {formatMoney(
                                      delivery.balanceDue || delivery.codAmount,
                                    )}
                                  </p>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="products">
            <ConsoleSection
              title="Merchant products"
              description="Recent catalog visibility for this merchant without exposing merchant-side editing."
            >
              {productsError ? (
                <StateMessage
                  title="Products unavailable"
                  message={productsError}
                  destructive
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <Table>
                    <TableHeader className="bg-slate-950/70">
                      <TableRow className="border-white/10">
                        <TableHead className="text-slate-300">
                          Product
                        </TableHead>
                        <TableHead className="text-slate-300">SKU</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="text-slate-300">Stock</TableHead>
                        <TableHead className="text-slate-300">
                          Updated
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-white/[0.03]">
                      {products.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-12 text-center text-slate-400"
                          >
                            No products exist for this merchant.
                          </TableCell>
                        </TableRow>
                      ) : (
                        products.map((product) => (
                          <TableRow
                            key={product.id}
                            className="border-white/10"
                          >
                            <TableCell className="font-medium text-white">
                              {product.name}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {product.sku || "No SKU"}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <BusinessBadge value={product.status} />
                                {product.isLowStock ? (
                                  <p className="text-xs text-amber-200">
                                    Low stock
                                  </p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {product.trackInventory
                                ? product.stockQuantity.toLocaleString()
                                : "Not tracked"}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {formatDate(product.updatedAt)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="support">
            <ConsoleSection
              title="Merchant support note"
              description="Internal platform context for handoff, risk, or follow-up guidance on this merchant."
            >
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                {supportNoteError ? (
                  <StateMessage
                    title="Support note unavailable"
                    message={supportNoteError}
                    destructive
                  />
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="support-note">Internal note</Label>
                  <Textarea
                    id="support-note"
                    value={supportNote.note}
                    onChange={(event) =>
                      setSupportNote((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    readOnly={!canManage}
                    placeholder="Add platform-only merchant support context, escalation notes, or onboarding follow-up."
                    className="min-h-36 border-white/10 bg-slate-950/40"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">
                    Last updated: {formatDate(supportNote.updatedAt)}
                  </p>
                  {canManage ? (
                    <Button
                      onClick={() => void saveSupportNote()}
                      disabled={savingSupportNote}
                      className="bg-sky-500 text-slate-950 hover:bg-sky-400"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingSupportNote ? "Saving..." : "Save note"}
                    </Button>
                  ) : (
                    <FoundationNote
                      title="Read-only support note"
                      description="Your role can review this merchant note but cannot change it."
                    />
                  )}
                </div>
              </div>
            </ConsoleSection>
          </TabsContent>

          <TabsContent value="users">
            <ConsoleSection
              title="Team users"
              description="All workspace users for this merchant. Invite new members or resend invitations for inactive users."
              action={
                canManage ? (
                  <Button
                    onClick={() => setInviteOpen(true)}
                    size="sm"
                    className="bg-sky-500 text-slate-950 hover:bg-sky-400"
                  >
                    Invite user
                  </Button>
                ) : null
              }
            >
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <Table>
                  <TableHeader className="bg-slate-950/70">
                    <TableRow className="border-white/10">
                      <TableHead className="text-slate-300">Name</TableHead>
                      <TableHead className="text-slate-300">Email</TableHead>
                      <TableHead className="text-slate-300">Role</TableHead>
                      <TableHead className="text-slate-300">Status</TableHead>
                      <TableHead className="text-slate-300">
                        Last login
                      </TableHead>
                      <TableHead className="text-right text-slate-300">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="bg-white/[0.03]">
                    {usersError ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-12 text-center text-slate-400"
                        >
                          Users could not be loaded.
                        </TableCell>
                      </TableRow>
                    ) : users.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-12 text-center text-slate-400"
                        >
                          No team users exist for this merchant.
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user) => (
                        <TableRow
                          key={user.id}
                          className="border-white/10 hover:bg-white/5"
                        >
                          <TableCell className="font-medium text-white">
                            {user.fullName}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {user.email}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {user.role}
                          </TableCell>
                          <TableCell>
                            <BusinessBadge value={user.status} />
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {formatDateTime(user.lastSeenAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {user.status === "inactive" && canManage ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleResendInvite(user.id)}
                                className="text-sky-200 hover:bg-white/10 hover:text-white"
                              >
                                Resend invite
                              </Button>
                            ) : user.status === "active" ? (
                              <span className="text-xs text-slate-500">
                                Active
                              </span>
                            ) : user.status === "suspended" ? (
                              <span className="text-xs text-slate-500">
                                Suspended
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </ConsoleSection>
          </TabsContent>
        </Tabs>
      </ConsolePage>

      <Dialog open={proofReviewOpen} onOpenChange={setProofReviewOpen}>
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Review payment proof</DialogTitle>
            <DialogDescription className="text-slate-300">
              {reviewRecord?.invoiceNumber || "Invoice"} ·{" "}
              {reviewRecord?.subscriptionPlan?.name ||
                (typeof reviewRecord?.metadata?.selectedPlanName === "string"
                  ? reviewRecord.metadata.selectedPlanName
                  : typeof reviewRecord?.metadata?.productName === "string"
                    ? reviewRecord.metadata.productName
                    : "Unknown item")}{" "}
              ·{" "}
              {reviewRecord
                ? formatMoney(reviewRecord.amountDue, reviewRecord.currency)
                : ""}
            </DialogDescription>
          </DialogHeader>
          {reviewError ? (
            <StateMessage
              title="Review failed"
              message={reviewError}
              destructive
            />
          ) : null}
          <div className="space-y-4">
            {reviewRecord?.metadata?.paymentProof ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Detail
                    label="Submitted amount"
                    value={formatMoney(
                      reviewRecord.metadata.paymentProof.paidAmount ?? 0,
                      reviewRecord.currency,
                    )}
                  />
                  <Detail
                    label="Payment method"
                    value={String(
                      reviewRecord.metadata.paymentProof.paymentMethod || "—",
                    )}
                  />
                  <Detail
                    label="Paid date"
                    value={formatDate(
                      reviewRecord.metadata.paymentProof.paidDate,
                    )}
                  />
                  <Detail
                    label="Submitted"
                    value={formatDateTime(
                      reviewRecord.metadata.paymentProof.submittedAt,
                    )}
                  />
                  <Detail
                    label="Receipt"
                    value={String(
                      reviewRecord.metadata.paymentProof.fileName || "—",
                    )}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="review-amount">Confirmed amount (MMK)</Label>
                <Input
                  id="review-amount"
                  inputMode="numeric"
                  value={reviewAmount}
                  onChange={(event) => setReviewAmount(event.target.value)}
                  className="border-white/10 bg-slate-950/40"
                />
              </div>
            )}
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              Approving marks the invoice as paid and activates the
              subscription period. Rejecting keeps the invoice open.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProofReviewOpen(false)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitProofReview("rejected")}
              disabled={reviewing}
              className="bg-rose-500 text-white hover:bg-rose-400"
            >
              {reviewing ? "Rejecting..." : "Reject proof"}
            </Button>
            <Button
              onClick={() => void submitProofReview("approved")}
              disabled={reviewing}
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            >
              {reviewing ? "Approving..." : "Approve proof"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectRevision}
        onOpenChange={(open) => {
          if (!open) setRejectRevision(null);
        }}
      >
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Reject upgrade request</DialogTitle>
            <DialogDescription className="text-slate-300">
              {rejectRevision
                ? `${rejectRevision.kind === "trial_conversion" ? "Trial upgrade" : "Upgrade"} — ${rejectRevision.previousPlanName || rejectRevision.previousPlanId} → ${rejectRevision.upgradedPlanName || rejectRevision.upgradedPlanId}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {upgradeActionError ? (
            <StateMessage
              title="Reject failed"
              message={upgradeActionError}
              destructive
            />
          ) : null}
          <div className="space-y-2">
            <Label className="text-slate-300">Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Explain why this request is being rejected."
              className="min-h-24 border-white/10 bg-slate-950/40"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectRevision(null)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                rejectRevision
                  ? void handleRejectRevision(rejectRevision, rejectReason)
                  : undefined
              }
              disabled={approvingRevisionId !== null}
              className="bg-rose-500 text-white hover:bg-rose-400"
            >
              {approvingRevisionId === rejectRevision?.id
                ? "Rejecting..."
                : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Change merchant plan</DialogTitle>
            <DialogDescription className="text-slate-300">
              Applying this change updates the merchant subscription immediately
              and creates a fresh billing record by default for the selected
              period.
            </DialogDescription>
          </DialogHeader>
          {planError ? (
            <StateMessage
              title="Plan change failed"
              message={planError}
              destructive
            />
          ) : null}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target plan</Label>
              <select
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-white"
              >
                <option value="">Select plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatMoney(plan.monthlyPrice)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-month">Yangon billing month</Label>
              <input
                id="plan-month"
                type="month"
                value={planMonth}
                onChange={(event) => setPlanMonth(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-white"
              />
            </div>
            <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
              Plan changes always cover one complete calendar month in{" "}
              <strong>Asia/Yangon</strong>. The period runs from{" "}
              <strong>{`${planMonth}-01`}</strong> through (excluding){" "}
              <strong>{nextMonthDate(planMonth)}</strong>. Partial or custom
              periods are not supported.
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-note">Operator note</Label>
              <Textarea
                id="plan-note"
                value={planNote}
                onChange={(event) => setPlanNote(event.target.value)}
                placeholder="Optional note recorded with the subscription change"
                className="min-h-24 border-white/10 bg-slate-950/40"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPlanOpen(false)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitPlanChange()}
              disabled={savingPlan || !selectedPlanId || !planMonth}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              {savingPlan ? "Applying..." : "Apply plan change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>
              {statusLabel} {merchant.companyName}
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              The reason is required and recorded with the status change in the
              platform audit trail.
            </DialogDescription>
          </DialogHeader>
          {statusError ? (
            <StateMessage
              title="Status change failed"
              message={statusError}
              destructive
            />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="status-reason">Reason</Label>
            <Textarea
              id="status-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                changingToActive
                  ? "Why is access being restored?"
                  : "Why is this merchant being suspended?"
              }
              className="min-h-28 border-white/10 bg-slate-950/40"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusOpen(false)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void changeStatus()}
              disabled={savingStatus || reason.trim().length < 3}
              className={
                changingToActive
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-rose-500 text-white"
              }
            >
              {savingStatus
                ? "Saving..."
                : `Confirm ${statusLabel.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription className="text-slate-300">
              Send an invitation to join this merchant's workspace.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteUser} className="space-y-4">
            {inviteResult ? (
              <StateMessage
                title="Invite failed"
                message={inviteResult}
                destructive
              />
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full name</Label>
              <Input
                id="invite-name"
                value={inviteForm.fullName}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, fullName: e.target.value })
                }
                required
                className="border-white/10 bg-slate-950/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }
                required
                className="border-white/10 bg-slate-950/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={inviteForm.role || "csr"}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, role: e.target.value })
                }
                className="w-full rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-white"
              >
                <option value="csr">CSR</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
                className="border-white/10 bg-white/5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviting}
                className="bg-sky-500 text-slate-950 hover:bg-sky-400"
              >
                {inviting ? "Sending..." : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 break-words font-medium text-white">{value}</p>
    </div>
  );
}
function StateMessage({
  title,
  message,
  destructive = false,
}: {
  title: string;
  message: string;
  destructive?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${destructive ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 opacity-80">{message}</p>
      </div>
    </div>
  );
}
function metricLabel(metric: string) {
  return (
    (
      {
        csrs: "Team members",
        channels: "Connected channels",
        apiRequests: "API requests",
        providerMessages: "Provider messages",
      } as Record<string, string>
    )[metric] || metric
  );
}
function limitNote(used?: number, limit?: number | null) {
  if (used === undefined) return "Usage endpoint unavailable";
  return limit === null || limit === undefined
    ? `${used.toLocaleString()} used · no limit`
    : `${used.toLocaleString()} of ${limit.toLocaleString()}`;
}
function UsageMeter({
  label,
  metric,
}: {
  label: string;
  metric: TenantUsageSummaryDto["metrics"]["csrs"];
}) {
  const percent =
    metric.percentUsed === null ? 0 : Math.min(100, metric.percentUsed);
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-white">{label}</p>
        <span className="text-sm text-slate-400">
          {limitNote(metric.used, metric.limit)}
        </span>
      </div>
      <Progress value={percent} className="mt-4 h-2" />
      <p className="mt-3 text-xs text-slate-500">
        {metric.unlimited
          ? "No numeric limit configured."
          : metric.remaining === 0
            ? "Configured limit reached."
            : `${metric.remaining?.toLocaleString()} remaining this cycle.`}
      </p>
    </div>
  );
}
