"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage, WorkspaceStatStrip } from "@/components/workspace"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  agentDeliveriesApi,
  getApiErrorMessage,
  getStoredSession,
  type DeliveryStatus,
} from "@/lib/api"
import { useDeliveriesList, useDelivery, useUpdateDelivery } from "@/lib/queries/deliveries"
import { workspaceDeliveryRoles } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const statuses: DeliveryStatus[] = [
  "packed",
  "out_for_delivery",
  "delivered",
  "failed_delivery",
  "returned",
]
const next: Record<DeliveryStatus, DeliveryStatus[]> = {
  packed: ["out_for_delivery"],
  out_for_delivery: ["delivered", "failed_delivery"],
  delivered: ["returned"],
  failed_delivery: ["out_for_delivery", "returned"],
  returned: [],
}

export default function DeliveriesPage() {
  const { t } = useI18n()
  const canEdit = (workspaceDeliveryRoles as readonly string[]).includes(
    getStoredSession()?.user.role || "agent",
  )
  const [status, setStatus] = useState<DeliveryStatus | "all">("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | undefined>(searchParams.get("delivery") || undefined)
  const [reason, setReason] = useState("")
  const [assignee, setAssignee] = useState("")
  const [phone, setPhone] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")
  const query = useDeliveriesList({
    status,
    search,
    page,
    limit: pageSize,
    sortBy: "createdAt",
    sortOrder: "DESC",
  })
  const updateDelivery = useUpdateDelivery()
  const rows = useMemo(() => query.data?.data || [], [query.data?.data])
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId),
    [rows, selectedId],
  )
  // A deep link (`?delivery=`) can point at a delivery that is not on the
  // current page or filter. Fetch it by id rather than silently showing
  // nothing; the list row still wins when it is present.
  const offPage = Boolean(selectedId) && !selected
  const detailQuery = useDelivery(offPage ? selectedId : null)
  const active =
    selected ??
    (detailQuery.data?.id === selectedId ? detailQuery.data : undefined)

  // Seed the editable fields once per delivery, for both list clicks and deep
  // links. Without this a deep-linked delivery shows blank assignee/phone/date.
  const [seededId, setSeededId] = useState<string | null>(null)
  useEffect(() => {
    if (!active || seededId === active.id) return
    setSeededId(active.id)
    setAssignee(active.deliveryAssigneeName || "")
    setPhone(active.deliveryAssigneePhone || "")
    setDeliveryDate(active.deliveryDate?.slice(0, 10) || "")
  }, [active, seededId])

  const autoSelected = useRef(false)
  useEffect(() => {
    const requested = searchParams.get("delivery")
    if (requested && rows.some((r) => r.id === requested) && selectedId !== requested) {
      setSelectedId(requested)
      return
    }
    if (autoSelected.current || selectedId || query.isLoading || !rows.length) return
    autoSelected.current = true
    setSelectedId(rows[0].id)
  }, [rows, selectedId, query.isLoading, searchParams])
  const selectStatus = (value: DeliveryStatus | "all") => {
    setStatus(value)
    setPage(1)
  }
  const update = async (
    payload: Parameters<typeof agentDeliveriesApi.update>[1],
  ) => {
    if (!active || !canEdit) return
    if (
      payload.status &&
      ["failed_delivery", "returned"].includes(payload.status) &&
      !reason.trim()
    ) {
      toast.error(t("workspace.deliveries.reasonRequired"))
      return
    }
    try {
      // The mutation invalidates delivery lists/detail and the order lists
      // whose delivery pills mirror this row, so no manual refetch is needed.
      await updateDelivery.mutateAsync({
        id: active.id,
        data: {
          ...payload,
          reason: reason.trim() || undefined,
        },
      })
      setReason("")
      toast.success(t("workspace.deliveries.updated"))
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, t("workspace.deliveries.updateFailed")),
      )
    }
  }
  return (
    <>
      <WorkspaceHeader
        navKey="deliveries"
        title={t("workspace.deliveries.title")}
        description={t("workspace.deliveries.description")}
      />
      <WorkspacePage>
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>{t("workspace.deliveries.search")}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  className="h-9 w-full max-w-md pl-9"
                  value={search}
                  placeholder={t("workspace.deliveries.searchPlaceholder")}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                />
              </div>
            </div>
            {/* Same 8/15/25 page-size control as products and orders; shrinking
                the page invalidates the current offset, so snap back to page 1. */}
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value))
                setPage(1)
              }}
            >
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8">
                  {t("workspace.deliveries.perPage", { count: 8 })}
                </SelectItem>
                <SelectItem value="15">
                  {t("workspace.deliveries.perPage", { count: 15 })}
                </SelectItem>
                <SelectItem value="25">
                  {t("workspace.deliveries.perPage", { count: 25 })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <WorkspaceStatStrip
            ariaLabel={t("workspace.deliveries.status")}
            items={[
              {
                label: t("workspace.deliveries.all"),
                value: query.data?.total ?? 0,
                active: status === "all",
                onClick: () => selectStatus("all"),
              },
              ...statuses.map((value) => ({
                label: t(`workspace.deliveries.state.${value}`),
                value: query.data?.counts?.[value] ?? 0,
                active: status === value,
                onClick: () => selectStatus(value),
              })),
            ]}
          />
        </div>
        <div className={cn("grid gap-6", active ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1")}>
          <div className="divide-y overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            {rows.map((row) => (
              <button
                className={cn(
                  "flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-muted/40 dark:hover:bg-slate-900/60",
                  row.id === selectedId &&
                    "bg-[#F3F1FE] dark:bg-indigo-500/15",
                )}
                key={row.id}
                onClick={() => setSelectedId(row.id)}
              >
                <span>
                  <span className="block font-semibold">{row.orderNumber}</span>
                  <span className="text-sm text-muted-foreground">
                    {row.customer?.fullName ||
                      t("workspace.deliveries.noCustomer")}
                  </span>
                </span>
                <Badge variant="outline">
                  {t(`workspace.deliveries.state.${row.status}`)}
                </Badge>
              </button>
            ))}
            {!rows.length && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {query.isLoading
                  ? t("workspace.deliveries.loading")
                  : t("workspace.deliveries.empty")}
              </div>
            )}
            <div className="flex justify-between p-3">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t("common.previous")}
              </Button>
              <span className="self-center text-sm">
                {page} / {query.data?.totalPages || 1}
              </span>
              <Button
                variant="outline"
                disabled={!query.data?.hasNext}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
          {active && (
            <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {active.orderNumber}
                </p>
                <h2 className="text-xl font-semibold">
                  {t(`workspace.deliveries.state.${active.status}`)}
                </h2>
              </div>
              <div className="space-y-2">
                <Label>{t("workspace.deliveries.assignee")}</Label>
                <Input
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workspace.deliveries.phone")}</Label>
                <Input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workspace.deliveries.date")}</Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workspace.deliveries.reason")}</Label>
                <Textarea
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <Button
                disabled={!canEdit}
                onClick={() =>
                  void update({
                    deliveryAssigneeName: assignee,
                    deliveryAssigneePhone: phone,
                    deliveryDate: deliveryDate || undefined,
                  })
                }
              >
                {t("workspace.deliveries.saveAssignee")}
              </Button>
              <div className="flex flex-wrap gap-2">
                {next[active.status].map((value) => (
                  <Button
                    key={value}
                    variant="outline"
                    disabled={!canEdit}
                    onClick={() => void update({ status: value })}
                  >
                    {t(`workspace.deliveries.state.${value}`)}
                  </Button>
                ))}
              </div>
            </aside>
          )}
        </div>
      </WorkspacePage>
    </>
  )
}