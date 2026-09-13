import { NextResponse } from "next/server"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const OTP_FILE = path.join(DATA_DIR, "mock-otp.json")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
async function readOtps(): Promise<any[]> {
  try {
    if (!existsSync(OTP_FILE)) return []
    const data = await readFile(OTP_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeOtps(otps: any[]) {
  await ensureDataDir()
  await writeFile(OTP_FILE, JSON.stringify(otps, null, 2))
}

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, purpose, paymentId } = body

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const code = generateOtpCode()
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()

    const otps = await readOtps()

    // Expire old unused OTPs for this email+purpose
    const updated = otps.map((o) =>
      o.email === normalizedEmail && o.purpose === (purpose || "otp_login") && !o.usedAt
        ? { ...o, usedAt: new Date().toISOString() }
        : o
    )

    // Add new OTP
    updated.push({
      id: `otp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      email: normalizedEmail,
      code,
      purpose: purpose || "otp_login",
      paymentId: paymentId || null,
      expiresAt,
      usedAt: null,
      attemptCount: 0,
      createdAt: new Date().toISOString(),
    })

    await writeOtps(updated)

    console.log(`[MockOTP] Generated OTP for ${normalizedEmail}: ${code}`)

    return NextResponse.json(
      { success: true, message: "OTP sent to your email." },
      { headers: CORS_HEADERS }
    )
  } catch (error) {
    console.error("[MockOTP] Generate error:", error)
    return NextResponse.json(
      { error: "Failed to generate OTP" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
