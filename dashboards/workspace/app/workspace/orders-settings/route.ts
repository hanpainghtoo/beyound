import { NextResponse } from "next/server"

/**
 * Legacy route. The old "Payments and Order setting" page is now the
 * payment-only "Payment Settings" page. Redirect bookmarks and old links,
 * dropping any ?tab= query param along the way.
 */
export function GET(request: Request) {
  const target = new URL("/workspace/payment-settings", request.url)

  // Preserve the public host/protocol. In dev, request.url can carry an
  // internal host ("localhost") that differs from the one the browser used,
  // and a cross-host redirect would drop the session.
  const host = request.headers.get("host")
  if (host) target.host = host
  const forwardedProto = request.headers.get("x-forwarded-proto")
  if (forwardedProto) target.protocol = `${forwardedProto}:`

  return NextResponse.redirect(target, 307)
}
