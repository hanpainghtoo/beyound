export const workspaceRoles = ["owner", "admin", "supervisor", "csr", "finance", "delivery"] as const

export type WorkspaceRole = (typeof workspaceRoles)[number]

export const workspaceManagementRoles = ["owner", "admin", "supervisor"] as const satisfies readonly WorkspaceRole[]
export const workspacePaymentRoles = ["owner", "admin", "supervisor", "finance"] as const satisfies readonly WorkspaceRole[]
export const workspaceDeliveryRoles = ["owner", "admin", "supervisor", "delivery"] as const satisfies readonly WorkspaceRole[]

export function roleLabel(role?: string) {
  if (role === "owner") return "Owner"
  if (role === "admin") return "Admin"
  if (role === "supervisor") return "Manager"
  if (role === "finance") return "Finance"
  if (role === "delivery") return "Delivery"
  return "CSR"
}

export function defaultWorkspaceRouteForRole(role?: string) {
  if (role === "finance") return "/workspace/billing"
  if (role === "delivery") return "/workspace/deliveries"
  return "/workspace"
}
