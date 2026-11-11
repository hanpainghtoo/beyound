"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BotTemplateDto } from "@/lib/api"
import {
  useBotTemplates,
  useCreateBotTemplate,
  useDeleteBotTemplate,
  useUpdateBotTemplate,
} from "@/lib/queries/bot-templates"
import { TemplateEditorDialog } from "./template-editor-dialog"
import { toInput } from "./template-model"

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Request failed."
}

export function TemplateManager() {
  const templatesQuery = useBotTemplates()
  const createMutation = useCreateBotTemplate()
  const updateMutation = useUpdateBotTemplate()
  const deleteMutation = useDeleteBotTemplate()
  const [editing, setEditing] = useState<BotTemplateDto | null | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] =
    useState<BotTemplateDto | null>(null)

  const templates = templatesQuery.data ?? []
  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = async (data: {
    name: string
    fields: ReturnType<typeof toInput>
  }) => {
    setError(null)
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data })
      } else {
        await createMutation.mutateAsync(data)
      }
      setEditing(undefined)
    } catch (requestError) {
      setError(messageOf(requestError))
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setError(null)
    try {
      await deleteMutation.mutateAsync(confirmDelete.id)
      setConfirmDelete(null)
    } catch (requestError) {
      setError(messageOf(requestError))
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Bot templates
          </p>
          <p className="max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Menu content for this merchant&apos;s Telegram bots. The default
            template cannot be deleted.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setError(null)
            setEditing(null)
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> New template
        </Button>
      </div>

      {templatesQuery.isPending ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading templates…
        </p>
      ) : null}
      {templatesQuery.isError ? (
        <p className="text-sm text-red-800 dark:text-red-200">
          {messageOf(templatesQuery.error)}
        </p>
      ) : null}
      {templates.length === 0 && !templatesQuery.isPending ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No templates yet.
        </p>
      ) : null}

      <div className="space-y-2">
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-950 dark:text-slate-50">
                {template.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {template.fields.length} fields
              </p>
            </div>
            {template.isDefault ? <Badge>Default</Badge> : null}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setError(null)
                  setEditing(template)
                }}
                aria-label={`Edit ${template.name}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {!template.isDefault ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDelete(template)}
                  aria-label={`Delete ${template.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
      ) : null}

      {editing !== undefined ? (
        <TemplateEditorDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(undefined)
          }}
          template={editing}
          saving={saving}
          error={null}
          onSave={handleSave}
        />
      ) : null}

      {confirmDelete ? (
        <AlertDialog
          open={Boolean(confirmDelete)}
          onOpenChange={(open) => {
            if (!open) setConfirmDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {confirmDelete.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the template. Templates used by a
                channel cannot be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-600/90 focus-visible:ring-red-600/40 dark:bg-red-600 dark:text-white dark:hover:bg-red-600/90"
                disabled={deleteMutation.isPending}
                onClick={() => void handleDelete()}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
