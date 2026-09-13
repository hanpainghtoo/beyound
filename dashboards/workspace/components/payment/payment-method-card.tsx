"use client"

import { useState } from "react"
import { ChevronDown, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PaymentMethodConfig, PaymentOption } from "@/lib/payment-methods"

type PaymentMethodCardProps = {
  method: PaymentMethodConfig
  selectedOptionId: string | null
  onSelectOption: (optionId: string) => void
  collapsed?: boolean
}

export function PaymentMethodCard({ method, selectedOptionId, onSelectOption, collapsed }: PaymentMethodCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = async (text: string, optionId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(optionId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setCopiedId(null)
    }
  }

  const hasSelectedOption = method.options.some((opt) => opt.id === selectedOptionId)

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-300",
        hasSelectedOption
          ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200"
          : "border-slate-200 bg-white"
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => {
        if (!hasSelectedOption) setIsExpanded(false)
      }}
      style={collapsed ? { maxHeight: 0, overflow: "hidden", opacity: 0, margin: 0, padding: 0, borderWidth: 0 } : undefined}
    >
      {/* Category Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-slate-50/50 rounded-2xl"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 overflow-hidden">
          <img
            src={method.icon}
            alt={method.name}
            className="h-full w-full object-contain p-1"
          />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{method.name}</p>
          <p className="text-sm text-slate-500">
            {method.options.length} options available
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-slate-400 transition-transform duration-300",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded Options */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="border-t border-slate-200 px-4 pb-4 pt-3 space-y-2">
          {method.options.map((option) => (
            <OptionItem
              key={option.id}
              option={option}
              isSelected={selectedOptionId === option.id}
              onSelect={() => onSelectOption(option.id)}
              onCopy={handleCopy}
              copiedId={copiedId}
              showQR={method.id === "digital-wallet"}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function OptionItem({
  option,
  isSelected,
  onSelect,
  onCopy,
  copiedId,
  showQR,
}: {
  option: PaymentOption
  isSelected: boolean
  onSelect: () => void
  onCopy: (text: string, id: string) => void
  copiedId: string | null
  showQR?: boolean
}) {
  const accountDetail = option.accountNumber || option.phoneNumber || ""
  const label = option.accountNumber ? "Account No" : "Phone No"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect() }}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-all duration-200 cursor-pointer",
        isSelected
          ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors mt-0.5",
            isSelected ? "border-indigo-600" : "border-slate-300"
          )}
        >
          {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-indigo-600" />}
        </div>
        <div className="flex-1 min-w-0 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <img
                src={option.icon}
                alt={option.name}
                className="h-5 w-5 object-contain"
              />
              <p className="font-medium text-slate-900 text-sm">{option.name}</p>
            </div>
            {option.accountName && (
              <p className="text-xs text-slate-500 mt-0.5">{option.accountName}</p>
            )}
            {accountDetail && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500">{label}:</span>
                <span className="text-xs font-medium text-slate-700">{accountDetail}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopy(accountDetail, option.id)
                  }}
                  className="text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  {copiedId === option.id ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            )}
          </div>
          {showQR && (
            <div className="flex flex-col items-center gap-1 shrink-0">
              <img
                src="/brand/QR.png"
                alt={`${option.name} QR`}
                className="h-16 w-16 shrink-0 rounded object-contain"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const img = new Image()
                  img.src = "/brand/QR.png"
                  img.onload = () => {
                    const canvas = document.createElement("canvas")
                    canvas.width = img.width
                    canvas.height = img.height
                    const ctx = canvas.getContext("2d")
                    if (ctx) {
                      ctx.drawImage(img, 0, 0)
                      canvas.toBlob((blob) => {
                        if (blob) {
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement("a")
                          a.href = url
                          a.download = `${option.name}-payment-qr.png`
                          a.click()
                          URL.revokeObjectURL(url)
                        }
                      }, "image/png")
                    }
                  }
                }}
                className="flex items-center gap-0.5 text-[10px] text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download QR
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
