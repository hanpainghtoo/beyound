const CORE_API_URL = process.env.CORE_API_URL || "http://localhost:3001/api/v1"
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Password123!"
// Signed upload URLs are issued against the configured public file-storage
// host (e.g. https://files.zayos.com.mm in production). In local dev the
// running API may be configured with the production host while the local
// file-storage service listens on localhost. The presigned signature is
// path-based, so rewriting the origin to FILE_STORAGE_PUBLIC_URL is safe and
// lets the same script run in dev and production.
const FILE_STORAGE_PUBLIC_URL = process.env.FILE_STORAGE_PUBLIC_URL || ""

function rewriteUploadOrigin(uploadUrl) {
  if (!FILE_STORAGE_PUBLIC_URL) return uploadUrl
  try {
    const signed = new URL(uploadUrl)
    const expected = new URL(FILE_STORAGE_PUBLIC_URL)
    if (signed.origin !== expected.origin) {
      signed.protocol = expected.protocol
      signed.host = expected.host
      return signed.toString()
    }
  } catch {
    // fall through to the original URL
  }
  return uploadUrl
}

const mediaFixtures = [
  {
    fileName: "seed-mingalar-x1-product.png",
    contentType: "image/png",
    purpose: "product-image",
    productSku: "MM-PHONE-001",
    bodyBase64: "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAYElEQVR4nO3PQQ3AIADAQEDXhnKZJ4kQbCQs9P4xvIO9s7vndwJ4zQGgXQBoFwDaBYB2AaBdAGgXANoFgHYBoF0AaBcA2gWAdgGgXQBoFwDaBYB2AaBdAGgXANoFgHYBHs4CAQHnG6c7AAAAAElFTkSuQmCC",
  },
  {
    fileName: "seed-clear-case-product.png",
    contentType: "image/png",
    purpose: "product-image",
    productSku: "MM-CASE-001",
    bodyBase64: "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAYElEQVR4nO3PQQ3AIADAQECxhq4wTyJEsJCw0PvH8A72zu6e3wngNQeAdgGgXQBoFwDaBYB2AaBdAGgXANoFgHYBoF0AaBcA2gWAdgGgXQBoFwDaBYB2AaBdAGgXANoFeJgCAQFq4j0XAAAAAElFTkSuQmCC",
  },
  {
    fileName: "seed-cod-delivery-guide.txt",
    contentType: "text/plain",
    purpose: "reply-attachment",
    body: "Mingalar Mobile COD delivery guide\\n\\n1. Confirm township and phone number.\\n2. Share final COD amount.\\n3. Ask customer to prepare exact cash.\\n4. Update order status after rider handoff.\\n",
  },
  {
    fileName: "seed-payment-confirmation-note.txt",
    contentType: "text/plain",
    purpose: "reply-attachment",
    body: "Payment confirmation checklist\\n\\n- Verify bank transfer screenshot.\\n- Match amount and order number.\\n- Update payment status.\\n- Reply with delivery timeline.\\n",
  },
]

async function request(path, { token, ...init } = {}) {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json")
  if (token) headers.set("authorization", `Bearer ${token}`)

  const response = await fetch(`${CORE_API_URL}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} failed ${response.status}: ${JSON.stringify(body)}`)
  }
  return body
}

async function login(usernameOrEmail) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail, password: DEMO_PASSWORD }),
  })
}

async function getOrUploadMedia(token, fixture) {
  const existing = await request(`/media?limit=100&search=${encodeURIComponent(fixture.fileName)}`, { token })
  const existingFile = existing.data?.find((file) => file.fileName === fixture.fileName && file.status !== "archived")
  if (existingFile) return existingFile

  const content = fixture.bodyBase64 ? Buffer.from(fixture.bodyBase64, "base64") : Buffer.from(fixture.body, "utf8")
  const upload = await request("/media/uploads", {
    token,
    method: "POST",
    body: JSON.stringify({
      fileName: fixture.fileName,
      contentType: fixture.contentType,
      sizeBytes: content.length,
      purpose: fixture.purpose,
      metadata: { source: "seed:demo", scenario: "v2-media-library" },
    }),
  })

  const putResponse = await fetch(rewriteUploadOrigin(upload.upload.url), {
    method: "PUT",
    headers: upload.upload.headers,
    body: content,
  })
  if (!putResponse.ok) throw new Error(`PUT ${fixture.fileName} failed ${putResponse.status}`)

  const downloaded = await request(`/media/${upload.file.id}/download-url`, { token })
  return downloaded.file
}

async function main() {
  const admin = await login("admin@demo.local")
  const supervisor = await login("supervisor@demo.local")
  const adminToken = admin.accessToken
  const supervisorToken = supervisor.accessToken

  const uploadedFiles = []
  for (const fixture of mediaFixtures) {
    uploadedFiles.push(await getOrUploadMedia(adminToken, fixture))
  }

  const products = await request("/tenant/products?limit=100", { token: adminToken })
  for (const fixture of mediaFixtures.filter((item) => item.productSku)) {
    const product = products.data?.find((item) => item.sku === fixture.productSku)
    const file = uploadedFiles.find((item) => item.fileName === fixture.fileName)
    if (!product || !file) continue
    const images = Array.from(new Set([file.id, ...(product.images || [])]))
    await request(`/tenant/products/${product.id}`, {
      token: adminToken,
      method: "PUT",
      body: JSON.stringify({ images }),
    })
  }

  const conversations = await request("/csr/conversations?limit=100", { token: supervisorToken })
  const targetConversation = conversations.data?.find((item) => item.conversationId === "demo-conv-open-001")
  const attachmentFile = uploadedFiles.find((item) => item.fileName === "seed-cod-delivery-guide.txt")
  if (targetConversation && attachmentFile) {
    const messages = await request(`/csr/conversations/${targetConversation.id}/messages`, { token: supervisorToken })
    const alreadySeeded = messages.some((message) => message.content === "Seeded COD delivery guide attached for the customer.")
    if (!alreadySeeded) {
      const downloadable = await request(`/media/${attachmentFile.id}/download-url`, { token: supervisorToken })
      await request("/csr/conversations/messages", {
        token: supervisorToken,
        method: "POST",
        body: JSON.stringify({
          conversationId: targetConversation.id,
          messageType: "file",
          content: "Seeded COD delivery guide attached for the customer.",
          attachments: [{
            fileId: downloadable.file.id,
            fileName: downloadable.file.fileName,
            contentType: downloadable.file.contentType,
            sizeBytes: downloadable.file.sizeBytes,
            url: downloadable.download.url,
            role: "message_attachment",
          }],
        }),
      })
    }
  }

  console.log(`Media seed complete: ${uploadedFiles.length} files available, product image associations checked.`)
}

main().catch((error) => {
  console.error("Media seed failed:", error)
  process.exitCode = 1
})
