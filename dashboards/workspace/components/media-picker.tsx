"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { File as FileIcon, Image as ImageIcon, Search, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { csrMediaApi, getApiErrorMessage, type CsrMediaFileDto } from "@/lib/api"

type MediaPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (file: CsrMediaFileDto) => void
  purpose?: string
}

export function MediaPicker({ open, onOpenChange, onSelect, purpose = "message-attachment" }: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<CsrMediaFileDto[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const result = await csrMediaApi.list({ search: search || undefined })
      setFiles(result.data.filter((file) => Boolean(file.download)))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load media"))
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(load, 200)
    return () => window.clearTimeout(timer)
  }, [load, open])

  const upload = async (file?: globalThis.File) => {
    if (!file) return
    setIsUploading(true)
    setError("")
    try {
      const result = await csrMediaApi.upload(file, purpose)
      onSelect({ ...result.file, download: result.download })
      onOpenChange(false)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Upload failed"))
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Choose media</DialogTitle><DialogDescription>Select an existing workspace file or upload a new one.</DialogDescription></DialogHeader>
        <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" /><Input aria-label="Search media library" placeholder="Search media…" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div><input ref={inputRef} className="hidden" type="file" accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(event) => upload(event.target.files?.[0])} /><Button variant="outline" onClick={() => inputRef.current?.click()} disabled={isUploading}><Upload className="mr-2 h-4 w-4" />{isUploading ? "Uploading…" : "Upload new"}</Button></div>
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</p> : null}
        <div className="grid max-h-[460px] grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3">
          {isLoading ? <p className="col-span-full p-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading media…</p> : error ? <p className="col-span-full p-10 text-center text-sm text-slate-500 dark:text-slate-400">Media files are unavailable right now.</p> : files.length === 0 ? <p className="col-span-full p-10 text-center text-sm text-slate-500 dark:text-slate-400">No uploaded media found.</p> : files.map((file) => <button key={file.id} onClick={() => { onSelect(file); onOpenChange(false) }} className="overflow-hidden rounded-xl border text-left transition hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-500/40 dark:hover:ring-indigo-500/20">{file.contentType.startsWith("image/") && file.download ? <img src={file.download.url} alt="" className="h-28 w-full bg-slate-100 object-contain dark:bg-slate-900" /> : <div className="flex h-28 items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500">{file.contentType.startsWith("image/") ? <ImageIcon className="h-8 w-8" /> : <FileIcon className="h-8 w-8" />}</div>}<div className="p-3"><p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{file.fileName}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{file.contentType}</p></div></button>)}
        </div>
      </DialogContent>
    </Dialog>
  )
}
