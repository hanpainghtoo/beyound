"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Eye,
  RefreshCw,
  Search,
  XCircle,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  adminActivatePeriod,
  approveUpgradeRevision,
  confirmPlatformBillingPayment,
  getPlatformBillingRecords,
  getPlatformPaymentProofDownloadUrl,
  getStoredSession,
  PlatformApiError,
  reviewPlatformPaymentProof,
  sendPlatformBillingReminder,
  type ConfirmPlatformPaymentInput,
  type ReviewPlatformPaymentProofInput,
  type SendPlatformBillingReminderInput,
  type TenantBillingRecordDto,
} from "@/lib/api";

const paymentStatuses = [
  "all",
  "unpaid",
  "partially_paid",
  "paid",
  "overdue",
  "waived",
] as const;
const canUpdateBilling = (role?: string) =>
  role === "super_admin" || role === "ops_admin" || role === "finance_viewer";
const canViewBilling = (role?: string) =>
  canUpdateBilling(role) || role === "read_only";
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The billing request could not be completed.";
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Not recorded";
const formatMoney = (value: number | string, currency = "MMK") =>
  `${currency} ${Number(value || 0).toLocaleString()}`;
const outstanding = (record: TenantBillingRecordDto) =>
  Math.max(Number(record.amountDue || 0) - Number(record.amountPaid || 0), 0);
const isPastDue = (record: TenantBillingRecordDto) =>
  Boolean(
    record.dueDate &&
    new Date(record.dueDate).getTime() < Date.now() &&
    !["paid", "waived"].includes(record.paymentStatus),
  );
const initialPayment = (): ConfirmPlatformPaymentInput => ({
  paymentDate: new Date().toISOString().slice(0, 16),
  receivedAmount: 0,
  paymentMethod: "bank_transfer",
  paymentReference: "",
  internalNote: "",
});
const initialReminder = (
  markOverdue = true,
): SendPlatformBillingReminderInput => ({
  note: "",
  markOverdue,
  suspendTenant: false,
});

