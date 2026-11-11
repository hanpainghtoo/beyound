"use client"

import { Store } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"
import { useI18n } from "@/components/providers/i18n-provider"

export default function ProductReportPage() {
  const { t } = useI18n()
  return (
    <BusinessReportPage
      title={t("workspace.reportPages.productReport")}
      description={t("workspace.reportPages.understandProductDemandRequestsFrom")}
      report="products"
      icon={Store}
      fileName="product-report.csv"
    />
  )
}
