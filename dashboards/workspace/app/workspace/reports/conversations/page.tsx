"use client"

import { MessagesSquare } from "lucide-react"

import { BusinessReportPage } from "../_components/business-report-page"

export default function ConversationReportPage() {
  return (
    <BusinessReportPage
      title="Conversation Report"
      description="Understand chat volume, open work, unread conversations, first response time, and channel mix."
      report="conversations"
      icon={MessagesSquare}
      fileName="conversation-report.csv"
    />
  )
}
