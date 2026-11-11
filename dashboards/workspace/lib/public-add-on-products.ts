import { isServerConfigurationError, resolveCoreApiBaseUrl } from "../../shared/server-core-api-config.js"

export type PublicAddOnComponent = {
  id: string
  componentType: "inbound_messages" | "outbound_messages" | "channel_slots" | "storage_gb"
  quantity: number
  unit: "messages" | "requests" | "channels" | "gb"
  displayOrder: number
}

export type PublicAddOnProduct = {
  id: string
  name: string
  description?: string | null
  price: number
  currency: string
  components: PublicAddOnComponent[]
}

export type DisplayAddOnComponent = PublicAddOnComponent & {
  label: string
  displayQuantity: string
}

export type DisplayAddOnProduct = PublicAddOnProduct & {
  description: string
  priceDisplay: string
  componentList: DisplayAddOnComponent[]
}

const COMPONENT_LABELS: Record<PublicAddOnComponent["componentType"], string> = {
  inbound_messages: "Inbound messages",
  outbound_messages: "Outbound messages",
  channel_slots: "Channels",
  storage_gb: "Storage",
}

function formatQuantity(quantity: number, unit: PublicAddOnComponent["unit"]) {
  if (!Number.isFinite(quantity) || quantity < 0) return "Custom"
  const formatted = quantity.toLocaleString()
  return unit === "gb" ? `${formatted} GB` : `${formatted} ${unit}`
}

function formatPrice(price: number, currency: string) {
  if (!Number.isFinite(price) || price <= 0 || !currency.trim()) return "Pricing unavailable"
  return `${currency.trim()} ${price.toLocaleString()}`
}

export function toDisplayAddOnProduct(product: PublicAddOnProduct): DisplayAddOnProduct {
  return {
    ...product,
    description: product.description?.trim() || "Additional capacity for your active subscription period.",
    priceDisplay: formatPrice(Number(product.price), product.currency),
    componentList: [...(product.components || [])]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((component) => ({
        ...component,
        label: COMPONENT_LABELS[component.componentType] || component.componentType,
        displayQuantity: formatQuantity(Number(component.quantity), component.unit),
      })),
  }
}

export async function fetchPublicAddOnProducts(): Promise<DisplayAddOnProduct[]> {
  let apiBaseUrl: string
  try {
    apiBaseUrl = resolveCoreApiBaseUrl(process.env)
  } catch (error) {
    if (isServerConfigurationError(error)) {
      console.error(`[workspace-public-add-on-products] ${error.message}`)
      throw new Error("Live add-on catalog is temporarily unavailable.", { cause: error })
    }
    throw error
  }

  const response = await fetch(`${apiBaseUrl}/public/add-on-products`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Unable to load public add-on products (${response.status})`)
  }

  const payload = (await response.json()) as PublicAddOnProduct[]
  return payload.map(toDisplayAddOnProduct)
}
