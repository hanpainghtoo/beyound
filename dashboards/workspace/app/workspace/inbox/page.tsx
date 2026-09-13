"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  Maximize2,
  MoreHorizontal,
  MessageCircle,
  Package,
  Paperclip,
  Phone,
  Search,
  Send,
  ShieldAlert,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
} from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { MediaPicker } from "@/components/media-picker"
import { WorkspacePage } from "@/components/workspace"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useCsrLiveInbox } from "@/hooks/use-csr-live-inbox"
import {
  csrCannedResponsesApi,
  csrConversationsApi,
  csrCustomersApi,
  csrOrdersApi,
  csrProductsApi,
  tenantCsrsApi,
  getApiErrorMessage,
  getStoredSession,
  type CsrCannedResponseDto,
  type CsrConversationDto,
  type CsrCustomerDto,
  type CsrMessageDto,
  type CsrMediaFileDto,
  type CsrOrderDto,
  type CsrOrderItemDto,
  type CsrProductDto,
  type CsrTimelineEventDto,
  type TenantCsrDto,
} from "@/lib/api"
import { cn } from "@/lib/utils"

type InboxMode = "queue" | "focus"
type MobilePane = "queue" | "conversation" | "context"
type QueueFilter =
  | "all"
  | "unread"
  | "unassigned"
  | "mine"
  | "order_intent"
  | "payment_review"
  | "delivery"
  | "complaints"
  | "follow_up"
  | "resolved"
type ContextTab = "customer" | "current_order" | "payment" | "delivery" | "notes" | "timeline"
type ConversationRecord = {
  id: string
  customerId: string
  assignedCsrId?: string | null
  customerName: string
  customerAvatar?: string | null
  channelName: string
  channelType: NonNullable<CsrConversationDto["channel"]>["channelType"] | "unknown"
  latestMessage: string
  latestAt: string | null
  waitingSince: string | null
  unread: boolean
  unreadCount: number | null
  priority: CsrConversationDto["priority"]
  status: CsrConversationDto["status"]
  subject?: string | null
  email?: string | null
  phone?: string | null
  location: string
  tags: string[]
  slaDueAt?: string | null
  raw: CsrConversationDto
}
type TimelineEvent = {
  id: string
  title: string
  description: string
  createdAt: string
  source: string
  linkedObject: string
  nextAction: string
  tone: "message" | "order" | "payment" | "assignment" | "note" | "system"
}

const queueFilters: Array<{ value: QueueFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "unassigned", label: "Unassigned" },
  { value: "mine", label: "Mine" },
  { value: "follow_up", label: "Follow Up" },
  { value: "resolved", label: "Resolved" },
]

const toTitle = (value: string) =>
  value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const formatClock = (value?: string | null) => {
  if (!value) return "No activity"
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "Unknown"
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatDate = (value?: string | null) => {
  if (!value) return "Unknown"
  return new Date(value).toLocaleDateString()
}

const formatCurrency = (amount?: string | number | null, currency = "MMK") =>
  `${currency} ${Number(amount || 0).toLocaleString()}`

const minutesAgo = (value?: string | null) => {
  if (!value) return null
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
}

const formatWait = (value?: string | null) => {
  const minutes = minutesAgo(value)
  if (minutes === null) return "No wait signal"
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m waiting`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours}h ${remainder}m waiting`
}

const formatLocation = (location?: Record<string, unknown> | null) => {
  if (!location) return "Not provided"
  const city = typeof location.city === "string" ? location.city : ""
  const country = typeof location.country === "string" ? location.country : ""
  return [city, country].filter(Boolean).join(", ") || "Not provided"
}

const mapConversation = (conversation: CsrConversationDto): ConversationRecord => ({
  id: conversation.id,
  customerId: conversation.customerId,
  assignedCsrId: conversation.assignedCsrId,
  customerName: conversation.customer?.fullName || conversation.subject || "Customer",
  customerAvatar: conversation.customer?.avatarUrl,
  channelName: conversation.channel?.displayName || conversation.channel?.channelName || "Channel",
  channelType: conversation.channel?.channelType || "unknown",
  latestMessage: conversation.searchSnippet || conversation.subject || "Open conversation",
  latestAt: conversation.lastMessageAt || conversation.updatedAt,
  waitingSince: conversation.lastCustomerMessageAt || conversation.lastMessageAt || conversation.updatedAt,
  unread: conversation.metadata?.inboxUnread === true,
  unreadCount: typeof conversation.metadata?.inboxUnreadCount === "number" ? conversation.metadata.inboxUnreadCount : null,
  priority: conversation.priority,
  status: conversation.status,
  subject: conversation.subject,
  email: conversation.customer?.email,
  phone: conversation.customer?.phone,
  location: formatLocation(conversation.customer?.location),
  tags: [...(conversation.tags || []), ...(conversation.customer?.tags || [])],
  slaDueAt: conversation.slaDueAt,
  raw: conversation,
})

const mapMessage = (message: CsrMessageDto) => ({
  ...message,
  content: message.content || "",
})

const getPayloadText = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) return value
    if (typeof value === "number") return value.toLocaleString()
  }
  return null
}

const mapTimelineEvent = (event: CsrTimelineEventDto): TimelineEvent => {
  const eventType = event.eventType.toLowerCase()
  const payload = event.payload || {}
  const status = getPayloadText(payload, ["status", "paymentStatus"])
  const note = getPayloadText(payload, ["note", "content", "message"])
  const amount = getPayloadText(payload, ["totalAmount", "paidAmount", "balanceDue"])
  const orderNumber = getPayloadText(payload, ["orderNumber"])
  const source = event.source || event.actorType || "ZayOS"
  const linkedObject = orderNumber || toTitle(event.entityType)

  if (eventType.includes("payment")) {
    return {
      id: event.id,
      title: "Payment update",
      description: [status && `Status: ${toTitle(status)}`, amount && `Amount: ${amount}`].filter(Boolean).join(" • ") || toTitle(event.eventType),
      createdAt: event.createdAt,
      source,
      linkedObject,
      nextAction: status === "paid" || status === "cod_collected" ? "Continue fulfilment" : "Confirm payment state",
      tone: "payment",
    }
  }

  if (eventType.includes("order")) {
    return {
      id: event.id,
      title: orderNumber ? `Order ${orderNumber}` : "Order update",
      description: [status && `Status: ${toTitle(status)}`, amount && `Total: ${amount}`].filter(Boolean).join(" • ") || toTitle(event.eventType),
      createdAt: event.createdAt,
      source,
      linkedObject,
      nextAction: status === "delivered" ? "Schedule customer follow-up" : "Review order stage",
      tone: "order",
    }
  }

  if (eventType.includes("message")) {
    return {
      id: event.id,
      title: "Message activity",
      description: note || toTitle(event.eventType),
      createdAt: event.createdAt,
      source,
      linkedObject,
      nextAction: "Review and reply",
      tone: "message",
    }
  }

  if (eventType.includes("assign")) {
    return {
      id: event.id,
      title: "Assignment changed",
      description: toTitle(event.eventType),
      createdAt: event.createdAt,
      source,
      linkedObject,
      nextAction: "Confirm ownership",
      tone: "assignment",
    }
  }

  if (eventType.includes("note")) {
    return {
      id: event.id,
      title: "Internal note",
      description: note || "Customer note updated",
      createdAt: event.createdAt,
      source,
      linkedObject,
      nextAction: "Use note in next response",
      tone: "note",
    }
  }

  return {
    id: event.id,
    title: toTitle(event.eventType),
    description: event.source ? `Source: ${event.source}` : "System event",
    createdAt: event.createdAt,
    source,
    linkedObject,
    nextAction: "Review event",
    tone: "system",
  }
}

