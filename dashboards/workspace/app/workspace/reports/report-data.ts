import {
  csrConversationsApi,
  csrCustomersApi,
  csrOrdersApi,
  csrProductsApi,
  type CsrConversationDto,
  type CsrCustomerDto,
  type CsrOrderDto,
  type CsrProductDto,
} from "@/lib/api"

export type ReportKpi = {
  label: string
  value: string
  note?: string
  tone: "indigo" | "blue" | "violet" | "emerald" | "amber" | "rose"
}

export type ReportTable = {
  columns: string[]
  rows: string[][]
}

export type ReportKind = "conversations" | "sales-orders" | "deliveries" | "customers" | "products" | "payments"

export type ReportResult = {
  kpis: ReportKpi[]
  table: ReportTable
}

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "Not recorded"
const formatCurrency = (amount: number | string, currency = "MMK") => `${currency} ${Number(amount || 0).toLocaleString()}`
const inPeriod = (value: string, days: number) => new Date(value).getTime() >= Date.now() - days * 86_400_000

function conversationReport(conversations: CsrConversationDto[]): ReportResult {
  const open = conversations.filter((item) => item.status === "open" || item.status === "pending").length
  const resolved = conversations.filter((item) => item.status === "resolved" || item.status === "closed").length
  const responseTimes = conversations
    .filter((item) => item.firstMessageAt && item.firstResponseAt)
    .map((item) => Math.max(0, new Date(item.firstResponseAt!).getTime() - new Date(item.firstMessageAt!).getTime()))
  const averageMinutes = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length / 60_000) : 0

  return {
    kpis: [
      { label: "Total conversations", value: String(conversations.length), note: "In the selected period", tone: "indigo" },
      { label: "Open conversations", value: String(open), note: "Need follow-up", tone: "amber" },
      { label: "Resolved conversations", value: String(resolved), note: conversations.length ? `${Math.round(resolved / conversations.length * 100)}% resolution rate` : "No conversations yet", tone: "emerald" },
      { label: "High priority", value: String(conversations.filter((item) => item.priority === "high" || item.priority === "urgent").length), note: "Priority queue", tone: "rose" },
      { label: "Average first response", value: responseTimes.length ? `${averageMinutes}m` : "Not available", note: "From recorded response timestamps", tone: "blue" },
    ],
    table: {
      columns: ["Created", "Customer", "Channel", "Subject", "Status", "Priority", "Last activity"],
      rows: conversations.map((item) => [
        formatDate(item.createdAt),
        item.customer?.fullName || "Customer",
        item.channel?.displayName || item.channel?.channelName || titleCase(item.channel?.channelType || "unknown"),
        item.subject || "No subject",
        titleCase(item.status),
        titleCase(item.priority),
        formatDate(item.lastMessageAt || item.updatedAt),
      ]),
    },
  }
}

function salesReport(orders: CsrOrderDto[], conversations: CsrConversationDto[]): ReportResult {
  const gross = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
  const currency = orders[0]?.currency || "MMK"
  const conversationOrders = orders.filter((order) => order.conversationId).length
  return {
    kpis: [
      { label: "Total orders", value: String(orders.length), note: "In the selected period", tone: "violet" },
      { label: "Orders from chat", value: String(conversationOrders), note: "Linked to a conversation", tone: "blue" },
      { label: "Gross order value", value: formatCurrency(gross, currency), note: "All loaded orders", tone: "emerald" },
      { label: "Average order value", value: formatCurrency(orders.length ? gross / orders.length : 0, currency), note: "Across loaded orders", tone: "indigo" },
      { label: "Pending orders", value: String(orders.filter((order) => order.status === "new" || order.status === "confirmed" || order.status === "preparing" || order.status === "packed").length), note: "Awaiting fulfillment", tone: "amber" },
      { label: "Delivered orders", value: String(orders.filter((order) => order.status === "delivered" || order.status === "cod_collected").length), note: "Completed deliveries", tone: "emerald" },
      { label: "Conversation conversion", value: conversations.length ? `${Math.round(conversationOrders / conversations.length * 100)}%` : "Not available", note: "Linked orders per conversation", tone: "blue" },
    ],
    table: {
      columns: ["Order", "Customer", "Amount", "Payment", "Fulfillment", "Created"],
      rows: orders.map((order) => [order.orderNumber, order.customer?.fullName || "Customer", formatCurrency(order.totalAmount, order.currency), titleCase(order.paymentStatus), titleCase(order.status), formatDate(order.createdAt)]),
    },
  }
}

