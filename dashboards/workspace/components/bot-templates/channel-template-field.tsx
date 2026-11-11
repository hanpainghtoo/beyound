"use client"

import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  useBotTemplates,
  useChannelTemplateSelection,
  useSetChannelTemplateSelection,
  useUpdateBotTemplate,
} from "@/lib/queries/bot-templates"
import { TelegramPreview } from "./telegram-preview"
import { TemplateEditorDialog } from "./template-editor-dialog"
import type { BotTemplateDto } from "@/lib/api"
import { fromDto, toInput } from "./template-model"

type Props = {
  channelId: string
  /** Display name of the channel; used in the live preview header. */
  channelName: string
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Request failed."
}

// Verify rule: attaching/switching templates never re-verifies the bot —
// verification stays tied to botToken changes in the channel form.
// Changes stage locally; Confirm applies toggle + selection in one request,
// which also turns the whole sale flow on (Plan 74 one-toggle setup).
export function ChannelTemplateField({
  channelId,
  channelName,
}: Props) {
  const templatesQuery = useBotTemplates()
  const selectionQuery = useChannelTemplateSelection(channelId)
  const setMutation = useSetChannelTemplateSelection()
  const updateMutation = useUpdateBotTemplate()
  const [draftEnabled, setDraftEnabled] = useState(false)
  const [draftTemplateId, setDraftTemplateId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  // Plan 76: a refused command list is not fatal — the bot still serves the
  // menu, it just won't advertise /start and /menu in the Telegram UI.
  const [commandsWarning, setCommandsWarning] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<
    BotTemplateDto | null | undefined
  >(undefined)

  const selection = selectionQuery.data
  useEffect(() => {
    if (selection) {
      setDraftTemplateId(selection.templateId ?? "")
      setDraftEnabled(selection.useBotTemplate)
    }
  }, [selection])

  const templates = templatesQuery.data ?? []
  const saving = setMutation.isPending
  const dirty =
    draftEnabled !== (selection?.useBotTemplate ?? false) ||
    draftTemplateId !== (selection?.templateId ?? "")

  const handleConfirm = async () => {
    setError(null)
    setCommandsWarning(false)
    try {
      const applied = await setMutation.mutateAsync({
        channelId,
        data: {
          templateId: draftTemplateId || undefined,
          useBotTemplate: draftEnabled,
        },
      })
      if (draftEnabled && applied.commandsRegistered === false) {
        setCommandsWarning(true)
      }
    } catch (requestError) {
      setError(messageOf(requestError))
      setDraftTemplateId(selection?.templateId ?? "")
      setDraftEnabled(selection?.useBotTemplate ?? false)
    }
  }

  const handleEditSave = async (editData: {
    name: string
    fields: ReturnType<typeof toInput>
  }) => {
    if (!editingTemplate) return
    try {
      await updateMutation.mutateAsync({
        id: editingTemplate.id,
        data: { name: editData.name, fields: editData.fields },
      })
      setEditingTemplate(undefined)
    } catch (requestError) {
      setError(messageOf(requestError))
    }
  }

  // The live preview follows the *draft* selection, so it appears the moment
  // a template is picked in the dropdown (or the switch is toggled on),
  // even before the merchant confirms. It renders the same template the
  // saved selection will point at once confirmed.
  const previewTemplate =
    templates.find((t) => t.id === draftTemplateId) ?? null
  const showPreview = draftEnabled && !!previewTemplate
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Use bot template
          </p>
          <p className="max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Render this channel&apos;s menu from a template. Confirming turns
            on the whole sale flow and refreshes the webhook registration.
          </p>
        </div>
        <Switch
          checked={draftEnabled}
          disabled={saving || selectionQuery.isPending}
          onCheckedChange={setDraftEnabled}
          aria-label="Use bot template"
        />
      </div>
      <div className="space-y-2">
        <Label>Template</Label>
        <Select
          value={draftTemplateId}
          disabled={saving || templatesQuery.isPending}
          onValueChange={setDraftTemplateId}
        >
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select a template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
                {template.isDefault ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
      ) : null}
      {commandsWarning ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          The template is live, but Telegram would not accept the bot command
          list. Customers won&apos;t see /start and /menu in the chat menu until
          they type one — the bot answers either way.
        </p>
      ) : null}
      <div className="flex justify-end border-t border-slate-200 pt-3 dark:border-slate-800">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={handleConfirm}
        >
          {saving ? "Confirming…" : "Confirm"}
        </Button>
      </div>

      {showPreview ? (
        <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Template preview
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Edit ${previewTemplate.name}`}
              onClick={() => setEditingTemplate(previewTemplate)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <TelegramPreview
            key={previewTemplate.id}
            channelName={channelName}
            templateName={previewTemplate.name}
            fields={fromDto(previewTemplate.fields)}
            onEdit={() => setEditingTemplate(previewTemplate)}
          />
        </div>
      ) : null}

      {editingTemplate !== undefined ? (
        <TemplateEditorDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingTemplate(undefined)
          }}
          template={editingTemplate}
          saving={updateMutation.isPending}
          error={error}
          onSave={handleEditSave}
        />
      ) : null}
    </div>
  )
}
