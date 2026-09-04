// server.ts — the shell API. Thin on purpose: auth + launcher
// entitlement only. No dashboard domain content is ever served here
// (per SOUL.md scope — that's each dashboard's own repo/API).
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { handleGoogleLogin, requireShellAuth } from './auth';
import { grantsForEmail, launcherDoors } from './entitlements';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'shell-dashboard-api' }));

app.post('/auth/google', handleGoogleLogin);

/**
 * GET /me — re-renders the launcher's entitlement set. Deliberately
 * re-queries each business's staff_user table fresh on every call
 * (fail-closed re-check, ADR-001 Decision 1) rather than trusting the
 * grants baked into the JWT at login time — so a deactivation or role
 * change is reflected the moment the launcher is next loaded/refreshed,
 * not only after the 8h token expires. Mirrors VLS's own requireAuth
 * pattern of re-reading role/active from the DB on every request.
 */
app.get('/me', requireShellAuth, async (req, res) => {
  const email = req.shell!.google_email;
  try {
    const grants = await grantsForEmail(email); // fresh, not from the JWT payload
    const doors = await launcherDoors(email, grants);
    res.json({ google_email: email, grants, doors });
  } catch (err: any) {
    // A DB error here must not silently authenticate someone, and
    // must not crash the process either — fail closed with a 503,
    // same principle VLS's own requireAuth documents for itself.
    res.status(503).json({ error: 'entitlement_check_failed', message: err.message });
  }
});

const PORT = Number(process.env.PORT ?? 4100);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`shell-dashboard-api listening on :${PORT}`);
});
