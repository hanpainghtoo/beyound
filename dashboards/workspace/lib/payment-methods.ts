export type PaymentMethodType = "bank" | "wallet"

export type PaymentOption = {
  id: string
  name: string
  icon: string
  accountName?: string
  accountNumber?: string
  phoneNumber?: string
}

export type PaymentMethodConfig = {
  id: string
  name: string
  type: PaymentMethodType
  icon: string
  options: PaymentOption[]
}

export const paymentMethods: PaymentMethodConfig[] = [
  {
    id: "bank-account",
    name: "Bank Account",
    type: "bank",
    icon: "/brand/zayos-mark-light.png",
    options: [
      {
        id: "kbz-bank",
        name: "KBZ Bank",
        icon: "/brand/KBZ.png",
        accountName: "ZayOS Corporation",
        accountNumber: "1234567890",
      },
      {
        id: "aya-bank",
        name: "AYA Bank",
        icon: "/brand/AYA.png",
        accountName: "ZayOS Corporation",
        accountNumber: "0987654321",
      },
    ],
  },
  {
    id: "digital-wallet",
    name: "Digital Wallet",
    type: "wallet",
    icon: "/brand/zayos-mark-light.png",
    options: [
      {
        id: "kbz-pay",
        name: "KPay",
        icon: "/brand/kpay.png",
        accountName: "Kyaw Lin Myint",
        phoneNumber: "09888888888",
      },
      {
        id: "aya-pay",
        name: "AYAPay",
        icon: "/brand/AYA.png",
        accountName: "Kyaw Lin Myint",
        phoneNumber: "09888888888",
      },
    ],
  },
]

export const businessTypes = [
  { value: "online-shop", label: "Online Shop" },
  { value: "local-brand", label: "Local Brand" },
  { value: "service-business", label: "Service Business" },
  { value: "restaurant", label: "Restaurant" },
  { value: "retail", label: "Retail" },
  { value: "other", label: "Other" },
]

export const teamSizes = [
  { value: "1-3", label: "1-3 people" },
  { value: "4-10", label: "4-10 people" },
  { value: "11-25", label: "11-25 people" },
  { value: "26-50", label: "26-50 people" },
  { value: "50+", label: "50+ people" },
]

export function generatePaymentReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `P-${timestamp}-${random}`
}

export function formatBillingPeriod(startDate: Date, endDate: Date): string {
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }
  const start = startDate.toLocaleDateString("en-US", options)
  const end = endDate.toLocaleDateString("en-US", options)
  return `${start} - ${end}`
}

export function getNextMonthRange(): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  return { start, end }
}
