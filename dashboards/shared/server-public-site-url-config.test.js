const test = require("node:test")
const assert = require("node:assert/strict")

const { resolvePublicSiteUrl } = require("./server-public-site-url-config")

test("resolves a configured public site URL in production", () => {
  assert.equal(
    resolvePublicSiteUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://zayos.com.mm/",
    }),
    "https://zayos.com.mm",
  )
})

test("fails safely when the production public site URL is missing", () => {
  assert.throws(() => resolvePublicSiteUrl({ NODE_ENV: "production" }), /NEXT_PUBLIC_SITE_URL/)
})

test("allows an explicit localhost URL for local builds", () => {
  assert.equal(
    resolvePublicSiteUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    }),
    "http://localhost:3000",
  )
})
