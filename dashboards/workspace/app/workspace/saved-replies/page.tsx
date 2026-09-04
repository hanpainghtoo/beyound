"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { Search as SearchIcon, Plus, Copy, Edit, Trash2, MessageSquare, Clock, TrendingUp, Hash, AlertCircle, ArrowLeft } from "lucide-react"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage, WorkspaceSplitView } from "@/components/workspace"
import {
  csrCannedResponsesApi,
  getApiErrorMessage,
  type CsrCannedResponseDto,
  type CreateCsrCannedResponseInput,
} from "@/lib/api"

type VisibilityFilter = "all" | CsrCannedResponseDto["visibility"]

type ResponseFormState = {
  title: string
  shortcut: string
  content: string
  tags: string
  visibility: "public" | "private" | "team"
}

const defaultFormState: ResponseFormState = {
  title: "",
  shortcut: "",
  content: "",
  tags: "",
  visibility: "public",
}

const toFormState = (response: CsrCannedResponseDto): ResponseFormState => ({
  title: response.title,
  shortcut: response.shortcut || "",
  content: response.content,
  tags: response.tags.join(", "),
  visibility: response.visibility,
})

const toPayload = (form: ResponseFormState): CreateCsrCannedResponseInput => ({
  title: form.title.trim(),
  shortcut: form.shortcut.trim() || undefined,
  content: form.content.trim(),
  tags: form.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean),
  visibility: form.visibility,
})

const formatDate = (value?: string) => {
  if (!value) return "Never"
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
}

