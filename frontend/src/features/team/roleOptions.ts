import type { BusinessContext, Role } from '@/types/api'

/**
 * Roles the current user may hand out: mirrors the backend rule (you can only grant permissions
 * you hold; only owners grant the owner role). The backend re-checks every assignment.
 */
export function assignableRoles(roles: Role[] | undefined, context: BusinessContext | undefined): Role[] {
  if (!roles || !context) return []
  const mine = new Set(context.permissions)
  return roles.filter((role) => {
    if (role.key === 'owner') return context.is_owner
    return role.permissions.every((p) => mine.has(p))
  })
}
