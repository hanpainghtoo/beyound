"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useI18n } from "@/components/providers/i18n-provider"
import { File as FileIcon, Image as ImageIcon, Music as MusicIcon, Search, Upload, Video as VideoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { agentMediaApi, getApiErrorMessage, type AgentMediaFileDto } from "@/lib/api"
import { matchesFileAccept } from "@/lib/file-accept"

type MediaPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (file: AgentMediaFileDto, fresh?: boolean) => void
  purpose?: string
  /**
   * Restricts the file dialog, the browsed grid and new uploads alike. Browsers
   * treat `accept` as advisory, so uploads are re-checked at runtime too.
   */
  accept?: string
  /** Shown when an upload is rejected by `accept`. */
  acceptErrorMessage?: string
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  purpose = "message-attachment",
  accept,
  acceptErrorMessage,
}: MediaPickerProps) {
  const { t } = useI18n()
  const resolvedAcceptError =
    acceptErrorMessage || t("workspace.mediaPicker.onlyImageFiles")
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<AgentMediaFileDto[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  // `error` means the library itself could not be loaded, which is what swaps
  // the grid for the "unavailable" message. `notice` is for anything the user
  // did — a rejected file type, a failed upload — which must leave the browsed
  // files in place so they can simply pick a different one.
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const load = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const result = await agentMediaApi.list({ search: search || undefined })
      setFiles(
        result.data.filter(
          // AgentMediaFileDto carries fileName/contentType rather than the
          // File-shaped name/type the accept matcher works with.
          (file) =>
            Boolean(file.download) &&
            matchesFileAccept(
              { name: file.fileName, type: file.contentType },
              accept,
            ),
        ),
      )
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t("workspace.mediaPicker.unableLoadMedia")))
    } finally {
      setIsLoading(false)
    }
  }, [search, accept, t])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(load, 200)
    return () => window.clearTimeout(timer)
  }, [load, open])

  const upload = async (file?: globalThis.File) => {
    if (!file) return
    // `accept` on the input is only a hint — reject here as well so the rule
    // holds when the picker is switched to "All Files".
    if (!matchesFileAccept(file, accept)) {
      setNotice(resolvedAcceptError)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    setIsUploading(true)
    setNotice("")
    try {
      const result = await agentMediaApi.upload(file, purpose)
      onSelect({ ...result.file, download: result.download }, true)
      onOpenChange(false)
    } catch (requestError) {
      setNotice(getApiErrorMessage(requestError, t("workspace.mediaPicker.uploadFailed")))
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Choose media</DialogTitle><DialogDescription>Select an existing workspace file or upload a new one.</DialogDescription></DialogHeader>
        <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" /><Input aria-label={t("workspace.mediaPicker.searchMediaLibrary")} placeholder={t("workspace.mediaPicker.searchMedia")} className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div><input ref={inputRef} className="hidden" type="file" accept={accept ?? "image/*,video/*,audio/*,.pdf,.txt"} onChange={(event) => upload(event.target.files?.[0])} /><Button variant="outline" onClick={() => inputRef.current?.click()} disabled={isUploading}><Upload className="mr-2 h-4 w-4" />{isUploading ? t("workspace.mediaPicker.uploading") : t("workspace.mediaPicker.uploadNew")}</Button></div>
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</p> : null}
        {notice ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">{notice}</p> : null}
        <div className="grid max-h-[460px] grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3">
          {isLoading ? <p className="col-span-full p-10 text-center text-sm text-slate-500 dark:text-slate-400">{t("workspace.mediaPicker.loadingMedia")}</p> : error ? <p className="col-span-full p-10 text-center text-sm text-slate-500 dark:text-slate-400">t("workspace.mediaPicker.mediaUnavailable")</p> : files.length === 0 ? <p className="col-span-full p-10 text-center text-sm text-slate-500 dark:text-slate-400">t("workspace.mediaPicker.noMediaFound")</p> : files.map((file) => <button key={file.id} onClick={() => { onSelect(file); onOpenChange(false) }} className="overflow-hidden rounded-xl border text-left transition hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-500/40 dark:hover:ring-indigo-500/20">{file.contentType.startsWith("image/") && file.download ? <img src={file.download.url} alt="" className="h-28 w-full bg-slate-100 object-contain dark:bg-slate-900" /> : <div className="relative flex h-28 items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500">{file.contentType.startsWith("image/") ? <ImageIcon className="h-8 w-8" /> : file.contentType.startsWith("video/") ? <VideoIcon className="h-8 w-8" /> : file.contentType.startsWith("audio/") ? <MusicIcon className="h-8 w-8" /> : <FileIcon className="h-8 w-8" />}{file.contentType.startsWith("video/") || file.contentType.startsWith("audio/") ? <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{file.contentType.startsWith("video/") ? t("workspace.mediaPicker.video") : t("workspace.mediaPicker.audio")}</span> : null}</div>}<div className="p-3"><p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{file.fileName}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{file.contentType}</p></div></button>)}
        </div>
      </DialogContent>
    </Dialog>
  )
}
