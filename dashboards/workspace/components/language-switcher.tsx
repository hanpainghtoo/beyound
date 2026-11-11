"use client"

import { useCallback } from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useI18n } from "@/components/providers/i18n-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LOCALES, preloadTranslations, type Locale } from "@/i18n_translation/translation"

// Fixed maps keep the two supported locales unambiguous:
// one flag source and one label key per locale.
const FLAG_SRC: Record<Locale, string> = {
  my: "/Myanmarflag.png",
  en: "/Englishflag.png",
}

const LABEL_KEY: Record<Locale, string> = {
  my: "navigation.languageMyanmar",
  en: "navigation.languageEnglish",
}

/**
 * Compact language switcher.
 *
 * Renders a single tab showing the active language's flag and name.
 * Clicking it opens a dropdown with both languages. Switching is a
 * pure client-side state update: no reload, no router.refresh, no
 * navigation, no overlay and no artificial delay. The other locale
 * is preloaded on item hover/focus so the switch renders in the
 * same tick.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, changeLanguage, isSwitching, t } = useI18n()

  const handleSelect = useCallback(
    (next: Locale) => {
      if (next === locale) return
      changeLanguage(next)
    },
    [changeLanguage, locale],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          lang={locale}
          aria-label={t("navigation.languageSwitcherLabel")}
          data-switching={isSwitching ? "true" : undefined}
          className={cn(
            // Fixed-height pill so the header layout does not shift
            // between languages; the flag is a consistent 20×20 box.
            "flex h-8 items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/70 py-1 pl-1.5 pr-2 backdrop-blur transition-colors hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-900/70 dark:hover:bg-slate-800",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0084FF] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900",
            className,
          )}
        >
          <img src={FLAG_SRC[locale]} alt="" className="h-5 w-5 rounded-full object-cover" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
            {t(LABEL_KEY[locale])}
          </span>
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            lang={option}
            onSelect={() => handleSelect(option)}
            onMouseEnter={() => preloadTranslations(option)}
            onFocus={() => preloadTranslations(option)}
            className="gap-2"
          >
            <img src={FLAG_SRC[option]} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            <span className="flex-1 text-sm">{t(LABEL_KEY[option])}</span>
            {option === locale ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
