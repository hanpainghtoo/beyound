"use client"

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react"
import { Upload, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg"]
const MAX_SIZE_MB = 5
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

type ReceiptUploaderProps = {
  onFileSelect: (file: File | null) => void
  selectedFile: File | null
}

export function ReceiptUploader({ onFileSelect, selectedFile }: ReceiptUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Invalid file type. Please upload a PNG or JPG image."
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`
    }
    return null
  }, [])

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      onFileSelect(null)
      return
    }
    setError(null)
    onFileSelect(file)
  }, [validateFile, onFileSelect])

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const handleRemove = useCallback(() => {
    onFileSelect(null)
    setError(null)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }, [onFileSelect])

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg"
        onChange={handleInputChange}
        className="hidden"
      />

      {selectedFile ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
            <Upload className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{selectedFile.name}</p>
            <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
            isDragOver
              ? "border-indigo-400 bg-indigo-50"
              : "border-indigo-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
            <Upload className="h-6 w-6 text-indigo-500" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-900">
            Click to upload receipt screenshot
          </p>
          <p className="mt-1 text-xs text-slate-500">
            or drag and drop file here (PNG, JPG, MAX 5MB)
          </p>
        </button>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
