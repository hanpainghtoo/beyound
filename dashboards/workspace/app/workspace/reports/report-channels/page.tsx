"use client";

import { useCallback } from "react";
import { ReportClient, StatCard, DataTable } from "../_components/report-client";
import { useFormatters } from "@/lib/formatters";
import { useI18n } from "@/components/providers/i18n-provider";
import { reportsApi, type ChannelReport, type ReportPeriod } from "@/lib/api";

function ChannelContent({ data }: { data: ChannelReport }) {
  const { t } = useI18n();
  const { currency: formatCurrency } = useFormatters();
  const { channels } = data;
  const totalInbound = channels.reduce((s, c) => s + c.inbound, 0);
  const totalOutbound = channels.reduce((s, c) => s + c.outbound, 0);
  const totalCustomers = channels.reduce((s, c) => s + c.customers, 0);
  const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Inbound Messages" value={totalInbound} />
        <StatCard label="Outbound Messages" value={totalOutbound} />
        <StatCard label="Total Customers" value={totalCustomers} />
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.channelPerformance")}</h3>
        <DataTable
          columns={["Channel", "Type", "Inbound", "Outbound", "Customers", "Revenue"]}
          rows={channels.map((c) => [
            c.channelName,
            c.channelType,
            c.inbound,
            c.outbound,
            c.customers,
            formatCurrency(c.revenue),
          ])}
        />
      </div>
    </div>
  );
}

export default function ChannelReportPage() {
  const fetcher = useCallback((period: ReportPeriod) => reportsApi.channels(period), []);
  return (
    <ReportClient
      title="Channel Report"
      description="Inbound/outbound, customers, revenue, and sales by channel."
      fetcher={fetcher}
    >
      {(data) => <ChannelContent data={data} />}
    </ReportClient>
  );
}
