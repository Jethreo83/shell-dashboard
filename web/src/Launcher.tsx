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

// Where each dashboard actually lives — filled in as they deploy.
// Deliberately NOT derived from `doors` (which only tells us
// entitlement, not URL) and deliberately incomplete until hermes
// confirms deploy URLs for each dashboard.
const DASHBOARD_URLS: Record<string, string | undefined> = {
  vls: undefined,
  collision: undefined,
  elektrica: undefined,
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
      <header>
        <span>{session.google_email}</span>
        <button onClick={logout}>Log out</button>
      </header>
      {error && <p role="alert">{error}</p>}
      {doors === null && !error && <p>Loading your dashboards…</p>}
      {doors !== null && doors.length === 0 && (
        <p>No dashboards are provisioned for this account yet.</p>
      )}
      <div>
        {doors?.map((d) => {
          const url = DASHBOARD_URLS[d.business];
          return (
            <div key={d.business}>
              <h3>{d.label}</h3>
              <p>Role: {d.role}</p>
              {url ? (
                <a href={url}>Open</a>
              ) : (
                <span>(deploy URL not configured yet)</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
