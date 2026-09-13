"use client"

import { Store } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"

export default function ProductReportPage() {
  return (
    <BusinessReportPage
      title="Product Report"
      description="Understand product demand, requests from conversations, orders, and inventory pressure."
      report="products"
      icon={Store}
      fileName="product-report.csv"
    />
  )
}
