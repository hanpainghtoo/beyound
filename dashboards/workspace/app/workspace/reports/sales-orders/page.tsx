"use client"

import { BarChart3 } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"
import { useI18n } from "@/components/providers/i18n-provider"

export default function SalesOrdersReportPage() {
  const { t } = useI18n()
  return (
    <BusinessReportPage
      title={t("workspace.reportPages.salesOrdersReport")}
      description={t("workspace.reportPages.trackOrdersCreatedFromConversations")}
      report="sales-orders"
      icon={BarChart3}
      fileName="sales-orders-report.csv"
    />
  )
}
