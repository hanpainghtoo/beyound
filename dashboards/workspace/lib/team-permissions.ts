import type { WorkspaceRole } from "./roles"

export type TeamPermissionTarget = {
  id: string
  role: WorkspaceRole
}

/** Team management visibility rules shared by list/detail surfaces. */
export function canEditTeamMember(
  viewerRole: string | undefined,
  viewerId: string | undefined,
  target: TeamPermissionTarget,
) {
  if (viewerRole === "owner" || viewerRole === "admin") return true
  if (viewerRole === "supervisor") return target.role !== "owner"
  if (viewerRole === "agent") return viewerId === target.id
  return false
}

export function canDeleteTeamMember(
  viewerRole: string | undefined,
  target: TeamPermissionTarget,
) {
  if (target.role === "owner") return false
  return viewerRole === "owner" || viewerRole === "admin" || viewerRole === "supervisor"
}
