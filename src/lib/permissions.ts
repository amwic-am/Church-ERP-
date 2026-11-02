// The permission model the interface enforces, kept in one file so no screen
// invents its own rule.
//
// Keys are the closed list the database was seeded with (`<module>.<action>`),
// generated from the migrations by scripts/gen-types.mjs. This file only reads
// that list; the real answer to "may this person do it" is always the SECURITY
// DEFINER `has_permission()` in Postgres, because a browser-side check is a
// courtesy, not a boundary.

// Relative `.ts` imports so scripts/verify-lib.mjs can exercise this module in node.
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_LABELS,
  ROLE_KEYS,
  SEED_ROLE_PERMISSIONS,
  type PermissionKey,
  type RoleKey,
} from '../types/permissions.ts';

export { ALL_PERMISSION_KEYS, PERMISSION_LABELS, ROLE_KEYS, SEED_ROLE_PERMISSIONS };
export type { PermissionKey, RoleKey };

export type Grant = { permission: PermissionKey; scope: Record<string, unknown> };

/** The module half of `module.action`, which drives sidebar grouping. */
export function moduleOf(key: PermissionKey): string {
  return key.split('.')[0];
}

export function actionOf(key: PermissionKey): string {
  const [, ...rest] = key.split('.');
  return rest.join('.');
}

export function labelOf(key: PermissionKey): string {
  return PERMISSION_LABELS[key];
}

export function permissionsByModule(): Map<string, PermissionKey[]> {
  const grouped = new Map<string, PermissionKey[]>();
  for (const key of ALL_PERMISSION_KEYS) {
    const module = moduleOf(key);
    if (!grouped.has(module)) grouped.set(module, []);
    grouped.get(module)!.push(key);
  }
  return grouped;
}

/** True when any of the listed keys is held — how a screen with two owners opens. */
export function holdsAny(granted: readonly PermissionKey[], keys: readonly PermissionKey[]): boolean {
  return keys.some((k) => granted.includes(k));
}

/** The four portals of the specification; staff roles use the ERP modules instead. */
export const PORTAL_ROLES: readonly RoleKey[] = ['student', 'parent', 'teacher', 'department_head'];

export function isPortalRole(role: RoleKey): boolean {
  return PORTAL_ROLES.includes(role);
}

/** Where a signed-in person lands. */
export function homeFor(roles: readonly RoleKey[], granted: readonly PermissionKey[]): string {
  if (roles.includes('super_admin') || granted.includes('system.read')) return '/erp/dashboard';
  if (roles.includes('student')) return '/erp/portal/student';
  if (roles.includes('parent')) return '/erp/portal/parent';
  if (roles.includes('teacher')) return '/erp/portal/teacher';
  if (roles.includes('department_head')) return '/erp/portal/department';
  if (granted.includes('reports.read') || granted.includes('finance.read')) return '/erp/dashboard';
  if (granted.includes('website.read')) return '/erp/website/homepage';
  return '/erp/dashboard';
}

export const ACTION_LABELS: Record<string, string> = {
  read: 'ማየት',
  write: 'ማስተዳደር',
  publish: 'ማሳወቅ',
  approve: 'ማጽደቅ',
  export: 'መላኪያ',
  mark: 'መመዝገብ',
  delete: 'ማጥፋት',
  promote: 'ማሻገር',
  release: 'መፍታት',
};

/** Which roles the migrations give a permission to — shown in the roles editor. */
export function rolesWith(key: PermissionKey): RoleKey[] {
  return ROLE_KEYS.filter((role) => SEED_ROLE_PERMISSIONS[role]?.includes(key));
}
