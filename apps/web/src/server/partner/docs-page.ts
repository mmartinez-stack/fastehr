import { createHash } from 'node:crypto'
import { PARTNER_API_BASE_PATH } from '@fastehr/contracts'

/**
 * The reference page at `/api/v1/docs`: Swagger UI reading the generated
 * document from `/api/v1/openapi.json`.
 *
 * The assets are the vendored copy under `public/swagger-ui` that the staff
 * API documentation already uses (ADR 35: verbatim files, no npm package,
 * no CDN), so no third-party script ever runs on this origin. The one script
 * of our own is the initialiser below, inline, and the policy admits it by
 * its hash rather than by relaxing `script-src` to anything unhashed.
 */
const INIT_SCRIPT = `window.addEventListener('DOMContentLoaded', function () {
  window.ui = SwaggerUIBundle({
    url: ${JSON.stringify(`${PARTNER_API_BASE_PATH}/openapi.json`)},
    dom_id: '#swagger-ui',
    deepLinking: false,
    tryItOutEnabled: false,
    supportedSubmitMethods: [],
  })
})`

const INIT_SCRIPT_HASH = `sha256-${createHash('sha256').update(INIT_SCRIPT).digest('base64')}`

export const DOCS_CONTENT_SECURITY_POLICY = `default-src 'none'; script-src 'self' '${INIT_SCRIPT_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`

export const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FastEHR Partner API</title>
<link rel="stylesheet" href="/swagger-ui/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="/swagger-ui/swagger-ui-bundle.js"></script>
<script>${INIT_SCRIPT}</script>
</body>
</html>
`
