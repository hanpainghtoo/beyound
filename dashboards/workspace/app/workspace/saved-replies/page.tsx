"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useI18n } from "@/components/providers/i18n-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Search as SearchIcon, Plus, Copy, Edit, Trash2, MessageSquare, Clock, TrendingUp, Hash, ArrowLeft, Image as ImageIcon, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage, WorkspaceSplitView } from "@/components/workspace"
import {
  agentCannedResponsesApi,
  getApiErrorMessage,
  type AgentCannedResponseDto,
  type CreateAgentCannedResponseInput,
} from "@/lib/api"
import { cannedKeys } from "@/lib/queries/canned"
import { MediaPicker } from "@/components/media-picker"
import { useMediaImage } from "@/hooks/use-media-image"

type VisibilityFilter = "all" | AgentCannedResponseDto["visibility"]

type ResponseFormState = {
  title: string
  shortcut: string
  content: string
  tags: string
  visibility: "public" | "private" | "team"
  /** Media-library id of the photo. `null` means "no photo"; the signed URL used for preview is never part of the form state. */
  imageMediaId: string | null
}

const defaultFormState: ResponseFormState = {
  title: "",
  shortcut: "",
  content: "",
  tags: "",
  visibility: "public",
  imageMediaId: null,
}

const toFormState = (response: AgentCannedResponseDto): ResponseFormState => ({
  title: response.title,
  shortcut: response.shortcut || "",
  content: response.content,
  tags: response.tags.join(", "),
  visibility: response.visibility,
  imageMediaId: response.imageMediaId ?? null,
})

const toPayload = (form: ResponseFormState): CreateAgentCannedResponseInput => ({
  title: form.title.trim(),
  shortcut: form.shortcut.trim() || undefined,
  content: form.content.trim(),
  tags: form.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean),
  visibility: form.visibility,
  // `null` is deliberate: it is what clears a stored photo. Omitting the key
  // would leave the previous photo in place.
  imageMediaId: form.imageMediaId,
})

const formatDate = (t: (key: string) => string, value?: string) => {
  if (!value) return t("workspace.savedReplies.never")
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
}

