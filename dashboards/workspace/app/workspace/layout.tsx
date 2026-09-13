import type { Metadata } from "next"
import { WorkspaceLayout } from "@/components/workspace-shell"
import { QueryProvider } from "@/components/providers/query-provider"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Commerce Workspace",
  description: "Tenant-facing workspace for merchants and CSRs.",
}

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <QueryProvider>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </QueryProvider>
  )
}
