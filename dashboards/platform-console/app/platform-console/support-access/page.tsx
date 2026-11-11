import { ConsoleHeader } from "@/components/platform-console-shell"
import { PlatformConsoleUnavailableState } from "@/components/platform-console-release-state"

export default function Page() {
  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Support Access"
        description="Support-access grants require an auditable backend workflow before they can be exposed in production."
      />
      <PlatformConsoleUnavailableState
        title="Support access is not available in this release"
        description="This route remains intentionally out of production navigation."
        reason="There is no production platform-admin API for real support-session grants, approval state, revocation, or audit history. The page no longer displays generated sessions or unusable action buttons."
      />
    </>
  )
}
