export class ServerPublicSiteUrlConfigurationError extends Error {
  constructor(message: string, envVarName?: string)
  envVarName?: string
}

export function normalizePublicSiteUrl(
  rawValue: string,
  options?: {
    envVarName?: string
  },
): string

export function resolvePublicSiteUrl(
  env?: NodeJS.ProcessEnv,
  options?: {
    envVarName?: string
    requireInDevelopment?: boolean
  },
): string | null

export function isServerPublicSiteUrlConfigurationError(
  error: unknown,
): error is ServerPublicSiteUrlConfigurationError
