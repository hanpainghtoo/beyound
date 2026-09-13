import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const PAYMENTS_FILE = path.join(DATA_DIR, "mock-payments.json")

type PaymentSubmission = {
  paymentId: string
  account: {
    fullName: string
    companyName: string
    email: string
    phoneNumber: string
    businessType: string
    teamSize: string
    salesChannels: string
    dailyOrderRange: string
    selectedPackage: string
    interestedIn: string
    message: string
  }
  payment: {
    planId: string
    planName: string
    paymentMethod: string
    note: string
  }
  receipt: {
    fileName: string
    fileData: string
  }
  status: "pending_review" | "linked" | "rejected"
  linkedTenantId?: string
  linkedBillingRecordId?: string
  linkedAt?: string
  createdAt: string
}

async function readPayments(): Promise<PaymentSubmission[]> {
  try {
    if (!existsSync(PAYMENTS_FILE)) {
      return []
    }
    const data = await readFile(PAYMENTS_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function writePayments(payments: PaymentSubmission[]) {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
  await writeFile(PAYMENTS_FILE, JSON.stringify(payments, null, 2))
}

export async function findPendingPaymentByEmail(email: string): Promise<PaymentSubmission | null> {
  const payments = await readPayments()
  return payments.find(
    (p) => p.account.email.toLowerCase() === email.toLowerCase() && p.status === "pending_review"
  ) || null
}

export async function markPaymentAsLinked(
  paymentId: string,
  tenantId: string,
  billingRecordId?: string
): Promise<boolean> {
  const payments = await readPayments()
  const index = payments.findIndex((p) => p.paymentId === paymentId)

  if (index === -1) {
    return false
  }

  payments[index] = {
    ...payments[index],
    status: "linked",
    linkedTenantId: tenantId,
    linkedBillingRecordId: billingRecordId,
    linkedAt: new Date().toISOString(),
  }

  await writePayments(payments)
  return true
}

export function getPaymentMethodForBackend(frontendMethod: string): string {
  const methodMap: Record<string, string> = {
    "kbz-pay": "kbzpay",
    "kbz-bank": "bank_transfer",
    "aya-bank": "bank_transfer",
  }
  return methodMap[frontendMethod] || "bank_transfer"
}

export function getPlanIdForBackend(planName: string): string | null {
  const planMap: Record<string, string> = {
    "Business Launch": "e167c371-e2e1-499e-9de9-99f2d946922f",
    "Business Growth": "2ab31ae2-95f9-4883-8ed8-a6d55b9469e8",
    "Enterprise": "f8c7d6e5-a4b3-42c1-9d0e-8f7a6b5c4d3e",
  }
  return planMap[planName] || null
}
