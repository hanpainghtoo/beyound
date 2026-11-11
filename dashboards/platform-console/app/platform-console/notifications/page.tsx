import { ConsoleHeader } from "@/components/platform-console-shell"
import { PlatformConsoleUnavailableState } from "@/components/platform-console-release-state"

export default function NotificationsPage() {
  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Notifications"
        description="Platform operator notifications are not yet backed by a production platform-admin notifications API."
      />
      <PlatformConsoleUnavailableState
        title="Notifications are not available in this release"
        description="This route remains intentionally out of production navigation."
        reason="The backend currently exposes tenant-user notification workflows, not persisted platform-operator notifications. Sample alerts and client-side read/delete controls have been removed so no mock notification feed is presented as live console data."
      />
    </>
  )
}
