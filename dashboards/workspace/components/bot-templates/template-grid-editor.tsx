"use client"

import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  FIELD_LABELS,
  isButtonKey,
  type DraftField,
} from "./template-model"

type Props = {
  fields: DraftField[]
  onChange: (fields: DraftField[]) => void
  disabled?: boolean
}

function move(fields: DraftField[], index: number, delta: -1 | 1) {
  const next = [...fields]
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function patch(
  fields: DraftField[],
  index: number,
  update: Partial<DraftField>,
) {
  return fields.map((field, i) =>
    i === index ? { ...field, ...update } : field,
  )
}

export function TemplateGridEditor({ fields, onChange, disabled }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div
            key={field.key}
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950"
          >
            {isButtonKey(field.key) ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || index === 0}
                  onClick={() => onChange(move(fields, index, -1))}
                  aria-label={`Move ${field.key} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || index === fields.length - 1}
                  onClick={() => onChange(move(fields, index, 1))}
                  aria-label={`Move ${field.key} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            <div className="min-w-28 flex-1">
              <p className="text-sm font-medium text-slate-950 dark:text-slate-50">
                {FIELD_LABELS[field.key] ?? field.key}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isButtonKey(field.key)
                  ? `button · row ${index + 1}`
                  : "text · always on top"}
              </p>
            </div>
            {isButtonKey(field.key) ? (
              <>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5">
                  {(["full", "half", "third"] as const).map((layout) => (
                    <Button
                      key={layout}
                      type="button"
                      variant={field.layout === layout ? "secondary" : "ghost"}
                      size="sm"
                      disabled={disabled}
                      onClick={() => onChange(patch(fields, index, { layout }))}
                    >
                      {layout === "full"
                        ? "Full"
                        : layout === "half"
                          ? "Half"
                          : "Third"}
                    </Button>
                  ))}
                </div>
                <Input
                  value={field.label}
                  disabled={disabled}
                  placeholder={FIELD_LABELS[field.key]}
                  aria-label={`${FIELD_LABELS[field.key]} label`}
                  className="min-w-32 flex-1"
                  onChange={(event) =>
                    onChange(
                      patch(fields, index, { label: event.target.value }),
                    )
                  }
                />
              </>
            ) : (
              <Input
                value={field.label}
                disabled={disabled}
                placeholder="Welcome, welcome!"
                className="min-w-40 flex-1"
                aria-label="Greeting text"
                onChange={(event) =>
                  onChange(patch(fields, index, { label: event.target.value }))
                }
              />
            )}
            {isButtonKey(field.key) ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.visible}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(patch(fields, index, { visible: checked }))
                  }
                  aria-label={`Visible: ${field.key}`}
                />
                {field.visible ? (
                  <Eye className="h-4 w-4 text-slate-400" />
                ) : (
                  <EyeOff className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Orders button condition</Label>
        <Select
          value={
            fields.find((field) => field.key === "orders")?.condition ??
            "none"
          }
          disabled={disabled}
          onValueChange={(value) => {
            const index = fields.findIndex((field) => field.key === "orders")
            if (index >= 0)
              onChange(
                patch(fields, index, {
                  condition: value === "none" ? null : value,
                }),
              )
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Always show</SelectItem>
            <SelectItem value="requires_ordering">
              Only when ordering is on
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
