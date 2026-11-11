"use client"

import { MessagesSquare } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"
import { useI18n } from "@/components/providers/i18n-provider"

export default function ConversationReportPage() {
  const { t } = useI18n()
  return (
    <BusinessReportPage
      title={t("workspace.reportPages.conversationReport")}
      description={t("workspace.reportPages.understandChatVolumeOpenWork")}
      report="conversations"
      icon={MessagesSquare}
      fileName="conversation-report.csv"
    />
  )
}
