"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection, WorkspaceStatCard } from "@/components/workspace"
import {
  Search as SearchIcon,
  Eye,
  Edit,
  MessageSquare,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Tag,
  Users,
  TrendingUp,
  ShoppingBag,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Clock3,
  Plus,
} from "lucide-react"
import { WorkspaceHeader } from "@/components/workspace-header"
import {
  csrConversationsApi,
  csrCustomersApi,
  csrOrdersApi,
  getApiErrorMessage,
  tenantChannelsApi,
  type CsrConversationDto,
  type CsrChannelDto,
  type CsrCustomerDto,
  type CsrOrderDto,
  type CsrTimelineEventDto,
  type CreateCsrCustomerInput,
  type UpdateCsrCustomerInput,
} from "@/lib/api"

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
  raw: CsrCustomerDto
}

type CustomerSortKey = "name" | "totalConversations" | "location" | "status"
type CustomerStatusFilter = "all" | CustomerRow["status"] | "vip"

type CustomerEditForm = {
  fullName: string
  email: string
  phone: string
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

const formatLocation = (location?: Record<string, unknown> | null) => {
  if (!location) return "Not provided"
  const city = typeof location.city === "string" ? location.city : ""
  const country = typeof location.country === "string" ? location.country : ""
  return [city, country].filter(Boolean).join(", ") || "Not provided"
}

const formatDate = (value?: string | null) => {
  if (!value) return "Unknown"
  return new Date(value).toLocaleDateString()
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "Unknown"
  return new Date(value).toLocaleString()
}

const hasVipTag = (tags: string[]) => tags.some((tag) => ["vip", "premium"].includes(tag.toLowerCase()))

const mapCustomer = (
  customer: CsrCustomerDto,
  orders: CsrOrderDto[],
  conversations: CsrConversationDto[],
  channels: CsrChannelDto[] = [],
): CustomerRow => {
  const customerOrders = orders.filter((order) => order.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const customerConversations = conversations.filter((conversation) => conversation.customerId === customer.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const firstConvChannel = customerConversations[0]?.channel
  const channelFromConv = firstConvChannel?.displayName || firstConvChannel?.channelName
  const channelFromCustomer = customer.channelId ? channels.find((c) => c.id === customer.channelId) : undefined
  const channel = channelFromConv || channelFromCustomer?.displayName || channelFromCustomer?.channelName || "Not recorded"
  const currency = customerOrders[0]?.currency || "MMK"

  return {
    id: customer.id,
    name: customer.fullName || "Customer",
    email: customer.email || "No email",
    phone: customer.phone || "No phone",
    location: formatLocation(customer.location),
    joinDate: formatDate(customer.createdAt),
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
    lastOrder: customerOrders[0]?.orderNumber || "No orders yet",
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
    city: typeof location.city === "string" ? location.city : "",
    country: typeof location.country === "string" ? location.country : "",
    tags: customer.tags.join(", "),
    notes: customer.notes,
    status: customer.status,
  }
}

const formatEventType = (eventType: string) => eventType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "details">("list")
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>("all")
  const [sortKey, setSortKey] = useState<CustomerSortKey>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [orders, setOrders] = useState<CsrOrderDto[]>([])
  const [conversations, setConversations] = useState<CsrConversationDto[]>([])
  const [timeline, setTimeline] = useState<CsrTimelineEventDto[]>([])
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null)
  const [editForm, setEditForm] = useState<CustomerEditForm | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CustomerCreateForm>(defaultCreateForm)
  const [isSavingCustomer, setIsSavingCustomer] = useState(false)
  const [channels, setChannels] = useState<CsrChannelDto[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const selectedCustomerId = selectedCustomer?.id
  const loadRequestRef = useRef(0)
  const savingCustomerRef = useRef(false)

  const loadCustomers = async (search?: string) => {
    const requestId = ++loadRequestRef.current
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const [customerDtos, orderDtos, conversationDtos] = await Promise.all([
        csrCustomersApi.list(search),
        csrOrdersApi.list(),
        csrConversationsApi.list({ filter: "all" }),
      ])
      if (requestId !== loadRequestRef.current) return
      setOrders(orderDtos)
      setConversations(conversationDtos)
      const mappedCustomers = customerDtos.map((customer) => mapCustomer(customer, orderDtos, conversationDtos, channels))
      setCustomers(mappedCustomers)
      setSelectedCustomer((current) => {
        if (current && mappedCustomers.some((customer) => customer.id === current.id)) return mappedCustomers.find((customer) => customer.id === current.id) || current
        return mappedCustomers[0] || null
      })
    } catch (error) {
      if (requestId !== loadRequestRef.current) return
      setErrorMessage(getApiErrorMessage(error, "Failed to load customers"))
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false)
    }
  }

  const loadTimeline = async (customerId: string) => {
    setIsLoadingTimeline(true)
    try {
      const events = await csrCustomersApi.timeline(customerId)
      setTimeline(events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    } catch {
      setTimeline([])
    } finally {
      setIsLoadingTimeline(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadCustomers()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    tenantChannelsApi.list().then(setChannels).catch(() => setChannels([]))
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadCustomers(searchTerm)
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [searchTerm])

  useEffect(() => {
    if (!selectedCustomerId) {
      setTimeline([])
      return
    }
    loadTimeline(selectedCustomerId)
  }, [selectedCustomerId])

  const recentConversations = useMemo(() => {
    if (!selectedCustomer) return []
    return conversations
      .filter((conversation) => conversation.customerId === selectedCustomer.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.subject || "Customer conversation",
        detail: `${conversation.channel?.displayName || conversation.channel?.channelName || "Channel not recorded"} · ${conversation.status.replaceAll("_", " ")}`,
        time: formatDateTime(conversation.lastMessageAt || conversation.updatedAt),
      }))
  }, [conversations, selectedCustomer])

  const recentOrders = useMemo(() => {
    if (!selectedCustomer) return []
    return orders
      .filter((order) => order.customerId === selectedCustomer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((order) => ({ id: order.orderNumber, status: order.status.replaceAll("_", " "), total: `${order.currency} ${Number(order.totalAmount || 0).toLocaleString()}`, note: `Created ${formatDate(order.createdAt)}` }))
  }, [orders, selectedCustomer])

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      if (statusFilter === "all") return true
      if (statusFilter === "vip") return customer.isVip
      return customer.status === statusFilter
    })
  }, [customers, statusFilter])

  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((first, second) => {
      const firstValue = first[sortKey]
      const secondValue = second[sortKey]
      if (firstValue < secondValue) return sortDirection === "asc" ? -1 : 1
      if (firstValue > secondValue) return sortDirection === "asc" ? 1 : -1
      return 0
    })
  }, [filteredCustomers, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / pageSize))
  const paginatedCustomers = sortedCustomers.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, pageSize, statusFilter])

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

  const createCustomer = async () => {
    if (savingCustomerRef.current) return
    savingCustomerRef.current = true
    setIsSavingCustomer(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const payload: CreateCsrCustomerInput = {
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        channelId: createForm.channelId,
        city: createForm.city.trim() || undefined,
        country: createForm.country.trim() || undefined,
        tags: createForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: createForm.notes.trim() || undefined,
        status: createForm.status,
      }
      const created = await csrCustomersApi.create(payload)
      setIsCreateOpen(false)
      setCreateForm(defaultCreateForm)
      setSuccessMessage("Customer created.")
      await loadCustomers(searchTerm)
      const createdCustomer = mapCustomer(created, orders, conversations, channels)
      setSelectedCustomer(createdCustomer)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to create customer"))
    } finally {
      savingCustomerRef.current = false
      setIsSavingCustomer(false)
    }
  }

  const saveCustomer = async () => {
    if (!editingCustomer || !editForm || savingCustomerRef.current) return
    savingCustomerRef.current = true
    setIsSavingCustomer(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const location = editForm.city.trim() || editForm.country.trim()
        ? { city: editForm.city.trim(), country: editForm.country.trim() }
        : null
      const payload: UpdateCsrCustomerInput = {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        location,
        tags: editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: editForm.notes,
        status: editForm.status,
      }
      await csrCustomersApi.update(editingCustomer.id, payload)
      setEditingCustomer(null)
      setEditForm(null)
      setSuccessMessage("Customer profile saved.")
      await loadCustomers(searchTerm)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to save customer"))
    } finally {
      savingCustomerRef.current = false
      setIsSavingCustomer(false)
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Customers"
        title="Customers"
        description="View customer profiles, commerce context, recent conversations, and order history."
        actions={
          <UiButton onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add customer
          </UiButton>
        }
      />

      <WorkspacePage containerClassName="max-w-[1500px]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <WorkspaceStatCard label="Total Customers" value={customers.length} note={`${customers.length} profiles in the workspace`} icon={Users} tone="indigo" />
          <WorkspaceStatCard label="Active Customers" value={customers.filter((customer) => customer.status === "active").length} note="Customers ready for follow-up" icon={TrendingUp} tone="emerald" />
          <WorkspaceStatCard label="VIP Customers" value={customers.filter((customer) => customer.isVip).length} note="Profiles tagged VIP or premium" icon={Tag} tone="violet" />
          <WorkspaceStatCard label="Conversations" value={customers.reduce((sum, customer) => sum + customer.totalConversations, 0)} note="Linked conversation records" icon={MessageSquare} tone="blue" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
          <WorkspaceSection className={`${mobileView === "list" ? "block" : "hidden"} lg:block`} title="Customer Directory" description="Browse and search customer profiles with commerce context." contentClassName="space-y-4">
            {errorMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                <AlertCircle className="h-4 w-4" />
                {errorMessage}
              </div>
            ) : null}
            {successMessage ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                {successMessage}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full flex-none sm:flex-1">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  placeholder="Search customers..."
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
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="vip">VIP tagged</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="flex-1 sm:w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 / page</SelectItem>
                  <SelectItem value="15">15 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-[620px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 max-lg:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableCustomerHead label="Customer" active={sortKey === "name"} direction={sortKey === "name" ? sortDirection : undefined} onClick={() => toggleCustomerSort("name")} />
                  <TableHead>Contact</TableHead>
                  <SortableCustomerHead label="Conversations" active={sortKey === "totalConversations"} direction={sortKey === "totalConversations" ? sortDirection : undefined} onClick={() => toggleCustomerSort("totalConversations")} />
                  <SortableCustomerHead label="Location" active={sortKey === "location"} direction={sortKey === "location" ? sortDirection : undefined} onClick={() => toggleCustomerSort("location")} />
                  <SortableCustomerHead label="Status" active={sortKey === "status"} direction={sortKey === "status" ? sortDirection : undefined} onClick={() => toggleCustomerSort("status")} />
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Loading customers...
                    </TableCell>
                  </TableRow>
                ) : errorMessage ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Customers are unavailable right now.
                    </TableCell>
                  </TableRow>
                ) : sortedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      {customers.length === 0 ? "No customers found" : "No customers match this filter"}
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
                          <Avatar className="h-8 w-8">
                            {customer.avatar ? <AvatarImage src={customer.avatar} /> : null}
                            <AvatarFallback>
                              {customer.name.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {customer.isVip ? <Badge className="status-pill status-premium" variant="secondary">VIP</Badge> : null}
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
                      <TableCell>{customer.totalConversations}</TableCell>
                      <TableCell>{customer.location}</TableCell>
                      <TableCell><Badge className={getStatusColor(customer.status)}>{customer.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <UiButton variant="ghost" size="icon" aria-label={`View ${customer.name}`} onClick={(event) => { event.stopPropagation(); setSelectedCustomer(customer) }}><Eye className="h-4 w-4" /></UiButton>
                          <UiButton asChild variant="ghost" size="icon" aria-label={`Message ${customer.name}`} onClick={(event) => event.stopPropagation()}>
                            <Link href={customer.latestConversationId ? `/workspace/inbox?conversation=${customer.latestConversationId}` : `/workspace/inbox?customer=${customer.id}`}>
                              <MessageSquare className="h-4 w-4" />
                            </Link>
                          </UiButton>
                          <UiButton variant="ghost" size="icon" aria-label={`Edit ${customer.name}`} onClick={(event) => { event.stopPropagation(); openEditCustomer(customer) }}><Edit className="h-4 w-4" /></UiButton>
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
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950 dark:text-slate-50">{customer.name}</p><p className="mt-1 truncate text-sm text-slate-500">{customer.phone || customer.preferredChannel}</p></div><Badge className={getStatusColor(customer.status)}>{customer.status}</Badge></div>
                  <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{customer.totalOrders} orders</span><span>{customer.totalConversations} conversations</span></div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span>{sortedCustomers.length === 0 ? "No customers" : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, sortedCustomers.length)} of ${sortedCustomers.length}`}</span>
              <div className="flex items-center gap-2">
                <UiButton variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" />Previous</UiButton>
                <span className="text-xs font-medium">Page {page} of {totalPages}</span>
                <UiButton variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next<ChevronRight className="h-4 w-4" /></UiButton>
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection className={`${mobileView === "details" ? "block" : "hidden"} lg:block`} title="Customer Details" description="Commerce context first, profile details second." action={<UiButton variant="ghost" size="sm" className="lg:hidden" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />Customers</UiButton>}>
            {selectedCustomer ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      {selectedCustomer.avatar ? <AvatarImage src={selectedCustomer.avatar} /> : null}
                      <AvatarFallback className="text-lg">
                        {selectedCustomer.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{selectedCustomer.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedCustomer.isVip ? <Badge className="status-pill status-premium" variant="secondary">VIP customer</Badge> : null}
                        <Badge className={getStatusColor(selectedCustomer.status)}>{selectedCustomer.status}</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Total orders" value={`${selectedCustomer.totalOrders}`} icon={ShoppingBag} />
                  <MetricCard label="Conversations" value={`${selectedCustomer.totalConversations}`} icon={MessageSquare} />
                  <MetricCard label="Last order" value={selectedCustomer.lastOrder} icon={ShoppingBag} />
                  <MetricCard label="Preferred channel" value={selectedCustomer.preferredChannel} icon={MessageSquare} />
                </div>

                <Tabs defaultValue="profile" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                    <TabsTrigger value="conversations">Conversations</TabsTrigger>
                    {(isLoadingTimeline || timeline.length > 0) ? <TabsTrigger value="activity">Activity</TabsTrigger> : null}
                  </TabsList>
                  <TabsContent value="profile">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <h4 className="font-semibold text-slate-950 dark:text-slate-50">Profile details</h4>
                      <div className="mt-4 space-y-3">
                        <InfoRow icon={Mail} value={selectedCustomer.email} />
                        <InfoRow icon={Phone} value={selectedCustomer.phone} />
                        <InfoRow icon={MapPin} value={selectedCustomer.location} />
                        <InfoRow icon={Calendar} value={`Joined ${selectedCustomer.joinDate}`} />
                      </div>
                      <div className="mt-4">
                        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Tags</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedCustomer.tags.length === 0 ? (
                            <span className="text-sm text-slate-500 dark:text-slate-400">No tags</span>
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
                    <DetailList title="Orders">
                      {recentOrders.length === 0 ? (
                        <EmptyDetail message="No orders recorded yet for this customer." />
                      ) : recentOrders.map((order) => (
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
                    </DetailList>
                  </TabsContent>
                  <TabsContent value="conversations">
                    <DetailList title="Recent Conversations">
                      {recentConversations.length === 0 ? (
                        <EmptyDetail message="No conversations recorded yet for this customer." />
                      ) : recentConversations.map((item) => (
                        <Link key={item.id} href={`/workspace/inbox?conversation=${item.id}`} className="block rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/70 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{item.time}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p>
                        </Link>
                      ))}
                    </DetailList>
                  </TabsContent>
                  {(isLoadingTimeline || timeline.length > 0) ? (
                    <TabsContent value="activity">
                      <DetailList title="Activity">
                        {isLoadingTimeline ? (
                          <EmptyDetail message="Loading customer activity..." />
                        ) : timeline.map((event) => (
                          <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatEventType(event.eventType)}</p>
                              <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.createdAt)}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.source || event.entityType}</p>
                          </div>
                        ))}
                      </DetailList>
                    </TabsContent>
                  ) : null}
                </Tabs>
              </div>
            ) : (
              <WorkspaceEmptyState icon={Users} title="No customer selected" description="Select a customer to view profile, orders, conversations, and activity." />
            )}
          </WorkspaceSection>
        </div>

        <Dialog open={Boolean(editingCustomer)} onOpenChange={(open) => !open && setEditingCustomer(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>Update the persisted customer profile used across conversations and orders.</DialogDescription>
            </DialogHeader>
            {editForm ? (
              <div className="grid gap-4 py-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name"><Input value={editForm.fullName} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} /></Field>
                  <Field label="Status">
                    <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value as CustomerRow["status"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Email"><Input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></Field>
                  <Field label="Phone"><Input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></Field>
                  <Field label="City"><Input value={editForm.city} onChange={(event) => setEditForm({ ...editForm, city: event.target.value })} /></Field>
                  <Field label="Country"><Input value={editForm.country} onChange={(event) => setEditForm({ ...editForm, country: event.target.value })} /></Field>
                </div>
                <Field label="Tags"><Input value={editForm.tags} onChange={(event) => setEditForm({ ...editForm, tags: event.target.value })} placeholder="vip, repeat buyer" /></Field>
                <Field label="Notes"><Textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} rows={4} /></Field>
                <div className="flex justify-end gap-2">
                  <UiButton variant="outline" onClick={() => setEditingCustomer(null)}>Cancel</UiButton>
                  <UiButton onClick={saveCustomer} disabled={isSavingCustomer}>{isSavingCustomer ? "Saving..." : "Save Changes"}</UiButton>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </WorkspacePage>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>Create a customer profile so the team can start orders and keep reusable contact context.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={createForm.fullName} onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))} />
            </Field>
            <Field label="Channel">
              <Select value={createForm.channelId} onValueChange={(value) => setCreateForm((current) => ({ ...current, channelId: value }))}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.displayName || channel.channelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Email">
              <Input type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} />
            </Field>
            <Field label="City">
              <Input value={createForm.city} onChange={(event) => setCreateForm((current) => ({ ...current, city: event.target.value }))} />
            </Field>
            <Field label="Country">
              <Input value={createForm.country} onChange={(event) => setCreateForm((current) => ({ ...current, country: event.target.value }))} />
            </Field>
            <Field label="Status">
              <Select value={createForm.status} onValueChange={(value) => setCreateForm((current) => ({ ...current, status: value as CustomerRow["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tags">
              <Input value={createForm.tags} onChange={(event) => setCreateForm((current) => ({ ...current, tags: event.target.value }))} placeholder="vip, repeat buyer" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Textarea value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <UiButton variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isSavingCustomer}>Cancel</UiButton>
            <UiButton onClick={() => void createCustomer()} disabled={isSavingCustomer || !createForm.fullName.trim() || !createForm.channelId}>
              {isSavingCustomer ? "Saving..." : "Create customer"}
            </UiButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
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

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="inline-flex rounded-2xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">{value}</p>
    </div>
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
      <div className="mt-4 space-y-3">{children}</div>
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
