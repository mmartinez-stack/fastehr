'use client'

import Script from 'next/script'
import { useCallback, useEffect } from 'react'

/**
 * Mounts the vendored Swagger UI (public/swagger-ui, ADR 35) on the
 * document at `documentUrl`. The bundle is a classic script that defines
 * `window.SwaggerUIBundle`; it is loaded from this origin, never a CDN, so
 * nothing third-party runs on a signed-in page.
 */
interface SwaggerUiBundle {
  (options: {
    url: string
    dom_id: string
    deepLinking?: boolean
    displayRequestDuration?: boolean
    tryItOutEnabled?: boolean
    requestInterceptor?: (request: { credentials?: string }) => unknown
  }): unknown
}

declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerUiBundle
  }
}

const STYLESHEET = '/swagger-ui/swagger-ui.css'

export function SwaggerView({ documentUrl }: { documentUrl: string }) {
  // The stylesheet is a static asset, not a module, so it is attached from
  // here rather than imported; Next's global-CSS import cannot reach public/.
  useEffect(() => {
    if (document.querySelector(`link[href="${STYLESHEET}"]`) !== null) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = STYLESHEET
    document.head.append(link)
    return () => link.remove()
  }, [])

  const mount = useCallback(() => {
    window.SwaggerUIBundle?.({
      url: documentUrl,
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      // Same-origin requests carry the session cookie. The browser adds the
      // Origin header Better Auth's POSTs require on its own.
      requestInterceptor: (request) => {
        request.credentials = 'same-origin'
        return request
      },
    })
  }, [documentUrl])

  return (
    <>
      <Script src="/swagger-ui/swagger-ui-bundle.js" strategy="afterInteractive" onLoad={mount} />
      <div id="swagger-ui" />
    </>
  )
}
