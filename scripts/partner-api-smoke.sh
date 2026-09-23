#!/usr/bin/env bash
# Exercises the partner API (/api/v1) of a deployed FastEHR with one key, the
# way the vendor's system will: the document cut to the key, every lookup
# shape the contract accepts and refuses, a failed and a successful
# verification, the queue count, and the refusals for no key and a wrong key.
#
#   BASE_URL=https://dev.fastehr.diagnosticpartners.net \
#   KEY='fehr_dev_…' DOB=1985-12-10 PHONE=9515550101 LAST_NAME=Lovelace scripts/partner-api-smoke.sh
#
# DOB/PHONE/LAST_NAME name a patient that exists in that environment (on dev,
# the invented Ada Lovelace). Read-only apart from the verification attempts it
# records; a successful verification resets the patient's failure count, so
# running it repeatedly never locks the patient. Needs curl and python3. Exits
# non-zero on the first answer that does not match; docs/partner-api/README.md
# explains every rule asserted here.
set -euo pipefail

: "${BASE_URL:?set BASE_URL, e.g. https://dev.fastehr.diagnosticpartners.net}"
: "${KEY:?set KEY to the partner API key}" "${DOB:?set DOB (YYYY-MM-DD)}" "${PHONE:?set PHONE (ten digits)}" "${LAST_NAME:?set LAST_NAME}"
B="$BASE_URL/api/v1"

