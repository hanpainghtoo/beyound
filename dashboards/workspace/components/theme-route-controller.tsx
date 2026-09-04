"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const STORAGE_KEY = "zayos-commerce-theme"

type Theme = "light" | "dark"

function resolveWorkspaceTheme(): Theme {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY)
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme
  } catch {
    // Ignore local storage access failures and fall back to system preference.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.style.colorScheme = theme
}

export function ThemeRouteController() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname.startsWith("/workspace")) {
      applyTheme(resolveWorkspaceTheme())
      return
    }

    applyTheme("light")
  }, [pathname])

  return null
}
