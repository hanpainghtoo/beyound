"use client"

import { BarChart3 } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"

export default function SalesOrdersReportPage() {
  return (
    <BusinessReportPage
      title="Sales & Orders Report"
      description="Track orders created from conversations, gross order value, fulfillment state, and chat-to-order conversion."
      report="sales-orders"
      icon={BarChart3}
      fileName="sales-orders-report.csv"
    />
  )
}
