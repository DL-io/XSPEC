import type { Role } from '@polyshore/core';

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: ['*'],
  trader: ['read', 'trade:paper', 'trade:live:request'],
  risk: ['read', 'risk:manage', 'killswitch:manage'],
  compliance: ['read', 'audit:export'],
  viewer: ['read'],
  api_only: ['api:read']
};

export function can(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes('*') || ROLE_PERMISSIONS[role].includes(permission);
}

export function requirePermission(role: Role, permission: string): void {
  if (!can(role, permission)) throw new Error(`Role ${role} lacks permission ${permission}`);
}

export function roleFromHeader(value: string | null): Role {
  const role = value as Role | null;
  if (role && ROLE_PERMISSIONS[role]) return role;
  return 'viewer';
}