const getConversationIntent = (conversation: ConversationRecord, order: CsrOrderDto | null) => {
  const haystack = `${conversation.subject || ""} ${conversation.latestMessage} ${conversation.tags.join(" ")}`.toLowerCase()
  if (
    haystack.includes("payment") ||
    order?.paymentStatus === "pending" ||
    order?.paymentStatus === "partially_paid" ||
    order?.paymentStatus === "cod_pending"
  ) {
    return "Payment review"
  }
  if (haystack.includes("complaint") || haystack.includes("refund") || haystack.includes("angry")) return "Complaint"
  if (
    haystack.includes("delivery") ||
    haystack.includes("tracking") ||
    haystack.includes("dispatch") ||
    order?.deliveryAssigneeName ||
    order?.trackingNumber ||
    ["out_for_delivery", "delivered", "failed_delivery", "returned"].includes(order?.status || "")
  ) {
    return "Delivery"
  }
  if (
    haystack.includes("order") ||
    haystack.includes("buy") ||
    haystack.includes("want") ||
    haystack.includes("checkout") ||
    haystack.includes("cart") ||
    order
  ) {
    return "Order intent"
  }
  if (haystack.includes("follow up") || haystack.includes("followup")) return "Follow up"
  return "General"
}

const isComplaint = (intent: string, conversation: ConversationRecord) =>
  intent === "Complaint" || conversation.tags.some((tag) => tag.toLowerCase().includes("complaint"))

const isPaymentReview = (intent: string) => intent === "Payment review"
const isOrderIntent = (intent: string) => intent === "Order intent"
const isDeliveryFlow = (intent: string) => intent === "Delivery"
const isFollowUp = (conversation: ConversationRecord) =>
  conversation.tags.some((tag) => tag.toLowerCase().includes("follow")) || conversation.status === "pending"

const getCommerceNextAction = (conversation: ConversationRecord | null, order: CsrOrderDto | null) => {
  if (!conversation) return "Select a conversation to see the next commerce action."
  if (!order) return "Confirm product, quantity, price, and delivery details before creating the order."
  if (order.status === "failed_delivery") return "Contact the customer, record the failure reason, and decide whether to retry or return."
  if (["pending", "partially_paid"].includes(order.paymentStatus)) return "Confirm payment or agree COD before fulfilment continues."
  if (order.paymentStatus === "cod_pending" && order.status === "delivered") return "Confirm COD collection and close the payment loop."
  if (order.status === "new") return "Confirm the order details and move the order into preparation."
  if (["confirmed", "preparing"].includes(order.status)) return "Pack the order and prepare the delivery handoff."
  if (order.status === "packed") return "Assign delivery, route details, and tracking."
  if (order.status === "out_for_delivery") return "Monitor delivery and keep the customer updated."
  if (["delivered", "cod_collected"].includes(order.status)) return "Schedule follow-up and capture repeat-purchase context."
  return "Review the latest event and move the order to its next valid stage."
}

const isOverdue = (conversation: ConversationRecord) => {
  if (conversation.slaDueAt) return new Date(conversation.slaDueAt).getTime() < Date.now()
  const wait = minutesAgo(conversation.waitingSince)
  return wait !== null && wait >= 45 && conversation.status !== "resolved" && conversation.status !== "closed"
}

const getScore = (conversation: ConversationRecord, order: CsrOrderDto | null) => {
  const intent = getConversationIntent(conversation, order)
  const wait = minutesAgo(conversation.waitingSince) || 0
  const orderTotal = Number(order?.totalAmount || 0)
  let score = 0

  if (isPaymentReview(intent)) score += 1000
  if (isOrderIntent(intent)) score += 800
  if (isOverdue(conversation)) score += 700
  if (orderTotal >= 300000) score += 600
  if (isComplaint(intent, conversation)) score += 500
  if (conversation.unread) score += 160
  if (!conversation.assignedCsrId) score += 120
  if (conversation.priority === "urgent") score += 220
  if (conversation.priority === "high") score += 120

  score += Math.min(wait, 600)
  return score
}

const channelBadgeClass: Record<ConversationRecord["channelType"], string> = {
  messenger: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200",
  telegram: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200",
  viber: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200",
  tiktok: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200",
  unknown: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300",
}

