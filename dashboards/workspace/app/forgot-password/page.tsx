import type { Metadata } from "next"

import ForgotPasswordClient from "./forgot-password-client"

export const metadata: Metadata = {
  title: "Reset Password",
  description:
    "Request a secure, one-time link to choose a new password for your ZayOS workspace account.",
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />
}