export default function BillingPage() {
  const [records, setRecords] = useState<TenantBillingRecordDto[]>([]);
  const [role, setRole] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<(typeof paymentStatuses)[number]>("all");
  const [selected, setSelected] = useState<TenantBillingRecordDto | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payment, setPayment] = useState(initialPayment);
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [reviewRecord, setReviewRecord] =
    useState<TenantBillingRecordDto | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [reminder, setReminder] = useState<SendPlatformBillingReminderInput>(
    initialReminder(true),
  );
  const [overdueError, setOverdueError] = useState("");
  const [savingOverdue, setSavingOverdue] = useState(false);
  const [activatingPeriodId, setActivatingPeriodId] = useState<string | null>(
    null,
  );
  const [approvingRevisionId, setApprovingRevisionId] = useState<string | null>(
    null,
  );
  const [activationError, setActivationError] = useState("");
  const canUpdate = canUpdateBilling(role);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setPermissionDenied(false);
    try {
      setRecords(await getPlatformBillingRecords());
    } catch (requestError) {
      if (
        requestError instanceof PlatformApiError &&
        requestError.status === 403
      )
        setPermissionDenied(true);
      setError(errorMessage(requestError));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRole(getStoredSession()?.user.role);
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const merchant =
          record.tenant?.companyName ||
          record.tenant?.tenantCode ||
          record.tenantId;
        const haystack =
          `${merchant} ${record.invoiceNumber || ""} ${record.metadata?.paymentReference || ""} ${record.notes || ""}`.toLowerCase();
        return (
          haystack.includes(query.trim().toLowerCase()) &&
          (statusFilter === "all" || record.paymentStatus === statusFilter)
        );
      }),
    [query, records, statusFilter],
  );

  const updateRecord = (updated: TenantBillingRecordDto) => {
    setRecords((current) =>
      current.map((record) =>
        record.id === updated.id ? { ...record, ...updated } : record,
      ),
    );
    setSelected((current) =>
      current?.id === updated.id ? { ...current, ...updated } : current,
    );
  };

  const openPayment = (record: TenantBillingRecordDto) => {
    setSelected(record);
    setPayment({ ...initialPayment(), receivedAmount: outstanding(record) });
    setPaymentError("");
    setPaymentOpen(true);
  };

  const confirmPayment = async () => {
    if (!selected) return;
    if (
      !Number.isFinite(payment.receivedAmount) ||
      payment.receivedAmount < 0
    ) {
      setPaymentError("Received amount cannot be negative.");
      return;
    }
    setSavingPayment(true);
    setPaymentError("");
    try {
      const updated = await confirmPlatformBillingPayment(selected, {
        ...payment,
        paymentDate: new Date(payment.paymentDate).toISOString(),
        paymentReference: payment.paymentReference?.trim() || undefined,
        internalNote: payment.internalNote?.trim(),
      });
      updateRecord(updated);
      setPaymentOpen(false);
      // Payment confirmation creates or updates the subscription period in a
      // separate transaction. Reload the list so the row immediately receives
      // its linked period and can show "Activate period" without a page refresh.
      await load();
    } catch (requestError) {
      setPaymentError(errorMessage(requestError));
    } finally {
      setSavingPayment(false);
    }
  };

  const openReview = (record: TenantBillingRecordDto) => {
    setReviewRecord(record);
    setReceiptPreviewUrl(null);
    setReceiptPreviewLoading(false);
    setReviewReason("");
    setReviewError("");
    setReviewOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    const contentType = reviewRecord?.metadata?.paymentProof?.contentType;

    setReceiptPreviewUrl(null);
    setReceiptPreviewLoading(false);

    if (
      !reviewOpen ||
      !reviewRecord ||
      !contentType?.startsWith("image/")
    ) {
      return () => {
        cancelled = true;
      };
    }

    setReceiptPreviewLoading(true);
    void getPlatformPaymentProofDownloadUrl(reviewRecord)
      .then((response) => {
        if (!cancelled) setReceiptPreviewUrl(response.download.url);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setReviewError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setReceiptPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reviewOpen, reviewRecord]);

  const closeReview = (open: boolean) => {
    setReviewOpen(open);
    if (!open) {
      setReceiptPreviewUrl(null);
      setReceiptPreviewLoading(false);
    }
  };

  const viewProofReceipt = async (record: TenantBillingRecordDto) => {
    try {
      const response = await getPlatformPaymentProofDownloadUrl(record);
      window.open(response.download.url, "_blank", "noopener,noreferrer");
    } catch (requestError) {
      setReviewError(errorMessage(requestError));
    }
  };

  const reviewProof = async (
    outcome: ReviewPlatformPaymentProofInput["outcome"],
  ) => {
    if (!reviewRecord) return;
    if (outcome === "rejected" && !reviewReason.trim()) {
      setReviewError("A rejection reason is required.");
      return;
    }
    setSavingReview(true);
    setReviewError("");
    try {
      const proof = reviewRecord.metadata?.paymentProof;
      const updated = await reviewPlatformPaymentProof(reviewRecord, {
        outcome,
        safeReason: outcome === "rejected" ? reviewReason.trim() : undefined,
        amountPaid:
          outcome === "approved" && proof?.paidAmount !== undefined
            ? Number(proof.paidAmount)
            : undefined,
        paidAt:
          outcome === "approved" ? proof?.paidDate || undefined : undefined,
      });
      updateRecord(updated);
      setReviewRecord(updated);
      setReviewOpen(false);
      // Proof approval creates the period after updating the billing record;
      // reload to attach that new period to the invoice row immediately.
      await load();
    } catch (requestError) {
      setReviewError(errorMessage(requestError));
    } finally {
      setSavingReview(false);
    }
  };

  const openOverdue = (record: TenantBillingRecordDto, markOverdue = true) => {
    setSelected(record);
    setReminder(initialReminder(markOverdue));
    setOverdueError("");
    setOverdueOpen(true);
  };

  const markOverdue = async () => {
    if (!selected) return;
    setSavingOverdue(true);
    setOverdueError("");
    try {
      const result = await sendPlatformBillingReminder(selected, {
        note: reminder.note?.trim() || undefined,
        markOverdue: reminder.markOverdue,
        suspendTenant: reminder.suspendTenant,
      });
      updateRecord(result.billingRecord);
      setOverdueOpen(false);
    } catch (requestError) {
      setOverdueError(errorMessage(requestError));
    } finally {
      setSavingOverdue(false);
    }
  };

  const activatePeriod = async (record: TenantBillingRecordDto) => {
    const period = record.subscriptionPeriod;
    if (!period) return;
    setActivatingPeriodId(period.id);
    setActivationError("");
    try {
      await adminActivatePeriod(record.tenantId, period.id, {});
      await load();
    } catch (requestError) {
      setActivationError(errorMessage(requestError));
    } finally {
      setActivatingPeriodId(null);
    }
  };

  const approveUpgrade = async (record: TenantBillingRecordDto) => {
    const revision = record.pendingUpgradeRevision;
    if (!revision) return;
    setApprovingRevisionId(revision.id);
    setActivationError("");
    try {
      await approveUpgradeRevision(
        record.tenantId,
        revision.subscriptionPeriodId,
        revision.id,
        {},
      );
      await load();
    } catch (requestError) {
      setActivationError(errorMessage(requestError));
    } finally {
      setApprovingRevisionId(null);
    }
  };

  const openCount = records.filter(
    (record) => !["paid", "waived"].includes(record.paymentStatus),
  ).length;
  const overdueCount = records.filter(
    (record) => record.paymentStatus === "overdue" || isPastDue(record),
  ).length;
  const receivedTotal = records.reduce(
    (sum, record) => sum + Number(record.amountPaid || 0),
    0,
  );
  const currency = records[0]?.currency || "MMK";

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Billing"
        description="Myanmar-style manual invoices, bank transfer confirmation, and overdue follow-up from live platform billing records."
        actions={
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <ConsolePage>
        {role && !canViewBilling(role) ? (
          <StateMessage
            title="Billing permission required"
            message="Your platform role is not allowed to view billing records."
            destructive
          />
        ) : null}
        {role === "finance_viewer" ? (
          <StateMessage
            title="Finance payment access"
            message="You can review invoices and confirm verified manual payments. Merchant, plan, and platform setting changes remain restricted to operations admins."
          />
        ) : null}
        {role === "read_only" ? (
          <StateMessage
            title="Read-only billing access"
            message="You can inspect invoice and payment state, but only finance, operations, and super admins can change billing records."
          />
        ) : null}
        {error ? (
          <StateMessage
            title={
              permissionDenied
                ? "Permission required"
                : "Billing data unavailable"
            }
            message={error}
            destructive
          />
        ) : null}
        {activationError ? (
          <StateMessage
            title="Period activation failed"
            message={activationError}
            destructive
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard
            label="Invoices"
            value={loading ? "..." : records.length}
            note="Live manual invoice records"
            tone="blue"
          />
          <ConsoleStatCard
            label="Open follow-up"
            value={loading ? "..." : openCount}
            note="Unpaid or partially paid"
            tone="amber"
          />
          <ConsoleStatCard
            label="Overdue"
            value={loading ? "..." : overdueCount}
            note="Marked or past due"
            tone="rose"
          />
          <ConsoleStatCard
            label="Payments received"
            value={loading ? "..." : formatMoney(receivedTotal, currency)}
            note="Across loaded records"
            tone="emerald"
          />
        </div>

        <ConsoleSection
          title="Filters"
          description="Search real invoices by merchant, reference, or notes."
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search merchant, invoice, payment reference"
                className="border-white/10 bg-slate-950/40 pl-9 text-white"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as (typeof paymentStatuses)[number])
              }
            >
              <SelectTrigger className="border-white/10 bg-slate-950/40 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "all"
                      ? "All payment states"
                      : status.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ConsoleSection>

        <ConsoleSection
          title="Manual invoice queue"
          description="Payment status changes only after an authorized operator records a real manual or bank payment."
          action={
            <Badge
              variant="outline"
              className="border-white/10 bg-white/5 text-slate-300"
            >
              {filtered.length} shown
            </Badge>
          }
        >
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table className="min-w-[1180px]">
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">
                    Invoice / merchant
                  </TableHead>
                  <TableHead className="text-slate-300">Plan / Item</TableHead>
                  <TableHead className="text-slate-300">
                    Billing period
                  </TableHead>
                  <TableHead className="text-slate-300">Amount</TableHead>
                  <TableHead className="text-slate-300">Due date</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">
                    Payment details
                  </TableHead>
                  <TableHead className="text-slate-300">Notes</TableHead>
                  <TableHead className="text-right text-slate-300">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-12 text-center text-slate-400"
                    >
                      Loading live billing records...
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-12 text-center text-slate-400"
                    >
                      Billing records could not be loaded.
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-12 text-center text-slate-400"
                    >
                      <Banknote className="mx-auto mb-3 h-6 w-6" />
                      {records.length
                        ? "No invoices match these filters."
                        : "No billing records have been issued yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((record) => {
                    const overdue =
                      record.paymentStatus === "overdue" || isPastDue(record);
                    const proof = record.metadata?.paymentProof;
                    const proofPending = proof?.status === "pending_review";
                    const merchant =
                      record.tenant?.companyName || "Merchant unavailable";
                    const recordPeriod = record.subscriptionPeriod;
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
                    const upgradeAwaitingApproval = Boolean(
                      record.pendingUpgradeRevision?.upgradeStatus ===
                        "pending_approval" &&
                        record.metadata?.purchaseRequestType === "upgrade",
                    );
                    const method = String(
                      record.metadata?.paymentMethod ||
                        proof?.paymentMethod ||
                        "Not recorded",
                    ).replaceAll("_", " ");
                    const reference = String(
                      record.metadata?.paymentReference ||
                        proof?.transactionReference ||
                        "No reference",
                    );
                    return (
                      <TableRow
                        key={record.id}
                        className={
                          overdue
                            ? "border-rose-400/20 bg-rose-500/[0.06] hover:bg-rose-500/10"
                            : "border-white/10 hover:bg-white/5"
                        }
                      >
                        <TableCell>
                          <p className="font-medium text-white">
                            {record.invoiceNumber ||
                              (record.invoiceStatus === "draft"
                                ? "Draft invoice"
                                : "Invoice number pending")}
                          </p>
                          <Link
                            href={`/platform-console/merchants/${record.tenantId}`}
                            className="mt-1 inline-flex items-center text-xs text-sky-300 hover:text-sky-200"
                          >
                            {merchant}
                            <ExternalLink className="ml-1 h-3 w-3" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-slate-300">
                          {record.subscriptionPlan?.name ||
                            (typeof record.metadata?.selectedPlanName ===
                            "string"
                              ? record.metadata.selectedPlanName
                              : typeof record.metadata?.productName === "string"
                                ? record.metadata.productName
                                : "—")}
                        </TableCell>
                        <TableCell className="text-slate-300">
                          {formatDate(record.billingPeriodStart)} –{" "}
                          {formatDate(record.billingPeriodEnd)}
                        </TableCell>
                        <TableCell>
                          <p className="text-white">
                            {formatMoney(record.amountDue, record.currency)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Received{" "}
                            {formatMoney(record.amountPaid, record.currency)} ·
                            Due{" "}
                            {formatMoney(outstanding(record), record.currency)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p
                            className={
                              overdue
                                ? "font-medium text-rose-200"
                                : "text-slate-300"
                            }
                          >
                            {formatDate(record.dueDate)}
                          </p>
                          {overdue ? (
                            <p className="text-xs text-rose-300">
                              Overdue follow-up
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <BusinessBadge value={record.paymentStatus} />
                            <BusinessBadge value={record.invoiceStatus} />
                            {periodAwaitingActivation ? (
                              <BusinessBadge value="awaiting activation" />
                            ) : null}
                            {periodAwaitingApproval ? (
                              <BusinessBadge value="awaiting approval" />
                            ) : null}
                            {upgradeAwaitingApproval ? (
                              <BusinessBadge value="awaiting upgrade approval" />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="capitalize text-slate-300">{method}</p>
                          <p
                            className="max-w-40 truncate text-xs text-slate-500"
                            title={reference}
                          >
                            {reference}
                          </p>
                          {record.paidAt ? (
                            <p className="text-xs text-slate-500">
                              {formatDate(record.paidAt)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-52 text-slate-300">
                          {record.notes || "No internal note"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {proof?.mediaFileId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReview(record)}
                                className="border-sky-400/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20"
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                {canUpdate && proofPending
                                  ? "Review proof"
                                  : "View proof"}
                              </Button>
                            ) : null}
                            {(periodAwaitingActivation ||
                              periodAwaitingApproval) &&
                            canUpdate ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={activatingPeriodId !== null}
                                onClick={() => void activatePeriod(record)}
                                className="border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                              >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                {activatingPeriodId === recordPeriod?.id
                                  ? "Activating..."
                                  : periodAwaitingActivation
                                    ? "Activate period"
                                    : "Approve upcoming"}
                              </Button>
                            ) : null}
                            {upgradeAwaitingApproval && canUpdate ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={approvingRevisionId !== null}
                                onClick={() => void approveUpgrade(record)}
                                className="border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                              >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                {approvingRevisionId ===
                                record.pendingUpgradeRevision?.id
                                  ? "Approving..."
                                  : "Approve upgrade"}
                              </Button>
                            ) : null}
                            {canUpdate &&
                            !proofPending &&
                            !["paid", "waived"].includes(
                              record.paymentStatus,
                            ) ? (
                              <Button
                                size="sm"
                                onClick={() => openPayment(record)}
                                className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Confirm payment
                              </Button>
                            ) : null}
                            {canUpdate &&
                            isPastDue(record) &&
                            record.paymentStatus !== "overdue" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openOverdue(record, true)}
                                className="border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                              >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Mark overdue
                              </Button>
                            ) : null}
                            {canUpdate && overdue ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openOverdue(record, false)}
                                className="border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                              >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Send reminder
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
        </ConsoleSection>

        <div className="grid gap-5 xl:grid-cols-2">
          <ConsoleSection
            title="Overdue follow-up"
            description="Past-due invoices can now trigger a merchant reminder, can be marked overdue in the same action, and can optionally suspend the tenant for tighter operator control."
          >
            <FoundationNote
              icon={CalendarClock}
              title="Reminder delivery"
              description="Reminder delivery is currently implemented as persisted in-app merchant notifications for owner, admin, and finance workspace users, with reminder history stored on the billing record."
            />
          </ConsoleSection>
          <ConsoleSection
            title="Payment/COD boundary"
            description="This screen covers platform subscription invoices only."
          >
            <FoundationNote
              icon={Banknote}
              title="COD reporting remains separate"
              description="Platform-wide order and COD reconciliation APIs are still missing. No seed order or delivery totals are shown as billing data."
            />
          </ConsoleSection>
        </div>
      </ConsolePage>
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Confirm manual payment</DialogTitle>
            <DialogDescription className="text-slate-300">
              Record verified funds for{" "}
              {selected?.invoiceNumber || "this invoice"}. The saved API
              response will replace the invoice row.
            </DialogDescription>
          </DialogHeader>
          {paymentError ? (
            <StateMessage
              title="Payment confirmation failed"
              message={paymentError}
              destructive
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Payment date"
              type="datetime-local"
              value={payment.paymentDate}
              onChange={(value) =>
                setPayment({ ...payment, paymentDate: value })
              }
            />
            <Field
              label="Received amount"
              type="number"
              min="0"
              value={String(payment.receivedAmount)}
              onChange={(value) =>
                setPayment({ ...payment, receivedAmount: Number(value) })
              }
            />
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select
                value={payment.paymentMethod}
                onValueChange={(value) =>
                  setPayment({ ...payment, paymentMethod: value })
                }
              >
                <SelectTrigger className="border-white/10 bg-slate-950/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cash_deposit">Cash deposit</SelectItem>
                  <SelectItem value="manual_cash">Manual cash</SelectItem>
                  <SelectItem value="other_manual">Other manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Payment reference (optional)"
              value={payment.paymentReference || ""}
              onChange={(value) =>
                setPayment({ ...payment, paymentReference: value })
              }
              placeholder="Bank transaction ID or receipt note"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="internal-note">Internal note</Label>
            <Textarea
              id="internal-note"
              value={payment.internalNote}
              onChange={(event) =>
                setPayment({ ...payment, internalNote: event.target.value })
              }
              placeholder="Finance review context"
              className="min-h-24 border-white/10 bg-slate-950/40"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentOpen(false)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmPayment()}
              disabled={
                savingPayment ||
                !payment.paymentDate ||
                payment.receivedAmount < 0
              }
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            >
              {savingPayment ? "Saving..." : "Confirm received payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>{" "}
      <Dialog open={reviewOpen} onOpenChange={closeReview}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>
              {reviewRecord?.metadata?.paymentProof?.status === "pending_review"
                ? "Review payment proof"
                : "Payment proof details"}
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              {reviewRecord?.invoiceNumber || "Invoice"} ·{" "}
              {reviewRecord?.tenant?.companyName || "Merchant"}
            </DialogDescription>
          </DialogHeader>
          {reviewError ? (
            <StateMessage
              title="Payment-proof action failed"
              message={reviewError}
              destructive
            />
          ) : null}
          {reviewRecord?.metadata?.paymentProof ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info
                  label="Proof status"
                  value={String(
                    reviewRecord.metadata.paymentProof.status || "Not recorded",
                  ).replaceAll("_", " ")}
                />
                <Info
                  label="Submitted amount"
                  value={formatMoney(
                    reviewRecord.metadata.paymentProof.paidAmount || 0,
                    reviewRecord.currency,
                  )}
                />
                <Info
                  label="Payment method"
                  value={String(
                    reviewRecord.metadata.paymentProof.paymentMethod ||
                      "Not recorded",
                  ).replaceAll("_", " ")}
                />
                <Info
                  label="Paid date"
                  value={formatDate(
                    reviewRecord.metadata.paymentProof.paidDate,
                  )}
                />
                <Info
                  label="Transaction reference"
                  value={
                    reviewRecord.metadata.paymentProof.transactionReference ||
                    "Not provided"
                  }
                />
                <Info
                  label="Receipt file"
                  value={
                    reviewRecord.metadata.paymentProof.fileName ||
                    "Not recorded"
                  }
                />
              </div>
              {reviewRecord.metadata.paymentProof.rejectionReason ? (
                <StateMessage
                  title="Rejection reason"
                  message={reviewRecord.metadata.paymentProof.rejectionReason}
                  destructive
                />
              ) : null}
              {reviewRecord.metadata.paymentProof.contentType?.startsWith(
                "image/",
              ) && (receiptPreviewLoading || receiptPreviewUrl) ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                  {receiptPreviewLoading ? (
                    <div
                      className="h-40 w-full animate-pulse rounded-lg bg-white/10"
                      aria-label="Loading payment receipt preview"
                    />
                  ) : receiptPreviewUrl ? (
                    <img
                      src={receiptPreviewUrl}
                      alt="Payment receipt"
                      className="max-h-64 w-full rounded-lg border border-white/10 object-contain"
                    />
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => void viewProofReceipt(reviewRecord)}
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View receipt
                </Button>
                {canUpdate &&
                reviewRecord.metadata.paymentProof.status ===
                  "pending_review" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void reviewProof("rejected")}
                      disabled={savingReview}
                      className="border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject proof
                    </Button>
                    <Button
                      onClick={() => void reviewProof("approved")}
                      disabled={savingReview}
                      className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve proof
                    </Button>
                  </>
                ) : null}
              </div>
              {canUpdate &&
              reviewRecord.metadata.paymentProof.status === "pending_review" ? (
                <div className="space-y-2">
                  <Label htmlFor="proof-review-reason">
                    Rejection reason, if rejecting
                  </Label>
                  <Textarea
                    id="proof-review-reason"
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    placeholder="Required only when rejecting"
                    className="border-white/10 bg-slate-950/40"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={overdueOpen} onOpenChange={setOverdueOpen}>
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>
              {reminder.markOverdue
                ? "Overdue follow-up"
                : "Send billing reminder"}
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              {reminder.markOverdue
                ? `Send a merchant reminder for ${selected?.invoiceNumber || "this invoice"} and persist overdue state in the same action.`
                : `Send another merchant billing reminder for ${selected?.invoiceNumber || "this invoice"} without changing its current overdue flag.`}
            </DialogDescription>
          </DialogHeader>
          {overdueError ? (
            <StateMessage
              title="Reminder action failed"
              message={overdueError}
              destructive
            />
          ) : null}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="overdue-note">Internal follow-up note</Label>
              <Textarea
                id="overdue-note"
                value={reminder.note || ""}
                onChange={(event) =>
                  setReminder((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Optional collection context or suspension reason"
                className="min-h-24 border-white/10 bg-slate-950/40"
              />
            </div>
            <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <label className="flex items-start gap-3 text-sm text-slate-200">
                <Checkbox
                  checked={Boolean(reminder.markOverdue)}
                  onCheckedChange={(checked) =>
                    setReminder((current) => ({
                      ...current,
                      markOverdue: Boolean(checked),
                    }))
                  }
                />
                <span>
                  <span className="font-medium text-white">
                    Persist overdue status
                  </span>
                  <span className="mt-1 block text-slate-400">
                    Keep the invoice clearly marked overdue in the billing
                    queue.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-200">
                <Checkbox
                  checked={Boolean(reminder.suspendTenant)}
                  onCheckedChange={(checked) =>
                    setReminder((current) => ({
                      ...current,
                      suspendTenant: Boolean(checked),
                    }))
                  }
                />
                <span>
                  <span className="font-medium text-white">
                    Suspend merchant after reminder
                  </span>
                  <span className="mt-1 block text-slate-400">
                    Use when the merchant should lose active platform access
                    until billing follow-up is resolved.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverdueOpen(false)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void markOverdue()}
              disabled={savingOverdue}
              className="bg-rose-500 text-white hover:bg-rose-400"
            >
              {savingOverdue
                ? "Sending..."
                : reminder.suspendTenant
                  ? "Send reminder and suspend"
                  : reminder.markOverdue
                    ? "Send reminder and mark overdue"
                    : "Send reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium capitalize text-white">
        {value}
      </p>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="border-white/10 bg-slate-950/40"
      />
    </div>
  );
}
