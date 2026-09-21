# Partner API data flow

What protected health information crosses the partner API, in which
direction, and what the trail keeps (ADR 37, ADR 38). One row per
operation; extend it in the same commit as any new operation.

| Operation | PHI in (from the vendor) | PHI out (to the vendor) | Stored by us | Lawful basis |
| --- | --- | --- | --- | --- |
| `POST /patients/lookup` | date of birth; phone and/or name; or a patient id | up to five of: patient id, first and last name, last four digits of the phone, clinic slug | audit row: key id, operation, outcome, request id, address, duration. Never the identifiers. | Treatment and health care operations: identifying the caller's record |
| `POST /patients/{patientId}/verify` | patient id (path); date of birth; phone | whether the factors matched; a verification token | verification row (token hash, client, patient, expiry); attempt row (client, patient id, pass or fail, address); audit row with the patient as subject | Verification of identity before disclosure (§164.514(h)) |
| `GET /queue/count` | none | counts and wait minutes per clinic | audit row | Health care operations |

What the vendor holds: the identifiers the caller spoke, the candidates it
was shown, the token for fifteen minutes, and its own call recording or
transcript. Their retention and deletion are business associate agreement
terms, not something this system controls. Nothing the vendor sends is
stored except the attempt rows above, and no request body or query string
is written anywhere on our side.

Where it travels: TLS from the vendor's servers to the clinic's proxy, the
proxy to the application container over the instance network, and the
application to the database over TLS inside the VPC. No third party sees a
request: no analytics, no error tracker, no CDN on the docs page.
