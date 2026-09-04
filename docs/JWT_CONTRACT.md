# SSO JWT Contract — the shared secret/issuer convention

Status: v1, implements ADR-001 Decision 1 + hermes's answer to Open
Question 1 (2026-09-04): "One JWT, true SSO — all dashboard APIs
verify it directly via a shared secret/issuer convention. Not a
redirect/exchange-token handoff."

This document is the interface contract. **The shell issues the
token. Each dashboard's own backend (VLS/Elektrica/Collision) verifies
it independently** — that independent verification is what makes
"door doesn't appear" a real routing-level gate (hermes's answer to
Open Question 4) and not just a UI nicety. If a dashboard's backend
skips this and trusts "the shell already checked," the security
boundary breaks. This file exists so every locked bot implements
verification identically without needing to read shell source.

## 1. Issuance (shell only)

Only the shell's API issues these tokens, after:
1. Verifying a Google ID token via Google's public keys (same as
   VLS's `handleGoogleLogin`).
2. Confirming `email_verified` is true.
3. Matching the email's domain to a configured business (ADR-001
   Decision 4 — domain list TBD, see `docs/ADR-001-shell-architecture.md`
   Open Question 3).
4. Querying each business's own `staff_user` table (read-only) for an
   **active** row matching that email, across all businesses the
   email's domain(s) might map to.

## 2. Token shape

Algorithm: `HS256`. Signed with `JWT_SECRET` (shared across shell +
all dashboard APIs — this is the "shared secret" half of the
convention; rotate by coordinating a redeploy of all four services,
not silently).

```json
{
  "iss": "shell-dashboard",
  "person_id": 123,
  "google_email": "jed@vlslawfirm.com",
  "grants": [
    { "business": "vls", "role": "attorney" },
    { "business": "collision", "role": "owner" }
  ],
  "iat": 1735900000,
  "exp": 1735928800
}
```

- `iss` is always the literal string `shell-dashboard` — dashboard
  backends should check this, not just signature validity, so a token
  from an unrelated signer sharing the same secret by accident is
  still rejected on issuer mismatch.
- `grants` is the array of business+role pairs this person currently
  holds. **A dashboard backend only cares about its own business's
  entry** — VLS's backend looks for `grants.find(g => g.business ===
  'vls')` and ignores the rest.
- No refresh token, no session store, no blocklist (per hermes's
  answer to Open Question 5, 2026-09-04) — matches VLS's own existing
  pattern exactly. Logout is client-side token discard only; a
  copied/stolen token remains valid until `exp`. This is an accepted
  tradeoff, not an oversight — revisit only if/when financials needs a
  harder guarantee.

## 3. TTL

`exp` = `iat` + 8 hours (`28800` seconds), matching VLS's existing
`SESSION_TTL_SECONDS`. Same workday-session rationale — do not extend
this without discussing with hermes, since TTL length is the whole
mitigation for having no revocation mechanism.

## 4. What a dashboard backend does with it (contract for VLS/Elektrica/Collision)

This section is intentionally the same shape as VLS's own
`requireAuth` in `api/src/auth.ts` — copy that pattern, generalized:

1. Read `Authorization: Bearer <token>` header.
2. `jwt.verify(token, JWT_SECRET)` — reject on any failure
   (expired/malformed/bad signature) with `401`.
3. Check `decoded.iss === 'shell-dashboard'` — reject with `401` if
   not.
4. Find this dashboard's own grant: `decoded.grants.find(g =>
   g.business === '<this business>')`. If missing, `403` — the token
   is valid but this person has no entitlement to *this* dashboard
   (e.g. a VLS-only user hitting Collision's API directly).
5. **Re-verify against your own DB**, same as VLS already does today:
   look up your own `staff_user` row by `google_email`, confirm
   `active = true`, and use the **freshly-read** role/capability from
   your DB for authorization decisions in this request — not the
   role string baked into the JWT at issuance time. This is what
   makes a deactivation or role change take effect immediately
   instead of waiting up to 8 hours for token expiry, exactly like
   VLS's `requireAuth` already does for its own JWT today.

Each dashboard backend needs `JWT_SECRET` as a shared env var (same
value across all four services) and a small ~15-line verification
middleware. No dashboard needs to call the shell's API at request
time — verification is fully local once `JWT_SECRET` is shared,
which is the point of a stateless SSO token.

## 5. Env vars this introduces

- `JWT_SECRET` — shared across shell + VLS + Elektrica + Collision
  backends. Not the same as any project's own pre-existing
  `JWT_SECRET` if one already exists per-project (VLS currently has
  its own) — coordinate the rename/merge through hermes before any
  project wires this, so nobody silently breaks their own existing
  auth by overwriting an env var of the same name with a different
  value.
- `GOOGLE_OAUTH_CLIENT_ID` — shell needs its own (or a shared) OAuth
  client ID registered for whichever domains it accepts sign-in from;
  TBD alongside the domain list.

## 6. Open item

VLS's existing `api/src/auth.ts` already issues its own JWT today
(single `role`, no `iss`, no `grants`). Once the shell exists,
does VLS's backend switch to verifying the shell's SSO token
exclusively (retiring its own Google-login endpoint), or run both
in parallel for some transition period? Not my call to make alone —
flagging for hermes, since it affects VLS's bot's own code, not
just the shell's.