function deliveryReport(orders: CsrOrderDto[]): ReportResult {
  const deliveries = orders.filter((order) => ["preparing", "packed", "out_for_delivery", "delivered", "cod_collected", "failed_delivery", "returned", "cancelled"].includes(order.status) || order.trackingNumber || order.deliveryAssigneeName)
  return {
    kpis: [
      { label: "Delivery records", value: String(deliveries.length), note: "In the selected period", tone: "blue" },
      { label: "Preparing", value: String(deliveries.filter((order) => order.status === "preparing" || order.status === "packed").length), note: "Ready for courier", tone: "indigo" },
      { label: "Out for delivery", value: String(deliveries.filter((order) => order.status === "out_for_delivery").length), note: "Active routes", tone: "amber" },
      { label: "Delivered", value: String(deliveries.filter((order) => order.status === "delivered" || order.status === "cod_collected").length), note: "Completed", tone: "emerald" },
      { label: "Failed / returned", value: String(deliveries.filter((order) => ["failed_delivery", "returned", "cancelled"].includes(order.status)).length), note: "Needs review", tone: "rose" },
    ],
    table: {
      columns: ["Order", "Customer", "Assignee", "Zone", "Tracking", "Status", "Created"],
      rows: deliveries.map((order) => [order.orderNumber, order.customer?.fullName || "Customer", order.deliveryAssigneeName || "Not assigned", order.deliveryZone || "Not recorded", order.trackingNumber || "Not recorded", titleCase(order.status), formatDate(order.createdAt)]),
    },
  }
}

function customerReport(customers: CsrCustomerDto[], orders: CsrOrderDto[], conversations: CsrConversationDto[], days: number): ReportResult {
  const orderMap = new Map<string, CsrOrderDto[]>()
  for (const order of orders) if (order.customerId) orderMap.set(order.customerId, [...(orderMap.get(order.customerId) || []), order])
  const activeIds = new Set([...orders.map((item) => item.customerId), ...conversations.map((item) => item.customerId)].filter(Boolean))
  return {
    kpis: [
      { label: "Total customers", value: String(customers.length), note: "Workspace customer base", tone: "indigo" },
      { label: "New customers", value: String(customers.filter((customer) => inPeriod(customer.createdAt, days)).length), note: "In the selected period", tone: "blue" },
      { label: "Active customers", value: String(activeIds.size), note: "Conversation or order activity", tone: "emerald" },
      { label: "Repeat customers", value: String([...orderMap.values()].filter((items) => items.length > 1).length), note: "Two or more orders", tone: "violet" },
      { label: "VIP customers", value: String(customers.filter((customer) => customer.tags.some((tag) => tag.toLowerCase() === "vip")).length), note: "Tagged VIP", tone: "amber" },
      { label: "Open conversations", value: String(conversations.filter((item) => item.status === "open" || item.status === "pending").length), note: "Need follow-up", tone: "rose" },
    ],
    table: {
      columns: ["Customer", "Contact", "Conversations", "Orders", "Total spent", "Status", "Last activity"],
      rows: customers.map((customer) => {
        const customerOrders = orderMap.get(customer.id) || []
        const currency = customerOrders[0]?.currency || "MMK"
        return [customer.fullName || "Customer", customer.phone || customer.email || "Not provided", String(customer.totalConversations), String(customerOrders.length), formatCurrency(customerOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0), currency), titleCase(customer.status), formatDate(customer.lastContactAt || customer.updatedAt)]
      }),
    },
  }
}

