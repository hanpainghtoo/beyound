export const MINIMUM_PASSWORD_LENGTH = 12
export const PASSWORD_POLICY_HINT = "Use at least 12 characters with uppercase, lowercase, number, and special character."
export const COMMON_PASSWORD_MESSAGE = "Password is too common. Choose a less predictable password."

const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/
const commonPasswords = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "qwerty",
  "qwerty123",
  "admin",
  "admin123",
  "letmein",
  "letmein123",
  "welcome",
  "welcome123",
  "changeme",
  "defaultpassword",
])

function isCommonPassword(password: string) {
  return commonPasswords.has(password.toLowerCase().replace(/[^a-z0-9]/g, ""))
}

export function getPasswordPolicyError(password: string) {
  const normalized = password.trim()
  if (!normalized) return "Password is required."
  if (normalized.length < MINIMUM_PASSWORD_LENGTH || !passwordPolicyRegex.test(normalized)) {
    return PASSWORD_POLICY_HINT
  }
  if (isCommonPassword(normalized)) return COMMON_PASSWORD_MESSAGE
  return ""
}
