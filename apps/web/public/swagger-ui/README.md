Swagger UI 5.33.0 (`swagger-ui-bundle.js`, `swagger-ui.css`), copied verbatim
from the `swagger-ui-dist` npm package, Apache-2.0 (see LICENSE). Vendored
rather than installed or loaded from a CDN: the npm package carries the
`@scarf/scarf` install-time telemetry dependency (ADR 7), and a script loaded
from a third party onto a signed-in page could call the API as that user.
Served at /swagger-ui/ for the /api-docs page (ADR 35). To upgrade, copy the
two files from a newer package and update this line.
