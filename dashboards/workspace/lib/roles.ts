export const workspaceRoles = ["owner", "admin", "supervisor", "agent", "finance", "delivery"] as const

export type WorkspaceRole = (typeof workspaceRoles)[number]

export const workspaceManagementRoles = ["owner", "admin", "supervisor"] as const satisfies readonly WorkspaceRole[]
export const workspacePaymentRoles = ["owner", "admin", "supervisor", "agent", "finance"] as const satisfies readonly WorkspaceRole[]
export const workspaceDeliveryRoles = ["owner", "admin", "supervisor", "agent"] as const satisfies readonly WorkspaceRole[]

export function roleLabel(role?: string) {
  if (role === "owner") return "Owner"
  if (role === "admin") return "Admin"
  if (role === "supervisor") return "Manager"
  if (role === "finance") return "Finance"
  if (role === "delivery") return "Delivery"
  return "Agent"
}

export function defaultWorkspaceRouteForRole(role?: string) {
  if (role === "finance") return "/workspace/billing"
  if (role === "delivery") return "/workspace/deliveries"
  return "/workspace"
}
