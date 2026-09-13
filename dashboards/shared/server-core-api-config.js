class ServerConfigurationError extends Error {
  constructor(message, envVarName) {
    super(message)
    this.name = "ServerConfigurationError"
    this.envVarName = envVarName
  }
}

const placeholderUrlValues = new Set([
  "http://example.com",
  "https://example.com",
  "http://example.invalid",
  "https://example.invalid",
])

function normalizeCoreApiBaseUrl(rawValue, envVarName = "CORE_API_URL") {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    throw new ServerConfigurationError(`Missing required environment variable: ${envVarName}`, envVarName)
  }

  if (placeholderUrlValues.has(trimmed.toLowerCase())) {
    throw new ServerConfigurationError(`Invalid ${envVarName}.`, envVarName)
  }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ServerConfigurationError(`Invalid ${envVarName}.`, envVarName)
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ServerConfigurationError(`Invalid ${envVarName}.`, envVarName)
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/"
  if (!["/", "/api/v1"].includes(normalizedPath)) {
    throw new ServerConfigurationError(`Invalid ${envVarName}.`, envVarName)
  }

  parsed.pathname = normalizedPath === "/" ? "/api/v1" : normalizedPath
  parsed.search = ""
  parsed.hash = ""
  return parsed.toString().replace(/\/$/, "")
}

function resolveCoreApiBaseUrl(env = process.env, envVarName = "CORE_API_URL") {
  const configuredValue = env[envVarName]
  if (!configuredValue || !configuredValue.trim()) {
    throw new ServerConfigurationError(`Missing required environment variable: ${envVarName}`, envVarName)
  }

  return normalizeCoreApiBaseUrl(configuredValue.trim(), envVarName)
}

function isServerConfigurationError(error) {
  return error instanceof ServerConfigurationError
}

module.exports = {
  ServerConfigurationError,
  isServerConfigurationError,
  normalizeCoreApiBaseUrl,
  resolveCoreApiBaseUrl,
}
