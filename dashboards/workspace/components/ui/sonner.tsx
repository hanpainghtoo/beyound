"use client"

import * as React from "react"
import { Toaster as Sonner, ToasterProps } from "sonner"

function usePanelTheme(): ToasterProps["theme"] {
  const [theme, setTheme] = React.useState<ToasterProps["theme"]>("system")

  React.useEffect(() => {
    const el = document.documentElement
    const sync = () => {
      setTheme(el.classList.contains("dark") ? "dark" : "light")
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(el, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
    return () => observer.disconnect()
  }, [])

  return theme
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = usePanelTheme()

  return (
    <Sonner
      theme={theme}
      position="top-right"
      richColors
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
