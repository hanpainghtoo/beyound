"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, FileSearch, MessageSquare, Search as SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { agentConversationsApi, getApiErrorMessage, type AgentConversationDto } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value: string | null | undefined, t: (key: string) => string) {
  if (!value) return t("workspace.search.unknown")
  return new Date(value).toLocaleString()
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?"
}

function getConversationSnippet(conversation: AgentConversationDto, t: (key: string) => string) {
  return conversation.searchSnippet || conversation.subject || t("workspace.search.noPreview")
}

export default function ConversationSearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AgentConversationDto[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)

  const { t } = useI18n()
  useEffect(() => {
    const normalizedQuery = query.trim()
    const timer = window.setTimeout(() => {
      if (normalizedQuery.length < 2) {
        setResults([])
        setSearchFailed(false)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setSearchFailed(false)
      agentConversationsApi
        .search(normalizedQuery)
        .then(setResults)
        .catch((requestError) => {
          setResults([])
          setSearchFailed(true)
          toast.error(getApiErrorMessage(requestError, t("workspace.search.failed")))
        })
        .finally(() => setIsLoading(false))
    }, normalizedQuery.length < 2 ? 0 : 300)

    return () => window.clearTimeout(timer)
  }, [query, t])

  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.search.eyebrow")}
        title={t("workspace.search.title")}
        description={t("workspace.search.description")}
      />

      <WorkspacePage containerClassName="max-w-[1200px]">
        <WorkspaceSection title={t("workspace.search.sectionTitle")} description={t("workspace.search.sectionDescription")}>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-3.5 h-5 w-5 text-indigo-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("workspace.search.placeholder")}
                className="h-12 border-white bg-white pl-12 text-base shadow-sm dark:border-slate-800 dark:bg-slate-950"
                autoFocus
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h3 className="font-semibold text-slate-950 dark:text-slate-50">{t("workspace.search.results")}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isLoading
                    ? t("workspace.search.searching")
                    : query.trim().length < 2
                      ? t("workspace.search.enterAtLeastTwo")
                      : t("workspace.search.matchingCount", { count: results.length, plural: results.length === 1 ? "" : "s" })}
                </p>
              </div>
              {query.trim().length >= 2 ? <Badge variant="outline">{query.trim()}</Badge> : null}
            </div>

            <div className="max-h-[calc(100vh-22rem)] min-h-[360px] overflow-auto p-4">
              {!isLoading && query.trim().length < 2 ? (
                <WorkspaceEmptyState
                  icon={FileSearch}
                  title={t("workspace.search.sectionTitle")}
                  description={t("workspace.search.emptyStateDescription")}
                />
              ) : searchFailed ? (
                <WorkspaceEmptyState
                  icon={AlertCircle}
                  title={t("workspace.search.unavailableTitle")}
                  description={t("workspace.search.unavailableDescription")}
                />
              ) : !isLoading && query.trim().length >= 2 && results.length === 0 ? (
                <WorkspaceEmptyState
                  icon={MessageSquare}
                  title={t("workspace.search.noMatchTitle")}
                  description={t("workspace.search.noMatchDescription")}
                />
              ) : (
                <div className="space-y-3">
                  {results.map((conversation) => {
                    const customerName = conversation.customer?.fullName || t("workspace.search.unknownCustomer")
                    const channelName = conversation.channel?.displayName || conversation.channel?.channelName || conversation.channel?.channelType || t("workspace.search.channelFallback")
                    const subject = conversation.subject || t("workspace.search.openConversation")
                    return (
                      <Link
                        key={conversation.id}
                        href={`/workspace/inbox?conversation=${conversation.id}`}
                        className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10"
                      >
                        <Avatar>
                          <AvatarFallback>{getInitials(customerName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-950 dark:text-slate-50">{customerName}</p>
                            <Badge variant="outline">{channelName}</Badge>
                            <Badge variant="secondary">{humanize(conversation.status)}</Badge>
                          </div>
                          <p className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">{subject}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{getConversationSnippet(conversation, t)}</p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {t("workspace.search.lastUpdated", { date: formatDateTime(conversation.lastMessageAt || conversation.updatedAt, t) })}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-300">{t("workspace.search.openInInbox")}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </WorkspaceSection>
      </WorkspacePage>
    </>
  )
}
