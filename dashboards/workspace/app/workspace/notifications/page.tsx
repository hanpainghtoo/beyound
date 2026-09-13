"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Bell, Check, CheckCircle, Info, Trash2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection } from "@/components/workspace"
import {
  csrNotificationsApi,
  getApiErrorMessage,
  type CsrNotificationDto,
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
  const [notifications, setNotifications] = useState<CsrNotificationDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  const loadNotifications = () => {
    setIsLoading(true)
    setError("")
    csrNotificationsApi
      .list()
      .then(setNotifications)
      .catch((requestError) => {
        setError(getApiErrorMessage(requestError, "Unable to load notifications"))
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(loadNotifications, [])

  const markRead = async (id: string) => {
    const updated = await csrNotificationsApi.markRead(id)
    setNotifications((current) => current.map((item) => (item.id === id ? updated : item)))
  }

  const markAllRead = async () => {
    await csrNotificationsApi.markAllRead()
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
  }

  const remove = async (id: string) => {
    await csrNotificationsApi.delete(id)
    setNotifications((current) => current.filter((item) => item.id !== id))
  }

  const unreadCount = notifications.filter((item) => !item.isRead).length

  return (
    <>
      <WorkspaceHeader eyebrow="Daily Work" title="Notifications" description="Your persisted ZayOS Workspace notifications." actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{unreadCount} unread</Badge>
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              <Check className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          </div>
        } />

      <WorkspacePage containerClassName="max-w-4xl">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        <WorkspaceSection
          title="Recent Notifications"
          description="Notification delivery preferences will be managed from Workspace Settings once persisted."
          action={<Badge variant="secondary">{unreadCount} unread</Badge>}
        >
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading notifications…</p>
          ) : error ? (
            <WorkspaceEmptyState
              icon={AlertCircle}
              title="Notifications are unavailable"
              description="Please refresh or try again later."
            />
          ) : notifications.length === 0 ? (
            <WorkspaceEmptyState
              icon={Bell}
              title="No notifications yet"
              description="Notifications will appear here once workspace activity is recorded."
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
                        <Button variant="ghost" size="icon" onClick={() => markRead(notification.id)} aria-label="Mark read">
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => remove(notification.id)} aria-label="Delete notification">
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
