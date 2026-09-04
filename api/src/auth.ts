// auth.ts — the shell's Google Sign-In verification + SSO JWT
// issuance, and the verification middleware (exposed here as the
// reference implementation of docs/JWT_CONTRACT.md section 4 — every
// dashboard backend should implement an equivalent, not import this
// file directly, since they are separate deployables/repos).
//
// Pattern generalized from vls-dashboard's api/src/auth.ts:
// Google Identity Services on the frontend -> POST id_token here ->
// verify against Google's public keys -> confirm email_verified ->
// match domain to a confirmed business -> look up an active row in
// THAT business's own staff_user table -> issue a shell-signed JWT
// carrying every grant this email currently holds (not just one
// business, since one person can hold grants across businesses).
//
// Session store: none, stateless JWT, 8h TTL — same tradeoff VLS
// already lives with (see docs/JWT_CONTRACT.md section 2 and
// hermes's 2026-09-04 answer to ADR-001 Open Question 5). No
// blocklist, no refresh rotation.
import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { grantsForEmail, Grant, launcherDoors } from './entitlements';
import { businessForDomain } from './businesses';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const JWT_SECRET_RAW = process.env.JWT_SECRET;
const ISSUER = 'shell-dashboard';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8h — matches VLS's existing SESSION_TTL_SECONDS.

if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_OAUTH_CLIENT_ID is not set.');
if (!JWT_SECRET_RAW) throw new Error('JWT_SECRET is not set.');
const JWT_SECRET: string = JWT_SECRET_RAW;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface ShellSession {
  person_id: number | null; // Deliberately unresolved — see comment at assignment below.
  google_email: string;
  grants: Grant[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      shell?: ShellSession;
    }
  }
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/**
 * POST /auth/google handler. Verifies the Google ID token, resolves
 * the email's domain to a confirmed business (rejects if the domain
 * matches no confirmed business at all — see businesses.ts), then
 * looks up every grant this email holds across ALL businesses (not
 * just the one whose domain matched — a person's Google account
 * belongs to one domain, but that domain confirms WHICH businesses
 * they're even allowed to attempt sign-in for; their actual grants
 * still come from each business's own staff_user table).
 */
export async function handleGoogleLogin(req: Request, res: Response) {
  const { id_token } = req.body ?? {};
  if (typeof id_token !== 'string' || !id_token) {
    return res.status(400).json({ error: 'missing_id_token' });
  }

  let email: string | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    email = payload?.email;
    if (!payload?.email_verified) {
      return res.status(401).json({ error: 'email_not_verified' });
    }
  } catch (err: any) {
    return res.status(401).json({ error: 'invalid_google_token', message: err.message });
  }

  if (!email) {
    return res.status(401).json({ error: 'invalid_google_token', message: 'no email in payload' });
  }

  const domain = emailDomain(email);
  const business = businessForDomain(domain);
  if (!business) {
    // Either genuinely not one of our three businesses, or a business
    // whose domain isn't confirmed yet (ADR-001 Open Question 3) — in
    // both cases we fail closed, not open. Do not guess a match.
    return res.status(403).json({ error: 'domain_not_allowed' });
  }

  let grants: Grant[];
  try {
    grants = await grantsForEmail(email);
  } catch (err: any) {
    // Same fail-closed-not-crash principle as /me in server.ts.
    return res.status(503).json({ error: 'entitlement_check_failed', message: err.message });
  }
  if (grants.length === 0) {
    return res.status(403).json({
      error: 'not_provisioned',
      message: `No active staff_user row for ${email} in any business's staff table. An admin must provision access.`,
      attempted_email: email,
    });
  }

  const session: ShellSession = {
    // NOT a TODO to "get around to" — verified blocked, not just
    // unimplemented. hermes confirmed (2026-09-05) that
    // vls.staff_user.person_id is NULL for all 5 production staff
    // rows: no platform.person row was ever created for VLS staff
    // (only for clients). Resolving this from the DB today would find
    // nothing to resolve to for any real staff member, so it would be
    // guessing, not implementing. The resolving mechanism now exists —
    // platform.match_or_create_person (vls-dashboard migration 008,
    // called through platform_identity_service) — but that's staff
    // PROVISIONING calling it, not shell reading it; shell has no
    // write/EXECUTE grant on platform.* beyond its own SELECT-only
    // scope (verified directly, see docs/BUILD_LOG.md), and correctly
    // doesn't call this function itself. Stays null until whichever
    // domain bot builds staff provisioning actually calls
    // match_or_create_person for existing staff rows — no shell code
    // change needed when that happens, since person_id here is never
    // used for anything (entitlement lookup is keyed on google_email
    // throughout, see entitlements.ts).
    person_id: null,
    google_email: email,
    grants,
  };

  const token = jwt.sign({ ...session, iss: ISSUER }, JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
  let doors;
  try {
    doors = await launcherDoors(email, grants);
  } catch (err: any) {
    return res.status(503).json({ error: 'entitlement_check_failed', message: err.message });
  }
  res.json({ token, expires_in: SESSION_TTL_SECONDS, session, doors });
}

/**
 * requireShellAuth — verifies the shell's own SSO JWT. This is the
 * reference implementation dashboard backends should mirror (per
 * docs/JWT_CONTRACT.md section 4), NOT something they import from
 * this repo directly (separate deployables). Re-checking grants
 * against the DB per-request (rather than trusting the JWT payload
 * alone) is deliberately NOT done here on every route — the shell
 * itself doesn't gate business content, only issues the token and
 * renders the launcher. Each dashboard backend is the one that must
 * re-verify ITS OWN grant against ITS OWN staff_user table per
 * request; see JWT_CONTRACT.md section 4 step 5. The shell re-checks
 * only when re-rendering the launcher itself (GET /me below).
 */
export async function requireShellAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }
  const token = header.slice('Bearer '.length);
  let decoded: ShellSession & { iss?: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as unknown as ShellSession & { iss?: string };
  } catch (err: any) {
    return res.status(401).json({ error: 'invalid_or_expired_token', message: err.message });
  }
  if (decoded.iss !== ISSUER) {
    return res.status(401).json({ error: 'invalid_issuer' });
  }
  req.shell = decoded;
  next();
}
