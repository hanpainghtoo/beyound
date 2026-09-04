import { Suspense } from "react"
import type { Metadata } from "next"

import LoginClient from "./login-client"

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your ZayOS Commerce Workspace account.",
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  )
}
