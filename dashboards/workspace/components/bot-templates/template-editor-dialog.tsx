"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BotTemplateDto } from "@/lib/api"
import { TemplateGridEditor } from "./template-grid-editor"
import { TelegramPreview } from "./telegram-preview"
import {
  defaultDraft,
  fromDto,
  isButtonKey,
  toInput,
  type DraftField,
} from "./template-model"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: BotTemplateDto | null
  saving: boolean
  error: string | null
  onSave: (data: { name: string; fields: ReturnType<typeof toInput> }) => void
}


export function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  saving,
  error,
  onSave,
}: Props) {
  const [name, setName] = useState("")
  const [fields, setFields] = useState<DraftField[]>(defaultDraft())
  const [localError, setLocalError] = useState<string | null>(null)
  // Collapsed live preview: the panel dismisses and the template form takes
  // the full width; re-expanding restores the panel (with theme toggle).
  const [previewCollapsed, setPreviewCollapsed] = useState(false)

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "")
      setFields(template ? fromDto(template.fields) : defaultDraft())
      setLocalError(null)
      setPreviewCollapsed(false)
    }
  }, [open, template])

  const hasVisibleButton = fields.some(
    (field) => field.visible && isButtonKey(field.key),
  )

  const handleSave = () => {
    if (!name.trim()) {
      setLocalError("Give the template a name.")
      return
    }
    if (!hasVisibleButton) {
      setLocalError("Keep at least one visible button.")
      return
    }
    onSave({ name: name.trim(), fields: toInput(fields) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? `Edit ${template.name}` : "New bot template"}
            {template?.isDefault ? " (default)" : ""}
          </DialogTitle>
          <DialogDescription>
            Arrange the menu buttons. The preview tracks your draft — nothing
            is saved until you confirm.
          </DialogDescription>
        </DialogHeader>
        <div
          className={
            previewCollapsed
              ? "grid gap-8 grid-cols-1"
              : "grid gap-8 md:grid-cols-[1fr_300px]"
          }
        >
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={name}
                disabled={saving}
                placeholder="e.g. Festival menu"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <TemplateGridEditor
              fields={fields}
              onChange={setFields}
              disabled={saving}
            />
            {localError || error ? (
              <p className="text-sm text-red-800 dark:text-red-200">
                {localError ?? error}
              </p>
            ) : null}
          </div>
          <TelegramPreview
            templateName={name}
            fields={fields}
            collapsed={previewCollapsed}
            onCollapsedChange={setPreviewCollapsed}
          />
        </div>
        <DialogFooter>
          <Button type="button" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
