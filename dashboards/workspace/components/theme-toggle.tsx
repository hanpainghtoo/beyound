"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

const STORAGE_KEY = "zayos-commerce-theme"

type Theme = "light" | "dark"

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark"
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.style.colorScheme = theme
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light"
    const storedTheme = window.localStorage.getItem(STORAGE_KEY)
    const preferredTheme: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    return isTheme(storedTheme) ? storedTheme : preferredTheme
  })

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark"

    setTheme(nextTheme)
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
    applyTheme(nextTheme)
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme"

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className="rounded-xl bg-slate-50/70 text-slate-600 shadow-sm dark:bg-slate-900/80 dark:text-slate-300"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
