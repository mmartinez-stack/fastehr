# ADR 26 — Legacy credentials verify in place, and retire on first sign-in

**Status:** accepted  
**Applies to:** `apps/web/src/server/auth.ts` · `apps/web/src/server/legacy-password.ts` · `packages/contracts/src/legacy-credential.ts` · `packages/db/scripts/migrate-users.ts`

Migrated staff sign in with the password they already have. This supersedes the
"Option B only" position recorded in migrate-users.ts (credentials never
migrate; everyone gets a temp password), which was written before the cutover
requirement — no interruption for staff — was decided.

## The legacy verifier, reproduced exactly

The legacy system stored PBKDF2-SHA1 (1000 iterations, 64-byte key) with a
per-user 16-byte salt kept as a hex string, and — the part that is easy to get
wrong — passed that hex string *as* the salt, never decoding it. The verifier
in `legacy-password.ts` reproduces this byte for byte, because "almost the same
KDF" fails every migrated login silently.

## One column, two formats, the prefix decides

The migrated hash and salt travel inside the credential `Account.password`
column as one string:

    legacy-pbkdf2-sha1$1000$<salt hex>$<hash hex>

Better Auth's own scrypt format is `<salt>:<key>`, so the two cannot be
confused; `emailAndPassword.password.verify` branches on the prefix and falls
through to scrypt for everything else. No schema change, no second column to
keep in sync, and `isLegacyCredential` is the single discriminator everywhere
(the verifier, the sign-in hook, the migration's own re-run guard).

The format codec lives in `@fastehr/contracts` because it *is* a contract:
`migrate-users.ts` writes it and the auth server reads it, and they must never
drift. The KDF itself deliberately does not — only `legacy-password.ts` can
compute a legacy hash.

## Weak hashes are a debt, paid down automatically

PBKDF2-SHA1 at 1000 iterations is far below current cost expectations, so
keeping those hashes indefinitely is not acceptable. The sign-in `hooks.after`
re-hashes with scrypt on every successful `/sign-in/email` whose stored
credential is still legacy-format — the one moment the plaintext is
legitimately present next to its hash. Each migrated credential therefore
survives exactly until its owner's first login. Password *writes* (change,
temp issuance) were already scrypt-only, so the legacy population only
shrinks. No forced reset, no flag day, no second system state to administer.

`mustChangePassword` stays out of this: a migrated user with a working
password is not in the temp-credential state.

## What never happens

The hash and salt appear in the NDJSON export, the `accounts` column, and
nowhere else — not in the migration report, not in logs, not re-derived. A
record whose hash/salt is missing or malformed migrates credential-less and is
listed in the report by reason; `issue-temp-password.ts` remains the path for
those accounts, unchanged.
