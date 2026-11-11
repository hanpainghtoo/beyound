"use client"

import { useRouter } from "next/navigation"
import { CircleSlash } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type FeatureDisabledDialogProps = {
  open: boolean
  /** Human-readable module name, e.g. "Orders". */
  featureName: string
  /** True when the viewer is allowed to change the toggle. */
  canManage?: boolean
}

/**
 * Plan 55: shown when a workspace module is switched off for this tenant.
 * Non-dismissible on purpose — the module cannot be reached until an owner
 * or admin re-enables it from Workspace Settings.
 */
export function FeatureDisabledDialog({
  open,
  featureName,
  canManage = false,
}: FeatureDisabledDialogProps) {
  const router = useRouter()

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleSlash className="size-5 text-amber-600 dark:text-amber-400" />
            {featureName} is turned off
          </DialogTitle>
          <DialogDescription>
            {featureName} has been disabled for this workspace, so this page is not
            available right now. Inbox and chat are always on.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => router.push(canManage ? "/workspace/settings" : "/workspace")}
          >
            {canManage ? "Open workspace settings" : "Back to home"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}