// The signed-in person, in one context.
//
// Mounts once at the top of the app, subscribes to Supabase's auth changes, and
// re-reads the role and permission RPCs whenever the session changes. Screens
// ask `can('news.publish')`; they never read a role name and guess.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { loadIdentity, onSessionChange, signOut as endSession, type Identity } from '@/lib/auth';
import { homeFor, holdsAny, type PermissionKey } from '@/lib/permissions';
import { LOGIN_PATH } from '@/lib/routes';
import { isSupabaseConfigured, missingConfigHint } from '@/lib/env';
import { currentUser } from '@/lib/supabase';

type AuthStatus = 'loading' | 'signed-out' | 'ready' | 'failed';

type AuthValue = {
  status: AuthStatus;
  identity: Identity | null;
  /** Why a signed-out app could not start — shown instead of an empty shell. */
  notice: string | null;
  can: (...keys: PermissionKey[]) => boolean;
  home: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [notice, setNotice] = useState<string | null>(isSupabaseConfigured ? null : missingConfigHint);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setStatus('signed-out');
      return;
    }
    try {
      const user = await currentUser();
      if (!user) {
        setIdentity(null);
        setStatus('signed-out');
        return;
      }
      setIdentity(await loadIdentity(user));
      setStatus('ready');
    } catch (error) {
      console.error('[auth] identity could not be loaded', error);
      setNotice('በመግቢያ ማረጋገጫ ላይ ችግር ተፈጥሯል።እንደገና ይሞክሩ።');
      setStatus('failed');
    }
  }, []);

  useEffect(() => {
    void load();
    return onSessionChange(() => void load());
  }, [load]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      identity,
      notice,
      can: (...keys) => Boolean(identity && holdsAny(identity.permissions, keys)),
      home: identity ? homeFor(identity.roles, identity.permissions) : LOGIN_PATH,
      refresh: load,
      signOut: async () => {
        await endSession();
        setIdentity(null);
        setStatus('signed-out');
      },
    }),
    [status, identity, notice, load]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ያለ መሆኑ አስፈላጊ ነው');
  return value;
}

export { useAuth as useIdentity };
