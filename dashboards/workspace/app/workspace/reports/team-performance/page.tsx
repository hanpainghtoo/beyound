"use client";

import { useCallback } from "react";
import { ReportClient, StatCard, DataTable } from "../_components/report-client";
import { useFormatters } from "@/lib/formatters";
import { useI18n } from "@/components/providers/i18n-provider";
import { reportsApi, type TeamPerformanceReport, type ReportPeriod } from "@/lib/api";

function TeamPerformanceContent({ data }: { data: TeamPerformanceReport }) {
  const { t } = useI18n();
  const { currency: formatCurrency } = useFormatters();
  const { agents } = data;
  const totalOrders = agents.reduce((s, a) => s + a.totalOrders, 0);
  const totalRevenue = agents.reduce((s, a) => s + a.totalRevenue, 0);
  const totalMessages = agents.reduce((s, a) => s + a.messagesSent, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("workspace.reports.totalAgents")} value={agents.length} />
        <StatCard label="Total Orders" value={totalOrders} />
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} />
        <StatCard label="Total Messages" value={totalMessages} />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.agentPerformance")}</h3>
        <DataTable
          columns={["Agent", "Role", "Orders", "Paid", "Revenue", "Collected", "Conversations", "Messages"]}
          rows={agents.map((a) => [
            a.name,
            a.role,
            a.totalOrders,
            a.paidOrders,
            formatCurrency(a.totalRevenue),
            formatCurrency(a.totalCollected),
            a.totalConversations,
            a.messagesSent,
          ])}
        />
      </div>
    </div>
  );
}

export default function TeamPerformanceReportPage() {
  const fetcher = useCallback((period: ReportPeriod) => reportsApi.teamPerformance(period), []);
  return (
    <ReportClient
      title="Team Performance Report"
      description="Agent response time, order creation to paid, and rankings."
      fetcher={fetcher}
    >
      {(data) => <TeamPerformanceContent data={data} />}
    </ReportClient>
  );
}
