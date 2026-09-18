import { PARTNER_API_BASE_PATH } from '@fastehr/contracts'

/**
 * The reference page at `/api/v1/docs`: Swagger UI reading the generated
 * document from `/api/v1/openapi.json`.
 *
 * The assets are served from this origin (`apps/web/scripts/copy-api-docs-assets.mjs`
 * copies them from `swagger-ui-dist` into `public/api-docs` at build and dev
 * time), so no third-party script ever runs on this origin, which is the
 * stance ADR 7 takes for PHI routes applied to the one page next to them.
 * The policy below allows exactly those files and inline styles (Swagger
 * UI sets them), and nothing else.
 */
export const DOCS_CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

export const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FastEHR Partner API</title>
<link rel="stylesheet" href="/api-docs/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="/api-docs/swagger-ui-bundle.js"></script>
<script src="/api-docs/init.js" data-spec-url="${PARTNER_API_BASE_PATH}/openapi.json"></script>
</body>
</html>
`
