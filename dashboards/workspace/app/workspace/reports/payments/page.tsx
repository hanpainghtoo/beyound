"use client"

import { Banknote } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"

export default function PaymentReportPage() {
  return (
    <BusinessReportPage
      title="Payment/COD Report"
      description="Track COD collection, bank transfer review, paid amount, outstanding balance, and overdue confirmations."
      report="payments"
      icon={Banknote}
      fileName="payment-cod-report.csv"
    />
  )
}
