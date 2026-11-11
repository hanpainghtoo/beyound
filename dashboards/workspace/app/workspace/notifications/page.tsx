"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Bell, Check, CheckCircle, Info, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  agentNotificationsApi,
  getApiErrorMessage,
  type AgentNotificationDto,
} from "@/lib/api"

const notificationIcons = {
  info: Info,
  warning: AlertCircle,
  error: XCircle,
  success: CheckCircle,
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export default function NotificationsPage() {
  const { t } = useI18n()
  const [notifications, setNotifications] = useState<AgentNotificationDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const loadNotifications = () => {
    setIsLoading(true)
    setLoadFailed(false)
    agentNotificationsApi
      .list()
      .then(setNotifications)
      .catch((requestError) => {
        setLoadFailed(true)
        toast.error(getApiErrorMessage(requestError, t("workspace.notifications.unableLoad")))
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(loadNotifications, [t])

  const markRead = async (id: string) => {
    try {
      const updated = await agentNotificationsApi.markRead(id)
      setNotifications((current) => current.map((item) => (item.id === id ? updated : item)))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.notifications.unableMarkRead")))
    }
  }

  const markAllRead = async () => {
    try {
      await agentNotificationsApi.markAllRead()
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.notifications.unableMarkAllRead")))
    }
  }

  const remove = async (id: string) => {
    try {
      await agentNotificationsApi.delete(id)
      setNotifications((current) => current.filter((item) => item.id !== id))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.notifications.unableDelete")))
    }
  }

  const unreadCount = notifications.filter((item) => !item.isRead).length

  return (
    <>
      <WorkspaceHeader eyebrow={t("workspace.notifications.eyebrow")} title={t("workspace.notifications.title")} description={t("workspace.notifications.description")} actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{unreadCount} unread</Badge>
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              <Check className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          </div>
        } />

      <WorkspacePage containerClassName="max-w-4xl">
        <WorkspaceSection
          title={t("workspace.notifications.recentTitle")}
          description={t("workspace.notifications.recentDescription")}
          action={<Badge variant="secondary">{unreadCount} unread</Badge>}
        >
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t("workspace.notifications.loading")}</p>
          ) : loadFailed ? (
            <WorkspaceEmptyState
              icon={AlertCircle}
              title={t("workspace.notifications.unavailableTitle")}
              description={t("workspace.notifications.unavailableDescription")}
            />
          ) : notifications.length === 0 ? (
            <WorkspaceEmptyState
              icon={Bell}
              title={t("workspace.notifications.emptyTitle")}
              description={t("workspace.notifications.emptyDescription")}
            />
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Bell
                const content = (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted dark:bg-slate-900">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{notification.title}</p>
                        {!notification.isRead && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <p className="text-sm text-muted-foreground">{notification.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatTime(notification.createdAt)}</p>
                    </div>
                  </>
                )
                return (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-4 rounded-lg border p-4 ${notification.isRead ? "bg-white dark:bg-slate-950" : "border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10"}`}
                  >
                    {notification.actionUrl ? (
                      <Link href={notification.actionUrl} className="flex min-w-0 flex-1 items-start gap-4">
                        {content}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-start gap-4">{content}</div>
                    )}
                    <div className="flex gap-1">
                      {!notification.isRead && (
                        <Button variant="ghost" size="icon" onClick={() => markRead(notification.id)} aria-label={t("workspace.notifications.markReadAria")}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => remove(notification.id)} aria-label={t("workspace.notifications.deleteAria")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </WorkspaceSection>
      </WorkspacePage>
    </>
  )
}
