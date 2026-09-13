"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { getStoredSession, SESSION_EXPIRED_EVENT } from "@/lib/api"

export function SessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const redirect = (expired: boolean) => {
      const reason = expired ? "&reason=session-expired" : ""
      router.replace(`/login?next=${encodeURIComponent(pathname)}${reason}`)
      setAuthorized(false)
    }
    const checkSession = () => {
      const session = getStoredSession()
      if (session?.user.type === "platform_admin") {
        setAuthorized(true)
      } else {
        redirect(false)
      }
    }
    const handleExpiry = () => redirect(true)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "kme-auth-session" && !event.newValue) redirect(false)
    }

    checkSession()
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiry)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiry)
      window.removeEventListener("storage", handleStorage)
    }
  }, [pathname, router])

  return authorized ? children : null
}