export default function SavedRepliesPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [responses, setResponses] = useState<AgentCannedResponseDto[]>([])
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "editor">("list")
  const [selectedVisibility, setSelectedVisibility] = useState<VisibilityFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateResponseOpen, setIsCreateResponseOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const actionInFlightRef = useRef(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [createForm, setCreateForm] = useState<ResponseFormState>(defaultFormState)
  const [editForm, setEditForm] = useState<ResponseFormState>(defaultFormState)

  const visibilityCounts = useMemo(() => {
    return responses.reduce(
      (counts, response) => ({
        ...counts,
        [response.visibility]: counts[response.visibility] + 1,
      }),
      { public: 0, team: 0, private: 0 } as Record<AgentCannedResponseDto["visibility"], number>,
    )
  }, [responses])

  const visibilityFilters: Array<{ label: string; value: VisibilityFilter; count: number }> = [
    { label: t("workspace.savedReplies.all"), value: "all", count: responses.length },
    { label: t("workspace.savedReplies.public"), value: "public", count: visibilityCounts.public },
    { label: t("workspace.savedReplies.team"), value: "team", count: visibilityCounts.team },
    { label: t("workspace.savedReplies.private"), value: "private", count: visibilityCounts.private },
  ]

  const filteredResponses = useMemo(() => responses.filter((response) => {
    const matchesVisibility = selectedVisibility === "all" || response.visibility === selectedVisibility
    const query = searchQuery.toLowerCase()
    const matchesSearch =
      response.title.toLowerCase().includes(query) ||
      response.content.toLowerCase().includes(query) ||
      response.shortcut?.toLowerCase().includes(query) ||
      response.tags.some((tag) => tag.toLowerCase().includes(query))

    return matchesVisibility && matchesSearch
  }), [responses, searchQuery, selectedVisibility])
  const selectedResponse = filteredResponses.find((response) => response.id === selectedResponseId) || filteredResponses[0] || null

  const loadResponses = useCallback(async () => {
    setIsLoading(true)
    setLoadFailed(false)
    try {
      const responseDtos = await agentCannedResponsesApi.list()
      setResponses(responseDtos)
      setSelectedResponseId((currentId) =>
        currentId && responseDtos.some((response) => response.id === currentId) ? currentId : responseDtos[0]?.id || null,
      )
      if (responseDtos[0]) {
        setEditForm(toFormState(responseDtos[0]))
      }
    } catch (error) {
      setLoadFailed(true)
      toast.error(getApiErrorMessage(error, t("workspace.savedReplies.unableLoad")))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadResponses()
  }, [loadResponses])

  useEffect(() => {
    if (selectedResponse) {
      setEditForm(toFormState(selectedResponse))
    }
  }, [selectedResponse])

  useEffect(() => {
    if (filteredResponses.some((response) => response.id === selectedResponseId)) return
    setSelectedResponseId(filteredResponses[0]?.id || null)
  }, [filteredResponses, selectedResponseId])

  const handleSelectResponse = (response: AgentCannedResponseDto) => {
    setSelectedResponseId(response.id)
    setMobileView("editor")
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("workspace.savedReplies.copied"))
    } catch {
      toast.error(t("workspace.savedReplies.copyFailed"))
    }
  }

  const handleCreateResponse = async () => {
    const payload = toPayload(createForm)
    if (!payload.title || !payload.content) return
    if (actionInFlightRef.current) return
    actionInFlightRef.current = true

    setActiveAction("create")
    try {
      const createdResponse = await agentCannedResponsesApi.create(payload)
      setResponses((currentResponses) => [createdResponse, ...currentResponses])
      setSelectedResponseId(createdResponse.id)
      setCreateForm(defaultFormState)
      setIsCreateResponseOpen(false)
      toast.success(t("workspace.savedReplies.created"))
      // Refresh dropdown consumers sharing the canned options cache.
      void queryClient.invalidateQueries({ queryKey: cannedKeys.all })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.savedReplies.unableCreate")))
    } finally {
      actionInFlightRef.current = false
      setActiveAction(null)
    }
  }

  const handleUpdateResponse = async () => {
    if (!selectedResponse) return
    const payload = toPayload(editForm)
    if (!payload.title || !payload.content) return
    if (actionInFlightRef.current) return
    actionInFlightRef.current = true

    setActiveAction(selectedResponse.id)
    try {
      const updatedResponse = await agentCannedResponsesApi.update(selectedResponse.id, payload)
      setResponses((currentResponses) =>
        currentResponses.map((response) => (response.id === updatedResponse.id ? updatedResponse : response)),
      )
      // Refresh dropdown consumers sharing the canned options cache.
      void queryClient.invalidateQueries({ queryKey: cannedKeys.all })
      toast.success(t("workspace.savedReplies.updated"))
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.savedReplies.unableUpdate")))
    } finally {
      actionInFlightRef.current = false
      setActiveAction(null)
    }
  }

  const handleDeleteResponse = async () => {
    if (!selectedResponse) return
    if (!confirm(t("workspace.savedReplies.confirmDelete", { title: selectedResponse.title }))) return
    if (actionInFlightRef.current) return
    actionInFlightRef.current = true

    setActiveAction(selectedResponse.id)
    try {
      await agentCannedResponsesApi.delete(selectedResponse.id)
      setResponses((currentResponses) => {
        const nextResponses = currentResponses.filter((response) => response.id !== selectedResponse.id)
        setSelectedResponseId(nextResponses[0]?.id || null)
        return nextResponses
      })
      toast.success(t("workspace.savedReplies.deleted"))
      // Refresh dropdown consumers sharing the canned options cache.
      void queryClient.invalidateQueries({ queryKey: cannedKeys.all })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("workspace.savedReplies.unableDelete")))
    } finally {
      actionInFlightRef.current = false
      setActiveAction(null)
    }
  }

  return (
    <WorkspacePage className="pb-4">
      <WorkspaceHeader
        eyebrow={t("workspace.savedReplies.eyebrow")}
        title={t("workspace.savedReplies.title")}
        description={t("workspace.savedReplies.description")}
        actions={
          <Dialog open={isCreateResponseOpen} onOpenChange={setIsCreateResponseOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("workspace.savedReplies.newReply")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t("workspace.savedReplies.createTitle")}</DialogTitle>
                <DialogDescription>{t("workspace.savedReplies.createDescription")}</DialogDescription>
              </DialogHeader>
              <ResponseForm
                form={createForm}
                submitLabel={activeAction === "create" ? t("workspace.savedReplies.creating") : t("workspace.savedReplies.createResponse")}
                isSubmitting={activeAction === "create"}
                onChange={setCreateForm}
                onCancel={() => setIsCreateResponseOpen(false)}
                onSubmit={handleCreateResponse}
              />
            </DialogContent>
          </Dialog>
        }
      />
      <WorkspaceSplitView className="lg:min-h-[calc(100svh-10rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={`${mobileView === "list" ? "flex" : "hidden"} w-full flex-col border-b border-slate-200 bg-white lg:flex lg:min-h-0 lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-950`}>
            <div className="space-y-4 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-slate-400" />
                <Input
                  placeholder={t("workspace.savedReplies.searchPlaceholder")}
                  className="pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <h3 className="mb-3 font-medium text-gray-900 dark:text-slate-50">{t("workspace.savedReplies.visibility")}</h3>
              <div className="space-y-1">
                {visibilityFilters.map((filter) => (
                  <button
                    key={filter.value}
                    className={`flex w-full items-center justify-between rounded-lg p-2 text-left transition-colors ${
                      selectedVisibility === filter.value ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200" : "text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-900/80"
                    }`}
                    onClick={() => setSelectedVisibility(filter.value)}
                  >
                    <span className="text-sm">{filter.label}</span>
                    <Badge variant="secondary">{filter.count}</Badge>
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium text-gray-900 dark:text-slate-50">{t("workspace.savedReplies.templates")}</h3>
                  <span className="text-sm text-gray-500 dark:text-slate-300">{t("workspace.savedReplies.savedRepliesCount", { count: filteredResponses.length })}</span>
                </div>
                <div className="space-y-2">
                  {isLoading ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">{t("workspace.savedReplies.loading")}</div>
                  ) : loadFailed ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500 dark:text-slate-300">{t("workspace.savedReplies.unavailable")}</div>
                    ) : filteredResponses.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500 dark:text-slate-300">{t("workspace.savedReplies.notFound")}</div>
                  ) : (
                    filteredResponses.map((response) => (
                      <button
                        key={response.id}
                        className={`w-full rounded-lg p-3 text-left transition-colors ${
                          selectedResponse?.id === response.id
                            ? "border border-blue-200 bg-blue-50 dark:border-blue-400/40 dark:bg-blue-500/15"
                            : "border border-transparent hover:bg-gray-50 dark:hover:bg-slate-900/80"
                        }`}
                        onClick={() => handleSelectResponse(response)}
                      >
                        <div className="flex-1 overflow-hidden">
                          <h4 className="truncate text-sm font-medium text-gray-900 dark:text-slate-50">{response.title}</h4>
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-slate-300">{response.content}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">
                              {response.visibility}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-300">
                              <TrendingUp className="h-3 w-3" />
                              <span>{response.usageCount}</span>
                            </div>
                          </div>
                          {response.shortcut && (
                            <div className="mt-1 flex items-center gap-1">
                              <Hash className="h-3 w-3 text-gray-400 dark:text-slate-400" />
                              <span className="font-mono text-xs text-gray-500 dark:text-slate-300">{response.shortcut}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>

        <div className={`${mobileView === "editor" ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}>
            <div className="border-b border-slate-200 p-2 dark:border-slate-800 lg:hidden"><Button variant="ghost" size="sm" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />{t("workspace.savedReplies.backToSavedReplies")}</Button></div>
            {selectedResponse ? (
              <>
                <div className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">{selectedResponse.title}</h2>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(selectedResponse.content)}>
                        <Copy className="mr-2 h-4 w-4" />
                        {t("workspace.savedReplies.copy")}
                      </Button>
                      <Button
                        aria-label={t("workspace.savedReplies.deleteAria")}
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteResponse}
                        disabled={activeAction === selectedResponse.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-slate-300">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      <span>{t("workspace.savedReplies.usedCount", { count: selectedResponse.usageCount })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{t("workspace.savedReplies.updatedAt", { date: formatDate(t, selectedResponse.updatedAt) })}</span>
                    </div>
                    {selectedResponse.shortcut && (
                      <div className="flex items-center gap-1">
                        <Hash className="h-4 w-4" />
                        <span className="font-mono">{selectedResponse.shortcut}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-6">
                  <Tabs defaultValue="preview" className="space-y-6">
                    <TabsList>
                      <TabsTrigger value="preview">{t("workspace.savedReplies.tabPreview")}</TabsTrigger>
                      <TabsTrigger value="edit">{t("workspace.savedReplies.tabEdit")}</TabsTrigger>
                      <TabsTrigger value="analytics">{t("workspace.savedReplies.tabUsage")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="preview" className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">{t("workspace.savedReplies.responsePreview")}</CardTitle>
                          <CardDescription>{t("workspace.savedReplies.responsePreviewDescription")}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-lg bg-gray-50 p-4 dark:bg-slate-900/80">
                            <div className="flex items-start space-x-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
                                <span className="text-sm font-medium text-white">A</span>
                              </div>
                              <div className="flex-1">
                                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-950">
                                  <p className="whitespace-pre-wrap text-gray-900 dark:text-slate-50">{selectedResponse.content}</p>
                                  <SavedReplyPhoto mediaId={selectedResponse.imageMediaId} className="mt-3" />
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">{t("workspace.savedReplies.teamMemberJustNow")}</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">{t("workspace.savedReplies.responseDetails")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">{t("workspace.savedReplies.visibility")}</Label>
                              <p className="text-sm capitalize text-gray-900 dark:text-slate-50">{selectedResponse.visibility}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">{t("workspace.savedReplies.shortcut")}</Label>
                              <p className="font-mono text-sm text-gray-900 dark:text-slate-50">{selectedResponse.shortcut || t("workspace.savedReplies.none")}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">{t("workspace.savedReplies.created")}</Label>
                              <p className="text-sm text-gray-900 dark:text-slate-50">{formatDate(t, selectedResponse.createdAt)}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">{t("workspace.savedReplies.updated")}</Label>
                              <p className="text-sm text-gray-900 dark:text-slate-50">{formatDate(t, selectedResponse.updatedAt)}</p>
                            </div>
                          </div>

                          <div>
                            <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">{t("workspace.savedReplies.tags")}</Label>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {selectedResponse.tags.length === 0 ? (
                                <span className="text-sm text-gray-500 dark:text-slate-300">{t("workspace.savedReplies.noTags")}</span>
                              ) : (
                                selectedResponse.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary">
                                    {tag}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="edit">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Edit className="h-4 w-4" />
                            {t("workspace.savedReplies.editResponse")}
                          </CardTitle>
                          <CardDescription>{t("workspace.savedReplies.editDescription")}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ResponseForm
                            form={editForm}
                            submitLabel={activeAction === selectedResponse.id ? t("workspace.savedReplies.saving") : t("workspace.savedReplies.saveChanges")}
                            isSubmitting={activeAction === selectedResponse.id}
                            onChange={setEditForm}
                            onCancel={() => setEditForm(toFormState(selectedResponse))}
                            onSubmit={handleUpdateResponse}
                          />
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="analytics" className="space-y-6">
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{t("workspace.savedReplies.totalUsage")}</CardTitle>
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{selectedResponse.usageCount}</div>
                            <p className="text-xs text-muted-foreground">{t("workspace.savedReplies.trackedByTeam")}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{t("workspace.savedReplies.visibility")}</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold capitalize">{selectedResponse.visibility}</div>
                            <p className="text-xs text-muted-foreground">{t("workspace.savedReplies.currentAccessLevel")}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{t("workspace.savedReplies.lastUpdated")}</CardTitle>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{formatDate(t, selectedResponse.updatedAt)}</div>
                            <p className="text-xs text-muted-foreground">{t("workspace.savedReplies.fromWorkspaceRecord")}</p>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-gray-500">
                {isLoading ? t("workspace.savedReplies.loading") : t("workspace.savedReplies.empty")}
              </div>
            )}
          </div>
      </WorkspaceSplitView>
    </WorkspacePage>
  )
}

/**
 * Photo attached to a saved reply.
 *
 * With `onAdd` it behaves as a form control — empty state offers "Add photo",
 * a resolved image offers "Replace photo" — and with `onRemove` it offers
 * removal. With neither it renders read-only for the detail pane: nothing when
 * there is no photo, and a recoverable "Photo unavailable" state when the
 * signed link has expired or the file is gone, never a broken image.
 *
 * The first paint after an id appears is `idle`, before the resolve effect
 * commits, so that state is treated as loading rather than as a failure.
 */
function SavedReplyPhoto({
  mediaId,
  onAdd,
  onRemove,
  className = "",
}: {
  mediaId?: string | null
  onAdd?: () => void
  onRemove?: () => void
  className?: string
}) {
  const { t } = useI18n()
  const image = useMediaImage(mediaId)

  if (!mediaId) {
    if (!onAdd) return null
    return (
      <div className={className}>
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
        >
          <ImageIcon className="h-5 w-5" />
          {t("workspace.savedReplies.addPhoto")}
        </button>
      </div>
    )
  }

  if (image.status === "failed") {
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <span>{t("workspace.savedReplies.photoUnavailable")}</span>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              {t("workspace.savedReplies.removePhoto")}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (image.status === "ready") {
    return (
      <div className={className}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <img
            src={image.url}
            alt={t("workspace.savedReplies.photo")}
            className="max-h-64 w-full object-contain"
          />
        </div>
        {onAdd || onRemove ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onAdd ? (
              <Button type="button" variant="outline" size="sm" onClick={onAdd}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("workspace.savedReplies.replacePhoto")}
              </Button>
            ) : null}
            {onRemove ? (
              <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("workspace.savedReplies.removePhoto")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="h-40 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
    </div>
  )
}

function ResponseForm({
  form,
  submitLabel,
  isSubmitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: ResponseFormState
  submitLabel: string
  isSubmitting: boolean
  onChange: (form: ResponseFormState) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const { t } = useI18n()
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false)
  const canSubmit = form.title.trim().length > 0 && form.content.trim().length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="response-title">{t("workspace.savedReplies.responseTitle")}</Label>
        <Input
          id="response-title"
          placeholder={t("workspace.savedReplies.titlePlaceholder")}
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="response-content">{t("workspace.savedReplies.responseContent")}</Label>
        <Textarea
          id="response-content"
          placeholder={t("workspace.savedReplies.contentPlaceholder")}
          className="min-h-[120px]"
          value={form.content}
          onChange={(event) => onChange({ ...form, content: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("workspace.savedReplies.photo")}</Label>
        <SavedReplyPhoto
          mediaId={form.imageMediaId}
          onAdd={() => setIsMediaPickerOpen(true)}
          onRemove={() => onChange({ ...form, imageMediaId: null })}
        />
        <MediaPicker
          open={isMediaPickerOpen}
          onOpenChange={setIsMediaPickerOpen}
          purpose="saved-reply-photo"
          accept="image/*"
          acceptErrorMessage={t("workspace.savedReplies.unsupportedFileType")}
          onSelect={(file) => onChange({ ...form, imageMediaId: file.id })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="response-visibility">{t("workspace.savedReplies.visibility")}</Label>
          <Select
            value={form.visibility}
            onValueChange={(visibility) =>
              onChange({ ...form, visibility: visibility as ResponseFormState["visibility"] })
            }
          >
            <SelectTrigger id="response-visibility">
              <SelectValue placeholder={t("workspace.savedReplies.selectVisibility")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{t("workspace.savedReplies.public")}</SelectItem>
              <SelectItem value="team">{t("workspace.savedReplies.team")}</SelectItem>
              <SelectItem value="private">{t("workspace.savedReplies.private")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="response-shortcut">{t("workspace.savedReplies.shortcut")}</Label>
          <Input
            id="response-shortcut"
            placeholder={t("workspace.savedReplies.shortcutPlaceholder")}
            value={form.shortcut}
            onChange={(event) => onChange({ ...form, shortcut: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="response-tags">{t("workspace.savedReplies.tags")}</Label>
        <Input
          id="response-tags"
          placeholder={t("workspace.savedReplies.tagsPlaceholder")}
          value={form.tags}
          onChange={(event) => onChange({ ...form, tags: event.target.value })}
        />
      </div>

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>
          {t("workspace.savedReplies.cancel")}
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
