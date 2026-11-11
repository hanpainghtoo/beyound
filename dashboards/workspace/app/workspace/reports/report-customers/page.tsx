"use client";

import { useCallback } from "react";
import { ReportClient, StatCard, DataTable } from "../_components/report-client";
import { useI18n } from "@/components/providers/i18n-provider";
import { reportsApi, type CustomerReport, type ReportPeriod } from "@/lib/api";

function CustomerContent({ data }: { data: CustomerReport }) {
  const { t } = useI18n();
  const { totalCustomers, newCustomers, segments, byChannel } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers" value={totalCustomers} />
        <StatCard label="New Customers" value={newCustomers} />
        <StatCard label="Cold (< 1 order)" value={segments.cold} />
        <StatCard label="Hot (>= 5 orders)" value={segments.hot} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.customerSegments")}</h3>
          <DataTable
            columns={["Segment", "Count"]}
            rows={[
              ["Cold (< 1 order)", segments.cold],
              ["Warm (1-4 orders)", segments.warm],
              ["Hot (>= 5 orders)", segments.hot],
            ]}
          />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.customersByChannel")}</h3>
          <DataTable
            columns={["Channel", "Type", "Customers"]}
            rows={byChannel.map((c) => [c.channelName || "Direct", c.channelType, c.customerCount])}
          />
        </div>
      </div>
    </div>
  );
}

export default function CustomerReportPage() {
  const fetcher = useCallback((period: ReportPeriod) => reportsApi.customers(period), []);
  return (
    <ReportClient
      title="Customer Report"
      description="New customers, segmentation, and customer types."
      fetcher={fetcher}
    >
      {(data) => <CustomerContent data={data} />}
    </ReportClient>
  );
}
