"use client"

import { UsersRound } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"
import { useI18n } from "@/components/providers/i18n-provider"

export default function CustomerReportPage() {
  const { t } = useI18n()
  return (
    <BusinessReportPage
      title={t("workspace.reportPages.customerReport")}
      description={t("workspace.reportPages.understandCustomerGrowthActiveCustomers")}
      report="customers"
      icon={UsersRound}
      fileName="customer-report.csv"
    />
  )
}
