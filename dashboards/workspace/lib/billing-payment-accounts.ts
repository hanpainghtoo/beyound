import { Building2, Smartphone, WalletCards } from "lucide-react"

import type { PublicBillingAccountGroup } from "@/lib/api"
import type { PaymentMethodConfig } from "@/lib/payment-methods"
import { useBillingAccounts } from "@/lib/queries/billing"

// Live billing-accounts module only — no hardcoded fallback (a stale account
// number could send real money to the wrong place; showing nothing is safer).
// When the account module lands new fields, only the mapper below changes.
export type PaymentMethodValue = "bank_transfer" | "kbzpay" | "wavepay"

export type PaymentAccount = {
  id: string
  method: PaymentMethodValue
  label: string
  detail: string
  iconUrl?: string | null
  qrUrl?: string | null
}

export type PaymentMethodGroup = {
  value: PaymentMethodValue | "wallet"
  label: string
  icon: typeof Building2
  accounts: PaymentAccount[]
}

/** Wallet method from the account name. Upstream follow-up: ask for an
 * explicit method slug on public items instead of name matching. */
export function detectWalletMethod(accountName: string): "kbzpay" | "wavepay" {
  if (/wave/i.test(accountName)) return "wavepay"
  return "kbzpay"
}

export function mapPublicGroups(
  groups: PublicBillingAccountGroup[],
): PaymentAccount[] {
  const accounts: PaymentAccount[] = []
  for (const group of groups) {
    if (!group || !Array.isArray(group.items)) continue
    for (const item of group.items) {
      if (!item || typeof item.id !== "string") continue
      if (group.type === "bank_account") {
        accounts.push({
          id: item.id,
          method: "bank_transfer",
          label: item.account_name || "Bank Account",
          detail: item.account_no || "",
          iconUrl: item.icon || null,
          qrUrl: null,
        })
      } else {
        accounts.push({
          id: item.id,
          method: detectWalletMethod(item.account_name || ""),
          label: item.account_name || "Digital Wallet",
          detail: item.ph_no || "",
          iconUrl: item.icon || null,
          qrUrl: item.qr || null,
        })
      }
    }
  }
  return accounts
}

export function groupAccounts(accounts: PaymentAccount[]): PaymentMethodGroup[] {
  const bank = accounts.filter((account) => account.method === "bank_transfer")
  const wallets = accounts.filter((account) => account.method !== "bank_transfer")
  const groups: PaymentMethodGroup[] = []
  if (bank.length) {
    groups.push({ value: "bank_transfer", label: "Bank Account", icon: Building2, accounts: bank })
  }
  if (wallets.length) {
    groups.push({ value: "wallet", label: "Digital Wallet", icon: WalletCards, accounts: wallets })
  }
  return groups
}

/** Live groups, or empty when the endpoint fails or returns nothing usable.
 * Callers render an explicit unavailable state — never stale constants. */
export function usePaymentMethodGroups(): {
  groups: PaymentMethodGroup[]
  isLive: boolean
  isLoading: boolean
  isError: boolean
} {
  const query = useBillingAccounts()
  if (query.isLoading) {
    return { groups: [], isLive: false, isLoading: true, isError: false }
  }
  if (query.isError || !query.data) {
    return { groups: [], isLive: false, isLoading: false, isError: true }
  }
  if (!Array.isArray(query.data)) {
    return { groups: [], isLive: false, isLoading: false, isError: false }
  }
  const mapped = mapPublicGroups(query.data)
  if (mapped.length === 0) {
    return { groups: [], isLive: false, isLoading: false, isError: false }
  }
  return { groups: groupAccounts(mapped), isLive: true, isLoading: false, isError: false }
}

export function walletMethodIcon(method: PaymentMethodValue) {
  return method === "kbzpay" ? Smartphone : WalletCards
}

export function mapGroupsToPaymentConfigs(groups: PaymentMethodGroup[]): PaymentMethodConfig[] {
  return groups.map((group) => ({
    id: group.value,
    name: group.label,
    type: group.value === "bank_transfer" ? "bank" : "wallet",
    icon: "/brand/zayos-mark-light.png",
    options: group.accounts.map((account) => ({
      id: account.id,
      name: account.label,
      icon: account.iconUrl || "/brand/zayos-mark-light.png",
      accountName: account.method === "bank_transfer" ? account.label : undefined,
      accountNumber: account.method === "bank_transfer" ? account.detail : undefined,
      phoneNumber: account.method !== "bank_transfer" ? account.detail : undefined,
      qrUrl: account.qrUrl || undefined,
    })),
  }))
}
