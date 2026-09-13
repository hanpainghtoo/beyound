import { NextResponse } from "next/server"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const MERCHANTS_FILE = path.join(DATA_DIR, "mock-merchants.json")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export async function GET() {
  try {
    const merchants = await readMerchants()
    return NextResponse.json({
      success: true,
      data: merchants,
      total: merchants.length,
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[MockMerchants] GET Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch merchants" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { merchantId, status, ...updates } = body

    if (!merchantId) {
      return NextResponse.json(
        { error: "merchantId is required" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const merchants = await readMerchants()
    const index = merchants.findIndex((m) => m.id === merchantId)

    if (index === -1) {
      return NextResponse.json(
        { error: "Merchant not found" },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    merchants[index] = {
      ...merchants[index],
      ...(status && { status }),
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    await writeMerchants(merchants)

    return NextResponse.json({
      success: true,
      merchant: merchants[index],
    }, { headers: CORS_HEADERS })
  } catch (error) {
    console.error("[MockMerchants] PATCH Error:", error)
    return NextResponse.json(
      { error: "Failed to update merchant" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