function productReport(products: CsrProductDto[]): ReportResult {
  const lowStock = products.filter((product) => product.trackInventory !== false && product.stockQuantity > 0 && product.stockQuantity <= (product.lowStockThreshold || 0)).length
  return {
    kpis: [
      { label: "Total products", value: String(products.length), note: "Catalog records", tone: "indigo" },
      { label: "Active products", value: String(products.filter((product) => product.status === "active").length), note: "Available for selling", tone: "emerald" },
      { label: "Low stock products", value: String(lowStock), note: "At or below threshold", tone: "amber" },
      { label: "Out of stock", value: String(products.filter((product) => product.status === "out_of_stock" || product.stockQuantity === 0).length), note: "Cannot fulfill now", tone: "rose" },
      { label: "Featured products", value: String(products.filter((product) => product.isFeatured).length), note: "Featured in catalog", tone: "blue" },
    ],
    table: {
      columns: ["Product", "SKU", "Category", "Stock", "Price", "Status", "Updated"],
      rows: products.map((product) => [product.name, product.sku || "No SKU", product.category?.name || "Uncategorized", product.trackInventory === false ? "Not tracked" : String(product.stockQuantity), formatCurrency(product.price), titleCase(product.status), formatDate(product.updatedAt)]),
    },
  }
}

function paymentReport(orders: CsrOrderDto[]): ReportResult {
  const currency = orders[0]?.currency || "MMK"
  const sum = (key: "totalAmount" | "paidAmount" | "balanceDue" | "codAmount") => orders.reduce((total, order) => total + Number(order[key] || 0), 0)
  return {
    kpis: [
      { label: "Total order value", value: formatCurrency(sum("totalAmount"), currency), note: "In the selected period", tone: "indigo" },
      { label: "Paid amount", value: formatCurrency(sum("paidAmount"), currency), note: "Collected", tone: "emerald" },
      { label: "COD pending", value: formatCurrency(orders.filter((order) => order.paymentStatus === "cod_pending").reduce((total, order) => total + Number(order.codAmount || order.balanceDue || 0), 0), currency), note: "Collect on delivery", tone: "amber" },
      { label: "Bank transfer review", value: String(orders.filter((order) => order.paymentMethod === "bank_transfer" && order.paymentStatus === "pending").length), note: "Needs confirmation", tone: "blue" },
      { label: "Outstanding balance", value: formatCurrency(sum("balanceDue"), currency), note: "Uncollected", tone: "rose" },
    ],
    table: {
      columns: ["Order", "Customer", "Amount", "Paid", "Balance", "Method", "Status", "Created"],
      rows: orders.map((order) => [order.orderNumber, order.customer?.fullName || "Customer", formatCurrency(order.totalAmount, order.currency), formatCurrency(order.paidAmount, order.currency), formatCurrency(order.balanceDue, order.currency), order.paymentMethod ? titleCase(order.paymentMethod) : "Not selected", titleCase(order.paymentStatus), formatDate(order.createdAt)]),
    },
  }
}

export async function loadReport(kind: ReportKind, days: number): Promise<ReportResult> {
  if (kind === "products") return productReport(await csrProductsApi.list())

  const [orders, conversations] = await Promise.all([csrOrdersApi.list(), csrConversationsApi.list({ filter: "all" })])
  const periodOrders = orders.filter((order) => inPeriod(order.createdAt, days))
  const periodConversations = conversations.filter((conversation) => inPeriod(conversation.createdAt, days))

  if (kind === "conversations") return conversationReport(periodConversations)
  if (kind === "sales-orders") return salesReport(periodOrders, periodConversations)
  if (kind === "deliveries") return deliveryReport(periodOrders)
  if (kind === "payments") return paymentReport(periodOrders)
  return customerReport(await csrCustomersApi.list(), periodOrders, periodConversations, days)
}
