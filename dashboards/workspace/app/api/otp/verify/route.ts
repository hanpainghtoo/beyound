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

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, code } = body

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and code are required" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const otps = await readOtps()

    // Find latest unused OTP for this email
    const activeOtp = otps
      .filter(
        (o) =>
          o.email === normalizedEmail &&
          !o.usedAt
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

    if (!activeOtp) {
      return NextResponse.json(
        { error: "No active verification code found." },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (new Date(activeOtp.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Code has expired." },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (activeOtp.attemptCount >= 5) {
      return NextResponse.json(
        { error: "Too many attempts. Please request a new code." },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (activeOtp.code !== code) {
      // Increment attempt count
      const updated = otps.map((o) =>
        o.id === activeOtp.id ? { ...o, attemptCount: o.attemptCount + 1 } : o
      )
      await writeOtps(updated)
      return NextResponse.json(
        { error: "Invalid code." },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    // Mark as used
    const updated = otps.map((o) =>
      o.id === activeOtp.id ? { ...o, usedAt: new Date().toISOString() } : o
    )
    await writeOtps(updated)

    // Return mock session (same shape as real AuthSession)
    const mockSession = {
      accessToken: `mock_access_${Date.now()}`,
      refreshToken: `mock_refresh_${Date.now()}`,
      user: {
        id: `user_${Date.now()}`,
        email: normalizedEmail,
        fullName: "Self-Registered User",
        role: "owner",
        type: "tenant_user" as const,
        tenantId: activeOtp.paymentId || `tenant_${Date.now()}`,
      },
    }

    console.log(`[MockOTP] Verified OTP for ${normalizedEmail}`)

    return NextResponse.json(
      { success: true, ...mockSession },
      { headers: CORS_HEADERS }
    )
  } catch (error) {
    console.error("[MockOTP] Verify error:", error)
    return NextResponse.json(
      { error: "Failed to verify OTP" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
