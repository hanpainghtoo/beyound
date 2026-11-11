"use client";

import { useCallback } from "react";
import { ReportClient, StatCard, DataTable } from "../_components/report-client";
import { useFormatters } from "@/lib/formatters";
import { useI18n } from "@/components/providers/i18n-provider";
import { reportsApi, type RevenueReport, type ReportPeriod } from "@/lib/api";

function RevenueContent({ data }: { data: RevenueReport }) {
  const { t } = useI18n();
  const { currency: formatCurrency } = useFormatters();
  const { summary, byChannel, byAgent, byProduct } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(summary.totalRevenue)} />
        <StatCard label="Total Paid" value={formatCurrency(summary.totalPaid)} />
        <StatCard label="Total Orders" value={summary.totalOrders} />
        <StatCard label="Avg Order Value" value={formatCurrency(summary.avgOrderValue)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.revenueByChannel")}</h3>
          <DataTable
            columns={["Channel", "Type", "Revenue", "Orders"]}
            rows={byChannel.map((c) => [c.channelName || "Direct", c.channelType, formatCurrency(c.revenue), c.orderCount])}
          />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.revenueByAgent")}</h3>
          <DataTable
            columns={["Agent", "Revenue", "Orders"]}
            rows={byAgent.map((a) => [a.agentName || "Unknown", formatCurrency(a.revenue), a.orderCount])}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.revenueByProduct")}</h3>
        <DataTable
          columns={["Product", "Revenue", "Sold", "Orders"]}
          rows={byProduct.map((p) => [p.productName, formatCurrency(p.revenue), p.totalSold, p.orderCount])}
        />
      </div>
    </div>
  );
}

export default function RevenueReportPage() {
  const fetcher = useCallback((period: ReportPeriod) => reportsApi.revenue(period), []);
  return (
    <ReportClient
      title="Revenue Report"
      description="Total revenue, by channels, agents, and products."
      fetcher={fetcher}
    >
      {(data) => <RevenueContent data={data} />}
    </ReportClient>
  );
}
