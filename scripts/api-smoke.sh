#!/usr/bin/env bash
# Exercises a deployed FastEHR through its HTTP surface: Better Auth for the
# session, then the tRPC procedures with and without it. Read-only except for
# the sign-in itself; nothing here creates or changes records.
#
#   BASE_URL=https://dev.fastehr.diagnosticpartners.net \
#   EMAIL=you@diagnosticpartners.com PASSWORD='…' scripts/api-smoke.sh
#
# The account must have already changed its temporary password (the app
# forces that at first sign-in). Needs curl and python3. Exits non-zero on
# the first check that does not match; the wire format and every procedure
# are described in docs/runbooks/test-development-api.md.
set -euo pipefail

: "${BASE_URL:?set BASE_URL, e.g. https://dev.fastehr.diagnosticpartners.net}"
: "${EMAIL:?set EMAIL}" "${PASSWORD:?set PASSWORD}"

JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

# tRPC inputs travel as a URL-encoded superjson envelope: {"json": <input>}.
encode() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
query()  { curl -sS -b "$JAR" -o /dev/stdout -w '\n%{http_code}' "$BASE_URL/api/trpc/$1${2:+?input=$(encode "$2")}"; }
expect() { # expect <label> <wanted http status> <response with status on its last line>
  local label=$1 wanted=$2 body=$3 status
  status=${body##*$'\n'}; body=${body%$'\n'*}
  if [ "$status" = "$wanted" ]; then printf '  ok   %-34s %s  %s\n' "$label" "$status" "${body:0:70}"
  else printf '  FAIL %-34s wanted %s got %s  %s\n' "$label" "$wanted" "$status" "${body:0:200}"; exit 1; fi
}

echo "FastEHR API smoke against $BASE_URL"

echo "public"
expect "health" 200 "$(query health)"
expect "protected query without a session" 401 "$(query patient.recent)"

echo "session"
# Better Auth applies an origin check to every POST: send Origin, always.
expect "sign-in" 200 "$(curl -sS -c "$JAR" -H "Origin: $BASE_URL" -H 'content-type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$EMAIL" "$PASSWORD")" \
  -o /dev/stdout -w '\n%{http_code}' "$BASE_URL/api/auth/sign-in/email" | sed 's/"token":"[^"]*"/"token":"…"/')"
SESSION=$(curl -sS -b "$JAR" "$BASE_URL/api/auth/get-session")
ROLE=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]) or {}; u=d.get("user") or {}; print(u.get("role",""), "pending-change" if u.get("mustChangePassword") else "")' "$SESSION")
echo "  session role: $ROLE"
case "$ROLE" in *pending-change*) echo "  the account must change its temporary password first (sign in once in the browser)"; exit 1;; esac

echo "queries (any staff role)"
expect "location.listActive" 200 "$(query location.listActive)"
expect "patient.recent" 200 "$(query patient.recent)"
expect "patient.search" 200 "$(query patient.search '{"json":{"query":"smith"}}')"
expect "validation failure is codes only" 400 "$(query patient.searchByName '{"json":{"name":"x"}}')"
expect "batch of two" 200 "$(curl -sS -b "$JAR" -o /dev/stdout -w '\n%{http_code}' \
  "$BASE_URL/api/trpc/health,location.listActive?batch=1&input=$(encode '{"0":{"json":null},"1":{"json":null}}')")"

echo "role-gated (403 is the correct answer for a role without the surface)"
case "$ROLE" in
  admin*|medical_director*|frontdesk*)
    expect "intake.listPending (clerical)" 200 "$(query intake.listPending '{"json":{"location":"all"}}')" ;;
  *) expect "intake.listPending (clerical)" 403 "$(query intake.listPending '{"json":{"location":"all"}}')" ;;
esac
case "$ROLE" in
  admin*|medical_director*) expect "staffUsers.list (admin)" 200 "$(query staffUsers.list)" ;;
  *) expect "staffUsers.list (admin)" 403 "$(query staffUsers.list)" ;;
esac
case "$ROLE" in
  medical_director*) expect "review.queue (medical director)" 200 "$(query review.queue)" ;;
  *) expect "review.queue (medical director)" 403 "$(query review.queue)" ;;
esac

echo "sign-out"
expect "sign-out" 200 "$(curl -sS -b "$JAR" -c "$JAR" -H "Origin: $BASE_URL" -H 'content-type: application/json' -d '{}' \
  -o /dev/stdout -w '\n%{http_code}' "$BASE_URL/api/auth/sign-out")"
expect "session gone" 401 "$(query patient.recent)"

echo "all checks passed"
