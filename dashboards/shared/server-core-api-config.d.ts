export class ServerConfigurationError extends Error {
  constructor(message: string, envVarName: string)
  envVarName: string
}

export function normalizeCoreApiBaseUrl(rawValue: string, envVarName?: string): string
export function resolveCoreApiBaseUrl(env?: NodeJS.ProcessEnv, envVarName?: string): string
export function isServerConfigurationError(error: unknown): error is ServerConfigurationError
