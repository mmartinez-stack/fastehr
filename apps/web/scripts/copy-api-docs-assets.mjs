/**
 * Copies the Swagger UI assets the partner API's docs page needs into
 * `public/api-docs`, so they are served from this origin (ADR 36; ADR 7's
 * reasoning: no third-party script on this origin). Runs before `next dev`
 * and `next build`; the directory is gitignored and the standalone image
 * copies `public` as it already does.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'api-docs')
mkdirSync(target, { recursive: true })

for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
  copyFileSync(require.resolve(`swagger-ui-dist/${file}`), join(target, file))
}

// The page's own initialiser, as a file rather than inline so the content
// security policy can stay `script-src 'self'`.
writeFileSync(
  join(target, 'init.js'),
  `window.addEventListener('DOMContentLoaded', function () {
  var script = document.querySelector('script[data-spec-url]')
  window.ui = SwaggerUIBundle({
    url: script ? script.getAttribute('data-spec-url') : '/api/v1/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: false,
    tryItOutEnabled: false,
    supportedSubmitMethods: [],
  })
})
`,
)
