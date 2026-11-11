/**
 * Badge tone palettes for the inbox.
 *
 * Six of these maps were copy-pasted into the page, each repeating the same
 * `border-*-200 bg-*-50 text-*-700 dark:border-*-500/20 dark:bg-*-500/10
 * dark:text-*-200` literal once per hue. The pattern is generated here from the
 * hue alone so a new tone is one line rather than another pasted string.
 *
 * Two slate tones exist on purpose. `slate` is the default/neutral state;
 * `slateQuiet` is a lower-contrast variant used for system and
 * already-settled context rows so they recede behind live work.
 */

export type BadgeTone =
  | "slate"
  | "slateQuiet"
  | "blue"
  | "amber"
  | "red"
  | "emerald"
  | "cyan"
  | "violet";

type ToneOverrides = {
  /** Base text colour. Defaults to `<hue>-700`. */
  text?: string;
  /** Dark-mode border. Defaults to `<hue>-500/20`. */
  darkBorder?: string;
  /** Dark-mode background. Defaults to `<hue>-500/10`. */
  darkBg?: string;
  /** Dark-mode text. Defaults to `<hue>-200`. */
  darkText?: string;
};

function toneClasses(hue: string, overrides: ToneOverrides = {}): string {
  const {
    text = `${hue}-700`,
    darkBorder = `${hue}-500/20`,
    darkBg = `${hue}-500/10`,
    darkText = `${hue}-200`,
  } = overrides;
  return (
    `border-${hue}-200 bg-${hue}-50 text-${text} ` +
    `dark:border-${darkBorder} dark:bg-${darkBg} dark:text-${darkText}`
  );
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  slate: toneClasses("slate", {
    darkBorder: "slate-700",
    darkBg: "slate-800/80",
  }),
  slateQuiet: toneClasses("slate", {
    text: "slate-600",
    darkBorder: "slate-700",
    darkBg: "slate-900/80",
    darkText: "slate-300",
  }),
  blue: toneClasses("blue"),
  amber: toneClasses("amber"),
  red: toneClasses("red"),
  emerald: toneClasses("emerald"),
  cyan: toneClasses("cyan"),
  violet: toneClasses("violet"),
};

/** Colours only — the caller supplies `rounded-full border` if it wants them. */
export function badgeTone(tone: BadgeTone): string {
  return TONE_CLASSES[tone];
}

/** Pill shape plus tone, the form most badges in the inbox use. */
export function badgePillClass(tone: BadgeTone): string {
  return `rounded-full border ${TONE_CLASSES[tone]}`
}

/** Slightly heavier pill, used by the rush-mode counter chips. */
export function counterChipClass(tone: BadgeTone): string {
  return `rounded-full border px-3 py-1.5 text-xs font-semibold ${TONE_CLASSES[tone]}`
}

const INTENT_TONES: Record<string, BadgeTone> = {
  payment_review: "amber",
  order_intent: "blue",
  complaints: "red",
  delivery: "cyan",
  follow_up: "violet",
}

export function intentBadgeClass(intent: string): string {
  return badgePillClass(INTENT_TONES[intent] ?? "slateQuiet")
}

const SETTLED_STATUSES = new Set(["resolved", "closed"])

export function statusBadgeClass(status: string): string {
  if (SETTLED_STATUSES.has(status)) return badgePillClass("emerald")
  if (status === "pending") return badgePillClass("amber")
  return badgePillClass("slate")
}

const PAID_STATUSES = new Set(["paid"])
const OPEN_PAYMENT_STATUSES = new Set([
  "unpaid",
  "partially_paid",
  // Legacy drawdown statuses still present on older rows.
  "pending",
  "cod_pending",
])

export function paymentBadgeClass(status: string): string {
  if (PAID_STATUSES.has(status)) return badgePillClass("emerald")
  if (OPEN_PAYMENT_STATUSES.has(status)) return badgePillClass("amber")
  return badgePillClass("slate")
}

/**
 * Order lifecycle status (`pending` / `confirmed` / `rejected` / `cancelled`).
 *
 * Kept separate from `statusBadgeClass`: that one knows conversation statuses,
 * so reusing it would paint `confirmed` and `cancelled` the same slate.
 */
const ORDER_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "amber",
  confirmed: "emerald",
  rejected: "red",
  cancelled: "slateQuiet",
}

export function orderStatusBadgeClass(status: string): string {
  return badgePillClass(ORDER_STATUS_TONES[status] ?? "slateQuiet")
}

/** Delivery status (`packed` … `returned`). */
const DELIVERY_STATUS_TONES: Record<string, BadgeTone> = {
  packed: "blue",
  out_for_delivery: "amber",
  delivered: "emerald",
  failed_delivery: "red",
  returned: "slateQuiet",
}

export function deliveryStatusBadgeClass(status: string): string {
  return badgePillClass(DELIVERY_STATUS_TONES[status] ?? "slateQuiet")
}

/**
 * Customer lifecycle status (`AgentCustomerDto.status`).
 *
 * Deliberately separate from `statusBadgeClass`: that helper knows conversation
 * and order statuses, so every customer status fell through to the same slate
 * pill and a blocked customer looked identical to an active one.
 */
const CUSTOMER_STATUS_TONES: Record<string, BadgeTone> = {
  active: "emerald",
  blocked: "red",
  archived: "slateQuiet",
}

export function customerStatusBadgeClass(status: string): string {
  return badgePillClass(CUSTOMER_STATUS_TONES[status] ?? "slateQuiet")
}

/**
 * Timeline event tones, keyed by the event's own `tone`.
 *
 * System events use the quieter slate so background activity recedes behind
 * live order and payment work.
 */
export const timelineToneClass: Record<string, string> = {
  message: badgeTone("blue"),
  order: badgeTone("emerald"),
  payment: badgeTone("amber"),
  assignment: badgeTone("slate"),
  note: badgeTone("violet"),
  system: badgeTone("slateQuiet"),
}
