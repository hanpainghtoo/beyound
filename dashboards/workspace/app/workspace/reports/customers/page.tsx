"use client"

import { UsersRound } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"

export default function CustomerReportPage() {
  return (
    <BusinessReportPage
      title="Customer Report"
      description="Understand customer growth, active customers, repeat buying, VIP segments, and open customer conversations."
      report="customers"
      icon={UsersRound}
      fileName="customer-report.csv"
    />
  )
}
