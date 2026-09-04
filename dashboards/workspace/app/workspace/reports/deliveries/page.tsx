"use client"

import { Truck } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"

export default function DeliveryReportPage() {
  return (
    <BusinessReportPage
      title="Delivery Report"
      description="Track preparing, in-transit, delivered, failed, returned, and delayed fulfillment records."
      report="deliveries"
      icon={Truck}
      fileName="delivery-report.csv"
    />
  )
}
