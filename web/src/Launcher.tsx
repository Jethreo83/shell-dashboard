// Launcher.tsx — the actual security boundary's visible surface: one
// door per active grant, nothing more. Per ADR-001 Decision 1: this
// is UI convenience, not the enforcement itself — each dashboard's
// own backend re-verifies the grant server-side (hermes's answer to
// ADR-001 Open Question 4: real routing-level enforcement, not
// UI-only). This component simply must never render a door for a
// business absent from `doors`.
import { useEffect, useState } from 'react';
import { useAuth } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

interface Door {
  business: string;
  label: string;
  role: string;
}

// Where each dashboard actually lives. Local dev URLs, pinned ports
// per hermes's port-collision fix (2026-09-05): vls=5180, elektrica=5181,
// collision=5182, shell(this app)=5173. Update to real production
// deploy URLs once any dashboard is actually deployed somewhere public.
const DASHBOARD_URLS: Record<string, string | undefined> = {
  vls: 'http://localhost:5180',
  collision: 'http://localhost:5182',
  elektrica: 'http://localhost:5181',
};

export function Launcher() {
  const { token, session, logout } = useAuth();
  const [doors, setDoors] = useState<Door[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? `failed (${res.status})`);
        }
        const body = await res.json();
        setDoors(body.doors);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load entitlements');
      }
    })();
  }, [token]);

  if (!session) return null;

  return (
    <div>
      <header className="shell-header">
        <div>
          <strong>Jocasta</strong>
          <span className="email">{session.google_email}</span>
        </div>
        <button className="shell-signout" onClick={logout}>Sign out</button>
      </header>

      {error && <p role="alert" style={{ color: 'var(--shell-danger)', textAlign: 'center', marginTop: 24 }}>{error}</p>}
      {doors === null && !error && <p className="shell-loading">Loading your dashboards…</p>}
      {doors !== null && doors.length === 0 && (
        <p className="shell-empty">No dashboards are provisioned for this account yet. Contact an admin.</p>
      )}

      <div className="shell-doors">
        {doors?.map((d) => {
          const url = DASHBOARD_URLS[d.business];
          return (
            <div key={d.business} className="shell-door">
              <h3>{d.label}</h3>
              <p className="role">Role: {d.role}</p>
              {url ? (
                <a className="open-btn" href={url}>Open →</a>
              ) : (
                <span className="unavailable">Not deployed yet</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
