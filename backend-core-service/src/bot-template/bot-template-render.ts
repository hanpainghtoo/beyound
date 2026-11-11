/**
 * Pure menu renderer (Plan 73, Phase 4a; thirds since Plan 75). Implements
 * the documented grid rule — sort-order walk over a 6-unit row (full = 6,
 * half = 3, third = 2), greedy packing, max 3 buttons per row — shared
 * conceptually with the workspace preview (`toGridRows`); both derive from
 * the same rule so WYSIWYG holds.
 */
import {
  BOT_TEMPLATE_GRID_ROW_UNITS,
  BOT_TEMPLATE_LAYOUT_UNITS,
} from './bot-template.constants';

export type RenderableField = {
  key: string;
  sort: number;
  layout: string;
  visible: boolean;
  condition: string | null;
  value?: Record<string, unknown> | null;
};

export type MenuButtonView = {
  key: string;
  label: string | null;
};

export function customLabel(field: RenderableField): string | null {
  const label = field.value?.label;
  return typeof label === 'string' && label.trim().length > 0
    ? label.trim()
    : null;
}

export function renderMenuRows(
  fields: RenderableField[],
  opts: { orderingEnabled: boolean },
): MenuButtonView[][] {
  const ordered = [...fields]
    .filter((field) => field.visible)
    .filter(
      (field) =>
        field.key !== 'greeting' &&
        (field.condition !== 'requires_ordering' || opts.orderingEnabled),
    )
    .sort((a, b) => a.sort - b.sort);
  const rows: MenuButtonView[][] = [];
  let row: MenuButtonView[] = [];
  let units = 0;
  const view = (field: RenderableField): MenuButtonView => ({
    key: field.key,
    label: customLabel(field),
  });
  for (const field of ordered) {
    const width =
      BOT_TEMPLATE_LAYOUT_UNITS[
        field.layout as keyof typeof BOT_TEMPLATE_LAYOUT_UNITS
      ] ?? BOT_TEMPLATE_GRID_ROW_UNITS;
    if (row.length > 0 && units + width > BOT_TEMPLATE_GRID_ROW_UNITS) {
      rows.push(row);
      row = [];
      units = 0;
    }
    row.push(view(field));
    units += width;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

export function renderGreeting(fields: RenderableField[]): string | null {
  const greeting = [...fields]
    .filter((field) => field.visible && field.key === 'greeting')
    .sort((a, b) => a.sort - b.sort)[0];
  return greeting ? customLabel(greeting) : null;
}
