import { ConsoleHeader } from "@/components/platform-console-shell"
import { PlatformConsoleUnavailableState } from "@/components/platform-console-release-state"

export default function Page() {
  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Platform Incidents"
        description="Persisted operational incidents are not yet available through a production platform-admin API."
      />
      <PlatformConsoleUnavailableState
        title="Incident operations are not available in this release"
        description="This route remains intentionally out of production navigation."
        reason="The backend does not currently expose persisted incident or operational event records for platform operators. To avoid showing fabricated outages, queues, or worker health, the incident dashboard has been reduced to an explicit unavailable state."
      />
    </>
  )
}
