"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { File, FileText, Image as ImageIcon, Music, Search as SearchIcon, TriangleAlert, Trash2, Upload, Video } from "lucide-react"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/workspace-header"
import { AudioPlayer } from "@/components/media/audio-player"
import { VideoPlayer } from "@/components/media/video-player"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WorkspacePage, WorkspaceSplitView, WorkspaceStatStrip } from "@/components/workspace"
import { agentMediaApi, getApiErrorMessage, getStoredSession, type AgentMediaFileDto } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

type MediaTypeFilter = "all" | "images" | "videos" | "audio" | "documents"

const isImage = (file: AgentMediaFileDto) => file.contentType.startsWith("image/")
const isVideo = (file: AgentMediaFileDto) => file.contentType.startsWith("video/")
const isAudio = (file: AgentMediaFileDto) => file.contentType.startsWith("audio/")
const isDocument = (file: AgentMediaFileDto) => !isImage(file) && !isVideo(file) && !isAudio(file)

const isValidFileUrl = (value?: string | null) => {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:"
  } catch {
    return value.startsWith("/")
  }
}

const isRuntimeMediaFile = (file: AgentMediaFileDto) => {
  const artifactText = [
    file.fileName,
    file.purpose,
    file.objectKey,
    JSON.stringify(file.metadata || {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return !/(^|[\s/_-])(playwright-media|playwright|seed|fixture|mock|test-artifact|test|e2e)([\s/_.-]|$)/.test(artifactText)
}

const matchesTypeFilter = (file: AgentMediaFileDto, type: MediaTypeFilter) => {
  if (type === "images") return isImage(file)
  if (type === "videos") return isVideo(file)
  if (type === "audio") return isAudio(file)
  if (type === "documents") return isDocument(file)
  return true
}

const matchesSearch = (file: AgentMediaFileDto, query: string) => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [file.fileName, file.purpose, file.contentType]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery))
}

