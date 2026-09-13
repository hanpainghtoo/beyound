const baseUrl = process.env.API_BASE_URL || "http://localhost:3007/api/v1"
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const cleanups = []

const users = {
  platform: ["platform@kme.local", "Password123!"],
  owner: ["owner@demo.local", "Password123!"],
  tenant: ["admin@demo.local", "Password123!"],
  supervisor: ["supervisor@demo.local", "Password123!"],
  finance: ["finance@demo.local", "Password123!"],
  delivery: ["delivery@demo.local", "Password123!"],
  workspace: ["supervisor@demo.local", "Password123!"],
}

async function request(path, token, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  })

  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} -> ${response.status} ${JSON.stringify(body).slice(0, 500)}`)
  }

  return body
}

async function expectStatus(path, expectedStatus, token, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  })
  if (response.status !== expectedStatus) {
    const text = await response.text()
    throw new Error(
      `${init.method || "GET"} ${path} -> expected ${expectedStatus}, received ${response.status} ${text.slice(0, 500)}`,
    )
  }
}

async function step(label, fn) {
  const result = await fn()
  console.log(`ok ${label}`)
  return result
}

async function login(label, usernameOrEmail, password) {
  const body = await request("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail, password }),
  })
  if (!body.accessToken || !body.refreshToken) {
    throw new Error(`${label} login did not return access and refresh tokens`)
  }
  console.log(`ok ${label} login`)
  return body
}

function firstData(body) {
  return Array.isArray(body?.data) ? body.data[0] : Array.isArray(body) ? body[0] : null
}

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function requireEvent(events, eventType, message) {
  const event = [...events].reverse().find((item) => item.eventType === eventType)
  requireCondition(event, message || `Expected domain event ${eventType}`)
  requireCondition(event.tenantId, `${eventType} event missing tenantId`)
  requireCondition(event.entityType, `${eventType} event missing entityType`)
  requireCondition(event.entityId, `${eventType} event missing entityId`)
  requireCondition(event.createdAt, `${eventType} event missing createdAt`)
  return event
}

async function cleanup() {
  for (const action of cleanups.reverse()) {
    try {
      await action()
    } catch (error) {
      console.warn(`warn cleanup failed: ${error.message}`)
    }
  }
}

async function main() {
  console.log(`API smoke target: ${baseUrl}`)

  const tokens = {}
  const refreshTokens = {}
  for (const [label, [usernameOrEmail, password]] of Object.entries(users)) {
    const auth = await login(label, usernameOrEmail, password)
    tokens[label] = auth.accessToken
    refreshTokens[label] = auth.refreshToken
  }

  await step("auth profile platform", () => request("/auth/profile", tokens.platform))
  await step("auth profile tenant", () => request("/auth/profile", tokens.tenant))
  await step("auth refresh workspace", () => request("/auth/refresh", refreshTokens.workspace, { method: "POST" }))
  const workspaceProfile = await step("auth profile workspace", () => request("/auth/profile", tokens.workspace))
  await step("auth profile workspace update", () =>
    request("/auth/profile", tokens.workspace, {
      method: "PUT",
      body: JSON.stringify({
        fullName: workspaceProfile.fullName,
        email: workspaceProfile.email,
        phone: workspaceProfile.phone || "",
        department: workspaceProfile.department || "",
        notificationPreferences: workspaceProfile.notificationPreferences || {},
      }),
    }),
  )
  const registrationPayload = {
    fullName: "Unauthorized Smoke User",
    email: `unauthorized-${suffix}@example.com`,
    password: "Password123!",
    role: "delivery",
  }
  await step("tenant registration rejects anonymous caller", () =>
    expectStatus("/auth/register/tenant-user", 401, null, {
      method: "POST",
      body: JSON.stringify(registrationPayload),
    }),
  )
  await step("tenant registration rejects supervisor caller", () =>
    expectStatus("/auth/register/tenant-user", 403, tokens.workspace, {
      method: "POST",
      body: JSON.stringify(registrationPayload),
    }),
  )
  await step("customer update rejects ownership fields", async () => {
    const customers = await request("/csr/customers?limit=1", tokens.workspace)
    const customer = firstData(customers)
    requireCondition(customer?.id, "Expected seeded customer for isolation check")
    await expectStatus(`/csr/customers/${customer.id}`, 403, tokens.workspace, {
      method: "PUT",
      body: JSON.stringify({ tenantId: "00000000-0000-0000-0000-000000000000" }),
    })
  })
  await step("workspace notifications list", () => request("/csr/notifications", tokens.workspace))
  await step("workspace notifications mark all read", () =>
    request("/csr/notifications/read-all", tokens.workspace, { method: "POST" }),
  )
  await step("workspace performance summary", () => request("/csr/performance?days=7", tokens.workspace))
  await step("supervisor team performance", () => request("/csr/performance/team?days=7", tokens.supervisor))

  const plan = await step("platform subscription plan create", () =>
    request("/platform-admin/subscription-plans", tokens.platform, {
      method: "POST",
      body: JSON.stringify({
        name: `Smoke Plan ${suffix}`,
        description: "Temporary smoke verification plan",
        monthlyPrice: 1000,
        maxCsrs: 3,
        maxChannels: 2,
        messageLimit: 1000,
        apiLimit: 1000,
        storageLimitGb: 1,
        features: { smoke: true },
        status: "active",
      }),
    }),
  )
  cleanups.push(() => request(`/platform-admin/subscription-plans/${plan.id}`, tokens.platform, { method: "DELETE" }))
  await step("platform subscription plan update", () =>
    request(`/platform-admin/subscription-plans/${plan.id}`, tokens.platform, {
      method: "PUT",
      body: JSON.stringify({ status: "active", description: "Updated by smoke verification" }),
    }),
  )

  const tenant = await step("platform tenant create", () =>
    request("/platform-admin/tenants", tokens.platform, {
      method: "POST",
      body: JSON.stringify({
        tenantCode: `SMOKE-${suffix}`.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
        companyName: `Smoke Tenant ${suffix}`,
        contactEmail: `smoke-${suffix}@example.com`,
        contactPerson: "Smoke Runner",
        subscriptionPlanId: plan.id,
        status: "pending",
      }),
    }),
  )
  cleanups.push(() => request(`/platform-admin/tenants/${tenant.id}`, tokens.platform, { method: "DELETE" }))
  await step("platform tenant update", () =>
    request(`/platform-admin/tenants/${tenant.id}`, tokens.platform, {
      method: "PUT",
      body: JSON.stringify({ companyName: `Smoke Tenant Updated ${suffix}` }),
    }),
  )
  await step("platform tenant approve", () =>
    request(`/platform-admin/tenants/${tenant.id}/approve`, tokens.platform, {
      method: "POST",
      body: JSON.stringify({
        action: "approved",
        subscriptionPlanId: plan.id,
        notes: `Smoke approve ${suffix}`,
      }),
    }),
  )
  await step("platform tenant suspend", () =>
    request(`/platform-admin/tenants/${tenant.id}/suspend`, tokens.platform, {
      method: "POST",
      body: JSON.stringify({ reason: `Smoke suspend ${suffix}` }),
    }),
  )
  await step("platform tenant reactivate", () =>
    request(`/platform-admin/tenants/${tenant.id}/reactivate`, tokens.platform, {
      method: "POST",
      body: JSON.stringify({ reason: `Smoke reactivate ${suffix}` }),
    }),
  )

  const template = await step("platform channel template create", () =>
    request("/platform-admin/channel-templates", tokens.platform, {
      method: "POST",
      body: JSON.stringify({
        channelType: "telegram",
        templateName: `Smoke Template ${suffix}`,
        defaultWelcomeMessage: "Welcome from smoke verification",
        webhookEvents: ["message"],
        status: "active",
        configuration: { smoke: true },
      }),
    }),
  )
  cleanups.push(() => request(`/platform-admin/channel-templates/${template.id}`, tokens.platform, { method: "DELETE" }))
  await step("platform channel template update", () =>
    request(`/platform-admin/channel-templates/${template.id}`, tokens.platform, {
      method: "PUT",
      body: JSON.stringify({
        channelType: "telegram",
        templateName: `Smoke Template Updated ${suffix}`,
        status: "inactive",
        configuration: { smoke: true, updated: true },
      }),
    }),
  )

  const smokeTeamMember = await step("tenant team member create", () =>
    request("/tenant/csrs", tokens.tenant, {
      method: "POST",
      body: JSON.stringify({
        fullName: `Smoke Delivery ${suffix}`,
        email: `smoke-delivery-${suffix}@demo.local`,
        password: `Smoke-${suffix}-Delivery!92`,
        role: "delivery",
        status: "active",
        department: "Smoke",
      }),
    }),
  )
  cleanups.push(() => request(`/tenant/csrs/${smokeTeamMember.id}`, tokens.tenant, { method: "DELETE" }))
  await step("tenant team member update", () =>
    request(`/tenant/csrs/${smokeTeamMember.id}`, tokens.tenant, {
      method: "PUT",
      body: JSON.stringify({ fullName: `Smoke Delivery Updated ${suffix}`, department: "Verification" }),
    }),
  )

  const channel = await step("tenant channel create", () =>
    request("/tenant/channels", tokens.tenant, {
      method: "POST",
      body: JSON.stringify({
        channelType: "telegram",
        channelName: `Smoke Channel ${suffix}`,
        displayName: `Smoke Channel ${suffix}`,
        configuration: { smoke: true },
        credentials: { botToken: `smoke-bot-token-${suffix}`, botUsername: `smoke_bot_${suffix}` },
        assignmentRule: "manual",
      }),
    }),
  )
  requireCondition(channel.credentialStatus === "encrypted", "Channel credentials were not marked encrypted")
  requireCondition(channel.connectionStatus === "ready", "Channel connection status was not marked ready")
  requireCondition(channel.credentials?.encrypted === true, "Channel credential preview did not report encrypted storage")
  requireCondition(channel.credentials?.values?.botToken === "********", "Channel bot token was not redacted")
  requireCondition(!JSON.stringify(channel).includes(`smoke-bot-token-${suffix}`), "Channel response leaked raw bot token")
  requireCondition(
    typeof channel.webhookUrl === "string" && channel.webhookUrl.includes(`/webhooks/telegram/${channel.id}`),
    "Channel webhook URL was not generated from the persisted channel UUID",
  )

  cleanups.push(() => request(`/tenant/channels/${channel.id}`, tokens.tenant, { method: "DELETE" }))
  await step("tenant channel update", () =>
    request(`/tenant/channels/${channel.id}`, tokens.tenant, {
      method: "PUT",
      body: JSON.stringify({ displayName: `Smoke Channel Updated ${suffix}`, assignmentRule: "round_robin" }),
    }),
  )
  await step("tenant channel credentials stay redacted", async () => {
    const updatedChannel = await request(`/tenant/channels/${channel.id}`, tokens.tenant)
    requireCondition(updatedChannel.credentialStatus === "encrypted", "Updated channel lost encrypted credential status")
    requireCondition(updatedChannel.credentials?.values?.botToken === "********", "Updated channel bot token was not redacted")
    requireCondition(typeof updatedChannel.webhookUrl === "string" && updatedChannel.webhookUrl.length > 0, "Updated channel lost webhook URL")
    requireCondition(
      !JSON.stringify(updatedChannel).includes(`smoke-bot-token-${suffix}`),
      "Updated channel response leaked raw bot token",
    )
    return updatedChannel
  })

  const response = await step("tenant canned response create", () =>
    request("/tenant/canned-responses", tokens.tenant, {
      method: "POST",
      body: JSON.stringify({
        title: `Smoke Response ${suffix}`,
        shortcut: `/smoke-${suffix}`,
        content: "Smoke canned response content",
        tags: ["smoke"],
        visibility: "public",
      }),
    }),
  )
  cleanups.push(() => request(`/tenant/canned-responses/${response.id}`, tokens.tenant, { method: "DELETE" }))
  await step("tenant canned response update", () =>
    request(`/tenant/canned-responses/${response.id}`, tokens.tenant, {
      method: "PUT",
      body: JSON.stringify({ content: "Updated smoke canned response content", tags: ["smoke", "updated"] }),
    }),
  )

  const smokeProduct = await step("tenant product create", () =>
    request("/tenant/products", tokens.tenant, {
      method: "POST",
      body: JSON.stringify({
        name: `Smoke Product ${suffix}`,
        sku: `SMOKE-${suffix}`.toUpperCase(),
        type: "product",
        price: 12345,
        stockQuantity: 5,
        status: "active",
        tags: ["smoke"],
      }),
    }),
  )
  cleanups.push(() => request(`/tenant/products/${smokeProduct.id}`, tokens.tenant, { method: "DELETE" }))
  await step("tenant product update", () =>
    request(`/tenant/products/${smokeProduct.id}`, tokens.tenant, {
      method: "PUT",
      body: JSON.stringify({ price: 23456, stockQuantity: 7, status: "inactive" }),
    }),
  )

  const conversations = await step("workspace conversation list", () => request("/csr/conversations", tokens.workspace))
  const conversation = firstData(conversations)
  if (!conversation) {
    throw new Error("No seeded conversation available for workspace smoke")
  }
  await step("workspace conversation filters and SLA queues", async () => {
    await request("/csr/conversations?filter=unread&limit=5", tokens.workspace)
    await request("/csr/conversations?filter=hot_leads&limit=5", tokens.workspace)
    await request("/csr/conversations?filter=vip&limit=5", tokens.workspace)
    await request("/csr/conversations?filter=overdue&limit=5", tokens.workspace)
    await request(`/csr/conversations?filter=assigned&assignedCsrId=${conversation.assignedCsrId || ""}&limit=5`, tokens.workspace)
    await request("/csr/conversations?slaState=normal&limit=5", tokens.workspace)
  })

  const customers = await step("workspace customer list", () => request("/csr/customers", tokens.workspace))
  const customer = firstData(customers)
  if (!customer) {
    throw new Error("No seeded customer available for workspace smoke")
  }
  const smokeCustomerId = conversation.customerId || conversation.customer?.id || customer.id
  await step("workspace customer detail", async () => {
    const detail = await request(`/csr/customers/${smokeCustomerId}`, tokens.workspace)
    requireCondition(detail.id === smokeCustomerId, "Customer detail did not match selected customer")
    return detail
  })
  await step("workspace customer update", async () => {
    const updated = await request(`/csr/customers/${smokeCustomerId}`, tokens.workspace, {
      method: "PUT",
      body: JSON.stringify({
        notes: `Smoke profile update ${suffix}`,
        tags: Array.from(new Set([...(customer.tags || []), "smoke-verified"])),
      }),
    })
    requireCondition(updated.notes === `Smoke profile update ${suffix}`, "Customer update did not persist notes")
    requireCondition((updated.tags || []).includes("smoke-verified"), "Customer update did not persist tags")
    return updated
  })

  const products = await step("tenant product list", () => request("/tenant/products?limit=100", tokens.tenant))
  const seededProduct = products.data?.find((item) => item.id !== smokeProduct.id) || firstData(products)
  if (!seededProduct) {
    throw new Error("No seeded product available for chat-to-order smoke")
  }

  const message = await step("workspace message send", () =>
    request("/csr/conversations/messages", tokens.workspace, {
      method: "POST",
      body: JSON.stringify({
        conversationId: conversation.id,
        messageType: "text",
        content: `Smoke verification reply ${suffix}`,
      }),
    }),
  )
  await step("workspace message history after send", async () => {
    const messages = await request(`/csr/conversations/${conversation.id}/messages`, tokens.workspace)
    if (!messages.some((item) => item.id === message.id)) {
      throw new Error("Sent message was not found in conversation history")
    }
    return messages
  })
  await step("message delivery domain event", async () => {
    const events = await request(`/domain-events/message/${message.id}`, tokens.workspace)
    const expectedEventType = message.status === "failed" ? "message.failed" : "message.sent"
    const event = requireEvent(events, expectedEventType)
    requireCondition(event.payload?.conversationId === conversation.id, "Message event missing conversationId payload")
    requireCondition(event.payload?.customerId, "Message event missing customerId payload")
    return events
  })

  const assignedConversation = await step("workspace conversation assignment", () =>
    request(`/csr/conversations/${conversation.id}/assign`, tokens.workspace, {
      method: "POST",
      body: JSON.stringify({ csrId: smokeTeamMember.id }),
    }),
  )
  requireCondition(assignedConversation.assignedCsrId === smokeTeamMember.id, "Conversation assignment did not persist")

  await step("conversation assignment domain event", async () => {
    const events = await request(`/domain-events/conversation/${conversation.id}`, tokens.workspace)
    const event = requireEvent(events, "conversation.assigned")
    requireCondition(event.payload?.assignedCsrId === smokeTeamMember.id, "Assignment event missing assignedCsrId payload")
    return events
  })

  const closedConversation = await step("workspace conversation status lifecycle", () =>
    request(`/csr/conversations/${conversation.id}`, tokens.workspace, {
      method: "PUT",
      body: JSON.stringify({
        status: "closed",
        closeReason: `Smoke lifecycle close ${suffix}`,
        slaDueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    }),
  )
  requireCondition(closedConversation.status === "closed", "Conversation status did not persist")
  requireCondition(closedConversation.closeReason === `Smoke lifecycle close ${suffix}`, "Conversation close reason did not persist")
  requireCondition(closedConversation.closedAt, "Conversation closedAt was not set")

  await step("conversation status domain event", async () => {
    const events = await request(`/domain-events/conversation/${conversation.id}`, tokens.workspace)
    const event = requireEvent(events, "conversation.status_changed")
    requireCondition(event.payload?.status === "closed", "Status event missing closed payload")
    return events
  })

  const order = await step("workspace chat-to-order create", () =>
    request("/csr/orders", tokens.workspace, {
      method: "POST",
      body: JSON.stringify({
        conversationId: conversation.id,
        customerId: smokeCustomerId,
        paymentMethod: "cod",
        shippingFee: 1000,
        paidAmount: 500,
        deliveryAssigneeName: "Smoke Rider",
        deliveryAssigneePhone: "09999999999",
        deliveryZone: "Sanchaung",
        paymentNotes: "Initial smoke partial payment",
        notes: `Smoke order ${suffix}`,
        items: [
          {
            productId: seededProduct.id,
            quantity: 1,
            unitPrice: Number(seededProduct.price || 1),
            variation: { color: "smoke" },
          },
        ],
      }),
    }),
  )
  requireCondition(order.status === "new", "Created order did not start as new")
  requireCondition(order.paymentStatus === "partially_paid", "Created order did not record partial payment")
  requireCondition(Number(order.paidAmount) === 500, "Created order did not persist paidAmount")
  requireCondition(Number(order.balanceDue) > 0, "Created order did not calculate balanceDue")
  requireCondition(Number(order.codAmount) > 0, "Created order did not calculate codAmount")
  requireCondition(order.deliveryAssigneeName === "Smoke Rider", "Created order did not persist delivery assignee")

  await step("workspace order list includes created order", async () => {
    const orders = await request("/orders?limit=100", tokens.workspace)
    if (!orders.data?.some((item) => item.id === order.id)) {
      throw new Error("Created order was not found in order list")
    }
    return orders
  })
  await step("workspace order detail and item snapshots", async () => {
    const detail = await request(`/orders/${order.id}`, tokens.workspace)
    requireCondition(detail.id === order.id, "Order detail did not match created order")
    requireCondition(Array.isArray(detail.statusHistory) && detail.statusHistory.length > 0, "Order detail missing status history")

    const items = await request(`/orders/${order.id}/items`, tokens.workspace)
    requireCondition(items.length > 0, "Order items were not returned")
    requireCondition(items[0].productName === seededProduct.name, "Order item missing product name snapshot")
    requireCondition(items[0].productSnapshot?.productId === seededProduct.id, "Order item missing product snapshot")
    requireCondition(items[0].variationSnapshot?.color === "smoke", "Order item missing variation snapshot")
    requireCondition(Number(items[0].unitPrice) === Number(seededProduct.price || 1), "Order item unit price was not locked")
    return { detail, items }
  })

  await step("order created domain event", async () => {
    const events = await request(`/domain-events/order/${order.id}`, tokens.workspace)
    const event = requireEvent(events, "order.created")
    requireCondition(event.payload?.customerId, "Order created event missing customerId payload")
    requireCondition(event.payload?.conversationId === conversation.id, "Order created event missing conversationId payload")
    return events
  })

  const confirmedOrder = await step("workspace order lifecycle delivery and payment update", () =>
    request(`/orders/${order.id}/lifecycle`, tokens.workspace, {
      method: "PUT",
      body: JSON.stringify({
        status: "confirmed",
        note: `Smoke lifecycle confirm ${suffix}`,
        deliveryAssigneeName: "Smoke Rider Updated",
        deliveryAssigneePhone: "09888888888",
        deliveryZone: "Kamayut",
        trackingNumber: `TRK-${suffix}`,
        deliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        paidAmount: Number(order.totalAmount),
        paymentNotes: "Smoke paid in full",
      }),
    }),
  )
  requireCondition(confirmedOrder.status === "confirmed", "Order status did not update to confirmed")
  requireCondition(confirmedOrder.deliveryAssigneeName === "Smoke Rider Updated", "Order delivery assignee did not update")
  requireCondition(confirmedOrder.deliveryZone === "Kamayut", "Order delivery zone did not update")
  requireCondition(confirmedOrder.trackingNumber === `TRK-${suffix}`, "Order tracking number did not update")
  requireCondition(["paid", "cod_collected"].includes(confirmedOrder.paymentStatus), "Order payment status did not update after full payment")
  requireCondition(Number(confirmedOrder.balanceDue) === 0, "Order balanceDue did not reach zero")
  requireCondition(
    confirmedOrder.statusHistory?.some((item) => item.status === "confirmed" && item.note === `Smoke lifecycle confirm ${suffix}`),
    "Order status history did not include confirmed transition",
  )

  await step("order status and payment domain events", async () => {
    const events = await request(`/domain-events/order/${order.id}`, tokens.workspace)
    const statusEvent = requireEvent(events, "order.status_changed")
    const paymentEvent = requireEvent(events, "order.payment_updated")
    requireCondition(statusEvent.payload?.status === "confirmed", "Order status event missing confirmed payload")
    requireCondition(Number(paymentEvent.payload?.balanceDue) === 0, "Order payment event missing zero balance payload")
    return events
  })

  const codCollectedOrder = await step("workspace order COD collection lifecycle", () =>
    request(`/orders/${order.id}/lifecycle`, tokens.workspace, {
      method: "PUT",
      body: JSON.stringify({
        status: "cod_collected",
        note: `Smoke COD collected ${suffix}`,
      }),
    }),
  )
  requireCondition(codCollectedOrder.status === "cod_collected", "Order status did not update to cod_collected")
  requireCondition(codCollectedOrder.paymentStatus === "cod_collected", "Order payment status did not update to cod_collected")
  requireCondition(codCollectedOrder.codCollectedAt, "Order codCollectedAt was not set")

  await step("customer timeline includes message and order events", async () => {
    const timeline = await request(`/domain-events/customers/${smokeCustomerId}/timeline`, tokens.workspace)
    requireEvent(timeline, "message.sent")
    requireEvent(timeline, "order.created")
    requireEvent(timeline, "order.status_changed")
    return timeline
  })

  await step("auth logout supervisor", () => request("/auth/logout", tokens.supervisor, { method: "POST" }))
}

main()
  .then(async () => {
    await cleanup()
    console.log("API smoke completed")
  })
  .catch(async (error) => {
    console.error(`fail ${error.message}`)
    await cleanup()
    process.exit(1)
  })
