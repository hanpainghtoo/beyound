// Plan 14 Phase 6: shared, pure helpers for rendering upgrade revision state.
// Both a paid-plan upgrade and a trial-to-paid upgrade are presented to the
// customer as "upgrade" — the trial distinction is surfaced separately in the
// history heading, not in the status label.

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function upgradeStatusLabel(status: string): string {
  const prefix = "Upgrade";
  if (status === "requested") return `${prefix} requested`;
  if (status === "pending_payment") return "Payment pending";
  if (status === "pending_approval") return `${prefix} pending approval`;
  if (status === "approved") return `${prefix} approved`;
  if (status === "rejected") return `${prefix} rejected`;
  if (status === "stale") return `${prefix} expired`;
  if (status === "cancelled") return `${prefix} cancelled`;
  return titleCase(status);
}

export type UpgradeStatusTone = "active" | "pending" | "muted";

export function upgradeStatusTone(status: string): UpgradeStatusTone {
  if (status === "approved") return "active";
  if (["rejected", "stale", "cancelled"].includes(status)) return "muted";
  return "pending";
}

const carryoverLabels: Record<string, string> = {
  inbound_messages: "Inbound",
  outbound_messages: "Outbound",
  api_requests: "API",
};

export function carryoverSummary(
  carryover?: Record<string, number | null> | null,
): string | null {
  if (!carryover) return null;
  const parts = Object.entries(carryover)
    .filter(([, value]) => value !== null && value !== undefined && value > 0)
    .map(
      ([key, value]) =>
        `${carryoverLabels[key] || titleCase(key)} +${Number(value).toLocaleString()}`,
    );
  return parts.length ? parts.join(" · ") : null;
}
