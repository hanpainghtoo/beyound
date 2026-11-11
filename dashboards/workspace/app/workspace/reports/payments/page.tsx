"use client"

import { Banknote } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"
import { useI18n } from "@/components/providers/i18n-provider"

export default function PaymentReportPage() {
  const { t } = useI18n()
  return (
    <BusinessReportPage
      title={t("workspace.reportPages.paymentReport")}
      description={t("workspace.reportPages.trackPaymentReview")}
      report="payments"
      icon={Banknote}
      fileName="payment-report.csv"
    />
  )
}
