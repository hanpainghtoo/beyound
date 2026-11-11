/**
 * Bot template field vocabulary (Plan 73). Keys mirror the hardcoded menu in
 * `telegram-commerce.service.ts:showMenu` 1:1 so the default template renders
 * byte-identical output to the legacy path.
 */
export const BOT_TEMPLATE_FIELD_KEYS = [
  'greeting',
  'products',
  'shop_info',
  'orders',
  'agent',
] as const;

export type BotTemplateFieldKey = (typeof BOT_TEMPLATE_FIELD_KEYS)[number];

export const BOT_TEMPLATE_BUTTON_KEYS: ReadonlySet<BotTemplateFieldKey> =
  new Set(['products', 'shop_info', 'orders', 'agent']);

export const BOT_TEMPLATE_LAYOUTS = ['full', 'half', 'third'] as const;

export type BotTemplateLayout = (typeof BOT_TEMPLATE_LAYOUTS)[number];

/** Grid units on a 6-unit row: full fills, halves pair, thirds triple. */
export const BOT_TEMPLATE_LAYOUT_UNITS: Record<BotTemplateLayout, number> = {
  full: 6,
  half: 3,
  third: 2,
};

export const BOT_TEMPLATE_GRID_ROW_UNITS = 6;

export const BOT_TEMPLATE_CONDITIONS = ['requires_ordering'] as const;

export type BotTemplateCondition =
  | (typeof BOT_TEMPLATE_CONDITIONS)[number]
  | null;

/** Field input accepted on create/update. `sort` is assigned by array order. */
export type BotTemplateFieldInput = {
  key: string;
  layout?: string;
  visible?: boolean;
  condition?: string | null;
  value?: Record<string, unknown>;
};

export const DEFAULT_BOT_TEMPLATE_NAME = 'Default';

/**
 * Default field set, 1:1 with the original hardcoded menu: greeting +
 * Products (full) + Shop info / Orders (half row, orders conditional on
 * ordering) + Agent. Single source for backfill, ensure-default, and the
 * no-DB menu fallback.
 */
export const DEFAULT_BOT_TEMPLATE_FIELDS: BotTemplateFieldInput[] = [
  { key: 'greeting', layout: 'full', visible: true },
  { key: 'products', layout: 'full', visible: true },
  { key: 'shop_info', layout: 'half', visible: true },
  {
    key: 'orders',
    layout: 'half',
    visible: true,
    condition: 'requires_ordering',
  },
  { key: 'agent', layout: 'full', visible: true },
];
