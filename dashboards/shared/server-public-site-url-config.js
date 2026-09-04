class ServerPublicSiteUrlConfigurationError extends Error {
  constructor(message, envVarName) {
    super(message)
    this.name = "ServerPublicSiteUrlConfigurationError"
    this.envVarName = envVarName
  }
}

const placeholderUrlValues = new Set([
  "http://example.com",
  "https://example.com",
  "http://example.invalid",
  "https://example.invalid",
])

function normalizePublicSiteUrl(rawValue, options = {}) {
  const envVarName = options.envVarName || "NEXT_PUBLIC_SITE_URL"
  const trimmed = rawValue.trim()

  if (!trimmed) {
    throw new ServerPublicSiteUrlConfigurationError(`Missing required environment variable: ${envVarName}`, envVarName)
  }

  if (placeholderUrlValues.has(trimmed.toLowerCase())) {
    throw new ServerPublicSiteUrlConfigurationError(`Invalid ${envVarName}.`, envVarName)
  }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ServerPublicSiteUrlConfigurationError(`Invalid ${envVarName}.`, envVarName)
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ServerPublicSiteUrlConfigurationError(`Invalid ${envVarName}.`, envVarName)
  }

  parsed.search = ""
  parsed.hash = ""
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/"

  return parsed.toString().replace(/\/$/, "")
}

function resolvePublicSiteUrl(env = process.env, options = {}) {
  const envVarName = options.envVarName || "NEXT_PUBLIC_SITE_URL"
  const nodeEnv = env.NODE_ENV || "development"
  const configuredValue = env[envVarName]

  if (!configuredValue || !configuredValue.trim()) {
    if (nodeEnv === "production" || options.requireInDevelopment === true) {
      throw new ServerPublicSiteUrlConfigurationError(`Missing required environment variable: ${envVarName}`, envVarName)
    }
    return null
  }

  return normalizePublicSiteUrl(configuredValue.trim(), {
    envVarName,
  })
}

function isServerPublicSiteUrlConfigurationError(error) {
  return error instanceof ServerPublicSiteUrlConfigurationError
}

module.exports = {
  ServerPublicSiteUrlConfigurationError,
  isServerPublicSiteUrlConfigurationError,
  normalizePublicSiteUrl,
  resolvePublicSiteUrl,
}
