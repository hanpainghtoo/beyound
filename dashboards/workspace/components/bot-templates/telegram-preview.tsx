"use client"

import { useState } from "react"
import { Pencil, ChevronDown, ChevronUp, Moon, Sun } from "lucide-react"
import { FIELD_LABELS, isButtonKey, toGridRows, type DraftField } from "./template-model"

export function TelegramPreview({
  channelName,
  templateName,
  fields,
  onEdit,
  collapsed: collapsedProp,
  onCollapsedChange,
}: {
  /**
   * Name of the channel this template will run on. Shown in the preview
   * header (falling back to the template name when absent, e.g. when the
   * component is reused inside the editor dialog).
   */
  channelName?: string
  /** Fallback identity shown in the preview header. */
  templateName: string
  fields: DraftField[]
  onEdit?: () => void
  /** Controlled collapse state; omit to keep local control. */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const isCollapsed = collapsedProp ?? internalCollapsed
  const setCollapsed = (value: boolean) => {
    if (onCollapsedChange) onCollapsedChange(value)
    else setInternalCollapsed(value)
  }

  const [isDark, setIsDark] = useState(false)
  const rows = toGridRows(fields)
  const buttonRows = rows.filter((row) =>
    row.some((field) => isButtonKey(field.key)),
  )
  const greetingField = fields.find((f) => f.key === "greeting")
  const greetingText =
    (greetingField?.label && String(greetingField.label).trim()) ||
    "Welcome, welcome!"

  const bg = isDark ? "bg-[#0e1621]" : "bg-[#e7ebf0]"
  const chatBg = isDark ? "bg-[#182533]" : "bg-[#ffffff]"
  const headerBg = isDark ? "bg-[#17212b]" : "bg-[#ffffff]"
  const textColor = isDark ? "text-[#f5f5f5]" : "text-[#000000]"
  const subtextColor = isDark ? "text-[#7f91a4]" : "text-[#7f91a4]"
  const bubbleBg = isDark ? "bg-[#182533]" : "bg-[#ffffff]"
  const btnBg = isDark ? "bg-[#2b5278]" : "bg-[#ffffff]"
  const btnBorder = isDark ? "border-[#3a6a8e]" : "border-[#d4d4d4]"
  const btnText = isDark ? "text-[#6ab3f3]" : "text-[#2b5278]"

  const heading = channelName?.trim() ? channelName.trim() : templateName

  const mock = (
    <>
      {/* Bot header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${headerBg}`}>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${isDark ? "bg-[#2b5278] text-white" : "bg-[#2b5278] text-white"}`}
        >
          {heading.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${textColor}`}>
            {heading || "Untitled"}
          </p>
          <p className={`text-[10px] ${subtextColor}`}>bot</p>
        </div>
      </div>

      {/* Chat area */}
      <div className={`space-y-2 px-3 py-3 ${chatBg}`} style={{ minHeight: "180px" }}>
        {/* Greeting bubble */}
        <div className={`max-w-[80%] rounded-xl rounded-tl-sm px-3 py-2 ${bubbleBg} shadow-sm`}>
          <p className={`text-xs leading-relaxed ${textColor}`}>
            {greetingText}
          </p>
          <p className={`mt-0.5 text-right text-[9px] ${subtextColor}`}>
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* Inline keyboard */}
      <div className={`space-y-1 px-2 pb-2 ${chatBg}`}>
        {buttonRows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-1">
            {row
              .filter((field) => isButtonKey(field.key))
              .map((field) => (
                <div
                  key={field.key}
                  className={`flex-1 rounded-md border px-1 py-1.5 text-center text-[10px] font-medium ${btnBg} ${btnBorder} ${btnText}`}
                >
                  {(field.label || field.key).trim() || FIELD_LABELS[field.key]}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div className={`flex items-center gap-2 px-3 py-2 ${headerBg}`}>
        <div className={`flex-1 rounded-full px-3 py-1 text-[10px] ${isDark ? "bg-[#0e1621] text-[#7f91a4]" : "bg-[#f1f1f4] text-[#999]"}`}>
          Message
        </div>
        <div className={`h-6 w-6 rounded-full flex items-center justify-center ${isDark ? "bg-[#2b5278]" : "bg-[#2b5278]"}`}>
          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
          </svg>
        </div>
      </div>
    </>
  )

  return (
    <div className="sticky top-0 mx-auto w-full max-w-72 shrink-0 self-start">
      <div className="mb-2 flex items-center justify-between">
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Back to preview
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Collapse
          </button>
        )}
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsDark((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div
          className={`overflow-hidden rounded-3xl border shadow-lg ${bg} ${isDark ? "border-[#2b3a4d]" : "border-[#d4d4d4]"}`}
        >
          {mock}
        </div>
      )}
    </div>
  )
}
