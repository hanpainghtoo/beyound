"use client"

import { Truck } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"
import { useI18n } from "@/components/providers/i18n-provider"

export default function DeliveryReportPage() {
  const { t } = useI18n()
  return (
    <BusinessReportPage
      title={t("workspace.reportPages.deliveryReport")}
      description={t("workspace.reportPages.trackDeliveryStates")}
      report="deliveries"
      icon={Truck}
      fileName="delivery-report.csv"
    />
  )
}