export default function SavedRepliesPage() {
  const [responses, setResponses] = useState<CsrCannedResponseDto[]>([])
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "editor">("list")
  const [selectedVisibility, setSelectedVisibility] = useState<VisibilityFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateResponseOpen, setIsCreateResponseOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const actionInFlightRef = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<ResponseFormState>(defaultFormState)
  const [editForm, setEditForm] = useState<ResponseFormState>(defaultFormState)

  const visibilityCounts = useMemo(() => {
    return responses.reduce(
      (counts, response) => ({
        ...counts,
        [response.visibility]: counts[response.visibility] + 1,
      }),
      { public: 0, team: 0, private: 0 } as Record<CsrCannedResponseDto["visibility"], number>,
    )
  }, [responses])

  const visibilityFilters: Array<{ label: string; value: VisibilityFilter; count: number }> = [
    { label: "All", value: "all", count: responses.length },
    { label: "Public", value: "public", count: visibilityCounts.public },
    { label: "Team", value: "team", count: visibilityCounts.team },
    { label: "Private", value: "private", count: visibilityCounts.private },
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
    setErrorMessage(null)
    try {
      const responseDtos = await csrCannedResponsesApi.list()
      setResponses(responseDtos)
      setSelectedResponseId((currentId) =>
        currentId && responseDtos.some((response) => response.id === currentId) ? currentId : responseDtos[0]?.id || null,
      )
      if (responseDtos[0]) {
        setEditForm(toFormState(responseDtos[0]))
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to load saved replies"))
    } finally {
      setIsLoading(false)
    }
  }, [])

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

  const handleSelectResponse = (response: CsrCannedResponseDto) => {
    setSelectedResponseId(response.id)
    setMobileView("editor")
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const handleCreateResponse = async () => {
    const payload = toPayload(createForm)
    if (!payload.title || !payload.content) return
    if (actionInFlightRef.current) return
    actionInFlightRef.current = true

    setActiveAction("create")
    setErrorMessage(null)
    try {
      const createdResponse = await csrCannedResponsesApi.create(payload)
      setResponses((currentResponses) => [createdResponse, ...currentResponses])
      setSelectedResponseId(createdResponse.id)
      setCreateForm(defaultFormState)
      setIsCreateResponseOpen(false)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to create canned response"))
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
    setErrorMessage(null)
    try {
      const updatedResponse = await csrCannedResponsesApi.update(selectedResponse.id, payload)
      setResponses((currentResponses) =>
        currentResponses.map((response) => (response.id === updatedResponse.id ? updatedResponse : response)),
      )
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to update canned response"))
    } finally {
      actionInFlightRef.current = false
      setActiveAction(null)
    }
  }

  const handleDeleteResponse = async () => {
    if (!selectedResponse) return
    if (!confirm(`Delete ${selectedResponse.title}? This action cannot be undone.`)) return
    if (actionInFlightRef.current) return
    actionInFlightRef.current = true

    setActiveAction(selectedResponse.id)
    setErrorMessage(null)
    try {
      await csrCannedResponsesApi.delete(selectedResponse.id)
      setResponses((currentResponses) => {
        const nextResponses = currentResponses.filter((response) => response.id !== selectedResponse.id)
        setSelectedResponseId(nextResponses[0]?.id || null)
        return nextResponses
      })
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Failed to delete canned response"))
    } finally {
      actionInFlightRef.current = false
      setActiveAction(null)
    }
  }

  return (
    <WorkspacePage className="pb-4">
      <WorkspaceHeader
        eyebrow="Knowledge"
        title="Saved Replies"
        description="Create, manage, and reuse message templates."
        actions={
          <Dialog open={isCreateResponseOpen} onOpenChange={setIsCreateResponseOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Saved Reply
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Saved Reply</DialogTitle>
                <DialogDescription>Create a new template for quick replies.</DialogDescription>
              </DialogHeader>
              <ResponseForm
                form={createForm}
                submitLabel={activeAction === "create" ? "Creating..." : "Create Response"}
                isSubmitting={activeAction === "create"}
                onChange={setCreateForm}
                onCancel={() => setIsCreateResponseOpen(false)}
                onSubmit={handleCreateResponse}
              />
            </DialogContent>
          </Dialog>
        }
      />
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </div>
        </div>
      )}

      <WorkspaceSplitView className="lg:min-h-[calc(100svh-10rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={`${mobileView === "list" ? "flex" : "hidden"} w-full flex-col border-b border-slate-200 bg-white lg:flex lg:min-h-0 lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-950`}>
            <div className="space-y-4 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-slate-400" />
                <Input
                  placeholder="Search saved replies..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <h3 className="mb-3 font-medium text-gray-900 dark:text-slate-50">Visibility</h3>
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
                  <h3 className="font-medium text-gray-900 dark:text-slate-50">Templates</h3>
                  <span className="text-sm text-gray-500 dark:text-slate-300">{filteredResponses.length} saved replies</span>
                </div>
                <div className="space-y-2">
                  {isLoading ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">Loading saved replies...</div>
                  ) : errorMessage ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500 dark:text-slate-300">Saved replies are unavailable right now</div>
                    ) : filteredResponses.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500 dark:text-slate-300">No saved replies found</div>
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
            <div className="border-b border-slate-200 p-2 dark:border-slate-800 lg:hidden"><Button variant="ghost" size="sm" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />Saved replies</Button></div>
            {selectedResponse ? (
              <>
                <div className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">{selectedResponse.title}</h2>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(selectedResponse.content)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                      <Button
                        aria-label="Delete response"
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
                      <span>Used {selectedResponse.usageCount} times</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>Updated {formatDate(selectedResponse.updatedAt)}</span>
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
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                      <TabsTrigger value="edit">Edit</TabsTrigger>
                      <TabsTrigger value="analytics">Usage</TabsTrigger>
                    </TabsList>

                    <TabsContent value="preview" className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Response Preview</CardTitle>
                          <CardDescription>How this response will appear to customers</CardDescription>
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
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">Team member - Just now</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Response Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">Visibility</Label>
                              <p className="text-sm capitalize text-gray-900 dark:text-slate-50">{selectedResponse.visibility}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">Shortcut</Label>
                              <p className="font-mono text-sm text-gray-900 dark:text-slate-50">{selectedResponse.shortcut || "None"}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">Created</Label>
                              <p className="text-sm text-gray-900 dark:text-slate-50">{formatDate(selectedResponse.createdAt)}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">Updated</Label>
                              <p className="text-sm text-gray-900 dark:text-slate-50">{formatDate(selectedResponse.updatedAt)}</p>
                            </div>
                          </div>

                          <div>
                            <Label className="text-sm font-medium text-gray-700 dark:text-slate-200">Tags</Label>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {selectedResponse.tags.length === 0 ? (
                                <span className="text-sm text-gray-500 dark:text-slate-300">No tags</span>
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
                            Edit Response
                          </CardTitle>
                          <CardDescription>Changes are saved to the workspace reply library</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ResponseForm
                            form={editForm}
                            submitLabel={activeAction === selectedResponse.id ? "Saving..." : "Save Changes"}
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
                            <CardTitle className="text-sm font-medium">Total Usage</CardTitle>
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{selectedResponse.usageCount}</div>
                            <p className="text-xs text-muted-foreground">Tracked by team usage</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Visibility</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold capitalize">{selectedResponse.visibility}</div>
                            <p className="text-xs text-muted-foreground">Current access level</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{formatDate(selectedResponse.updatedAt)}</div>
                            <p className="text-xs text-muted-foreground">From the workspace reply record</p>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-gray-500">
                {isLoading ? "Loading saved replies..." : "No saved replies are available yet."}
              </div>
            )}
          </div>
      </WorkspaceSplitView>
    </WorkspacePage>
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
  const canSubmit = form.title.trim().length > 0 && form.content.trim().length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="response-title">Response Title</Label>
        <Input
          id="response-title"
          placeholder="Enter saved reply title..."
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="response-content">Response Content</Label>
        <Textarea
          id="response-content"
          placeholder="Enter your saved reply message..."
          className="min-h-[120px]"
          value={form.content}
          onChange={(event) => onChange({ ...form, content: event.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="response-visibility">Visibility</Label>
          <Select
            value={form.visibility}
            onValueChange={(visibility) =>
              onChange({ ...form, visibility: visibility as ResponseFormState["visibility"] })
            }
          >
            <SelectTrigger id="response-visibility">
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="team">Team</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="response-shortcut">Shortcut</Label>
          <Input
            id="response-shortcut"
            placeholder="/shortcut"
            value={form.shortcut}
            onChange={(event) => onChange({ ...form, shortcut: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="response-tags">Tags</Label>
        <Input
          id="response-tags"
          placeholder="greeting, order, support"
          value={form.tags}
          onChange={(event) => onChange({ ...form, tags: event.target.value })}
        />
      </div>

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
