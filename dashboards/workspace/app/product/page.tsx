import type { Metadata } from "next";

import { ProductPageClient } from "@/components/product-page-client";

export const metadata: Metadata = {
  title: "Product",
  description:
    "Explore the ZayOS Commerce Workspace for conversations, orders, deliveries, products, customers, media, saved replies, and performance.",
};

export default function ProductPage() {
  return <ProductPageClient />;
}
