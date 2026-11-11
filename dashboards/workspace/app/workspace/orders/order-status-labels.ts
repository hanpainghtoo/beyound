"use client"

import { useI18n } from "@/components/providers/i18n-provider"

/**
 * Status values arrive from the API as raw slugs (`out_for_delivery`), so every
 * surface that renders them needs the same translation. Payment labels reuse
 * `ordersPage.paid`/`unpaid`; delivery reuses `workspace.deliveries.state.*`
 * because those strings are already user-reviewed, unlike most of the
 * placeholder-filled `workspace.orders.*` keys.
 */
export function useOrderStatusLabels() {
  const { t } = useI18n()

  const orderStatus = (value?: string | null) => {
    switch (value) {
      case "pending": return t("workspace.ordersPage.orderStatus.pending")
      case "confirmed": return t("workspace.ordersPage.orderStatus.confirmed")
      case "rejected": return t("workspace.ordersPage.orderStatus.rejected")
      case "cancelled": return t("workspace.ordersPage.orderStatus.cancelled")
      default: return value || "—"
    }
  }

  const paymentStatus = (value?: string | null) => {
    switch (value) {
      case "paid": return t("workspace.ordersPage.paid")
      case "partially_paid": return t("workspace.orders.paymentPartiallyPaid")
      case "unpaid": return t("workspace.ordersPage.unpaid")
      default: return value || "—"
    }
  }

  const deliveryStatus = (value?: string | null) => {
    if (!value) return "—"
    return t(`workspace.deliveries.state.${value}`)
  }

  return { orderStatus, paymentStatus, deliveryStatus }
}