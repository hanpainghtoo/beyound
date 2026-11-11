"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button as UiButton } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection, WorkspaceStatStrip } from "@/components/workspace"
import {
  Search as SearchIcon,
  Edit,
  MessageSquare,
  Tag,
  Users,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Clock3,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { WorkspaceHeader } from "@/components/workspace-header"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  agentCustomersApi,
  agentCustomerTagsApi,
  getApiErrorMessage,
  type AgentChannelDto,
  type AgentConversationDto,
  type AgentCustomerDto,
  type AgentOrderDto,
  type CreateAgentCustomerInput,
  type CustomerTagDto,
  type UpdateAgentCustomerInput,
} from "@/lib/api"
import { customerKeys, useCustomerTags, useCustomerTimeline, useCustomersList } from "@/lib/queries/customers"
import { isChannelConnectionReady } from "@/lib/channel-connection"
import { useSenderAvatar } from "@/components/inbox/use-sender-avatar"
import { useChannelOptions } from "@/lib/queries/channels"
import { useConversationsBulk } from "@/lib/queries/inbox"
import { useOrdersBulk } from "@/lib/queries/orders"

type CustomerRow = {
  id: string
  name: string
  email: string
  phone: string
  location: string
  joinDate: string
  totalConversations: number
  status: "active" | "blocked" | "archived"
  isVip: boolean
  channels: string[]
  avatar?: string | null
  tags: string[]
  notes: string
  totalOrders: number
  totalSpent: string
  lastOrder: string
  preferredChannel: string
  latestConversationId?: string
  /**
   * Derived by the list rather than by `mapCustomer`, which only sees the
   * channel id and not its connection status. Absent means "don't offer chat",
   * so a row built elsewhere fails closed.
   */
  canChat?: boolean
  raw: AgentCustomerDto
}

type CustomerSortKey = "name" | "totalConversations" | "location" | "status"
type CustomerStatusFilter = "all" | CustomerRow["status"] | "vip"

type CustomerEditForm = {
  fullName: string
  email: string
  phone: string
  channelId: string
  city: string
  country: string
  tags: string
  notes: string
  status: CustomerRow["status"]
}

type CustomerCreateForm = {
  fullName: string
  email: string
  phone: string
  channelId: string
  city: string
  country: string
  tags: string
  notes: string
  status: CustomerRow["status"]
}

const defaultCreateForm: CustomerCreateForm = {
  fullName: "",
  email: "",
  phone: "",
  channelId: "",
  city: "",
  country: "",
  tags: "",
  notes: "",
  status: "active",
}

const formatLocation = (location: Record<string, unknown> | null | undefined, t: (key: string, values?: Record<string, string | number>) => string) => {
  if (!location) return t("workspace.customers.notProvided")
  const city = typeof location.city === "string" ? location.city : ""
  const country = typeof location.country === "string" ? location.country : ""
  return [city, country].filter(Boolean).join(", ") || t("workspace.customers.notProvided")
}

const formatDate = (value: string | null | undefined, t: (key: string, values?: Record<string, string | number>) => string) => {
  if (!value) return t("workspace.customers.unknown")
  return new Date(value).toLocaleDateString()
}

const formatDateTime = (value: string | null | undefined, t: (key: string, values?: Record<string, string | number>) => string) => {
  if (!value) return t("workspace.customers.unknown")
  return new Date(value).toLocaleString()
}

const hasVipTag = (tags: string[]) => tags.some((tag) => ["vip", "premium"].includes(tag.toLowerCase()))

