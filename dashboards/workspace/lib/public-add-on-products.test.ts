import test from "node:test"
import assert from "node:assert/strict"

import { toDisplayAddOnProduct, type PublicAddOnProduct } from "./public-add-on-products"

function product(overrides: Partial<PublicAddOnProduct> = {}): PublicAddOnProduct {
  return {
    id: "product-1",
    name: "Message Boost",
    description: "More room for customer conversations.",
    price: 50000,
    currency: "MMK",
    components: [
      {
        id: "component-1",
        componentType: "inbound_messages",
        quantity: 1000,
        unit: "messages",
        displayOrder: 1,
      },
    ],
    ...overrides,
  }
}

test("renders add-on cards only from live catalog values", () => {
  const displayed = toDisplayAddOnProduct(product())

  assert.equal(displayed.description, "More room for customer conversations.")
  assert.equal(displayed.priceDisplay, "MMK 50,000")
  assert.deepEqual(displayed.componentList, [
    {
      id: "component-1",
      componentType: "inbound_messages",
      quantity: 1000,
      unit: "messages",
      displayOrder: 1,
      label: "Inbound messages",
      displayQuantity: "1,000 messages",
    },
  ])
})

test("does not fall back to a hardcoded price when catalog data is invalid", () => {
  const displayed = toDisplayAddOnProduct(product({ price: 0, description: " " }))

  assert.equal(displayed.priceDisplay, "Pricing unavailable")
  assert.equal(displayed.description, "Additional capacity for your active subscription period.")
})
