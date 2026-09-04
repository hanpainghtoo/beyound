"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Circle,
  CreditCard,
  Inbox,
  MessageSquareText,
  Package,
  Radio,
  ShoppingBag,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkspacePage, WorkspaceSection, WorkspaceStatCard } from "@/components/workspace"
import {
  csrConversationsApi,
  csrDashboardApi,
  csrOrdersApi,
  csrProductsApi,
  getApiErrorMessage,
  getStoredSession,
  tenantCsrsApi,
  tenantBillingApi,
  tenantChannelsApi,
  tenantSettingsApi,
  type CsrConversationDto,
  type CsrOrderDto,
  type CommerceWorkspaceStatsDto,
} from "@/lib/api"

const emptyStats: CommerceWorkspaceStatsDto = {
  assignedConversations: 0,
  unreadConversations: 0,
  todayChatsHandled: 0,
  avgResponseTime: 0,
  resolutionRate: 0,
  customerSatisfactionAvg: 0,
  onlineTime: 0,
  activeCampaigns: 0,
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "No recent activity"
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1_440)}d ago`
}

function humanizeStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getConversationStage(conversation: CsrConversationDto) {
  const subject = (conversation.subject || "").toLowerCase()
  const tags = conversation.tags?.map((tag) => tag.toLowerCase()) || []

  if (subject.includes("payment") || tags.includes("payment")) return "Payment review"
  if (subject.includes("confirm") || tags.includes("confirm")) return "Waiting confirmation"
  if (conversation.status === "pending") return "Unread"
  return "Needs reply"
}

function isToday(value: string) {
  const date = new Date(value)
  const today = new Date()
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
}

function formatCurrency(amount: number | string, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount))
}

type SetupTask = {
  key: string
  title: string
  detail: string
  href: string
  icon: typeof CreditCard
  complete: boolean
  status: "complete" | "pending" | "unknown"
}

type ActivityItem = {
  id: string
  title: string
  detail: string
  meta: string
  sortAt: string
  href: string
  tone: "conversation" | "order" | "delivery" | "payment"
}

export default function DashboardHome() {
  const session = getStoredSession()
  const [stats, setStats] = useState(emptyStats)
  const [conversations, setConversations] = useState<CsrConversationDto[]>([])
  const [orders, setOrders] = useState<CsrOrderDto[]>([])
  const [setupTasks, setSetupTasks] = useState<SetupTask[]>([])
  const [setupGuideDismissed, setSetupGuideDismissed] = useState(false)
  const [setupGuideCompleted, setSetupGuideCompleted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true)
      setError("")
      try {
        const [statsResult, assignedResult, orderResult] = await Promise.all([
          csrDashboardApi.stats(),
          csrConversationsApi.list({ filter: "assigned" }),
          csrOrdersApi.list(),
        ])
        setStats(statsResult)
        setConversations(assignedResult.slice(0, 6))
        setOrders(orderResult)

        const [settingsResult, channelsResult, productsResult, csrsResult, billingResult] = await Promise.allSettled([
          tenantSettingsApi.get(),
          tenantChannelsApi.list(),
          csrProductsApi.list(),
          tenantCsrsApi.list(),
          tenantBillingApi.get(),
        ])
        const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null
        const onboardingState = settings?.featureFlags?.onboardingSetupGuide as { dismissedAt?: string; completedAt?: string } | undefined
        setSetupGuideDismissed(Boolean(onboardingState?.dismissedAt))
        setSetupGuideCompleted(Boolean(onboardingState?.completedAt))
        const channels = channelsResult.status === "fulfilled" ? channelsResult.value : null
        const products = productsResult.status === "fulfilled" ? productsResult.value : null
        const csrs = csrsResult.status === "fulfilled" ? csrsResult.value : null
        const billing = billingResult.status === "fulfilled" ? billingResult.value : null
        const activeChannels = channels?.filter((channel) => channel.status === "active" || channel.connectionStatus === "connected").length
        const activeProducts = products?.filter((product) => product.status === "active").length

        const nextSetupTasks: SetupTask[] = [
          {
            key: "profile",
            title: "Complete business profile",
            detail: settings ? `${settings.companyName}${settings.contactPhone ? " · phone saved" : ""}` : "Business profile status unavailable",
            href: "/workspace/settings",
            icon: ShoppingBag,
            complete: Boolean(settings?.companyName && settings?.contactEmail && settings?.contactPhone),
            status: settingsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "channels",
            title: "Connect a sales channel",
            detail: channels ? `${activeChannels || 0} active of ${channels.length} configured` : "Channel status unavailable",
            href: "/workspace/channels",
            icon: Radio,
            complete: Boolean(activeChannels && activeChannels > 0),
            status: channelsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "products",
            title: "Add products",
            detail: products ? `${activeProducts || 0} active product${activeProducts === 1 ? "" : "s"}` : "Product status unavailable",
            href: "/workspace/products",
            icon: Package,
            complete: Boolean(activeProducts && activeProducts > 0),
            status: productsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "team",
            title: "Invite your team",
            detail: csrs ? `${csrs.length} workspace user${csrs.length === 1 ? "" : "s"}` : "Team status unavailable",
            href: "/workspace/team",
            icon: UsersRound,
            complete: Boolean(csrs && csrs.length > 1),
            status: csrsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "billing",
            title: "Review plan and billing",
            detail: billing?.plan ? `${billing.plan.name} plan` : "No active plan found",
            href: "/workspace/billing",
            icon: CreditCard,
            complete: Boolean(billing?.plan),
            status: billingResult.status === "fulfilled" ? "pending" : "unknown",
          },
        ]

        setSetupTasks(nextSetupTasks.map((task) => ({ ...task, status: task.complete ? "complete" : task.status })))
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unable to load workspace dashboard"))
      } finally {
        setIsLoading(false)
      }
    }

    void loadDashboard()
  }, [])

  const firstName = session?.user.fullName?.split(" ")[0] || "there"
  const setupCompleteCount = setupTasks.filter((task) => task.complete).length
  const setupTotal = setupTasks.length || 5
  const showSetupGuide = !setupGuideDismissed && !setupGuideCompleted && (isLoading || setupCompleteCount < setupTotal)

  useEffect(() => {
    if (isLoading || setupGuideCompleted || setupTasks.length === 0 || setupCompleteCount < setupTotal) return
    setSetupGuideCompleted(true)
    tenantSettingsApi.updateOnboardingState({ completedAt: new Date().toISOString() }).catch(() => setSetupGuideCompleted(false))
  }, [isLoading, setupCompleteCount, setupGuideCompleted, setupTasks.length, setupTotal])

  const dismissSetupGuide = async () => {
    setSetupGuideDismissed(true)
    try {
      await tenantSettingsApi.updateOnboardingState({ dismissedAt: new Date().toISOString() })
    } catch (requestError) {
      setSetupGuideDismissed(false)
      setError(getApiErrorMessage(requestError, "Unable to hide setup guide"))
    }
  }

  const commerceOverview = useMemo(() => {
    const todayOrders = orders.filter((order) => isToday(order.createdAt))
    const pendingDeliveries = orders.filter((order) => ["confirmed", "preparing", "packed", "out_for_delivery"].includes(order.status)).length
    const paymentsToConfirm = orders.filter((order) => ["pending", "cod_pending", "partially_paid"].includes(order.paymentStatus)).length
    const revenueToday = todayOrders.reduce((sum, order) => sum + Number(order.paidAmount || 0), 0)

    return {
      openConversations: stats.assignedConversations,
      newConversations: stats.unreadConversations,
      newOrdersToday: todayOrders.length,
      pendingDeliveries,
      paymentsToConfirm,
      followUpsDue: conversations.filter((conversation) => conversation.priority === "high").length,
      revenueToday,
      avgResponseTime: stats.avgResponseTime > 0 ? `${Math.max(1, Math.round(stats.avgResponseTime / 60))}m` : "Not available",
      currency: orders[0]?.currency || "MMK",
    }
  }, [orders, conversations, stats.assignedConversations, stats.unreadConversations, stats.avgResponseTime])

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const conversationEvents = conversations.slice(0, 3).map((conversation) => ({
      id: `conversation-${conversation.id}`,
      title: conversation.customer?.fullName || "Customer conversation",
      detail: conversation.subject || humanizeStatus(conversation.status),
      meta: `${getConversationStage(conversation)} · ${formatRelativeTime(conversation.lastMessageAt || conversation.updatedAt)}`,
      sortAt: conversation.lastMessageAt || conversation.updatedAt,
      href: `/workspace/inbox?conversation=${conversation.id}`,
      tone: "conversation" as const,
    }))

    const orderEvents = orders.slice(0, 3).map((order): ActivityItem => {
      const tone: ActivityItem["tone"] =
        order.paymentStatus === "cod_pending" || order.paymentStatus === "pending"
          ? "payment"
          : order.status === "out_for_delivery"
            ? "delivery"
            : "order"

      return {
        id: `order-${order.id}`,
        title: order.orderNumber,
        detail: `${order.customer?.fullName || "Customer not linked"} · ${formatCurrency(order.totalAmount, order.currency)}`,
        meta: `${humanizeStatus(order.status)} · ${formatRelativeTime(order.createdAt)}`,
        sortAt: order.createdAt,
        href: "/workspace/orders",
        tone,
      }
    })

    return [...conversationEvents, ...orderEvents]
      .sort((left, right) => new Date(right.sortAt).getTime() - new Date(left.sortAt).getTime())
      .slice(0, 6)
  }, [conversations, orders])

  const commerceHealth = useMemo(
    () => [
      {
        label: "Response pace",
        value: isLoading ? "Checking..." : commerceOverview.avgResponseTime,
        note: "Average first response from live workspace traffic",
      },
      {
        label: "Follow-up pressure",
        value: isLoading ? "Checking..." : `${commerceOverview.followUpsDue}`,
        note: "High-priority conversations still waiting on a staff next step",
      },
      {
        label: "Payment review",
        value: isLoading ? "Checking..." : `${commerceOverview.paymentsToConfirm}`,
        note: "Orders still waiting for online, transfer, or COD confirmation",
      },
      {
        label: "Delivery handoff",
        value: isLoading ? "Checking..." : `${commerceOverview.pendingDeliveries}`,
        note: "Orders not yet finished through dispatch or handover",
      },
    ],
    [commerceOverview.avgResponseTime, commerceOverview.followUpsDue, commerceOverview.paymentsToConfirm, commerceOverview.pendingDeliveries, isLoading],
  )

  const attentionCards = [
    {
      href: "/workspace/inbox?filter=unread",
      icon: Inbox,
      title: `${stats.unreadConversations} unread customer messages`,
      detail: "Conversations waiting for a sales reply",
      tone: "border-indigo-100 bg-indigo-50/80 text-indigo-700",
    },
    {
      href: "/workspace/orders",
      icon: CreditCard,
      title: `${commerceOverview.paymentsToConfirm} orders waiting payment confirmation`,
      detail: "Review online payments and pending transfers",
      tone: "border-amber-100 bg-amber-50/80 text-amber-700",
    },
    {
      href: "/workspace/orders",
      icon: Truck,
      title: `${commerceOverview.pendingDeliveries} deliveries pending update`,
      detail: "Track handoff, dispatch, and delivery progress",
      tone: "border-emerald-100 bg-emerald-50/80 text-emerald-700",
    },
    {
      href: "/workspace/orders",
      icon: WalletCards,
      title: `${orders.filter((order) => order.paymentStatus === "cod_pending").length} COD payments to review`,
      detail: "Confirm collection and close the payment loop",
      tone: "border-violet-100 bg-violet-50/80 text-violet-700",
    },
  ]


  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title={`Good morning, ${firstName}`}
        description="Here is what is moving across conversations, orders, payments, and deliveries today."
      />
      <WorkspacePage>
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {showSetupGuide ? (
          <WorkspaceSection
            className="hidden sm:block"
            title="Setup guide"
            description="Finish these live setup checks to make the workspace operational."
            action={
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {isLoading ? "Checking..." : `${setupCompleteCount}/${setupTotal} complete`}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => void dismissSetupGuide()}>
                  Hide
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {(setupTasks.length ? setupTasks : [
                { key: "profile", title: "Complete business profile", detail: "Checking profile", href: "/workspace/settings", icon: ShoppingBag, complete: false, status: "unknown" as const },
                { key: "channels", title: "Connect a sales channel", detail: "Checking channels", href: "/workspace/channels", icon: Radio, complete: false, status: "unknown" as const },
                { key: "products", title: "Add products", detail: "Checking products", href: "/workspace/products", icon: Package, complete: false, status: "unknown" as const },
                { key: "team", title: "Invite your team", detail: "Checking team", href: "/workspace/team", icon: UsersRound, complete: false, status: "unknown" as const },
                { key: "billing", title: "Review plan and billing", detail: "Checking billing", href: "/workspace/billing", icon: CreditCard, complete: false, status: "unknown" as const },
              ]).map((task) => {
                const Icon = task.icon
                return (
                  <Link key={task.key} href={task.href} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-400/30">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-lg bg-slate-100 p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        <Icon className="h-5 w-5" />
                      </span>
                      {task.complete ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /> : <Circle className="h-5 w-5 text-slate-300 dark:text-slate-700" />}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-50">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{task.detail}</p>
                  </Link>
                )
              })}
            </div>
          </WorkspaceSection>
        ) : null}

        <section aria-labelledby="commerce-overview">
          <div className="mb-3">
            <h2 id="commerce-overview" className="text-base font-bold text-slate-950 dark:text-slate-50">Today overview</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Start with the live work counts that tell the team what is moving, blocked, or still waiting.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <WorkspaceStatCard label="Assigned now" value={isLoading ? "—" : commerceOverview.openConversations} note="Live threads currently owned by the workspace" icon={MessageSquareText} tone="indigo" />
            <WorkspaceStatCard label="Waiting reply" value={isLoading ? "—" : commerceOverview.newConversations} note="Unread customer messages needing a response" icon={Inbox} tone="blue" />
            <WorkspaceStatCard label="Drafts and orders" value={isLoading ? "—" : commerceOverview.newOrdersToday} note="Orders created from chat during today’s cycle" icon={ShoppingBag} tone="amber" />
            <WorkspaceStatCard label="COD and delivery" value={isLoading ? "—" : commerceOverview.pendingDeliveries} note="Orders still moving through handoff and fulfilment" icon={Truck} tone="amber" />
            <WorkspaceStatCard
              label="Collected today"
              value={isLoading ? "—" : formatCurrency(commerceOverview.revenueToday, commerceOverview.currency)}
              note="Paid amounts recorded on today’s orders"
              icon={WalletCards}
              tone="emerald"
            />
          </div>
        </section>

        <WorkspaceSection
          title="Needs your attention"
          description="Focus on the work that keeps conversations, payments, and deliveries moving."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/workspace/inbox">
                Open inbox
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        >
          <div className="grid gap-3 xl:grid-cols-4">
            {attentionCards.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl border p-4 transition hover:shadow-sm ${item.tone}`}
                >
                  <span className="rounded-lg bg-white p-2 shadow-sm dark:bg-slate-950">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <strong className="block text-sm text-slate-950 dark:text-slate-50">{item.title}</strong>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </WorkspaceSection>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
          <WorkspaceSection
            title="Recent activity"
            description="The latest conversation and order changes that tell the team what happened and what should happen next."
            action={<Button asChild variant="outline" size="sm"><Link href="/workspace/inbox">View all</Link></Button>}
          >
            {isLoading ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading recent activity…</p>
            ) : error ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Recent activity is unavailable right now.
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 dark:text-slate-400">No conversation or order movement is visible yet.</p>
            ) : (
              recentActivity.map((item) => {
                const toneClass =
                  item.tone === "conversation"
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                    : item.tone === "payment"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                      : item.tone === "delivery"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl border border-transparent p-3 transition hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-900/80"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${toneClass}`}>
                      {item.tone === "conversation" ? "C" : item.tone === "payment" ? "P" : item.tone === "delivery" ? "D" : "O"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{item.title}</p>
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.meta}</p>
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-300">
                        <BellRing className="h-3 w-3" />
                        Open
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </WorkspaceSection>

          <div className="space-y-5">
          <WorkspaceSection title="Commerce health" description="Quick meaning around pace, blockage, and next operational pressure.">
              {commerceHealth.map((item) => (
                <Metric key={item.label} label={item.label} value={item.value} note={item.note} />
              ))}
            </WorkspaceSection>
          </div>
        </div>
      </WorkspacePage>
    </>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
        <strong className="text-sm text-slate-900 dark:text-slate-50">{value}</strong>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>
    </div>
  )
}