const mapCustomer = (
  customer: AgentCustomerDto,
  orders: AgentOrderDto[],
  conversations: AgentConversationDto[],
  channels: AgentChannelDto[] = [],
  t: (key: string, values?: Record<string, string | number>) => string,
): CustomerRow => {
  const customerOrders = orders.filter((order) => order.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const customerConversations = conversations.filter((conversation) => conversation.customerId === customer.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const firstConvChannel = customerConversations[0]?.channel
  const channelFromConv = firstConvChannel?.displayName || firstConvChannel?.channelName
  const channelFromCustomer = customer.channelId ? channels.find((c) => c.id === customer.channelId) : undefined
  const channel = channelFromConv || channelFromCustomer?.displayName || channelFromCustomer?.channelName || t("workspace.customers.notRecorded")
  const currency = customerOrders[0]?.currency || "MMK"

  return {
    id: customer.id,
    name: customer.fullName || t("workspace.customers.customer"),
    email: customer.email || t("workspace.customers.noEmail"),
    phone: customer.phone || t("workspace.customers.noPhone"),
    location: formatLocation(customer.location, t),
    joinDate: formatDate(customer.createdAt, t),
    totalConversations: customerConversations.length || customer.totalConversations,
    status: customer.status,
    isVip: hasVipTag(customer.tags || []),
    channels: Array.from(
      new Set(
        [
          ...customerConversations.map((conversation) => conversation.channel?.displayName || conversation.channel?.channelName).filter((value): value is string => Boolean(value)),
          ...(channelFromCustomer ? [channelFromCustomer.displayName || channelFromCustomer.channelName] : []),
        ].filter(Boolean) as string[],
      ),
    ),
    avatar: customer.avatarUrl,
    tags: customer.tags || [],
    notes: customer.notes || "",
    totalOrders: customerOrders.length,
    totalSpent: `${currency} ${customerOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0).toLocaleString()}`,
    lastOrder: customerOrders[0]?.orderNumber || t("workspace.customers.noOrders"),
    preferredChannel: channel,
    latestConversationId: customerConversations[0]?.id,
    raw: customer,
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "active":
      return "status-pill status-active"
    case "blocked":
      return "status-pill status-blocked"
    case "archived":
      return "status-pill status-archived"
    default:
      return "status-pill status-muted"
  }
}

const createEditForm = (customer: CustomerRow): CustomerEditForm => {
  const location = customer.raw.location || {}
  return {
    fullName: customer.raw.fullName || "",
    email: customer.raw.email || "",
    phone: customer.raw.phone || "",
    channelId: customer.raw.channelId || "",
    city: typeof location.city === "string" ? location.city : "",
    country: typeof location.country === "string" ? location.country : "",
    tags: customer.tags.join(", "),
    notes: customer.notes,
    status: customer.status,
  }
}

const formatEventType = (eventType: string) => eventType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

const NO_CHANNEL_VALUE = "__no_channel__"

export default function CustomersPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "details">("list")
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>("all")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<CustomerSortKey>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null)
  const [editForm, setEditForm] = useState<CustomerEditForm | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CustomerCreateForm>(defaultCreateForm)
  const [isSavingCustomer, setIsSavingCustomer] = useState(false)
  // Manage Tag dialog state — the shared tag vocabulary behind the dialog and
  // the new-customer picker.
  const [manageTagsOpen, setManageTagsOpen] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState("")
  const [tagActionPending, setTagActionPending] = useState(false)
  const selectedCustomerId = selectedCustomer?.id
  // Enrichment context — cached bulk scans shared with the inbox/orders/
  // dashboard consumers (counts, recent orders/conversations for the table
  // and detail pane). Independent of the paginated directory table.
  const ordersBulkQuery = useOrdersBulk()
  const conversationsBulkQuery = useConversationsBulk()
  const orders = useMemo(() => ordersBulkQuery.data ?? [], [ordersBulkQuery.data])
  const conversations = useMemo(() => conversationsBulkQuery.data ?? [], [conversationsBulkQuery.data])
  // Timeline — cached per selected customer (30s staleTime), server-paginated
  // newest-first.
  const [timelinePage, setTimelinePage] = useState(1)
  // Orders/conversations tabs paginate the client-side bulk scan slices.
  const [ordersTab, setOrdersTab] = useState(1)
  const [conversationsTab, setConversationsTab] = useState(1)
  const TAB_PAGE_SIZE = 5
  const timelineQuery = useCustomerTimeline(selectedCustomerId, timelinePage)
  const timeline = timelineQuery.data?.data ?? []
  const timelineTotalPages = timelineQuery.data?.totalPages ?? 1
  const isLoadingTimeline = timelineQuery.isLoading && !timelineQuery.data
  // Channels for the create form — same cached entry as the other selectors.
  const channelsQuery = useChannelOptions()
  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data])
  const tagsQuery = useCustomerTags()
  const tagList = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data])
  const savingCustomerRef = useRef(false)

  // Server only sorts by its whitelist (fullName/status); conversation-count
  // and location sorts fall back to the server default (lastContactAt DESC).
  const serverSortBy = sortKey === "name" ? "fullName" : sortKey === "status" ? "status" : undefined
  // VIP is client-derived (tags), never sent to the server.
  const serverStatus = statusFilter === "all" || statusFilter === "vip" ? undefined : statusFilter

  const listQuery = useCustomersList({
    search: debouncedSearch.trim() || undefined,
    page,
    limit: pageSize,
    sortBy: serverSortBy,
    sortOrder: sortDirection === "asc" ? "ASC" : "DESC",
    status: serverStatus,
  })
  const customerDtos = useMemo(() => listQuery.data?.data ?? [], [listQuery.data])
  const serverTotal = listQuery.data?.total ?? 0
  const serverTotalPages = Math.max(1, listQuery.data?.totalPages ?? 1)
  const isLoading = listQuery.isLoading
  const isFetchingPage = listQuery.isFetching && !listQuery.isLoading

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [searchTerm])

  const customers = useMemo(() => {
    const rows = customerDtos.map((customer) => {
      const row = mapCustomer(customer, orders, conversations, channels, t)
      const channel = channels.find((option) => option.id === customer.channelId)
      // Either half is enough on its own. A customer with an existing thread
      // only needs the button to reach it, and reading history works even while
      // the channel is still being set up. A customer with no thread yet needs a
      // usable channel instead, or the button would open a chat nobody can
      // answer — which is the real hazard, since every channel here sits at
      // `pending_configuration`.
      return {
        ...row,
        canChat: Boolean(row.latestConversationId) || isChannelConnectionReady(channel?.connectionStatus),
      }
    })
    const channelFiltered =
      channelFilter === "all"
        ? rows
        : channelFilter === "none"
          ? rows.filter((row) => !row.raw.channelId)
          : rows.filter((row) => row.raw.channelId === channelFilter)
    if (statusFilter === "vip") return channelFiltered.filter((row) => row.isVip)
    return channelFiltered
  }, [customerDtos, orders, conversations, channels, statusFilter, channelFilter, t])

  const loadFailed = Boolean(listQuery.error && !listQuery.data)
  const lastLoadToastRef = useRef<string | null>(null)

  useEffect(() => {
    if (listQuery.error && !listQuery.data) {
      const message = getApiErrorMessage(listQuery.error, t("workspace.customers.errorLoadCustomers"))
      if (lastLoadToastRef.current !== message) {
        lastLoadToastRef.current = message
        toast.error(message)
      }
    }
    if (listQuery.data) {
      lastLoadToastRef.current = null
    }
  }, [listQuery.error, listQuery.data, t])

  // Task 17: arriving from an order detail card (?customer=<id>) auto-selects
  // that customer so the profile opens without an extra click.
  useEffect(() => {
    const customerId = searchParams.get("customer")
    if (!customerId || selectedCustomer?.id === customerId) return
    const found = customers.find((row) => row.id === customerId)
    if (found) {
      setSelectedCustomer(found)
      setMobileView("details")
      return
    }
    void agentCustomersApi.get(customerId).then((dto) => {
      const row = mapCustomer(dto, orders, conversations, channels, t)
      const channel = channels.find((option) => option.id === dto.channelId)
      setSelectedCustomer({
        ...row,
        canChat: Boolean(row.latestConversationId) || isChannelConnectionReady(channel?.connectionStatus),
      })
      setMobileView("details")
    }).catch(() => {})
  }, [searchParams, customers, selectedCustomer, orders, conversations, channels, t])

  // Keep the detail selection on the current page when possible; otherwise
  // keep showing the previously selected profile instead of jumping.
  useEffect(() => {
    setSelectedCustomer((current) => {
      if (current && customers.some((customer) => customer.id === current.id)) {
        return customers.find((customer) => customer.id === current.id) || current
      }
      return customers[0] || current
    })
  }, [customers])

  // Every per-customer tab starts back at its first page when the detail
  // switches to another customer.
  useEffect(() => {
    setTimelinePage(1)
    setOrdersTab(1)
    setConversationsTab(1)
  }, [selectedCustomerId])

  const recentConversations = useMemo(() => {
    if (!selectedCustomer) return []
    return conversations
      .filter((conversation) => conversation.customerId === selectedCustomer.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.subject || t("workspace.customers.customerConversation"),
        detail: `${conversation.channel?.displayName || conversation.channel?.channelName || t("workspace.customers.channelNotRecorded")} · ${conversation.status.replaceAll("_", " ")}`,
        time: formatDateTime(conversation.lastMessageAt || conversation.updatedAt, t),
      }))
  }, [conversations, selectedCustomer, t])

  const recentOrders = useMemo(() => {
    if (!selectedCustomer) return []
    return orders
      .filter((order) => order.customerId === selectedCustomer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => ({ id: order.orderNumber, status: order.status.replaceAll("_", " "), total: `${order.currency} ${Number(order.totalAmount || 0).toLocaleString()}`, note: t("workspace.customers.created", { date: formatDate(order.createdAt, t) }) }))
  }, [orders, selectedCustomer, t])

  // The tabs page through the full client-side lists (the old slice(0, 5)
  // silently dropped everything past the fifth row).
  const conversationPages = Math.max(1, Math.ceil(recentConversations.length / TAB_PAGE_SIZE))
  const pagedConversations = recentConversations.slice((conversationsTab - 1) * TAB_PAGE_SIZE, conversationsTab * TAB_PAGE_SIZE)
  const orderPages = Math.max(1, Math.ceil(recentOrders.length / TAB_PAGE_SIZE))
  const pagedOrders = recentOrders.slice((ordersTab - 1) * TAB_PAGE_SIZE, ordersTab * TAB_PAGE_SIZE)

  // The directory table is the server page as-is (sort/filter already applied
  // server-side, except VIP which is derived client-side above).
  const paginatedCustomers = customers
  const totalPages = serverTotalPages

  useEffect(() => {
    setPage(1)
  }, [pageSize, statusFilter, channelFilter, sortKey, sortDirection])

  const toggleCustomerSort = (key: CustomerSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDirection(key === "totalConversations" ? "desc" : "asc")
  }

  const openEditCustomer = (customer: CustomerRow) => {
    setEditingCustomer(customer)
    setEditForm(createEditForm(customer))
  }

  // ---- Manage Tag dialog actions ------------------------------------------
  const invalidateTags = () => queryClient.invalidateQueries({ queryKey: customerKeys.tags })

  const addTag = async () => {
    const name = newTagName.trim()
    if (!name || tagActionPending) return
    setTagActionPending(true)
    try {
      await agentCustomerTagsApi.create(name)
      setNewTagName("")
      await invalidateTags()
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.customers.tagCreateFailed")))
    } finally {
      setTagActionPending(false)
    }
  }

  const renameTag = async (tag: CustomerTagDto) => {
    const name = tagDraft.trim()
    if (!name || tagActionPending) return
    setTagActionPending(true)
    try {
      await agentCustomerTagsApi.rename(tag.id, name)
      setEditingTagId(null)
      await invalidateTags()
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.customers.tagUpdateFailed")))
    } finally {
      setTagActionPending(false)
    }
  }

  const deleteTag = async (tag: CustomerTagDto) => {
    if (tagActionPending) return
    setTagActionPending(true)
    try {
      await agentCustomerTagsApi.remove(tag.id)
      await invalidateTags()
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.customers.tagDeleteFailed")))
    } finally {
      setTagActionPending(false)
    }
  }

  // The create form keeps `tags` as a comma-joined string (its payload
  // mapping predates the picker); chips toggle names in and out of it.
  const toggleCreateTag = (name: string) => {
    setCreateForm((current) => {
      const selected = current.tags.split(",").map((value) => value.trim()).filter(Boolean)
      const next = selected.includes(name)
        ? selected.filter((value) => value !== name)
        : [...selected, name]
      return { ...current, tags: next.join(", ") }
    })
  }

  const createCustomer = async () => {
    if (savingCustomerRef.current) return
    savingCustomerRef.current = true
    setIsSavingCustomer(true)
    try {
      const payload: CreateAgentCustomerInput = {
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        ...(createForm.channelId ? { channelId: createForm.channelId } : {}),
        city: createForm.city.trim() || undefined,
        country: createForm.country.trim() || undefined,
        tags: createForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: createForm.notes.trim() || undefined,
        status: createForm.status,
      }
      const created = await agentCustomersApi.create(payload)
      setIsCreateOpen(false)
      setCreateForm(defaultCreateForm)
      toast.success(t("workspace.customers.toastCustomerCreated"))
      setPage(1)
      await queryClient.invalidateQueries({ queryKey: customerKeys.all })
      const createdCustomer = mapCustomer(created, orders, conversations, channels, t)
      setSelectedCustomer(createdCustomer)
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.customers.errorCreateCustomer")))
    } finally {
      savingCustomerRef.current = false
      setIsSavingCustomer(false)
    }
  }

  const saveCustomer = async () => {
    if (!editingCustomer || !editForm || savingCustomerRef.current) return
    savingCustomerRef.current = true
    setIsSavingCustomer(true)
    try {
      const location = editForm.city.trim() || editForm.country.trim()
        ? { city: editForm.city.trim(), country: editForm.country.trim() }
        : null
      // Send the channel only when changed: empty string clears it (null),
      // a value reassigns it, untouched stays omitted.
      const originalChannelId = editingCustomer.raw.channelId || ""
      const payload: UpdateAgentCustomerInput = {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        ...(editForm.channelId !== originalChannelId ? { channelId: editForm.channelId || null } : {}),
        location,
        tags: editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: editForm.notes,
        status: editForm.status,
      }
      await agentCustomersApi.update(editingCustomer.id, payload)
      setEditingCustomer(null)
      setEditForm(null)
      toast.success(t("workspace.customers.toastProfileSaved"))
      await queryClient.invalidateQueries({ queryKey: customerKeys.all })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.customers.errorSaveCustomer")))
    } finally {
      savingCustomerRef.current = false
      setIsSavingCustomer(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.customers.eyebrow")}
        title={t("workspace.customers.title")}
        description={t("workspace.customers.description")}
        actions={
          <div className="flex items-center gap-2">
            <UiButton variant="outline" onClick={() => setManageTagsOpen(true)}>
              <Tag className="mr-2 h-4 w-4" />
              {t("workspace.customers.manageTags")}
            </UiButton>
            <UiButton onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("workspace.customers.addCustomer")}
            </UiButton>
          </div>
        }
      />

      <WorkspacePage containerClassName="max-w-[1500px]">
        <WorkspaceStatStrip
          ariaLabel={t("workspace.customers.summaryAriaLabel")}
          items={[
            { label: t("workspace.customers.all"), value: serverTotal, active: statusFilter === "all", onClick: () => setStatusFilter("all") },
            { label: t("workspace.customers.active"), value: customers.filter((customer) => customer.status === "active").length, active: statusFilter === "active", onClick: () => setStatusFilter("active") },
            { label: t("workspace.customers.vip"), value: customers.filter((customer) => customer.isVip).length, active: statusFilter === "vip", onClick: () => setStatusFilter("vip") },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
          <WorkspaceSection className={`${mobileView === "list" ? "block" : "hidden"} lg:block`} title={t("workspace.customers.directoryTitle")} description={t("workspace.customers.directoryDescription")} contentClassName="space-y-4">
            {loadFailed ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                <span className="flex-1">{t("workspace.customers.loadFailed")}</span>
                <UiButton variant="outline" size="sm" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>{t("workspace.customers.retry")}</UiButton>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full flex-none sm:flex-1">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  placeholder={t("workspace.customers.searchPlaceholder")}
                  className="pl-10"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CustomerStatusFilter)}>
                <SelectTrigger className="flex-1 sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("workspace.customers.allCustomers")}</SelectItem>
                  <SelectItem value="active">{t("workspace.customers.active")}</SelectItem>
                  <SelectItem value="blocked">{t("workspace.customers.blocked")}</SelectItem>
                  <SelectItem value="archived">{t("workspace.customers.archived")}</SelectItem>
                  <SelectItem value="vip">{t("workspace.customers.vipTagged")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={channelFilter} onValueChange={setChannelFilter} disabled={channelsQuery.isLoading && !channelsQuery.data}>
                <SelectTrigger className="flex-1 sm:w-[170px]">
                  <SelectValue placeholder={channelsQuery.isLoading && !channelsQuery.data ? t("workspace.customers.loading") : t("workspace.customers.channel")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("workspace.customers.allChannels")}</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.displayName || channel.channelName}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">{t("workspace.customers.noChannel")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="flex-1 sm:w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">{t("workspace.customers.perPage", { count: 8 })}</SelectItem>
                  <SelectItem value="15">{t("workspace.customers.perPage", { count: 15 })}</SelectItem>
                  <SelectItem value="25">{t("workspace.customers.perPage", { count: 25 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-[620px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 max-lg:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableCustomerHead label={t("workspace.customers.customer")} active={sortKey === "name"} direction={sortKey === "name" ? sortDirection : undefined} onClick={() => toggleCustomerSort("name")} />
                  <TableHead>{t("workspace.customers.contact")}</TableHead>
                  <TableHead>{t("workspace.customers.channel")}</TableHead>
                  <SortableCustomerHead label={t("workspace.customers.conversations")} active={sortKey === "totalConversations"} direction={sortKey === "totalConversations" ? sortDirection : undefined} onClick={() => toggleCustomerSort("totalConversations")} />
                  <SortableCustomerHead label={t("workspace.customers.location")} active={sortKey === "location"} direction={sortKey === "location" ? sortDirection : undefined} onClick={() => toggleCustomerSort("location")} />
                  <SortableCustomerHead label={t("workspace.customers.status")} active={sortKey === "status"} direction={sortKey === "status" ? sortDirection : undefined} onClick={() => toggleCustomerSort("status")} />
                  <TableHead>{t("workspace.customers.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      {t("workspace.customers.loadingCustomers")}
                    </TableCell>
                  </TableRow>
                ) : loadFailed && paginatedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      {t("workspace.customers.customersUnavailable")}
                    </TableCell>
                  </TableRow>
                ) : paginatedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      {serverTotal === 0 ? t("workspace.customers.noCustomersFound") : t("workspace.customers.noCustomersMatchFilter")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCustomers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className={`cursor-pointer transition-colors ${selectedCustomer?.id === customer.id ? "bg-indigo-50/80 shadow-[inset_3px_0_0_#4f46e5] dark:bg-indigo-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-900/80"}`}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <CustomerAvatar customer={customer} className="h-8 w-8" />
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {customer.isVip ? <Badge className="status-pill status-premium" variant="secondary">{t("workspace.customers.vip")}</Badge> : null}
                              <Badge className={getStatusColor(customer.status)}>{customer.status}</Badge>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm">{customer.email}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{customer.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-200">{customer.preferredChannel}</Badge></TableCell>
                      <TableCell>{customer.totalConversations}</TableCell>
                      <TableCell>{customer.location}</TableCell>
                      <TableCell><Badge className={getStatusColor(customer.status)}>{customer.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {customer.canChat ? (
                            <UiButton asChild variant="ghost" size="icon" aria-label={t("workspace.customers.messageCustomer", { name: customer.name })} onClick={(event) => event.stopPropagation()}>
                              <Link href={customer.latestConversationId ? `/workspace/inbox?conversation=${customer.latestConversationId}` : `/workspace/inbox?customer=${customer.id}`}>
                                <MessageSquare className="h-4 w-4" />
                              </Link>
                            </UiButton>
                          ) : null}
                          <UiButton variant="ghost" size="icon" aria-label={t("workspace.customers.editCustomer", { name: customer.name })} onClick={(event) => { event.stopPropagation(); openEditCustomer(customer) }}><Edit className="h-4 w-4" /></UiButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            <div className="space-y-3 lg:hidden">
              {paginatedCustomers.map((customer) => (
                <button key={customer.id} type="button" onClick={() => { setSelectedCustomer(customer); setMobileView("details") }} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950 dark:text-slate-50">{customer.name}</p><p className="mt-1 truncate text-sm text-slate-500">{customer.phone || t("workspace.customers.noPhone")}</p><Badge variant="secondary" className="mt-2 dark:bg-slate-800 dark:text-slate-200">{customer.preferredChannel}</Badge></div><Badge className={getStatusColor(customer.status)}>{customer.status}</Badge></div>
                  <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{t("workspace.customers.ordersCount", { count: customer.totalOrders })}</span><span>{t("workspace.customers.conversationsCount", { count: customer.totalConversations })}</span></div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span>{serverTotal === 0 ? t("workspace.customers.noCustomers") : t("workspace.customers.showingRange", { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, serverTotal), total: serverTotal })}{isFetchingPage ? t("workspace.customers.updating") : ""}</span>
              <div className="flex items-center gap-2">
                <UiButton variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || listQuery.isFetching}><ChevronLeft className="h-4 w-4" />{t("workspace.customers.previous")}</UiButton>
                <span className="text-xs font-medium">{t("workspace.customers.pageOf", { page, total: totalPages })}</span>
                <UiButton variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages || listQuery.isFetching}>{t("workspace.customers.next")}<ChevronRight className="h-4 w-4" /></UiButton>
              </div>
            </div>
          </WorkspaceSection>

          {/* No section title/description by design — the detail pane opens
              under the page-level header, and the customer's identity lives in
              the avatar card right below. */}
          <WorkspaceSection className={`${mobileView === "details" ? "block" : "hidden"} lg:block`} action={<UiButton variant="ghost" size="sm" className="lg:hidden" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />{t("workspace.customers.backToCustomers")}</UiButton>}>
            {selectedCustomer ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center gap-4">
                    <CustomerAvatar customer={selectedCustomer} className="h-16 w-16" fallbackClassName="text-lg" />
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{selectedCustomer.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedCustomer.isVip ? <Badge className="status-pill status-premium" variant="secondary">{t("workspace.customers.vipCustomer")}</Badge> : null}
                        <Badge className={getStatusColor(selectedCustomer.status)}>{selectedCustomer.status}</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <Tabs defaultValue="profile" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="profile">{t("workspace.customers.profile")}</TabsTrigger>
                    <TabsTrigger value="orders">{t("workspace.customers.orders")}</TabsTrigger>
                    <TabsTrigger value="conversations">{t("workspace.customers.conversations")}</TabsTrigger>
                    {(isLoadingTimeline || timeline.length > 0) ? <TabsTrigger value="activity">{t("workspace.customers.activity")}</TabsTrigger> : null}
                  </TabsList>
                  <TabsContent value="profile">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <h4 className="font-semibold text-slate-950 dark:text-slate-50">{t("workspace.customers.profileDetails")}</h4>
                      <div className="mt-4 space-y-3">
                        <InfoRow icon={Mail} value={selectedCustomer.email} />
                        <InfoRow icon={Phone} value={selectedCustomer.phone} />
                        <InfoRow icon={MapPin} value={selectedCustomer.location} />
                        <InfoRow icon={Calendar} value={t("workspace.customers.joined", { date: selectedCustomer.joinDate })} />
                      </div>
                      <div className="mt-4">
                        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("workspace.customers.tags")}</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedCustomer.tags.length === 0 ? (
                            <span className="text-sm text-slate-500 dark:text-slate-400">{t("workspace.customers.noTags")}</span>
                          ) : (
                            selectedCustomer.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="dark:bg-slate-800 dark:text-slate-200">
                                <Tag className="mr-1 h-3 w-3" />
                                {tag}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                      {selectedCustomer.notes ? (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                          {selectedCustomer.notes}
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>
                  <TabsContent value="orders">
                    <DetailList title={t("workspace.customers.orders")}>
                      {recentOrders.length === 0 ? (
                        <EmptyDetail message={t("workspace.customers.noOrdersRecorded")} />
                      ) : pagedOrders.map((order) => (
                        <div key={order.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{order.id}</p>
                            <Badge variant="outline">{order.status}</Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                            <span>{order.note}</span>
                            <strong>{order.total}</strong>
                          </div>
                        </div>
                      ))}
                      {recentOrders.length > 0 ? (
                        <ListPager page={ordersTab} totalPages={orderPages} onPrev={() => setOrdersTab((current) => Math.max(1, current - 1))} onNext={() => setOrdersTab((current) => Math.min(orderPages, current + 1))} />
                      ) : null}
                    </DetailList>
                  </TabsContent>
                  <TabsContent value="conversations">
                    <DetailList title={t("workspace.customers.recentConversations")}>
                      {recentConversations.length === 0 ? (
                        <EmptyDetail message={t("workspace.customers.noConversationsRecorded")} />
                      ) : pagedConversations.map((item) => (
                        <Link key={item.id} href={`/workspace/inbox?conversation=${item.id}`} className="block rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/70 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{item.time}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p>
                        </Link>
                      ))}
                      {recentConversations.length > 0 ? (
                        <ListPager page={conversationsTab} totalPages={conversationPages} onPrev={() => setConversationsTab((current) => Math.max(1, current - 1))} onNext={() => setConversationsTab((current) => Math.min(conversationPages, current + 1))} />
                      ) : null}
                    </DetailList>
                  </TabsContent>
                  {(isLoadingTimeline || timeline.length > 0 || timelineTotalPages > 1) ? (
                    <TabsContent value="activity">
                      <DetailList title={t("workspace.customers.activity")}>
                        {isLoadingTimeline ? (
                          <EmptyDetail message={t("workspace.customers.loadingActivity")} />
                        ) : (
                          <>
                            {timeline.map((event) => (
                              <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEventType(event.eventType)}</p>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.createdAt, t)}</span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.source || event.entityType}</p>
                              </div>
                            ))}
                            {/* Server-paged newest-first; paging past a shrinking
                                timeline lands on an empty page with the pager
                                still reachable to step back. */}
                            <ListPager page={timelinePage} totalPages={timelineTotalPages} onPrev={() => setTimelinePage((current) => Math.max(1, current - 1))} onNext={() => setTimelinePage((current) => Math.min(timelineTotalPages, current + 1))} />
                          </>
                        )}
                      </DetailList>
                    </TabsContent>
                  ) : null}
                </Tabs>
              </div>
            ) : (
              <WorkspaceEmptyState icon={Users} title={t("workspace.customers.emptyStateTitle")} description={t("workspace.customers.emptyStateDescription")} />
            )}
          </WorkspaceSection>
        </div>

        <Dialog open={Boolean(editingCustomer)} onOpenChange={(open) => !open && setEditingCustomer(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("workspace.customers.editTitle")}</DialogTitle>
              <DialogDescription>{t("workspace.customers.editDescription")}</DialogDescription>
            </DialogHeader>
            {editForm ? (
              <div className="grid gap-4 py-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("workspace.customers.name")}><Input value={editForm.fullName} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} /></Field>
                  <Field label={t("workspace.customers.status")}>
                    <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value as CustomerRow["status"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("workspace.customers.active")}</SelectItem>
                        <SelectItem value="blocked">{t("workspace.customers.blocked")}</SelectItem>
                        <SelectItem value="archived">{t("workspace.customers.archived")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("workspace.customers.email")}><Input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></Field>
                  <Field label={t("workspace.customers.phone")}><Input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></Field>
                  <Field label={t("workspace.customers.channelOptional")}>
                    <Select value={editForm.channelId || NO_CHANNEL_VALUE} onValueChange={(value) => setEditForm({ ...editForm, channelId: value === NO_CHANNEL_VALUE ? "" : value })} disabled={channelsQuery.isLoading && !channelsQuery.data}>
                      <SelectTrigger><SelectValue placeholder={channelsQuery.isLoading && !channelsQuery.data ? t("workspace.customers.loading") : t("workspace.customers.selectChannel")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CHANNEL_VALUE}>{t("workspace.customers.noChannel")}</SelectItem>
                        {channels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id}>
                            {channel.displayName || channel.channelName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("workspace.customers.city")}><Input value={editForm.city} onChange={(event) => setEditForm({ ...editForm, city: event.target.value })} /></Field>
                  <Field label={t("workspace.customers.country")}><Input value={editForm.country} onChange={(event) => setEditForm({ ...editForm, country: event.target.value })} /></Field>
                </div>
                <Field label={t("workspace.customers.tags")}><Input value={editForm.tags} onChange={(event) => setEditForm({ ...editForm, tags: event.target.value })} placeholder={t("workspace.customers.tagsPlaceholder")} /></Field>
                <Field label={t("workspace.customers.notes")}><Textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} rows={4} /></Field>
                <div className="flex justify-end gap-2">
                  <UiButton variant="outline" onClick={() => setEditingCustomer(null)}>{t("workspace.customers.cancel")}</UiButton>
                  <UiButton onClick={saveCustomer} disabled={isSavingCustomer}>{isSavingCustomer ? t("workspace.customers.saving") : t("workspace.customers.saveChanges")}</UiButton>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={manageTagsOpen} onOpenChange={(open) => { setManageTagsOpen(open); if (!open) setEditingTagId(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("workspace.customers.manageTagsTitle")}</DialogTitle>
              <DialogDescription>{t("workspace.customers.manageTagsDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void addTag() }}>
                <Input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} placeholder={t("workspace.customers.newTagPlaceholder")} maxLength={60} />
                <UiButton type="submit" disabled={!newTagName.trim() || tagActionPending}>{t("workspace.customers.addTag")}</UiButton>
              </form>
              {tagsQuery.isLoading && !tagsQuery.data ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("workspace.customers.loading")}</p>
              ) : tagList.length === 0 ? (
                <EmptyDetail message={t("workspace.customers.noTags")} />
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {tagList.map((tag) => editingTagId === tag.id ? (
                    <div key={tag.id} className="flex gap-2">
                      <Input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} maxLength={60} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void renameTag(tag) } }} autoFocus />
                      <UiButton size="sm" onClick={() => void renameTag(tag)} disabled={!tagDraft.trim() || tagActionPending}>{t("workspace.customers.saveChanges")}</UiButton>
                      <UiButton size="sm" variant="outline" onClick={() => setEditingTagId(null)}>{t("workspace.customers.cancel")}</UiButton>
                    </div>
                  ) : (
                    <div key={tag.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{tag.name}</span>
                      <div className="flex shrink-0 gap-1">
                        <UiButton variant="ghost" size="icon" aria-label={t("workspace.customers.renameTag", { name: tag.name })} onClick={() => { setEditingTagId(tag.id); setTagDraft(tag.name) }}><Edit className="h-4 w-4" /></UiButton>
                        <UiButton variant="ghost" size="icon" aria-label={t("workspace.customers.deleteTag", { name: tag.name })} onClick={() => void deleteTag(tag)}><Trash2 className="h-4 w-4" /></UiButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </WorkspacePage>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("workspace.customers.createTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.customers.createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label={t("workspace.customers.fullName")}>
              <Input value={createForm.fullName} onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))} />
            </Field>
            <Field label={t("workspace.customers.channelOptional")}>
              <Select value={createForm.channelId || NO_CHANNEL_VALUE} onValueChange={(value) => setCreateForm((current) => ({ ...current, channelId: value === NO_CHANNEL_VALUE ? "" : value }))} disabled={channelsQuery.isLoading && !channelsQuery.data}>
                <SelectTrigger><SelectValue placeholder={channelsQuery.isLoading && !channelsQuery.data ? t("workspace.customers.loading") : t("workspace.customers.selectChannel")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHANNEL_VALUE}>{t("workspace.customers.noChannel")}</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.displayName || channel.channelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("workspace.customers.email")}>
              <Input type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} />
            </Field>
            <Field label={t("workspace.customers.phone")}>
              <Input value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} />
            </Field>
            <Field label={t("workspace.customers.city")}>
              <Input value={createForm.city} onChange={(event) => setCreateForm((current) => ({ ...current, city: event.target.value }))} />
            </Field>
            <Field label={t("workspace.customers.country")}>
              <Input value={createForm.country} onChange={(event) => setCreateForm((current) => ({ ...current, country: event.target.value }))} />
            </Field>
            <Field label={t("workspace.customers.status")}>
              <Select value={createForm.status} onValueChange={(value) => setCreateForm((current) => ({ ...current, status: value as CustomerRow["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("workspace.customers.active")}</SelectItem>
                  <SelectItem value="blocked">{t("workspace.customers.blocked")}</SelectItem>
                  <SelectItem value="archived">{t("workspace.customers.archived")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("workspace.customers.tags")}>
                {tagsQuery.isLoading && !tagsQuery.data ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t("workspace.customers.loading")}</p>
                ) : tagList.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t("workspace.customers.noTagsYet")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tagList.map((tag) => {
                      const selected = createForm.tags.split(",").map((value) => value.trim()).includes(tag.name)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleCreateTag(tag.name)}
                          aria-pressed={selected}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${selected ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"}`}
                        >
                          <Tag className="h-3 w-3" />
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("workspace.customers.notes")}>
                <Textarea value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <UiButton variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isSavingCustomer}>{t("workspace.customers.cancel")}</UiButton>
            <UiButton onClick={() => void createCustomer()} disabled={isSavingCustomer || !createForm.fullName.trim()}>
              {isSavingCustomer ? t("workspace.customers.saving") : t("workspace.customers.createCustomer")}
            </UiButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CustomerAvatar({
  customer,
  className,
  fallbackClassName,
}: {
  customer: CustomerRow
  className?: string
  fallbackClassName?: string
}) {
  const { data: senderAvatarUrl } = useSenderAvatar(
    customer.latestConversationId || "",
    Boolean(customer.latestConversationId),
  )
  const src = senderAvatarUrl ?? customer.avatar
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} /> : null}
      <AvatarFallback className={fallbackClassName}>
        {customer.name.split(" ").map((n) => n[0]).join("")}
      </AvatarFallback>
    </Avatar>
  )
}

function SortableCustomerHead({ label, active, direction, onClick }: { label: string; active: boolean; direction?: "asc" | "desc"; onClick: () => void }) {
  return (
    <TableHead>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 font-medium ${active ? "text-indigo-700 dark:text-indigo-200" : ""}`}>
        {label}
        {/* Show an up arrow for ascending and a down arrow for descending. */}
        {direction === "desc" ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>
    </TableHead>
  )
}

function InfoRow({ icon: Icon, value }: { icon: typeof Mail; value: string }) {
  return (
    <div className="flex items-center space-x-2">
      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      <span className="text-sm">{value}</span>
    </div>
  )
}

function DetailList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <h4 className="font-semibold text-slate-950 dark:text-slate-50">{title}</h4>
      {/* Scroll cap so a long tab never pushes the pager below the fold. */}
      <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">{children}</div>
    </div>
  )
}

/** Compact prev/next pager shared by the customer-detail tab lists. */
function ListPager({ page, totalPages, onPrev, onNext }: { page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-1">
      <UiButton variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></UiButton>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{page} / {totalPages}</span>
      <UiButton variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></UiButton>
    </div>
  )
}

function EmptyDetail({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
      <Clock3 className="h-4 w-4" />
      {message}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
