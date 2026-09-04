import type { Metadata } from "next"
import { Suspense } from "react"

import ContactClient from "./contact-client"

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to the ZayOS team about demos, pricing, and support for your commerce workspace.",
}

export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <ContactClient />
    </Suspense>
  )
}
