"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, File, FileText, Image as ImageIcon, Search as SearchIcon, TriangleAlert, Trash2, Upload, Video } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WorkspacePage, WorkspaceSplitView, WorkspaceStatCard } from "@/components/workspace"
import { csrMediaApi, getApiErrorMessage, getStoredSession, type CsrMediaFileDto } from "@/lib/api"

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

type MediaTypeFilter = "all" | "images" | "videos" | "documents"

const isImage = (file: CsrMediaFileDto) => file.contentType.startsWith("image/")
const isVideo = (file: CsrMediaFileDto) => file.contentType.startsWith("video/")
const isDocument = (file: CsrMediaFileDto) => !isImage(file) && !isVideo(file)

const isValidFileUrl = (value?: string | null) => {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:"
  } catch {
    return value.startsWith("/")
  }
}

const isRuntimeMediaFile = (file: CsrMediaFileDto) => {
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

const matchesTypeFilter = (file: CsrMediaFileDto, type: MediaTypeFilter) => {
  if (type === "images") return isImage(file)
  if (type === "videos") return isVideo(file)
  if (type === "documents") return isDocument(file)
  return true
}

const matchesSearch = (file: CsrMediaFileDto, query: string) => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [file.fileName, file.purpose, file.contentType]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery))
}

