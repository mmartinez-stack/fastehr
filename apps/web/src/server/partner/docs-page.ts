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
const INIT_SCRIPT = `(function () {
  var specUrl = ${JSON.stringify(`${PARTNER_API_BASE_PATH}/openapi.json`)}
  var form = document.getElementById('key-form')
  var input = document.getElementById('key')
  var status = document.getElementById('status')
  function render(spec) {
    window.ui = SwaggerUIBundle({ spec: spec, dom_id: '#swagger-ui', deepLinking: false, tryItOutEnabled: false, supportedSubmitMethods: [] })
  }
  function load(key) {
    var headers = key ? { Authorization: 'Bearer ' + key } : {}
    status.textContent = key ? 'Checking the key…' : ''
    return fetch(specUrl, { headers: headers, cache: 'no-store' }).then(function (response) {
      if (response.status === 401) { status.textContent = 'That key was not accepted.'; return }
      if (response.status === 429) { status.textContent = 'Too many attempts. Wait a minute and try again.'; return }
      if (!response.ok) { status.textContent = 'The document could not be loaded (' + response.status + ').'; return }
      return response.json().then(function (spec) {
        var count = Object.keys(spec.paths || {}).length
        status.textContent = key ? (count === 0 ? 'Your key covers no operations.' : 'Showing the ' + count + ' path' + (count === 1 ? '' : 's') + ' your key covers.') : ''
        render(spec)
      })
    }).catch(function () { status.textContent = 'The document could not be loaded.' })
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    var key = input.value.trim()
    if (key) load(key)
  })
  window.addEventListener('DOMContentLoaded', function () { load('') })
})()`

const INIT_SCRIPT_HASH = `sha256-${createHash('sha256').update(INIT_SCRIPT).digest('base64')}`

export const DOCS_CONTENT_SECURITY_POLICY = `default-src 'none'; script-src 'self' '${INIT_SCRIPT_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`

/**
 * The page asks for the partner's key and fetches the document with it, so
 * the operations shown are the ones that key covers (ADR 38). The key lives
 * in the page's memory for that fetch and nowhere else: not in the URL, not
 * in storage, not sent to any origin but this one. Without a key the page
 * shows the skeleton: how to authenticate and the error format.
 */
export const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FastEHR Partner API</title>
<link rel="stylesheet" href="/swagger-ui/swagger-ui.css">
<style>
  .key-bar { font-family: sans-serif; background: #fafafa; border-bottom: 1px solid #ddd; padding: 12px 20px; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  .key-bar label { font-weight: 600; }
  .key-bar input { width: min(560px, 100%); padding: 6px 8px; font-family: monospace; }
  .key-bar button { padding: 6px 14px; }
  .key-bar .hint { flex-basis: 100%; color: #555; font-size: 0.9em; }
  #status { color: #333; }
</style>
</head>
<body>
<form id="key-form" class="key-bar" autocomplete="off">
  <label for="key">Your API key</label>
  <input id="key" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="fehr_…">
  <button type="submit">Show my operations</button>
  <span id="status" role="status"></span>
  <span class="hint">The key is checked by this server and kept only in this page while it is open. Without one, the page shows how to authenticate and the error format.</span>
</form>
<div id="swagger-ui"></div>
<script src="/swagger-ui/swagger-ui-bundle.js"></script>
<script>${INIT_SCRIPT}</script>
</body>
</html>
`
