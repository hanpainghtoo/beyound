import { NextResponse } from "next/server"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const PAYMENTS_FILE = path.join(DATA_DIR, "mock-payments.json")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
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
  await ensureDataDir()
  await writeFile(PAYMENTS_FILE, JSON.stringify(payments, null, 2))
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { paymentId, selectedOptionId, accountNumber, accountName, phoneNumber } = body

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400, headers: CORS_HEADERS })
    }

    const payments = await readPayments()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const index = payments.findIndex((p: any) => p.paymentId === paymentId)
    if (index === -1) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404, headers: CORS_HEADERS })
    }

    payments[index].payment = {
      ...payments[index].payment,
      selectedOptionId,
      selectedMethodType: "bank",
      bankAccount: { accountNumber, accountName, phoneNumber },
    }
    await writePayments(payments)

    return NextResponse.json({
      success: true,
      paymentId,
      message: "Bank account selected successfully",
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[MockPayment Bank] Error:", error)
    return NextResponse.json({ error: "Failed to select bank account" }, { status: 500, headers: CORS_HEADERS })
  }
}