export default function MediaLibraryPage() {
  const session = getStoredSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<CsrMediaFileDto[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [type, setType] = useState<MediaTypeFilter>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setIsLoading(true)
    setError("")
    try {
      const result = await csrMediaApi.list()
      const runtimeFiles = result.data.filter(isRuntimeMediaFile)
      setFiles(runtimeFiles)
      setSelectedId((current) => current && runtimeFiles.some((file) => file.id === current) ? current : runtimeFiles[0]?.id || null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load media"))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredFiles = useMemo(
    () => files.filter((file) => matchesTypeFilter(file, type) && matchesSearch(file, query)),
    [files, query, type],
  )
  const selected = files.find((file) => file.id === selectedId) || filteredFiles[0] || null
  const counts = useMemo(() => ({
    total: files.length,
    images: files.filter(isImage).length,
    videos: files.filter(isVideo).length,
    documents: files.filter(isDocument).length,
  }), [files])

  useEffect(() => {
    if (filteredFiles.some((file) => file.id === selectedId)) return
    setSelectedId(filteredFiles[0]?.id || null)
  }, [filteredFiles, selectedId])

  const uploadFiles = async (list: FileList | null) => {
    if (!list?.length) return
    setIsUploading(true)
    setError("")
    try {
      for (const file of Array.from(list)) await csrMediaApi.upload(file)
      await load()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Upload failed"))
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const archiveSelected = async () => {
    if (!selected || !confirm(`Archive ${selected.fileName}?`)) return
    await csrMediaApi.archive(selected.id)
    await load()
  }

  const canArchive = ["owner", "admin", "manager", "supervisor"].includes(session?.user.role || "")

  return (
    <>
      <WorkspaceHeader
        eyebrow="Knowledge"
        title="Media Library"
        description="Store and reuse workspace media for products and customer replies."
        actions={<><input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(event) => uploadFiles(event.target.files)} /><Button onClick={() => inputRef.current?.click()} disabled={isUploading}><Upload className="mr-2 h-4 w-4" />{isUploading ? "Uploading…" : "Upload"}</Button></>}
      />
      <WorkspacePage>
        {error ? <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"><AlertCircle className="h-4 w-4" />{error}</div> : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><WorkspaceStatCard label="Loaded files" value={counts.total} icon={File} tone="indigo" /><WorkspaceStatCard label="Images" value={counts.images} icon={ImageIcon} tone="emerald" /><WorkspaceStatCard label="Videos" value={counts.videos} icon={Video} tone="violet" /><WorkspaceStatCard label="Documents" value={counts.documents} icon={FileText} tone="amber" /></div>
        <WorkspaceSplitView className="xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0">
            <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4 dark:border-slate-800"><div className="relative w-full flex-1 sm:min-w-[240px]"><SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label="Search media" placeholder="Search filename, purpose, or type…" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Select value={type} onValueChange={(value) => setType(value as MediaTypeFilter)}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="images">Images</SelectItem><SelectItem value="videos">Videos</SelectItem><SelectItem value="documents">Documents</SelectItem></SelectContent></Select></div>
            {isLoading ? <div className="p-12 text-center text-sm text-slate-500">Loading media…</div> : error ? <div className="p-12 text-center text-sm text-slate-500">Media files are unavailable right now.</div> : files.length === 0 ? <div className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center"><div className="rounded-lg bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-200"><Upload className="h-5 w-5" /></div><h2 className="mt-4 font-bold text-slate-900 dark:text-slate-50">No media uploaded yet</h2><p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">No media uploaded yet. Upload files to reuse in customer replies.</p></div> : filteredFiles.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">No media match this search.</div> : <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 2xl:grid-cols-4">{filteredFiles.map((file) => <button key={file.id} onClick={() => setSelectedId(file.id)} className={`overflow-hidden rounded-lg border text-left transition hover:border-indigo-300 ${selected?.id === file.id ? "border-indigo-400 ring-2 ring-indigo-100 dark:border-indigo-400 dark:ring-indigo-500/20" : "border-slate-200 dark:border-slate-800"}`}><MediaPreview file={file} /><div className="p-3"><p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{file.fileName}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatBytes(file.sizeBytes)}</p></div></button>)}</div>}
          </section>
          <aside className="border-t bg-slate-50/40 p-5 dark:border-slate-800 dark:bg-slate-900/80 xl:border-l xl:border-t-0">{selected ? <div className="space-y-5"><MediaPreview file={selected} large /><div><h2 className="break-words text-lg font-bold text-slate-950 dark:text-slate-50">{selected.fileName}</h2><p className="text-sm text-slate-500 dark:text-slate-400">{selected.contentType} · {formatBytes(selected.sizeBytes)}</p></div><div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><Info label="Purpose" value={selected.purpose || "Media library"} /><Info label="Uploaded" value={selected.uploadedAt ? new Date(selected.uploadedAt).toLocaleString() : "Pending upload"} /></div>{selected.download?.url && isValidFileUrl(selected.download.url) ? <Button asChild className="w-full"><a href={selected.download.url} target="_blank" rel="noreferrer">Open file</a></Button> : <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><TriangleAlert className="h-4 w-4" />File preview unavailable for this asset.</div>}{canArchive ? <Button variant="outline" className="w-full text-red-600" onClick={archiveSelected}><Trash2 className="mr-2 h-4 w-4" />Archive file</Button> : null}{selected.download?.expiresAt ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Open link expires {new Date(selected.download.expiresAt).toLocaleString()}.</p> : <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Files remain tenant-isolated.</p>}</div> : <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">{error ? "Media details are unavailable right now." : "Select a file to view details."}</div>}</aside>
        </WorkspaceSplitView>
      </WorkspacePage>
    </>
  )
}

function MediaPreview({ file, large = false }: { file: CsrMediaFileDto; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  const className = large ? "h-64 w-full" : "h-32 w-full"
  const canPreviewImage = isImage(file) && file.download?.url && isValidFileUrl(file.download.url) && !imageFailed

  useEffect(() => {
    setImageFailed(false)
  }, [file.download?.url, file.id])

  if (canPreviewImage) {
    return <img src={file.download!.url} alt={file.fileName} className={`${className} bg-slate-100 object-contain`} onError={() => setImageFailed(true)} />
  }

  const Icon = isImage(file) ? ImageIcon : isVideo(file) ? Video : file.contentType.includes("pdf") || file.contentType.startsWith("text/") ? FileText : File
  const label = isImage(file) && imageFailed ? "Image unavailable" : file.contentType || "File"
  return <div className={`flex ${className} flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500`}><Icon className="h-10 w-10" /><span className="px-3 text-center text-xs text-slate-500">{label}</span></div>
}
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-slate-50">{value}</p></div> }
