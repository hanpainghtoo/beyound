import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const PAYMENTS_FILE = path.join(DATA_DIR, "mock-payments.json")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

type UserInfo = {
  fullName: string
  email: string
  phoneNumber: string
}

type PaymentSubmission = {
  paymentId: string
  company: {
    companyName: string
    companyEmail: string
    businessType: string
    teamSize: string
  }
  users: {
    owner: UserInfo
    admin: UserInfo
  }
  payment: {
    planId: string
    planName: string
    selectedOptionId: string
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params
    const payments = await readPayments()
    const payment = payments.find((p) => p.paymentId === paymentId)

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    return NextResponse.json({
      success: true,
      payment: {
        paymentId: payment.paymentId,
        company: payment.company,
        users: payment.users,
        payment: payment.payment,
        receipt: payment.receipt,
        status: payment.status,
        linkedTenantId: payment.linkedTenantId,
        linkedBillingRecordId: payment.linkedBillingRecordId,
        linkedAt: payment.linkedAt,
        createdAt: payment.createdAt,
      },
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[MockPayment] GET Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch payment" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