export default function MediaLibraryPage() {
  const session = getStoredSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<AgentMediaFileDto[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [type, setType] = useState<MediaTypeFilter>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const { t } = useI18n()
  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadFailed(false)
    try {
      const result = await agentMediaApi.list()
      const runtimeFiles = result.data.filter(isRuntimeMediaFile)
      setFiles(runtimeFiles)
      setSelectedId((current) => current && runtimeFiles.some((file) => file.id === current) ? current : runtimeFiles[0]?.id || null)
    } catch (requestError) {
      setLoadFailed(true)
      toast.error(getApiErrorMessage(requestError, t("workspace.media.unableLoad")))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const filteredFiles = useMemo(
    () => files.filter((file) => matchesTypeFilter(file, type) && matchesSearch(file, query)),
    [files, query, type],
  )
  const selected = files.find((file) => file.id === selectedId) || filteredFiles[0] || null
  const counts = useMemo(() => ({
    total: files.length,
    images: files.filter(isImage).length,
    videos: files.filter(isVideo).length,
    audio: files.filter(isAudio).length,
    documents: files.filter(isDocument).length,
  }), [files])

  useEffect(() => {
    if (filteredFiles.some((file) => file.id === selectedId)) return
    setSelectedId(filteredFiles[0]?.id || null)
  }, [filteredFiles, selectedId])

  const uploadFiles = async (list: FileList | null) => {
    if (!list?.length) return
    setIsUploading(true)
    try {
      for (const file of Array.from(list)) await agentMediaApi.upload(file)
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.media.uploadFailed")))
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const archiveSelected = async () => {
    if (!selected || !confirm(t("workspace.media.confirmArchive", { fileName: selected.fileName }))) return
    try {
      await agentMediaApi.archive(selected.id)
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.media.unableArchive")))
    }
  }

  const canArchive = ["owner", "admin", "supervisor"].includes(session?.user.role || "")

  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.media.eyebrow")}
        title={t("workspace.media.title")}
        description={t("workspace.media.description")}
        actions={<><input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(event) => uploadFiles(event.target.files)} /><Button onClick={() => inputRef.current?.click()} disabled={isUploading}><Upload className="mr-2 h-4 w-4" />{isUploading ? t("workspace.media.uploading") : t("workspace.media.upload")}</Button></>}
      />
      <WorkspacePage>
        <WorkspaceStatStrip
          ariaLabel={t("workspace.media.ariaLabel")}
          items={[
{ label: t("workspace.media.all"), value: counts.total, active: type === "all", onClick: () => setType("all") },
            { label: t("workspace.media.images"), value: counts.images, active: type === "images", onClick: () => setType("images") },
            { label: t("workspace.media.videos"), value: counts.videos, active: type === "videos", onClick: () => setType("videos") },
            { label: t("workspace.media.audio"), value: counts.audio, active: type === "audio", onClick: () => setType("audio") },
            { label: t("workspace.media.documents"), value: counts.documents, active: type === "documents", onClick: () => setType("documents") },
          ]}
        />
        <WorkspaceSplitView className="xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0">
<div className="flex flex-wrap gap-3 border-b border-slate-200 p-4 dark:border-slate-800"><div className="relative w-full flex-1 sm:min-w-[240px]"><SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label={t("workspace.media.searchAriaLabel")} placeholder={t("workspace.media.searchPlaceholder")} className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Select value={type} onValueChange={(value) => setType(value as MediaTypeFilter)}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("workspace.media.allTypes")}</SelectItem><SelectItem value="images">{t("workspace.media.images")}</SelectItem><SelectItem value="videos">{t("workspace.media.videos")}</SelectItem><SelectItem value="audio">{t("workspace.media.audio")}</SelectItem><SelectItem value="documents">{t("workspace.media.documents")}</SelectItem></SelectContent></Select></div>
            {isLoading ? <div className="p-12 text-center text-sm text-slate-500">{t("workspace.media.loading")}</div> : loadFailed ? <div className="p-12 text-center text-sm text-slate-500">{t("workspace.media.unavailable")}</div> : files.length === 0 ? <div className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center"><div className="rounded-lg bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-200"><Upload className="h-5 w-5" /></div><h2 className="mt-4 font-bold text-slate-900 dark:text-slate-50">{t("workspace.media.emptyTitle")}</h2><p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{t("workspace.media.emptyDescription")}</p></div> : filteredFiles.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">{t("workspace.media.noMatch")}</div> : <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 2xl:grid-cols-4">{filteredFiles.map((file) => <button key={file.id} onClick={() => setSelectedId(file.id)} className={`overflow-hidden rounded-lg border text-left transition hover:border-indigo-300 ${selected?.id === file.id ? "border-indigo-400 ring-2 ring-indigo-100 dark:border-indigo-400 dark:ring-indigo-500/20" : "border-slate-200 dark:border-slate-800"}`}><MediaPreview file={file} /><div className="p-3"><p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{file.fileName}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatBytes(file.sizeBytes)}</p></div></button>)}</div>}
          </section>
          <aside className="border-t bg-slate-50/40 p-5 dark:border-slate-800 dark:bg-slate-900/80 xl:border-l xl:border-t-0">{selected ? <div className="space-y-5"><MediaPreview file={selected} large /><div><h2 className="break-words text-lg font-bold text-slate-950 dark:text-slate-50">{selected.fileName}</h2><p className="text-sm text-slate-500 dark:text-slate-400">{selected.contentType} · {formatBytes(selected.sizeBytes)}</p></div><div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><Info label={t("workspace.media.purposeLabel")} value={selected.purpose || t("workspace.media.purposeFallback")} /><Info label={t("workspace.media.uploadedLabel")} value={selected.uploadedAt ? new Date(selected.uploadedAt).toLocaleString() : t("workspace.media.pendingUpload")} /></div>{selected.download?.url && isValidFileUrl(selected.download.url) ? <Button asChild className="w-full"><a href={selected.download.url} target="_blank" rel="noreferrer">{t("workspace.media.openFile")}</a></Button> : <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><TriangleAlert className="h-4 w-4" />{t("workspace.media.previewUnavailable")}</div>}{canArchive ? <Button variant="outline" className="w-full text-red-600" onClick={archiveSelected}><Trash2 className="mr-2 h-4 w-4" />{t("workspace.media.archiveFile")}</Button> : null}{selected.download?.expiresAt ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t("workspace.media.linkExpires", { date: new Date(selected.download.expiresAt).toLocaleString() })}</p> : <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t("workspace.media.tenantIsolated")}</p>}</div> : <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">{loadFailed ? t("workspace.media.detailsUnavailable") : t("workspace.media.selectFile")}</div>}</aside>
        </WorkspaceSplitView>
      </WorkspacePage>
    </>
  )
}

/**
 * Grid cards never mount a player: a library can hold dozens of clips, and
 * every one of them would open its own media connection and object URL before
 * the agent has chosen anything. Cards get a type badge; the detail pane on the
 * right is where playback happens.
 */
function MediaPreview({ file, large = false }: { file: AgentMediaFileDto; large?: boolean }) {
  const { t } = useI18n()
  const [imageFailed, setImageFailed] = useState(false)
  const className = large ? "h-64 w-full" : "h-32 w-full"
  const canPreviewImage = isImage(file) && file.download?.url && isValidFileUrl(file.download.url) && !imageFailed
  const mediaUrl = file.download?.url && isValidFileUrl(file.download.url) ? file.download.url : null

  useEffect(() => {
    setImageFailed(false)
  }, [file.download?.url, file.id])

  if (canPreviewImage) {
    return <img src={file.download!.url} alt={file.fileName} className={`${className} bg-slate-100 object-contain`} onError={() => setImageFailed(true)} />
  }

if (large && mediaUrl && isAudio(file)) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
        <AudioPlayer url={mediaUrl} label={file.fileName} downloadName={file.fileName} />
      </div>
    )
  }

  if (large && mediaUrl && isVideo(file)) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
        <VideoPlayer url={mediaUrl} label={file.fileName} sizeLabel={formatBytes(file.sizeBytes)} downloadName={file.fileName} />
      </div>
    )
  }

  const Icon = isImage(file) ? ImageIcon : isVideo(file) ? Video : isAudio(file) ? Music : file.contentType.includes("pdf") || file.contentType.startsWith("text/") ? FileText : File
  const label = isImage(file) && imageFailed ? t("workspace.media.imageUnavailable") : file.contentType || t("workspace.media.file")
  const KindBadge = isVideo(file) ? Video : isAudio(file) ? Music : null
  return (
    <div className={`relative flex ${className} flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500`}>
      <Icon className="h-10 w-10" />
      <span className="px-3 text-center text-xs text-slate-500">{label}</span>
      {KindBadge && !large ? (
        <span className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-1 text-white dark:bg-slate-950/70">
          <KindBadge className="h-3 w-3" aria-hidden />
        </span>
      ) : null}
    </div>
  )
}
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-slate-50">{value}</p></div> }
