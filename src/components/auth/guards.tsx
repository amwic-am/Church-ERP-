// The gate in front of every `/erp` screen.
//
// Two questions, answered here once: is there a session, and does that session
// hold one of the permissions this screen names. The redirect keeps the page the
// person was aiming at, and a "no" is a readable page rather than a blank one.
// This is presentation only — row level security remains the real boundary.
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './AuthProvider';
import { Spinner } from '@/components/ui/surface';
import { ACCESS_DENIED_PATH, LOGIN_PATH } from '@/lib/routes';
import { holdsAny, type PermissionKey, type RoleKey } from '@/lib/permissions';
import { UI } from '@/lib/i18n';

function FullPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">{children}</div>;
}

export function RequireAuth() {
  const { status, identity, notice, refresh } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <FullPage>
        <Spinner label="በመግቢያ ማረጋገጫ ላይ…" />
      </FullPage>
    );
  }

  if (status === 'failed') {
    return (
      <FullPage>
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-5 text-center">
          <p className="text-sm">{notice ?? UI.serverError}</p>
          <button type="button" onClick={() => void refresh()} className="mt-4 rounded-md border border-current px-3 py-1.5 text-sm font-medium">
            {UI.tryAgain}
          </button>
        </div>
      </FullPage>
    );
  }

  if (!identity) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${LOGIN_PATH}?from=${from}`} replace />;
  }

  return <Outlet />;
}

/** A signed-in person has no business on the sign-in form. */
export function RedirectIfSignedIn() {
  const { status, home } = useAuth();
  if (status === 'ready') return <Navigate to={home} replace />;
  if (status === 'loading') return <FullPage><Spinner /></FullPage>;
  return <Outlet />;
}

export function RequirePermission({ oneOf }: { oneOf: PermissionKey[] }) {
  const { can } = useAuth();
  if (oneOf.length > 0 && !can(...oneOf)) return <Navigate to={ACCESS_DENIED_PATH} replace />;
  return <Outlet />;
}

/** Portal doors are opened by role, not by a staff grant. */
export function RequireRole({ role }: { role: RoleKey }) {
  const { identity } = useAuth();
  if (!identity) return <Navigate to={LOGIN_PATH} replace />;
  if (!identity.roles.includes(role) && !identity.roles.includes('super_admin')) {
    return <Navigate to={ACCESS_DENIED_PATH} replace />;
  }
  return <Outlet />;
}

/** A button that must not even appear when the grant is missing. */
export function WhenAllowed({ oneOf, children }: { oneOf: PermissionKey[]; children: ReactNode }) {
  const { identity } = useAuth();
  if (!identity || !holdsAny(identity.permissions, oneOf)) return null;
  return <>{children}</>;
}
