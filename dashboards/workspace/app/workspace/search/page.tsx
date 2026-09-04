"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, FileSearch, MessageSquare, Search as SearchIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { csrConversationsApi, getApiErrorMessage, type CsrConversationDto } from "@/lib/api"

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value?: string | null) {
  if (!value) return "Unknown"
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

function getConversationSnippet(conversation: CsrConversationDto) {
  return conversation.searchSnippet || conversation.subject || "No message preview available."
}

export default function ConversationSearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CsrConversationDto[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const normalizedQuery = query.trim()
    const timer = window.setTimeout(() => {
      if (normalizedQuery.length < 2) {
        setResults([])
        setError("")
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError("")
      csrConversationsApi
        .search(normalizedQuery)
        .then(setResults)
        .catch((requestError) => {
          setResults([])
          setError(getApiErrorMessage(requestError, "Search failed"))
        })
        .finally(() => setIsLoading(false))
    }, normalizedQuery.length < 2 ? 0 : 300)

    return () => window.clearTimeout(timer)
  }, [query])

  return (
    <>
      <WorkspaceHeader
        eyebrow="Daily Work"
        title="Conversation Search"
        description="Find customer conversations, message history, order references, and payment notes across the workspace."
      />

      <WorkspacePage containerClassName="max-w-[1200px]">
        <WorkspaceSection title="Search conversations" description="Search real tenant conversations, customers, order references, and message text.">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-3.5 h-5 w-5 text-indigo-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customer, phone, order number, or message"
                className="h-12 border-white bg-white pl-12 text-base shadow-sm dark:border-slate-800 dark:bg-slate-950"
                autoFocus
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : null}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h3 className="font-semibold text-slate-950 dark:text-slate-50">Results</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isLoading
                    ? "Searching conversations..."
                    : query.trim().length < 2
                      ? "Enter at least 2 characters to search."
                      : `${results.length} matching conversation${results.length === 1 ? "" : "s"}`}
                </p>
              </div>
              {query.trim().length >= 2 ? <Badge variant="outline">{query.trim()}</Badge> : null}
            </div>

            <div className="max-h-[calc(100vh-22rem)] min-h-[360px] overflow-auto p-4">
              {!isLoading && query.trim().length < 2 ? (
                <WorkspaceEmptyState
                  icon={FileSearch}
                  title="Search conversations"
                  description="Search conversations by customer, phone, order number, or message."
                />
              ) : error ? (
                <WorkspaceEmptyState
                  icon={AlertCircle}
                  title="Conversation search is unavailable"
                  description="Please refresh or try again later."
                />
              ) : !isLoading && query.trim().length >= 2 && results.length === 0 ? (
                <WorkspaceEmptyState
                  icon={MessageSquare}
                  title="No matching conversations found."
                  description="Try another customer name, phone number, order number, or message phrase."
                />
              ) : (
                <div className="space-y-3">
                  {results.map((conversation) => {
                    const customerName = conversation.customer?.fullName || "Unknown customer"
                    const channelName = conversation.channel?.displayName || conversation.channel?.channelName || conversation.channel?.channelType || "Channel"
                    const subject = conversation.subject || "Open conversation"
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
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{getConversationSnippet(conversation)}</p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Last updated {formatDateTime(conversation.lastMessageAt || conversation.updatedAt)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-300">Open in Inbox</span>
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
