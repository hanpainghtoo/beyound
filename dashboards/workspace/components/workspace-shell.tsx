"use client"

import type React from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SessionGuard } from "@/components/session-guard"
import { WorkspaceWarningBanner } from "@/components/workspace-warning-banner"

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard requiredType="tenant_user">
      <SidebarProvider defaultOpen={true}>
          <div className="workspace-shell flex w-full flex-col">
          <WorkspaceWarningBanner />
          <div className="flex min-h-0 flex-1">
            <AppSidebar className="top-[var(--banner-height,0px)] h-[calc(100svh-var(--banner-height,0px))]" />
            <main className="min-w-0 flex-1 overflow-hidden flex flex-col">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </SessionGuard>
  )
}
