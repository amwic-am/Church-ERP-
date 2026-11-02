// Sign-in, sign-out and the identity the interface is drawn from.
//
// Supabase Auth hands us the JWT; the database decides what it means. Roles and
// permission keys come from `role_keys()` and `my_permissions()`, so the menus a
// person sees are the grants Postgres actually holds — and every request they
// make is still checked by row-level security, which does not care what the
// browser believes.

import type { User } from '@supabase/supabase-js';

import { ALL_PERMISSION_KEYS, ROLE_KEYS, type PermissionKey, type RoleKey } from './permissions.ts';
import { friendlyError } from './errors.ts';
import { callFn, supabase } from './supabase.ts';

export type Identity = {
  userId: string;
  email: string | null;
  nameAm: string;
  roles: RoleKey[];
  permissions: PermissionKey[];
  avatarPath: string | null;
};

/** Both RPCs are SECURITY DEFINER and default to `auth.uid()`. */
export async function loadIdentity(user: User): Promise<Identity> {
  const [roleKeys, permissionKeys] = await Promise.all([
    callFn('role_keys', {}),
    callFn('my_permissions', {}),
  ]);

  const { data, error } = await supabase.from('profiles').select('full_name_am, avatar_path').eq('id', user.id).maybeSingle();
  if (error) console.error('[auth] profile read failed', error.code, error.message);

  return {
    userId: user.id,
    email: user.email ?? null,
    nameAm: data?.full_name_am ?? user.email?.split('@')[0] ?? 'ተረጋጋጽ',
    // Anything the migrations do not know about is dropped rather than trusted.
    roles: roleKeys.filter((r): r is RoleKey => (ROLE_KEYS as readonly string[]).includes(r)),
    permissions: permissionKeys.filter((p): p is PermissionKey => (ALL_PERMISSION_KEYS as readonly string[]).includes(p)),
    avatarPath: data?.avatar_path ?? null,
  };
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  return { error: error ? friendlyError(error) : null };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[auth] sign-out failed', error.message);
}

/** Sends Supabase's reset link; the message is deliberately the same either way. */
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${globalThis.location.origin}/erp/reset-password`,
  });
  return { error: error ? friendlyError(error) : null };
}

export async function updatePassword(password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error ? friendlyError(error) : null };
}

export function holds(permissions: readonly PermissionKey[], key: PermissionKey): boolean {
  return permissions.includes(key);
}

/** Sessions that expired while the tab stayed open are refreshed, not fatal. */
export function onSessionChange(handler: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}