const contextToneClass: Record<TimelineEvent["tone"], string> = {
  message: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200",
  order: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  payment: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
  assignment: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200",
  note: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200",
  system: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300",
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function getMessageFailureDetails(message: ReturnType<typeof mapMessage>) {
  const providerDelivery = asRecord(message.metadata?.providerDelivery)
  if (!providerDelivery || message.status !== "failed") return null

  const providerStatus = typeof providerDelivery.providerStatus === "string" ? providerDelivery.providerStatus : ""
  const providerError = asRecord(providerDelivery.providerError)
  const fallbackError = typeof providerDelivery.error === "string" ? providerDelivery.error : ""
  const nextStep = typeof providerDelivery.nextStep === "string" ? providerDelivery.nextStep : ""

  if (providerStatus === "unsupported_message_type" && nextStep) {
    return nextStep
  }

  if (typeof providerError?.description === "string" && providerError.description.trim()) {
    return providerError.description
  }

  if (fallbackError) return fallbackError
  if (nextStep) return nextStep
  return "Provider delivery failed."
}

function getConversationChannelSupportNote(channelType: ConversationRecord["channelType"]) {
  if (channelType === "tiktok") {
    return {
      tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100",
      title: "TikTok replies are unavailable",
      description:
        "This TikTok surface currently captures inbound leads and comments only. Use ZayOS to organize the order, customer, and delivery work, but continue customer replies in the approved TikTok surface until outbound access exists.",
    }
  }

  if (channelType === "telegram") {
    return {
      tone: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100",
      title: "Telegram is ready for direct replies",
      description:
        "Telegram callbacks are verified with the channel secret token, so messages sent from this inbox map to the secured bot configuration.",
    }
  }

  return null
}

export default function InboxPage() {
  const session = getStoredSession()
  const searchParams = useSearchParams()
  const requestedConversationId = searchParams.get("conversation")
  const requestedCustomerId = searchParams.get("customer")
  const rushFromQuery = searchParams.get("rush") === "1"
  const modeFromQuery = searchParams.get("mode") === "focus" ? "focus" : "queue"
  const sessionUserId = session?.user.id || ""
  const sessionRole = session?.user.role || "csr"

  const [mode, setMode] = useState<InboxMode>(modeFromQuery)
  const [mobilePane, setMobilePane] = useState<MobilePane>("queue")
  const [rushMode, setRushMode] = useState(rushFromQuery)
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all")
  const [conversationSearch, setConversationSearch] = useState("")
  const [conversations, setConversations] = useState<ConversationRecord[]>([])
  const [allOrders, setAllOrders] = useState<CsrOrderDto[]>([])
  const [messages, setMessages] = useState<ReturnType<typeof mapMessage>[]>([])
  const [customerProfile, setCustomerProfile] = useState<CsrCustomerDto | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [teamMembers, setTeamMembers] = useState<TenantCsrDto[]>([])
  const [products, setProducts] = useState<CsrProductDto[]>([])
  const [cannedResponses, setCannedResponses] = useState<CsrCannedResponseDto[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(requestedConversationId)
  const [messageText, setMessageText] = useState("")
  const [selectedReplyId, setSelectedReplyId] = useState<string>("")
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<CsrMediaFileDto | null>(null)
  const [contextTab, setContextTab] = useState<ContextTab>("timeline")
  const [customerNotes, setCustomerNotes] = useState("")
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [loadingOrderItems, setLoadingOrderItems] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<CsrOrderItemDto[]>([])
  const [createOrderOpen, setCreateOrderOpen] = useState(false)
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false)
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [deliveryDraft, setDeliveryDraft] = useState({
    deliveryAssigneeName: "",
    deliveryAssigneePhone: "",
    deliveryZone: "",
    trackingNumber: "",
  })
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const latestAtRef = useRef<Record<string, string>>({})
  const { isLive, lastEventAt, liveError } = useCsrLiveInbox({
    enabled: true,
    onConversationUpsert: (conversation) => {
      const mapped = mapConversation(conversation)
      setConversations((current) => {
        const others = current.filter((item) => item.id !== mapped.id)
        return [mapped, ...others]
      })
      if (selectedConversationId === conversation.id && conversation.lastMessageAt) {
        const prev = latestAtRef.current[conversation.id]
        if (prev !== conversation.lastMessageAt) {
          latestAtRef.current[conversation.id] = conversation.lastMessageAt
          csrConversationsApi.messages(conversation.id).then((messageRows) => {
            setMessages(messageRows.map(mapMessage))
          }).catch(() => {})
        }
      }
    },
    onMessageCreated: (conversationId, message) => {
      const mapped = mapMessage(message)
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                latestMessage: mapped.content || conversation.latestMessage,
                latestAt: mapped.createdAt,
                waitingSince:
                  mapped.senderType === "customer"
                    ? mapped.createdAt
                    : conversation.waitingSince,
                unread: selectedConversationId === conversationId ? false : true,
              }
            : conversation,
        ),
      )
      setMessages((current) => {
        if (selectedConversationId !== conversationId || current.some((item) => item.id === mapped.id)) return current
        return [...current, mapped]
      })
    },
  })

  useEffect(() => {
    document.body.classList.toggle("workspace-inbox-rush", rushMode)
    const sidebar = document.querySelector<HTMLElement>(".workspace-shell > [data-slot='sidebar']")
    const workspaceMain = document.querySelector<HTMLElement>(".workspace-shell > main")
    const previousSidebarDisplay = sidebar?.style.display || ""
    const previousMainWidth = workspaceMain?.style.width || ""

    if (rushMode) {
      if (sidebar) sidebar.style.display = "none"
      if (workspaceMain) workspaceMain.style.width = "100%"
    } else {
      if (sidebar) sidebar.style.display = previousSidebarDisplay
      if (workspaceMain) workspaceMain.style.width = previousMainWidth
    }

    return () => {
      document.body.classList.remove("workspace-inbox-rush")
      if (sidebar) sidebar.style.display = previousSidebarDisplay
      if (workspaceMain) workspaceMain.style.width = previousMainWidth
    }
  }, [rushMode])

  useEffect(() => {
    const loadInitial = async () => {
      setLoadingQueue(true)
      setErrorMessage(null)
      try {
        const [conversationRows, orderRows, replyRows, productRows] = await Promise.all([
          csrConversationsApi.list({ filter: "all" }),
          csrOrdersApi.list(),
          csrCannedResponsesApi.list(),
          csrProductsApi.list(),
        ])
        setConversations(conversationRows.map(mapConversation))
        setAllOrders(orderRows)
        setCannedResponses(replyRows)
        setProducts(productRows.filter((product) => product.status === "active"))
        setSelectedConversationId((current) => current || requestedConversationId || conversationRows[0]?.id || null)
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error, "Failed to load inbox queue"))
      } finally {
        setLoadingQueue(false)
      }
    }

    loadInitial()
  }, [requestedConversationId])

  useEffect(() => {
    if (!["owner", "admin", "supervisor"].includes(sessionRole)) {
      setTeamMembers([])
      return
    }

    tenantCsrsApi
      .list()
      .then((csrRows) => setTeamMembers(csrRows.filter((csr) => csr.status === "active")))
      .catch(() => {
        // Assignment labels are helpful but should never block inbox access.
        setTeamMembers([])
      })
  }, [sessionRole])

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  )

  const ordersByConversation = useMemo(() => {
    const map = new Map<string, CsrOrderDto[]>()
    for (const order of allOrders) {
      if (!order.conversationId) continue
      const current = map.get(order.conversationId) || []
      current.push(order)
      map.set(order.conversationId, current)
    }
    return map
  }, [allOrders])

  const currentOrder = useMemo(() => {
    if (!selectedConversation) return null
    const related = ordersByConversation.get(selectedConversation.id) || []
    if (!related.length) return null
    return [...related].sort((a, b) => {
      const aActive = a.status !== "delivered" && a.status !== "cancelled" && a.status !== "returned" ? 1 : 0
      const bActive = b.status !== "delivered" && b.status !== "cancelled" && b.status !== "returned" ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })[0]
  }, [ordersByConversation, selectedConversation])

  const commerceNextAction = getCommerceNextAction(selectedConversation, currentOrder)
  const selectedChannelSupportNote = getConversationChannelSupportNote(selectedConversation?.channelType || "unknown")
  const selectedConversationSendBlocked = selectedConversation?.channelType === "tiktok"

  const previousOrders = useMemo(() => {
    if (!selectedConversation) return []
    return allOrders
      .filter((order) => order.customerId === selectedConversation.customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [allOrders, selectedConversation])

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      setCustomerProfile(null)
      setTimeline([])
      setCustomerNotes("")
      setOrderItems([])
      return
    }

    const conversation = conversations.find((c) => c.id === selectedConversationId)
    if (!conversation) return

    if (conversation.latestAt) {
      latestAtRef.current[selectedConversationId] = conversation.latestAt
    }

    setLoadingMessages(true)
    setLoadingProfile(true)
    setLoadingTimeline(true)
    setMessages([])
    setCustomerProfile(null)
    setTimeline([])
    setCustomerNotes("")
    setOrderItems([])

    const loadConversationContext = async () => {
      setErrorMessage(null)

      try {
        const [messageRows, profile, timelineRows] = await Promise.all([
          csrConversationsApi.messages(conversation.id),
          csrCustomersApi.get(conversation.customerId),
          csrCustomersApi.timeline(conversation.customerId),
        ])
        setMessages(messageRows.map(mapMessage))
        setCustomerProfile(profile)
        setCustomerNotes(profile.notes || "")
        setTimeline(timelineRows.map(mapTimelineEvent).reverse())
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error, "Failed to load conversation details"))
      } finally {
        setLoadingMessages(false)
        setLoadingProfile(false)
        setLoadingTimeline(false)
      }
    }

    loadConversationContext()
  }, [conversations, selectedConversationId])

  useEffect(() => {
    if (requestedConversationId) return
    if (!requestedCustomerId) return

    let cancelled = false
    const loadProfile = async () => {
      setLoadingProfile(true)
      setLoadingTimeline(true)
      setErrorMessage(null)
      try {
        const profile = await csrCustomersApi.get(requestedCustomerId)
        if (cancelled) return
        setCustomerProfile(profile)
        setCustomerNotes(profile.notes || "")
        const timelineRows = await csrCustomersApi.timeline(requestedCustomerId)
        if (cancelled) return
        setTimeline(timelineRows.map(mapTimelineEvent).reverse())
      } catch (error) {
        if (cancelled) return
        setErrorMessage(getApiErrorMessage(error, "Failed to load customer profile"))
      } finally {
        if (!cancelled) {
          setLoadingProfile(false)
          setLoadingTimeline(false)
        }
      }
    }

    void loadProfile()
    return () => { cancelled = true }
  }, [requestedCustomerId, requestedConversationId])

  useEffect(() => {
    if (!currentOrder) {
      setOrderItems([])
      return
    }

    const loadItems = async () => {
      setLoadingOrderItems(true)
      try {
        setOrderItems(await csrOrdersApi.items(currentOrder.id))
      } catch {
        setOrderItems([])
      } finally {
        setLoadingOrderItems(false)
      }
    }

    loadItems()
    setDeliveryDraft({
      deliveryAssigneeName: currentOrder.deliveryAssigneeName || "",
      deliveryAssigneePhone: currentOrder.deliveryAssigneePhone || "",
      deliveryZone: currentOrder.deliveryZone || "",
      trackingNumber: currentOrder.trackingNumber || "",
    })
  }, [currentOrder])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      messageEndRef.current?.scrollIntoView({ block: "end" })
    }, 50)

    return () => window.clearTimeout(timeout)
  }, [messages, selectedConversationId])

  const teamNameById = useMemo(
    () =>
      Object.fromEntries(
        teamMembers.map((member) => [member.id, member.fullName || member.email || member.phone || "Assigned staff"]),
      ),
    [teamMembers],
  )

  const filteredAndSortedConversations = useMemo(() => {
    const normalizedSearch = conversationSearch.trim().toLowerCase()
    const rows = conversations.filter((conversation) => {
      const order = (ordersByConversation.get(conversation.id) || [])[0] || null
      const intent = getConversationIntent(conversation, order)
      const matchesSearch =
        !normalizedSearch ||
        `${conversation.customerName} ${conversation.latestMessage} ${conversation.channelName} ${conversation.tags.join(" ")}`.toLowerCase().includes(normalizedSearch)

      const matchesFilter =
        queueFilter === "all" ? true
        : queueFilter === "unread" ? conversation.unread
        : queueFilter === "unassigned" ? !conversation.assignedCsrId
        : queueFilter === "mine" ? conversation.assignedCsrId === sessionUserId
        : queueFilter === "order_intent" ? isOrderIntent(intent)
        : queueFilter === "payment_review" ? isPaymentReview(intent)
        : queueFilter === "delivery" ? isDeliveryFlow(intent)
        : queueFilter === "complaints" ? isComplaint(intent, conversation)
        : queueFilter === "follow_up" ? isFollowUp(conversation)
        : queueFilter === "resolved" ? conversation.status === "resolved" || conversation.status === "closed"
        : true

      return matchesSearch && matchesFilter
    })

    return rows.sort((a, b) => {
      const diff = new Date(b.latestAt || b.raw.updatedAt).getTime() - new Date(a.latestAt || a.raw.updatedAt).getTime()
      if (diff !== 0) return diff
      const aOrder = (ordersByConversation.get(a.id) || [])[0] || null
      const bOrder = (ordersByConversation.get(b.id) || [])[0] || null
      return getScore(b, bOrder) - getScore(a, aOrder)
    })
  }, [conversationSearch, conversations, ordersByConversation, queueFilter, sessionUserId])

  useEffect(() => {
    if (!selectedConversationId && filteredAndSortedConversations[0]) {
      setSelectedConversationId(filteredAndSortedConversations[0].id)
    }
  }, [filteredAndSortedConversations, selectedConversationId])

  const visibleSelectedConversation =
    filteredAndSortedConversations.find((conversation) => conversation.id === selectedConversationId) ||
    selectedConversation

  const queueCounters = useMemo(() => {
    const incoming = conversations.filter((conversation) => (minutesAgo(conversation.latestAt) || 9999) <= 15).length
    const unread = conversations.filter((conversation) => conversation.unread).length
    const unassigned = conversations.filter((conversation) => !conversation.assignedCsrId).length
    const paymentReview = conversations.filter((conversation) =>
      isPaymentReview(getConversationIntent(conversation, (ordersByConversation.get(conversation.id) || [])[0] || null)),
    ).length
    const overdue = conversations.filter(isOverdue).length
    return { incoming, unread, unassigned, paymentReview, overdue }
  }, [conversations, ordersByConversation])

  const reloadOrders = async () => {
    const orders = await csrOrdersApi.list()
    setAllOrders(orders)
  }

  const handleSendMessage = async () => {
    if (!selectedConversation || (!messageText.trim() && !selectedMedia)) return
    if (selectedConversation.channelType === "tiktok") {
      setErrorMessage("TikTok conversations are currently inbound-only in ZayOS. Use the approved TikTok surface for customer replies and keep fulfilment work here.")
      return
    }
    setSubmittingAction("send")
    setErrorMessage(null)
    try {
      const reply = cannedResponses.find((item) => item.id === selectedReplyId)
      const attachment = selectedMedia?.download ? {
        fileId: selectedMedia.id,
        fileName: selectedMedia.fileName,
        contentType: selectedMedia.contentType,
        sizeBytes: selectedMedia.sizeBytes,
        url: selectedMedia.download.url,
        role: "message_attachment",
      } : undefined
      const messageType = selectedMedia?.contentType.startsWith("image/")
        ? "image"
        : selectedMedia?.contentType.startsWith("video/")
          ? "video"
          : selectedMedia?.contentType.startsWith("audio/")
            ? "audio"
            : selectedMedia
              ? "file"
              : "text"
      const sent = await csrConversationsApi.sendMessage({
        conversationId: selectedConversation.id,
        content: messageText.trim() || selectedMedia?.fileName || "Attachment",
        messageType,
        attachments: attachment ? [attachment] : [],
        cannedResponseId: reply && reply.content === messageText.trim() ? reply.id : undefined,
      })
      setMessages((current) => [...current, mapMessage(sent)])
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversation.id
            ? { ...conversation, latestMessage: sent.content || conversation.latestMessage, latestAt: sent.createdAt, unread: false }
            : conversation,
        ),
      )
      setMessageText("")
      setSelectedReplyId("")
      setSelectedMedia(null)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to send message"))
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleAssignToMe = async () => {
    if (!selectedConversation || !sessionUserId) return
    setSubmittingAction("assign-me")
    try {
      const updated = await csrConversationsApi.assign(selectedConversation.id, sessionUserId)
      const mapped = mapConversation(updated)
      setConversations((current) => current.map((conversation) => (conversation.id === mapped.id ? mapped : conversation)))
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to assign conversation"))
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleUpdateConversationStatus = async (status: CsrConversationDto["status"]) => {
    if (!selectedConversation) return
    setSubmittingAction(`status-${status}`)
    try {
      const updated = await csrConversationsApi.update(selectedConversation.id, { status })
      const mapped = mapConversation(updated)
      setConversations((current) => current.map((conversation) => (conversation.id === mapped.id ? mapped : conversation)))
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to update conversation status"))
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleConfirmPayment = async () => {
    if (!currentOrder) return
    setSubmittingAction("confirm-payment")
    try {
      await csrOrdersApi.updateLifecycle(currentOrder.id, {
        paymentStatus: "paid",
        note: "Payment confirmed from inbox",
      })
      await reloadOrders()
      setContextTab("payment")
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to confirm payment"))
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleSaveDelivery = async () => {
    if (!currentOrder) return
    setSubmittingAction("delivery")
    try {
      await csrOrdersApi.updateLifecycle(currentOrder.id, {
        deliveryAssigneeName: deliveryDraft.deliveryAssigneeName || undefined,
        deliveryAssigneePhone: deliveryDraft.deliveryAssigneePhone || undefined,
        deliveryZone: deliveryDraft.deliveryZone || undefined,
        trackingNumber: deliveryDraft.trackingNumber || undefined,
        note: "Delivery assignment updated from inbox",
      })
      await reloadOrders()
      setDeliveryDialogOpen(false)
      setContextTab("delivery")
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to update delivery"))
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedConversation) return
    setSavingNotes(true)
    try {
      const updated = await csrCustomersApi.update(selectedConversation.customerId, { notes: customerNotes })
      setCustomerProfile(updated)
      setCustomerNotes(updated.notes || "")
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to save notes"))
    } finally {
      setSavingNotes(false)
    }
  }

  const layoutColumns =
    rushMode
      ? "xl:grid-cols-[24rem_minmax(0,1fr)_24rem]"
      : mode === "focus"
      ? "xl:grid-cols-[18rem_minmax(0,1.25fr)_22rem]"
      : "xl:grid-cols-[minmax(32rem,1fr)_minmax(28rem,0.78fr)]"

  return (
    <>
      {rushMode ? (
        <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">ZayOS Live Commerce</p>
              <h1 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Rush Mode Command Center</h1>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto sm:justify-end">
              <CounterChip label="Incoming" value={queueCounters.incoming} tone="slate" />
              <CounterChip label="Unread" value={queueCounters.unread} tone="blue" />
              <CounterChip label="Unassigned" value={queueCounters.unassigned} tone="amber" />
              <CounterChip label="Payment" value={queueCounters.paymentReview} tone="amber" />
              <CounterChip label="Overdue" value={queueCounters.overdue} tone="red" />
              <Button size="sm" variant="outline" onClick={() => visibleSelectedConversation && setSelectedConversationId(filteredAndSortedConversations[0]?.id || visibleSelectedConversation.id)}>
                Next
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRushMode(false)}>
                Exit Fullscreen
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={cn(mobilePane === "queue" ? "block" : "hidden", "xl:block")}>
        <WorkspaceHeader
          title="Inbox"
          description="Run high-volume commerce conversations with queue priority, order context, and payment follow-up in one place."
          eyebrow="Live Commerce Command Center"
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant={mode === "queue" ? "default" : "outline"} onClick={() => { setMode("queue"); setMobilePane("queue") }}>
                Queue Mode
              </Button>
              <Button size="sm" variant={mode === "focus" ? "default" : "outline"} onClick={() => { setMode("focus"); setMobilePane(selectedConversationId ? "conversation" : "queue") }}>
                Focus Mode
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRushMode(true)}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Full Screen
              </Button>
            </div>
          }
        />
        </div>
      )}

      <WorkspacePage
        className={cn("pb-4 xl:h-[calc(100svh-4rem)] xl:overflow-hidden", rushMode && "p-0 xl:h-screen")}
        containerClassName={cn(
          "xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:gap-4 xl:space-y-0",
          rushMode ? "max-w-none px-3 py-3" : "max-w-[1600px]",
        )}
      >

        {liveError || errorMessage ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            {liveError ? `Live updates paused. ${liveError}` : errorMessage}
          </div>
        ) : null}

        <div className={cn("grid min-w-0 gap-3 xl:min-h-0 xl:flex-1", layoutColumns, rushMode && "max-w-none xl:min-h-[calc(100vh-5rem)]")}>
          <section className={cn("h-[calc(100svh-11rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:flex xl:h-auto xl:min-h-0", mobilePane === "queue" ? "flex" : "hidden")}>
            <div className="border-b border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <Badge className={cn("rounded-full border", isLive ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200")}>
                    {isLive ? "Live" : "Polling"}
                  </Badge>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{lastEventAt ? `Updated ${formatDateTime(lastEventAt.toISOString())}` : "Waiting for sync"}</span>
                  <div className="relative order-last w-full flex-1 sm:order-none sm:w-auto">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    value={conversationSearch}
                    onChange={(event) => setConversationSearch(event.target.value)}
                    placeholder="Search customer, message, tag, or channel"
                    className="pl-9"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedConversationId(filteredAndSortedConversations[0]?.id || null)}>
                  Next
                </Button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {queueFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setQueueFilter(filter.value)}
                    className={cn(
                      "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      queueFilter === filter.value
                        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-3">
                {loadingQueue ? (
                  <QueueEmptyState label="Loading queue…" />
                ) : filteredAndSortedConversations.length === 0 ? (
                  <QueueEmptyState label="No conversations match this queue right now." />
                ) : (
                  filteredAndSortedConversations.map((conversation) => {
                    const order = (ordersByConversation.get(conversation.id) || [])[0] || null
                    const intent = getConversationIntent(conversation, order)
                    const assignedName = conversation.assignedCsrId ? teamNameById[conversation.assignedCsrId] || "Assigned" : "Unassigned"
                    const active = conversation.id === visibleSelectedConversation?.id

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => {
                          setSelectedConversationId(conversation.id)
                          setMobilePane("conversation")
                        }}
                        className={cn(
                          "w-full rounded-xl border px-3 py-3 text-left transition",
                          active
                            ? "border-blue-200 bg-slate-50 shadow-sm ring-1 ring-blue-100 dark:border-blue-500/30 dark:bg-slate-900 dark:ring-blue-500/20"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10 rounded-xl">
                            <AvatarImage src={conversation.customerAvatar || undefined} alt={conversation.customerName} />
                            <AvatarFallback className="rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {initialsOf(conversation.customerName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{conversation.customerName}</p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{conversation.channelName}</p>
                              </div>
                              <div className="text-right">
                                <p className={cn("text-xs font-semibold", isOverdue(conversation) ? "text-red-600 dark:text-red-300" : "text-slate-500 dark:text-slate-400")}>
                                  {formatWait(conversation.waitingSince)}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatClock(conversation.latestAt)}</p>
                              </div>
                            </div>

                            <p className={cn("mt-2 text-sm text-slate-700 dark:text-slate-300", mode === "focus" ? "line-clamp-1" : "line-clamp-2")}>{conversation.latestMessage}</p>

                            <div className={cn("mt-3 flex flex-wrap gap-1.5", mode === "focus" && "hidden xl:flex")}>
                              <Badge className={cn("rounded-full border", channelBadgeClass[conversation.channelType])}>
                                {toTitle(conversation.channelType)}
                              </Badge>
                              <Badge className={intentBadgeClass(intent)}>{intent}</Badge>
                              <Badge className={statusBadgeClass(conversation.status)}>{toTitle(conversation.status)}</Badge>
                              {order ? <Badge className={paymentBadgeClass(order.paymentStatus)}>{toTitle(order.paymentStatus)}</Badge> : null}
                              {order ? <Badge className={deliveryBadgeClass(order.status)}>{toTitle(order.status)}</Badge> : null}
                              {conversation.unreadCount && conversation.unreadCount > 0 ? (
                                <Badge className="rounded-full border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
                                  {conversation.unreadCount} unread
                                </Badge>
                              ) : conversation.unread ? (
                                <Badge className="rounded-full border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">Unread</Badge>
                              ) : null}
                            </div>

                            <div className={cn("mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400", mode === "focus" && "hidden")}>
                              <span>Owner: {assignedName}</span>
                              <span>Order: {order ? `${order.orderNumber} • ${formatCurrency(order.totalAmount, order.currency)}` : "No order yet"}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </section>

          <section className={cn("h-[calc(100svh-1.5rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:flex xl:h-auto xl:min-h-0", mobilePane === "conversation" ? "flex" : "hidden")}>
            {visibleSelectedConversation ? (
              <>
                <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-800 sm:px-4 sm:py-3">
                  <div className="mb-3 flex items-center justify-between gap-2 xl:hidden">
                    <Button size="sm" variant="ghost" onClick={() => setMobilePane("queue")}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Conversations
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMobilePane("context")}>
                      Customer context
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{visibleSelectedConversation.customerName}</h2>
                        <Badge className={statusBadgeClass(visibleSelectedConversation.status)}>{toTitle(visibleSelectedConversation.status)}</Badge>
                        <Badge className={intentBadgeClass(getConversationIntent(visibleSelectedConversation, currentOrder))}>
                          {getConversationIntent(visibleSelectedConversation, currentOrder)}
                        </Badge>
                        {currentOrder ? <Badge className={paymentBadgeClass(currentOrder.paymentStatus)}>{toTitle(currentOrder.paymentStatus)}</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {visibleSelectedConversation.channelName} • {visibleSelectedConversation.phone || "No phone"} • {visibleSelectedConversation.location}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mode === "queue" && !rushMode ? (
                        <Button size="sm" className="max-xl:hidden" onClick={() => setMode("focus")}>
                          Open focus
                        </Button>
                      ) : null}
                      {!visibleSelectedConversation.assignedCsrId ? (
                        <Button size="sm" variant="outline" disabled={submittingAction === "assign-me"} onClick={handleAssignToMe}>
                          {submittingAction === "assign-me" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                          Assign to me
                        </Button>
                      ) : null}
                      <Select
                        value={visibleSelectedConversation.status}
                        onValueChange={(value) => handleUpdateConversationStatus(value as CsrConversationDto["status"])}
                      >
                        <SelectTrigger className="w-full max-xl:hidden min-[400px]:w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800 sm:px-4 sm:py-3">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton label="Create order" icon={ShoppingCart} onClick={() => setCreateOrderOpen(true)} />
                    <ActionButton label="Send product" icon={Package} onClick={() => setProductDialogOpen(true)} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><MoreHorizontal className="mr-2 h-4 w-4" />More actions</Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>Order workflow</DropdownMenuLabel>
                        <DropdownMenuItem disabled={!currentOrder} onClick={handleConfirmPayment}>Confirm payment</DropdownMenuItem>
                       <DropdownMenuItem disabled={!currentOrder} onClick={() => setDeliveryDialogOpen(true)}>Assign delivery</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Conversation workflow</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => { setContextTab("notes"); setMobilePane("context") }}>Add note</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateConversationStatus("resolved")}>Mark resolved</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <ScrollArea className="min-h-0 flex-1 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="space-y-4 p-4">
                    {selectedChannelSupportNote ? (
                      <div className={cn("rounded-2xl border p-4", selectedChannelSupportNote.tone)}>
                        <p className="text-sm font-semibold">{selectedChannelSupportNote.title}</p>
                        <p className="mt-1 text-sm leading-6">{selectedChannelSupportNote.description}</p>
                      </div>
                    ) : null}
                    {loadingMessages ? (
                      <QueueEmptyState label="Loading messages…" />
                    ) : messages.length === 0 ? (
                      <QueueEmptyState label="No messages yet in this conversation." />
                    ) : (
                      messages.map((message) => {
                        const outgoing = message.senderType === "csr"
                        const failureDetails = getMessageFailureDetails(message)
                        return (
                          <div key={message.id} className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                                outgoing
                                  ? message.status === "failed"
                                    ? "border border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100"
                                    : "bg-blue-600 text-white dark:bg-blue-500"
                                  : message.senderType === "system"
                                    ? "border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                    : "border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
                              )}
                            >
                              <p className="whitespace-pre-wrap text-sm leading-6">{message.content || "Attachment"}</p>
                              {outgoing ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-full text-[10px]",
                                      message.status === "failed"
                                        ? "border-red-300 text-red-700 dark:border-red-400/30 dark:text-red-100"
                                        : "border-white/20 text-white dark:border-white/20 dark:text-white",
                                    )}
                                  >
                                    {toTitle(message.status)}
                                  </Badge>
                                  <p className={cn("text-[11px]", message.status === "failed" ? "text-red-700 dark:text-red-200" : "text-blue-100 dark:text-blue-50/80")}>
                                    {formatDateTime(message.createdAt)}
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                                  {formatDateTime(message.createdAt)}
                                </p>
                              )}
                              {failureDetails ? (
                                <p className="mt-2 text-xs leading-5 text-red-700 dark:text-red-200">
                                  {failureDetails}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={messageEndRef} />
                  </div>
                </ScrollArea>

                <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
                  {selectedMedia ? (
                    <div className="mb-3 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-500/20 dark:bg-blue-500/10">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-blue-950 dark:text-blue-100">{selectedMedia.fileName}</p>
                        <p className="text-xs text-blue-700 dark:text-blue-200">{selectedMedia.contentType}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedMedia(null)}>Remove</Button>
                    </div>
                  ) : null}
                  <div className="mb-3 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <Select
                      value={selectedReplyId}
                      disabled={selectedConversationSendBlocked}
                      onValueChange={(value) => {
                        setSelectedReplyId(value)
                        const reply = cannedResponses.find((item) => item.id === value)
                        if (reply) setMessageText(reply.content)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Saved replies" />
                      </SelectTrigger>
                      <SelectContent>
                        {cannedResponses.length === 0 ? <SelectItem value="no-replies" disabled>No saved replies</SelectItem> : null}
                        {cannedResponses.map((reply) => (
                          <SelectItem key={reply.id} value={reply.id}>
                            {reply.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
                      {selectedConversationSendBlocked
                        ? "Saved replies stay available for staff reference, but TikTok customer replies must still be sent from the approved TikTok surface."
                        : "Fast reply is built for live-selling traffic. Use saved replies for repeat answers, then personalize only the last line."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-3">
                    <Button variant="outline" size="icon" aria-label="Attach media" className="self-end" onClick={() => setMediaPickerOpen(true)} disabled={selectedConversationSendBlocked}>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Textarea
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder={
                        selectedConversationSendBlocked
                          ? "TikTok replies are blocked in ZayOS. Use notes, orders, and delivery tools here instead."
                          : "Reply with order, payment, or delivery guidance…"
                      }
                      disabled={selectedConversationSendBlocked}
                      className="order-first min-h-[72px] w-full flex-none resize-none sm:order-none sm:min-h-[104px] sm:w-auto sm:flex-1"
                    />
                    <Button className="ml-auto self-end sm:ml-0" disabled={selectedConversationSendBlocked || ((!messageText.trim() && !selectedMedia) || submittingAction === "send")} onClick={handleSendMessage}>
                      {submittingAction === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {selectedConversationSendBlocked ? "Unavailable" : "Send"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <QueueEmptyState label="Select a conversation to enter focus mode." className="m-6" />
            )}
          </section>

          <MediaPicker open={mediaPickerOpen} onOpenChange={setMediaPickerOpen} onSelect={setSelectedMedia} />

          {(mode === "focus" || rushMode || mobilePane === "context") ? (
          <section className={cn(
            "h-[calc(100svh-1.5rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:h-auto xl:min-h-0",
            mobilePane === "context" ? "flex" : "hidden",
            mode === "focus" || rushMode ? "xl:flex" : "xl:hidden",
          )}>
            <div className="border-b border-slate-200 p-2 dark:border-slate-800 xl:hidden">
              <Button size="sm" variant="ghost" onClick={() => setMobilePane("conversation")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to conversation
              </Button>
            </div>
            <Tabs value={contextTab} onValueChange={(value) => setContextTab(value as ContextTab)} className="min-h-0 flex-1">
              <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Commerce Timeline</p>
                    <p className="mt-1 text-sm font-semibold">{visibleSelectedConversation?.customerName || "Customer context"}</p>
                  </div>
                  {currentOrder ? <Badge className="border-white/15 bg-white/10 text-white">{currentOrder.orderNumber}</Badge> : null}
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/10 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Next action</p>
                  <p className="mt-1 text-sm leading-6 text-white">{commerceNextAction}</p>
                </div>
              </div>
              <div className="border-b border-slate-200 p-3 dark:border-slate-800">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-slate-50 p-1 dark:bg-slate-900">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="customer">Customer</TabsTrigger>
                  <TabsTrigger value="current_order">Current Order</TabsTrigger>
                  <TabsTrigger value="payment">Payment</TabsTrigger>
                  <TabsTrigger value="delivery">Delivery</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="customer" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    {loadingProfile ? <QueueEmptyState label="Loading customer context…" /> : null}
                    {visibleSelectedConversation ? (
                      <>
                        <ContextCard title="Customer profile">
                          <DetailRow icon={UserRound} label="Name" value={customerProfile?.fullName || visibleSelectedConversation.customerName} />
                          <DetailRow icon={Phone} label="Phone" value={customerProfile?.phone || visibleSelectedConversation.phone || "Not provided"} />
                          <DetailRow icon={MapPin} label="Location" value={customerProfile ? formatLocation(customerProfile.location) : visibleSelectedConversation.location} />
                          <DetailRow icon={MessageCircle} label="Customer since" value={customerProfile ? formatDate(customerProfile.createdAt) : "Unknown"} />
                        </ContextCard>
                        <ContextCard title="Commerce summary">
                          <DetailRow icon={ShoppingCart} label="Previous orders" value={String(previousOrders.length)} />
                          <DetailRow
                            icon={CreditCard}
                            label="Lifetime value"
                            value={
                              previousOrders.length
                                ? formatCurrency(previousOrders.reduce((total, order) => total + Number(order.totalAmount || 0), 0), previousOrders[0]?.currency || "MMK")
                                : "No orders yet"
                            }
                          />
                          <DetailRow icon={ShieldAlert} label="Status" value={customerProfile?.status || "Active"} />
                        </ContextCard>
                      </>
                    ) : null}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="current_order" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    {currentOrder ? (
                      <>
                        <ContextCard title={currentOrder.orderNumber}>
                          <DetailRow icon={Package} label="Status" value={toTitle(currentOrder.status)} />
                          <DetailRow icon={CreditCard} label="Payment" value={toTitle(currentOrder.paymentStatus)} />
                          <DetailRow icon={ShoppingCart} label="Total" value={formatCurrency(currentOrder.totalAmount, currentOrder.currency)} />
                          <DetailRow icon={Clock3} label="Created" value={formatDateTime(currentOrder.createdAt)} />
                        </ContextCard>
                        <ContextCard title="Cart / order items">
                          {loadingOrderItems ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Loading order items…</p>
                          ) : orderItems.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No order items available for this order.</p>
                          ) : (
                            <div className="space-y-3">
                              {orderItems.map((item) => (
                                <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/80">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.productName}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Qty {item.quantity} • {formatCurrency(item.totalPrice, currentOrder.currency)}
                                  </p>
                                  {item.notes ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.notes}</p> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </ContextCard>
                      </>
                    ) : (
                      <QueueEmptyState label="No current order is linked to this conversation yet." className="m-4" />
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="payment" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    {currentOrder ? (
                      <ContextCard title="Payment review">
                        <DetailRow icon={CreditCard} label="Method" value={currentOrder.paymentMethod ? toTitle(currentOrder.paymentMethod) : "Not set"} />
                        <DetailRow icon={CheckCircle2} label="Status" value={toTitle(currentOrder.paymentStatus)} />
                        <DetailRow icon={ArrowUpRight} label="Paid amount" value={formatCurrency(currentOrder.paidAmount, currentOrder.currency)} />
                        <DetailRow icon={AlertCircle} label="Balance due" value={formatCurrency(currentOrder.balanceDue, currentOrder.currency)} />
                        <DetailRow icon={FileText} label="Payment notes" value={currentOrder.paymentNotes || "No payment notes"} />
                      </ContextCard>
                    ) : (
                      <QueueEmptyState label="Payment context will appear once an order exists." className="m-4" />
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="delivery" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    {currentOrder ? (
                      <ContextCard title="Delivery follow-up">
                        <DetailRow icon={Truck} label="Delivery status" value={toTitle(currentOrder.status)} />
                        <DetailRow icon={Users} label="Assignee" value={currentOrder.deliveryAssigneeName || "Not assigned"} />
                        <DetailRow icon={Phone} label="Assignee phone" value={currentOrder.deliveryAssigneePhone || "Not provided"} />
                        <DetailRow icon={MapPin} label="Zone" value={currentOrder.deliveryZone || "Not set"} />
                        <DetailRow icon={Package} label="Tracking" value={currentOrder.trackingNumber || "No tracking"} />
                      </ContextCard>
                    ) : (
                      <QueueEmptyState label="Delivery context will appear once an order reaches fulfilment." className="m-4" />
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="notes" className="min-h-0 flex-1">
                <div className="flex h-full flex-col p-4">
                  <Label htmlFor="customer-notes">Internal notes</Label>
                  <Textarea
                    id="customer-notes"
                    value={customerNotes}
                    onChange={(event) => setCustomerNotes(event.target.value)}
                    placeholder="Add order, payment, address, or escalation notes for the next staff member."
                    className="mt-3 min-h-[220px] flex-1 resize-none"
                  />
                  <Button className="mt-3 self-end" disabled={savingNotes} onClick={handleSaveNotes}>
                    {savingNotes ? "Saving…" : "Save notes"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-4">
                    {loadingTimeline ? (
                      <QueueEmptyState label="Loading customer timeline…" />
                    ) : timeline.length === 0 ? (
                      <QueueEmptyState label="No timeline events are available for this customer yet." />
                    ) : (
                      timeline.map((event) => (
                        <div key={event.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/80">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <Badge className={cn("rounded-full border", contextToneClass[event.tone])}>{event.title}</Badge>
                              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{event.description}</p>
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatDateTime(event.createdAt)}</p>
                          </div>
                          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:grid-cols-2">
                            <p><span className="font-semibold text-slate-700 dark:text-slate-200">Source:</span> {event.source}</p>
                            <p><span className="font-semibold text-slate-700 dark:text-slate-200">Linked:</span> {event.linkedObject}</p>
                            <p className="sm:col-span-2"><span className="font-semibold text-slate-700 dark:text-slate-200">Next:</span> {event.nextAction}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </section>
          ) : null}
        </div>

        <ConversationOrderDialog
          open={createOrderOpen}
          onOpenChange={setCreateOrderOpen}
          customerId={visibleSelectedConversation?.customerId || ""}
          conversationId={visibleSelectedConversation?.id || ""}
          products={products}
          onCreated={async () => {
            await reloadOrders()
            setContextTab("current_order")
          }}
        />

        <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Assign delivery</DialogTitle>
              <DialogDescription>Update delivery assignee, route, and tracking from the inbox.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="delivery-assignee-name">Assignee</Label>
                <Input
                  id="delivery-assignee-name"
                  value={deliveryDraft.deliveryAssigneeName}
                  onChange={(event) => setDeliveryDraft((current) => ({ ...current, deliveryAssigneeName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery-assignee-phone">Assignee phone</Label>
                <Input
                  id="delivery-assignee-phone"
                  value={deliveryDraft.deliveryAssigneePhone}
                  onChange={(event) => setDeliveryDraft((current) => ({ ...current, deliveryAssigneePhone: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery-zone">Delivery zone</Label>
                <Input
                  id="delivery-zone"
                  value={deliveryDraft.deliveryZone}
                  onChange={(event) => setDeliveryDraft((current) => ({ ...current, deliveryZone: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tracking-number">Tracking number</Label>
                <Input
                  id="tracking-number"
                  value={deliveryDraft.trackingNumber}
                  onChange={(event) => setDeliveryDraft((current) => ({ ...current, trackingNumber: event.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)}>Cancel</Button>
              <Button disabled={submittingAction === "delivery"} onClick={handleSaveDelivery}>
                {submittingAction === "delivery" ? "Saving…" : "Save delivery"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send product</DialogTitle>
              <DialogDescription>Insert a real product into the reply composer.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="grid gap-3 pr-4 md:grid-cols-2">
                {products.length === 0 ? <QueueEmptyState label="No active products are available." /> : null}
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setMessageText(`${product.name}${product.sku ? ` (${product.sku})` : ""} - ${formatCurrency(product.price)}`)
                      setProductDialogOpen(false)
                    }}
                    className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                  >
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{product.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{product.sku || "No SKU"}</p>
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{formatCurrency(product.price)}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </WorkspacePage>
    </>
  )
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string
  icon: typeof ShoppingCart
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button size="sm" variant="outline" disabled={disabled} onClick={onClick}>
      <Icon className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}

function CounterChip({ label, value, tone }: { label: string; value: number; tone: "slate" | "blue" | "amber" | "red" }) {
  return (
    <div className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", counterToneClass[tone])}>
      {label}: {value}
    </div>
  )
}

function ContextCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-950">
      <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{value}</p>
      </div>
    </div>
  )
}

function QueueEmptyState({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400", className)}>
      {label}
    </div>
  )
}

function ConversationOrderDialog({
  open,
  onOpenChange,
  customerId,
  conversationId,
  products,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  conversationId: string
  products: CsrProductDto[]
  onCreated: () => Promise<void>
}) {
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online" | "bank_transfer">("cod")
  const [shippingFee, setShippingFee] = useState("0")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [paidAmount, setPaidAmount] = useState("0")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState([{ productId: "", quantity: "1", unitPrice: "" }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setPaymentMethod("cod")
      setShippingFee("0")
      setDiscountAmount("0")
      setPaidAmount("0")
      setNotes("")
      setLines([{ productId: "", quantity: "1", unitPrice: "" }])
      setError(null)
    }
  }, [open])

  const total = useMemo(
    () =>
      Math.max(
        lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0) +
          Number(shippingFee || 0) -
          Number(discountAmount || 0),
        0,
      ),
    [discountAmount, lines, shippingFee],
  )

  const submit = async () => {
    setError(null)
    if (!customerId || !conversationId) return setError("Select a conversation before creating an order.")
    if (lines.some((line) => !line.productId || Number(line.quantity) < 1 || Number(line.unitPrice) < 0)) {
      return setError("Each order line needs a product, quantity, and valid price.")
    }
    if (Number(paidAmount) > total) return setError("Paid amount cannot be greater than order total.")

    setSaving(true)
    try {
      await csrOrdersApi.create({
        customerId,
        conversationId,
        paymentMethod,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
        shippingFee: Number(shippingFee || 0),
        discountAmount: Number(discountAmount || 0),
        paidAmount: Number(paidAmount || 0),
        notes: notes.trim() || undefined,
      })
      await onCreated()
      onOpenChange(false)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Failed to create order"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create order from conversation</DialogTitle>
          <DialogDescription>Turn the selected conversation into a live commerce order without leaving inbox.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cod">Cash on delivery</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="online">Online payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={() => setLines((current) => [...current, { productId: "", quantity: "1", unitPrice: "" }])}>
                Add item
              </Button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:grid-cols-[1fr_80px_120px]">
                <Select
                  value={line.productId}
                  onValueChange={(value) => {
                    const product = products.find((item) => item.id === value)
                    setLines((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, productId: value, unitPrice: String(product?.price || 0) } : row,
                      ),
                    )
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, rowIndex) => (rowIndex === index ? { ...row, quantity: event.target.value } : row)),
                    )
                  }
                />
                <Input
                  type="number"
                  min="0"
                  value={line.unitPrice}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, rowIndex) => (rowIndex === index ? { ...row, unitPrice: event.target.value } : row)),
                    )
                  }
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <AmountField label="Shipping fee" value={shippingFee} onChange={setShippingFee} />
            <AmountField label="Discount" value={discountAmount} onChange={setDiscountAmount} />
            <AmountField label="Paid amount" value={paidAmount} onChange={setPaidAmount} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-notes">Notes</Label>
            <Textarea id="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[100px]" />
          </div>

          <DialogFooter className="items-center">
            <p className="mr-auto text-sm text-slate-500 dark:text-slate-400">Order total: {formatCurrency(total)}</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={saving} onClick={submit}>{saving ? "Creating…" : "Create order"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AmountField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

const counterToneClass = {
  slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200",
  amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200",
} as const

const initialsOf = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

const intentBadgeClass = (intent: string) => {
  if (intent === "Payment review") return "rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
  if (intent === "Order intent") return "rounded-full border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200"
  if (intent === "Complaint") return "rounded-full border border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
  if (intent === "Delivery") return "rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200"
  if (intent === "Follow up") return "rounded-full border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200"
  return "rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300"
}

const statusBadgeClass = (status: CsrConversationDto["status"]) => {
  if (status === "resolved" || status === "closed") return "rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
  if (status === "pending") return "rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
  return "rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
}

const paymentBadgeClass = (status: CsrOrderDto["paymentStatus"]) => {
  if (status === "paid" || status === "cod_collected") return "rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
  if (status === "pending" || status === "partially_paid" || status === "cod_pending") return "rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
  if (status === "failed" || status === "refunded") return "rounded-full border border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
  return "rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
}

const deliveryBadgeClass = (status: CsrOrderDto["status"]) => {
  if (status === "delivered" || status === "cod_collected") return "rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
  if (status === "out_for_delivery" || status === "preparing" || status === "packed") return "rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200"
  if (status === "failed_delivery" || status === "returned" || status === "cancelled") return "rounded-full border border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
  return "rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300"
}
