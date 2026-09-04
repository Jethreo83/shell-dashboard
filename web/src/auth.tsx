// auth.tsx — auth context for the shell's own login. Generalized from
// vls-dashboard's web/src/auth.tsx: same JWT-in-localStorage pattern
// (acceptable for a staff-only internal tool, same caveat VLS's
// comment already notes — revisit if this needs to survive an
// XSS-hardening pass later), same Google Identity Services render
// flow. The generalization: `staff: StaffSession` (one role) becomes
// `session: ShellSession` (a `grants` array), because a shell login
// can hold entitlements across more than one business.
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const STORAGE_KEY = 'shell_dashboard_token';

export interface Grant {
  business: string;
  role: string;
}

export interface ShellSession {
  person_id: number | null;
  google_email: string;
  grants: Grant[];
}

interface AuthContextValue {
  token: string | null;
  session: ShellSession | null;
  loading: boolean;
  error: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string): ShellSession | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [session, setSession] = useState<ShellSession | null>(() => {
    const t = localStorage.getItem(STORAGE_KEY);
    return t ? decodeJwtPayload(t) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setSession(null);
  };

  useEffect(() => {
    if (token) {
      // Basic client-side expiry check on load — server still re-verifies
      // on every request regardless (see api/src/auth.ts requireShellAuth
      // and GET /me's fresh DB re-check); this just avoids a flash of
      // stale UI.
      const payload = decodeJwtPayload(token) as (ShellSession & { exp?: number }) | null;
      if (payload?.exp && payload.exp * 1000 < Date.now()) {
        logout();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCredentialResponse = async (response: { credential: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: response.credential }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `login failed (${res.status})`);
      }
      const body = await res.json();
      localStorage.setItem(STORAGE_KEY, body.token);
      setToken(body.token);
      setSession(body.session);
    } catch (e: any) {
      setError(e.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) return; // already logged in, no need to render the button
    const g = (window as any).google;
    if (!g?.accounts?.id) return;
    g.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    const el = document.getElementById('google-signin-button');
    if (el) {
      g.accounts.id.renderButton(el, { theme: 'outline', size: 'large' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, session, loading, error, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