call() { # call <method> <path> [json body] [extra curl args...]  -> prints body then status on its own line
  local method=$1 path=$2 body=${3-}; shift 2; [ $# -gt 0 ] && shift
  if [ -n "$body" ]; then
    curl -sS -X "$method" -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d "$body" -o /dev/stdout -w '\n%{http_code}' "$@" "$B$path"
  else
    curl -sS -X "$method" -H "Authorization: Bearer $KEY" -o /dev/stdout -w '\n%{http_code}' "$@" "$B$path"
  fi
}
expect() { # expect <label> <wanted status> <response> [python expression over the parsed body that must be truthy]
  local label=$1 wanted=$2 response=$3 check=${4-} status body
  status=${response##*$'\n'}; body=${response%$'\n'*}
  if [ "$status" != "$wanted" ]; then printf '  FAIL %-52s wanted %s got %s  %s\n' "$label" "$wanted" "$status" "${body:0:160}"; exit 1; fi
  if [ -n "$check" ] && ! python3 -c "import sys,json; d=json.loads(sys.argv[1]); sys.exit(0 if ($check) else 1)" "$body" 2>/dev/null; then
    printf '  FAIL %-52s %s  body: %s\n' "$label" "$status" "${body:0:160}"; exit 1
  fi
  printf '  ok   %-52s %s  %s\n' "$label" "$status" "${body:0:96}"
}

echo "FastEHR partner API smoke against $B"

echo "documents"
expect "openapi without a key: no operations" 200 "$(curl -sS -o /dev/stdout -w '\n%{http_code}' "$B/openapi.json")" 'd["paths"] == {}'
expect "openapi with the key: my operations" 200 "$(call GET /openapi.json)" 'len(d["paths"]) >= 1'
expect "docs page" 200 "$(curl -sS -o /dev/null -w 'html\n%{http_code}' "$B/docs")"

echo "authentication"
expect "no key" 401 "$(curl -sS -o /dev/stdout -w '\n%{http_code}' "$B/queue/count")" 'd["error"]["code"] == "unauthenticated"'
expect "wrong key" 401 "$(curl -sS -H 'Authorization: Bearer fehr_dev_not_a_key' -o /dev/stdout -w '\n%{http_code}' "$B/queue/count")"
expect "key in the query string is ignored" 401 "$(curl -sS -o /dev/stdout -w '\n%{http_code}' "$B/queue/count?api_key=$KEY")"

echo "lookup: the two accepted shapes"
expect "dateOfBirth + phone" 200 "$(call POST /patients/lookup "{\"dateOfBirth\":\"$DOB\",\"phone\":\"$PHONE\"}")" 'len(d["candidates"]) >= 1 and "dateOfBirth" not in str(d)'
expect "dateOfBirth + lastName" 200 "$(call POST /patients/lookup "{\"dateOfBirth\":\"$DOB\",\"lastName\":\"$LAST_NAME\"}")" 'len(d["candidates"]) >= 1'
expect "dateOfBirth + phone + lastName" 200 "$(call POST /patients/lookup "{\"dateOfBirth\":\"$DOB\",\"phone\":\"$PHONE\",\"lastName\":\"$LAST_NAME\"}")" 'len(d["candidates"]) >= 1'
PATIENT_ID=$(call POST /patients/lookup "{\"dateOfBirth\":\"$DOB\",\"phone\":\"$PHONE\"}" | head -1 | python3 -c 'import sys,json; print(json.load(sys.stdin)["candidates"][0]["patientId"])')
expect "patientId alone" 200 "$(call POST /patients/lookup "{\"patientId\":\"$PATIENT_ID\"}")" 'd["candidates"][0]["patientId"] == "'"$PATIENT_ID"'"'
expect "nobody matches: empty list" 200 "$(call POST /patients/lookup '{"dateOfBirth":"1901-01-01","phone":"5555550000"}')" 'd["candidates"] == [] and d["truncated"] is False'

echo "lookup: refused shapes answer 400 with field codes, never text"
expect "dateOfBirth alone" 400 "$(call POST /patients/lookup "{\"dateOfBirth\":\"$DOB\"}")" 'd["error"]["code"] == "invalid_input" and "phone" in d["error"]["validation"]["fieldErrors"]'
expect "phone alone" 400 "$(call POST /patients/lookup "{\"phone\":\"$PHONE\"}")" '"dateOfBirth" in d["error"]["validation"]["fieldErrors"]'
expect "lastName alone" 400 "$(call POST /patients/lookup "{\"lastName\":\"$LAST_NAME\"}")" '"dateOfBirth" in d["error"]["validation"]["fieldErrors"]'
expect "firstName without lastName" 400 "$(call POST /patients/lookup "{\"dateOfBirth\":\"$DOB\",\"firstName\":\"Ada\"}")" '"lastName" in d["error"]["validation"]["fieldErrors"]'
expect "patientId mixed with other fields" 400 "$(call POST /patients/lookup "{\"patientId\":\"$PATIENT_ID\",\"dateOfBirth\":\"$DOB\"}")"
expect "an unknown field" 400 "$(call POST /patients/lookup "{\"dateOfBirth\":\"$DOB\",\"phone\":\"$PHONE\",\"ssn\":\"x\"}")" 'd["error"]["validation"]["formErrors"] == ["unrecognized_keys"]'
expect "not JSON" 400 "$(call POST /patients/lookup '{oops')"

echo "verification"
expect "wrong phone" 403 "$(call POST "/patients/$PATIENT_ID/verify" "{\"dateOfBirth\":\"$DOB\",\"phone\":\"5555550000\"}")" 'd["error"]["code"] == "verification_failed"'
expect "right factors: a token" 200 "$(call POST "/patients/$PATIENT_ID/verify" "{\"dateOfBirth\":\"$DOB\",\"phone\":\"$PHONE\"}" | sed -E 's/"verificationToken":"[^"]+"/"verificationToken":"…"/')" 'd["verified"] is True and "expiresAt" in d'
expect "missing a factor" 400 "$(call POST "/patients/$PATIENT_ID/verify" "{\"dateOfBirth\":\"$DOB\"}")"

echo "queue"
expect "count, every clinic" 200 "$(call GET /queue/count)" '"waiting" in d and "byLocation" in d'
expect "count, one clinic" 200 "$(call GET '/queue/count?location=sylmar')" 'd["location"] == "sylmar"'
expect "unknown clinic" 400 "$(call GET '/queue/count?location=mars')"

echo "routing"
expect "unknown route" 404 "$(call GET /patients)"
expect "wrong verb" 405 "$(call GET /patients/lookup)"

echo "all checks passed"
