"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
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
  agentConversationsApi,
  agentDashboardApi,
  agentProductsApi,
  getApiErrorMessage,
  getStoredSession,
  tenantBillingApi,
  tenantAgentsApi,
  tenantChannelsApi,
  tenantSettingsApi,
  type AgentConversationDto,
  type CommerceWorkspaceStatsDto,
} from "@/lib/api"
import { toast } from "sonner"
import { useChannelOptions } from "@/lib/queries/channels"
import { useProductOptions } from "@/lib/queries/products"
import { useTeamOptions } from "@/lib/queries/team"
import { useOrdersBulk } from "@/lib/queries/orders"
import { useI18n } from "@/components/providers/i18n-provider"

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

function formatRelativeTime(value: string | null | undefined, t: (key: string, values?: Record<string, string | number>) => string) {
  if (!value) return t("workspace.home.noRecentActivity")
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return t("workspace.home.justNow")
  if (minutes < 60) return t("workspace.home.minutesAgo", { count: minutes })
  if (minutes < 1_440) return t("workspace.home.hoursAgo", { count: Math.floor(minutes / 60) })
  return t("workspace.home.daysAgo", { count: Math.floor(minutes / 1_440) })
}

function humanizeStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getConversationStage(conversation: AgentConversationDto, t: (key: string) => string) {
  const subject = (conversation.subject || "").toLowerCase()
  const tags = conversation.tags?.map((tag) => tag.toLowerCase()) || []

  if (subject.includes("payment") || tags.includes("payment")) return t("workspace.home.stagePayment")
  if (subject.includes("confirm") || tags.includes("confirm")) return t("workspace.home.stageConfirm")
  if (conversation.status === "pending") return t("workspace.home.stageUnread")
  return t("workspace.home.stageNeedsReply")
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
  const { t } = useI18n()
  const session = getStoredSession()
  const [stats, setStats] = useState(emptyStats)
  const [conversations, setConversations] = useState<AgentConversationDto[]>([])
  // Orders — cached bulk scan shared with customers page/inbox consumers.
  const ordersBulkQuery = useOrdersBulk()
  const orders = useMemo(() => ordersBulkQuery.data ?? [], [ordersBulkQuery.data])
  const [setupTasks, setSetupTasks] = useState<SetupTask[]>([])
  const [setupGuideDismissed, setSetupGuideDismissed] = useState(false)
  const [setupGuideCompleted, setSetupGuideCompleted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  // Setup counts — same cached option entries the selectors use, so the
  // dashboard and dropdowns share one request per source once warmed.
  const setupChannelsQuery = useChannelOptions()
  const setupProductsQuery = useProductOptions(true)
  const setupTeamQuery = useTeamOptions(false)

  const setupChannels = setupChannelsQuery.data
  const setupProducts = setupProductsQuery.data
  const setupTeam = setupTeamQuery.data

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true)
      setLoadFailed(false)
      try {
        const [statsResult, assignedResult] = await Promise.all([
          agentDashboardApi.stats(),
          agentConversationsApi.list({ filter: "assigned" }),
        ])
        setStats(statsResult)
        setConversations(assignedResult.slice(0, 6))

        const [settingsResult, channelsResult, productsResult, agentsResult, billingResult] = await Promise.allSettled([
          tenantSettingsApi.get(),
          setupChannels ? Promise.resolve(setupChannels) : tenantChannelsApi.list(),
          setupProducts ? Promise.resolve({ data: setupProducts }) : agentProductsApi.list(),
          setupTeam ? Promise.resolve(setupTeam) : tenantAgentsApi.list(),
          tenantBillingApi.get(),
        ])
        const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null
        const onboardingState = settings?.featureFlags?.onboardingSetupGuide as { dismissedAt?: string; completedAt?: string } | undefined
        setSetupGuideDismissed(Boolean(onboardingState?.dismissedAt))
        setSetupGuideCompleted(Boolean(onboardingState?.completedAt))
        const channels = channelsResult.status === "fulfilled" ? channelsResult.value : null
        const products = productsResult.status === "fulfilled" ? productsResult.value : null
        const agents = agentsResult.status === "fulfilled" ? agentsResult.value : null
        const billing = billingResult.status === "fulfilled" ? billingResult.value : null
        // Setup hooks fetch active-only products but the FULL team roster, so
        // re-derive the same display filtering the old direct calls applied.
        const activeChannels = channels?.filter((channel) => channel.status === "active" || channel.connectionStatus === "connected").length
        const activeProducts = products && Array.isArray(products)
          ? products.filter((product) => product.status === "active").length
          : products?.data.filter((product) => product.status === "active").length

        const nextSetupTasks: SetupTask[] = [
          {
            key: "profile",
            title: t("workspace.home.taskProfileTitle"),
            detail: settings
              ? t("workspace.home.taskProfileDetail", {
                  company: settings.companyName,
                  phone: settings.contactPhone ? t("workspace.home.phoneSaved") : "",
                })
              : t("workspace.home.profileUnavailable"),
            href: "/workspace/settings",
            icon: ShoppingBag,
            complete: Boolean(settings?.companyName && settings?.contactEmail && settings?.contactPhone),
            status: settingsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "channels",
            title: t("workspace.home.taskChannelsTitle"),
            detail: channels
              ? t("workspace.home.channelsDetail", { active: activeChannels || 0, total: channels.length })
              : t("workspace.home.channelsUnavailable"),
            href: "/workspace/channels",
            icon: Radio,
            complete: Boolean(activeChannels && activeChannels > 0),
            status: channelsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "products",
            title: t("workspace.home.taskProductsTitle"),
            detail: products
              ? t("workspace.home.productsDetail", {
                  count: activeProducts || 0,
                  noun: activeProducts === 1 ? t("workspace.home.productOne") : t("workspace.home.productOther"),
                })
              : t("workspace.home.productsUnavailable"),
            href: "/workspace/products",
            icon: Package,
            complete: Boolean(activeProducts && activeProducts > 0),
            status: productsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "team",
            title: t("workspace.home.taskTeamTitle"),
            detail: Array.isArray(agents)
              ? t("workspace.home.teamDetail", {
                  count: agents.length,
                  noun: agents.length === 1 ? t("workspace.home.userOne") : t("workspace.home.userOther"),
                })
              : t("workspace.home.teamUnavailable"),
            href: "/workspace/team",
            icon: UsersRound,
            complete: Boolean(Array.isArray(agents) && agents.length > 1),
            status: agentsResult.status === "fulfilled" ? "pending" : "unknown",
          },
          {
            key: "billing",
            title: t("workspace.home.taskBillingTitle"),
            detail: billing?.plan ? t("workspace.home.billingDetail", { plan: billing.plan.name }) : t("workspace.home.billingUnavailable"),
            href: "/workspace/billing",
            icon: CreditCard,
            complete: Boolean(billing?.plan),
            status: billingResult.status === "fulfilled" ? "pending" : "unknown",
          },
        ]

        setSetupTasks(nextSetupTasks.map((task) => ({ ...task, status: task.complete ? "complete" : task.status })))
      } catch (requestError) {
        setLoadFailed(true)
        toast.error(getApiErrorMessage(requestError, t("workspace.home.unableLoad")))
      } finally {
        setIsLoading(false)
      }
    }

    void loadDashboard()
    // Reloads on retry by design — setup queries warm the cache independently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken])

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
      toast.error(getApiErrorMessage(requestError, t("workspace.home.unableHideGuide")))
    }
  }

  const commerceOverview = useMemo(() => {
    const todayOrders = orders.filter((order) => isToday(order.createdAt))
    const pendingDeliveries = orders.filter((order) => order.status === "confirmed" && ["packed", "out_for_delivery"].includes(order.deliveryStatus)).length
    const paymentsToConfirm = orders.filter((order) => order.paymentStatus === "unpaid" && ["pending", "confirmed"].includes(order.status)).length
    const revenueToday = todayOrders.filter((order) => order.status === "confirmed" && order.paymentStatus === "paid" && order.deliveryStatus !== "returned").reduce((sum, order) => sum + Number(order.paidAmount || 0), 0)

    return {
      openConversations: stats.assignedConversations,
      newConversations: stats.unreadConversations,
      newOrdersToday: todayOrders.length,
      pendingDeliveries,
      paymentsToConfirm,
      followUpsDue: conversations.filter((conversation) => conversation.priority === "high").length,
      revenueToday,
      avgResponseTime: stats.avgResponseTime > 0 ? `${Math.max(1, Math.round(stats.avgResponseTime / 60))}m` : t("workspace.home.notAvailable"),
      currency: orders[0]?.currency || "MMK",
    }
  }, [orders, conversations, stats.assignedConversations, stats.unreadConversations, stats.avgResponseTime, t])

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const conversationEvents = conversations.slice(0, 3).map((conversation) => ({
      id: `conversation-${conversation.id}`,
      title: conversation.customer?.fullName || t("workspace.home.customerConversation"),
      detail: conversation.subject || humanizeStatus(conversation.status),
      meta: `${getConversationStage(conversation, t)} · ${formatRelativeTime(conversation.lastMessageAt || conversation.updatedAt, t)}`,
      sortAt: conversation.lastMessageAt || conversation.updatedAt,
      href: `/workspace/inbox?conversation=${conversation.id}`,
      tone: "conversation" as const,
    }))

    const orderEvents = orders.slice(0, 3).map((order): ActivityItem => {
      const tone: ActivityItem["tone"] =
        order.paymentStatus === "unpaid"
          ? "payment"
          : order.deliveryStatus === "out_for_delivery"
            ? "delivery"
            : "order"

      return {
        id: `order-${order.id}`,
        title: order.orderNumber,
        detail: `${order.customer?.fullName || t("workspace.home.customerNotLinked")} · ${formatCurrency(order.totalAmount, order.currency)}`,
        meta: `${humanizeStatus(order.status)} · ${formatRelativeTime(order.createdAt, t)}`,
        sortAt: order.createdAt,
        href: "/workspace/orders",
        tone,
      }
    })

    return [...conversationEvents, ...orderEvents]
      .sort((left, right) => new Date(right.sortAt).getTime() - new Date(left.sortAt).getTime())
      .slice(0, 6)
  }, [conversations, orders, t])

  const commerceHealth = useMemo(
    () => [
      {
        label: t("workspace.home.healthResponseLabel"),
        value: isLoading ? t("workspace.home.checking") : commerceOverview.avgResponseTime,
        note: t("workspace.home.healthResponseNote"),
      },
      {
        label: t("workspace.home.healthFollowupLabel"),
        value: isLoading ? t("workspace.home.checking") : `${commerceOverview.followUpsDue}`,
        note: t("workspace.home.healthFollowupNote"),
      },
      {
        label: t("workspace.home.healthPaymentLabel"),
        value: isLoading ? t("workspace.home.checking") : `${commerceOverview.paymentsToConfirm}`,
        note: t("workspace.home.healthPaymentNote"),
      },
      {
        label: t("workspace.home.healthDeliveryLabel"),
        value: isLoading ? t("workspace.home.checking") : `${commerceOverview.pendingDeliveries}`,
        note: t("workspace.home.healthDeliveryNote"),
      },
    ],
    [commerceOverview.avgResponseTime, commerceOverview.followUpsDue, commerceOverview.paymentsToConfirm, commerceOverview.pendingDeliveries, isLoading, t],
  )

  const attentionCards = [
    {
      href: "/workspace/inbox?filter=unread",
      icon: Inbox,
      title: t("workspace.home.attentionUnreadTitle", { count: stats.unreadConversations }),
      detail: t("workspace.home.attentionUnreadDetail"),
      tone: "border-indigo-100 bg-indigo-50/80 text-indigo-700",
    },
    {
      href: "/workspace/orders",
      icon: CreditCard,
      title: t("workspace.home.attentionPaymentsTitle", { count: commerceOverview.paymentsToConfirm }),
      detail: t("workspace.home.attentionPaymentsDetail"),
      tone: "border-amber-100 bg-amber-50/80 text-amber-700",
    },
    {
      href: "/workspace/orders",
      icon: Truck,
      title: t("workspace.home.attentionDeliveriesTitle", { count: commerceOverview.pendingDeliveries }),
      detail: t("workspace.home.attentionDeliveriesDetail"),
      tone: "border-emerald-100 bg-emerald-50/80 text-emerald-700",
    },
    {
      href: "/workspace/orders",
      icon: WalletCards,
      title: t("workspace.home.attentionCodTitle", { count: orders.filter((order) => order.paymentStatus === "unpaid").length }),
      detail: t("workspace.home.attentionCodDetail"),
      tone: "border-violet-100 bg-violet-50/80 text-violet-700",
    },
  ]


  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.home.eyebrow")}
        title={t("workspace.home.greeting", { name: firstName })}
        description={t("workspace.home.description")}
      />
      <WorkspacePage>
        {showSetupGuide ? (
          <WorkspaceSection
            className="hidden sm:block"
            title={t("workspace.home.setupTitle")}
            description={t("workspace.home.setupDescription")}
            action={
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {isLoading ? t("workspace.home.checking") : t("workspace.home.setupProgress", { done: setupCompleteCount, total: setupTotal })}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => void dismissSetupGuide()}>
                  {t("workspace.home.hide")}
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {(setupTasks.length ? setupTasks : [
                { key: "profile", title: t("workspace.home.taskProfileTitle"), detail: t("workspace.home.checkingProfile"), href: "/workspace/settings", icon: ShoppingBag, complete: false, status: "unknown" as const },
                { key: "channels", title: t("workspace.home.taskChannelsTitle"), detail: t("workspace.home.checkingChannels"), href: "/workspace/channels", icon: Radio, complete: false, status: "unknown" as const },
                { key: "products", title: t("workspace.home.taskProductsTitle"), detail: t("workspace.home.checkingProducts"), href: "/workspace/products", icon: Package, complete: false, status: "unknown" as const },
                { key: "team", title: t("workspace.home.taskTeamTitle"), detail: t("workspace.home.checkingTeam"), href: "/workspace/team", icon: UsersRound, complete: false, status: "unknown" as const },
                { key: "billing", title: t("workspace.home.taskBillingTitle"), detail: t("workspace.home.checkingBilling"), href: "/workspace/billing", icon: CreditCard, complete: false, status: "unknown" as const },
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
            <h2 id="commerce-overview" className="text-base font-bold text-slate-950 dark:text-slate-50">{t("workspace.home.todayOverview")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("workspace.home.todayOverviewDescription")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <WorkspaceStatCard label={t("workspace.home.statAssigned")} value={isLoading ? "—" : commerceOverview.openConversations} note={t("workspace.home.statAssignedNote")} icon={MessageSquareText} tone="indigo" />
            <WorkspaceStatCard label={t("workspace.home.statWaitingReply")} value={isLoading ? "—" : commerceOverview.newConversations} note={t("workspace.home.statWaitingReplyNote")} icon={Inbox} tone="blue" />
            <WorkspaceStatCard label={t("workspace.home.statDrafts")} value={isLoading ? "—" : commerceOverview.newOrdersToday} note={t("workspace.home.statDraftsNote")} icon={ShoppingBag} tone="amber" />
            <WorkspaceStatCard label={t("workspace.home.statCodDelivery")} value={isLoading ? "—" : commerceOverview.pendingDeliveries} note={t("workspace.home.statCodDeliveryNote")} icon={Truck} tone="amber" />
            <WorkspaceStatCard
              label={t("workspace.home.statCollected")}
              value={isLoading ? "—" : formatCurrency(commerceOverview.revenueToday, commerceOverview.currency)}
              note={t("workspace.home.statCollectedNote")}
              icon={WalletCards}
              tone="emerald"
            />
          </div>
        </section>

        <WorkspaceSection
          title={t("workspace.home.attentionTitle")}
          description={t("workspace.home.attentionDescription")}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/workspace/inbox">
                {t("workspace.home.openInbox")}
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
            title={t("workspace.home.recentTitle")}
            description={t("workspace.home.recentDescription")}
            action={<Button asChild variant="outline" size="sm"><Link href="/workspace/inbox">{t("workspace.home.viewAll")}</Link></Button>}
          >
            {isLoading ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 dark:text-slate-400">{t("workspace.home.loadingRecent")}</p>
            ) : loadFailed ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <p>{t("workspace.home.recentUnavailable")}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setReloadToken((token) => token + 1)}>{t("workspace.home.retry")}</Button>
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 dark:text-slate-400">{t("workspace.home.recentEmpty")}</p>
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
                        {t("workspace.home.open")}
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </WorkspaceSection>

          <div className="space-y-5">
          <WorkspaceSection title={t("workspace.home.healthTitle")} description={t("workspace.home.healthDescription")}>
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
