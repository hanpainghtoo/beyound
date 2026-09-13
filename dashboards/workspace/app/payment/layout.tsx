"use client"
import type { ReactNode } from "react"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Globe } from "lucide-react"

export default function PaymentLayout({ children }: { children: ReactNode }) {
  const [showLangDropdown, setShowLangDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowLangDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="mx-auto max-w-[960px] px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/zayos-logo-light.png"
              alt="ZayOS"
              width={120}
              height={30}
              className="h-7 sm:h-8 w-auto"
            />
          </Link>
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Language</span>
            </button>
            {showLangDropdown && (
              <div className="absolute right-0 mt-2 w-40 rounded-xl border border-slate-200 bg-white shadow-lg py-1 z-50">
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => setShowLangDropdown(false)}
                >
                  🇲🇲 Myanmar
                </button>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => setShowLangDropdown(false)}
                >
                  🇬🇧 English
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-[960px] px-4 sm:px-5 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
