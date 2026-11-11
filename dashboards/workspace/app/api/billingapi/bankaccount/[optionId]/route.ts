import { NextResponse } from "next/server"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const PAYMENTS_FILE = path.join(DATA_DIR, "mock-payments.json")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readPayments(): Promise<any[]> {
  try {
    if (!existsSync(PAYMENTS_FILE)) return []
    return JSON.parse(await readFile(PAYMENTS_FILE, "utf-8"))
  } catch {
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writePayments(payments: any[]) {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
  await writeFile(PAYMENTS_FILE, JSON.stringify(payments, null, 2))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ optionId: string }> }
) {
  try {
    const { optionId } = await params
    const body = await request.json()
    const { paymentId } = body

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId is required" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const payments = await readPayments()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const index = payments.findIndex((p: any) => p.paymentId === paymentId)
    if (index === -1) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    const isWallet = optionId.startsWith("kpay") || optionId.startsWith("aya-pay")
    payments[index].payment = {
      ...payments[index].payment,
      selectedOptionId: optionId,
      selectedMethodType: isWallet ? "wallet" : "bank",
    }
    await writePayments(payments)

    return NextResponse.json({
      success: true,
      paymentId,
      optionId,
      methodType: isWallet ? "wallet" : "bank",
      message: `Payment method ${optionId} selected successfully`,
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[BillingAPI] Error:", error)
    return NextResponse.json(
      { error: "Failed to select payment method" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
