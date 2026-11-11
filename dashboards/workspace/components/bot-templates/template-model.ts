import type { BotTemplateFieldDto } from "@/lib/api"

// Draft field edited in the grid editor. `sort` is positional (array order);
// the API layer assigns dense sort numbers on save.
export type DraftField = {
  key: string
  layout: string
  visible: boolean
  condition: string | null
  label: string
}

export const FIELD_KEYS = [
  "greeting",
  "products",
  "shop_info",
  "orders",
  "agent",
] as const

export const FIELD_LABELS: Record<string, string> = {
  greeting: "Greeting",
  products: "Products",
  shop_info: "Shop info",
  orders: "Orders",
  agent: "Chat with agent",
}

export const DEFAULT_BUTTON_LABELS: Record<string, string> = {
  products: "Products",
  shop_info: "Shop info",
  orders: "Orders",
  agent: "Chat with agent",
}

export function isButtonKey(key: string) {
  return key !== "greeting"
}

export function fromDto(fields: BotTemplateFieldDto[]): DraftField[] {
  return [...fields]
    .sort((a, b) => a.sort - b.sort)
    .map((field) => ({
      key: field.key,
      layout: field.layout,
      visible: field.visible,
      condition: field.condition,
      label:
        typeof field.value?.label === "string" && field.value.label.length > 0
          ? field.value.label
          : (DEFAULT_BUTTON_LABELS[field.key] ?? ""),
    }))
}

export function toInput(fields: DraftField[]) {
  return fields.map((field) => ({
    key: field.key,
    layout: field.layout,
    visible: field.visible,
    condition: field.condition,
    value: field.label ? { label: field.label } : {},
  }))
}

export type GridRow = DraftField[]

// Mirrors the server renderer rule (6-unit row: full = 6, half = 3,
// third = 2, greedy packing). Only visible fields render.
export function toGridRows(fields: DraftField[]): GridRow[] {
  const units = (layout: string) =>
    layout === "full" ? 6 : layout === "third" ? 2 : 3
  const rows: GridRow[] = []
  let row: GridRow = []
  let used = 0
  for (const field of fields) {
    if (!field.visible) continue
    const width = units(field.layout)
    if (row.length > 0 && used + width > 6) {
      rows.push(row)
      row = []
      used = 0
    }
    row.push(field)
    used += width
  }
  if (row.length > 0) rows.push(row)
  return rows
}

export function defaultDraft(): DraftField[] {
  return [
    { key: "greeting", layout: "full", visible: true, condition: null, label: "" },
    { key: "products", layout: "full", visible: true, condition: null, label: "Products" },
    { key: "shop_info", layout: "half", visible: true, condition: null, label: "Shop info" },
    { key: "orders", layout: "half", visible: true, condition: "requires_ordering", label: "Orders" },
    { key: "agent", layout: "full", visible: true, condition: null, label: "Chat with agent" },
  ]
}
