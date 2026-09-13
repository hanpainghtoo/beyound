import { NextResponse } from "next/server"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const PAYMENTS_FILE = path.join(DATA_DIR, "mock-payments.json")
const MERCHANTS_FILE = path.join(DATA_DIR, "mock-merchants.json")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function generatePaymentId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PAY-${timestamp}-${random}`
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readPayments(): Promise<any[]> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writePayments(payments: any[]) {
  await ensureDataDir()
  await writeFile(PAYMENTS_FILE, JSON.stringify(payments, null, 2))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readMerchants(): Promise<any[]> {
  try {
    if (!existsSync(MERCHANTS_FILE)) return []
    const data = await readFile(MERCHANTS_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeMerchants(merchants: any[]) {
  await ensureDataDir()
  await writeFile(MERCHANTS_FILE, JSON.stringify(merchants, null, 2))
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { paymentId, company, users, payment, receipt } = body

    if (paymentId) {
      const payments = await readPayments()
      const index = payments.findIndex((p) => p.paymentId === paymentId)
      if (index === -1) {
        return NextResponse.json(
          { error: "Payment not found" },
          { status: 404, headers: CORS_HEADERS }
        )
      }
      if (company) payments[index].company = company
      if (users) payments[index].users = users
      if (payment) payments[index].payment = { ...payments[index].payment, ...payment }
      if (receipt) payments[index].receipt = receipt
      await writePayments(payments)
      return NextResponse.json({
        success: true,
        paymentId,
        message: "Payment updated successfully",
      }, { headers: CORS_HEADERS })
    }

    if (!company?.companyName || !company?.companyEmail || !payment?.planId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const newPaymentId = generatePaymentId()
    const submission = {
      paymentId: newPaymentId,
      company: {
        companyName: company.companyName,
        companyEmail: company.companyEmail,
        businessType: company.businessType || "",
        teamSize: company.teamSize || "",
      },
      users: users || {},
      payment: {
        planId: payment.planId,
        planName: payment.planName || "",
        selectedOptionId: payment.selectedOptionId || "",
        note: payment.note || "",
      },
      receipt: receipt || { fileName: "", fileData: "" },
      status: "pending_review",
      createdAt: new Date().toISOString(),
    }

    const payments = await readPayments()
    payments.push(submission)
    await writePayments(payments)

    // Create merchant entry from self-registration
    const ownerEmail = users?.owner?.email || company.companyEmail
    const merchant = {
      id: `mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      tenantCode: `TENANT-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`,
      companyName: company.companyName,
      businessType: company.businessType || null,
      contactPerson: users?.owner?.fullName || "",
      contactEmail: ownerEmail,
      contactPhone: users?.owner?.phoneNumber || null,
      status: "active",
      subscriptionPlanId: payment.planId || null,
      subscriptionStartDate: new Date().toISOString(),
      subscriptionEndDate: null,
      customCsrLimit: null,
      customChannelLimit: null,
      customMessageLimit: null,
      customApiLimit: null,
      timezone: "Asia/Yangon",
      language: "en",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: null,
      statusReason: null,
      _selfRegistered: true,
      _paymentId: newPaymentId,
    }

    const merchants = await readMerchants()
    merchants.push(merchant)
    await writeMerchants(merchants)

    console.log(`[MockPayment] New payment submitted: ${newPaymentId}, merchant created: ${merchant.id}`)

    return NextResponse.json({
      success: true,
      paymentId: newPaymentId,
      merchantId: merchant.id,
      message: "Payment created successfully",
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[MockPayment] Error:", error)
    return NextResponse.json(
      { error: "Failed to submit payment" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { paymentId, status, linkedTenantId, linkedBillingRecordId } = body

    if (!paymentId || !status) {
      return NextResponse.json(
        { error: "paymentId and status are required" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const payments = await readPayments()
    const index = payments.findIndex((p) => p.paymentId === paymentId)

    if (index === -1) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    payments[index] = {
      ...payments[index],
      status,
      linkedTenantId: linkedTenantId || payments[index].linkedTenantId,
      linkedBillingRecordId: linkedBillingRecordId || payments[index].linkedBillingRecordId,
      linkedAt: status === "linked" ? new Date().toISOString() : payments[index].linkedAt,
    }

    await writePayments(payments)

    return NextResponse.json({
      success: true,
      message: `Payment ${paymentId} marked as ${status}`,
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[MockPayment] PATCH Error:", error)
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get("paymentId")

    if (paymentId) {
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
        payment,
      }, { headers: CORS_HEADERS })
    }

    const payments = await readPayments()
    const summary = payments.map((p) => ({
      paymentId: p.paymentId,
      companyName: p.company?.companyName,
      companyEmail: p.company?.companyEmail,
      businessType: p.company?.businessType,
      ownerName: p.users?.owner?.fullName,
      ownerEmail: p.users?.owner?.email,
      adminName: p.users?.admin?.fullName,
      adminEmail: p.users?.admin?.email,
      planName: p.payment?.planName,
      planId: p.payment?.planId,
      selectedOptionId: p.payment?.selectedOptionId,
      note: p.payment?.note,
      receiptFileName: p.receipt?.fileName,
      status: p.status,
      linkedTenantId: p.linkedTenantId,
      linkedBillingRecordId: p.linkedBillingRecordId,
      linkedAt: p.linkedAt,
      createdAt: p.createdAt,
    }))

    return NextResponse.json({
      success: true,
      count: summary.length,
      payments: summary,
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[MockPayment] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch payments" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
