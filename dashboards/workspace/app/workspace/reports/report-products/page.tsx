"use client";

import { useCallback } from "react";
import { ReportClient, StatCard, DataTable } from "../_components/report-client";
import { useFormatters } from "@/lib/formatters";
import { useI18n } from "@/components/providers/i18n-provider";
import { reportsApi, type ProductReport, type ReportPeriod } from "@/lib/api";

function ProductContent({ data }: { data: ProductReport }) {
  const { t } = useI18n();
  const { currency: formatCurrency } = useFormatters();
  const { products, stockHealth } = data;
  const totalSold = products.reduce((s, p) => s + p.totalSold, 0);
  const totalRevenue = products.reduce((s, p) => s + p.totalRevenue, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Products Sold" value={totalSold} />
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} />
        <StatCard label="Out of Stock" value={stockHealth.outOfStock} note={`${stockHealth.total} total products`} />
        <StatCard label="Low Stock" value={stockHealth.lowStock} />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">{t("workspace.reports.productSales")}</h3>
        <DataTable
          columns={["Product", "Sold", "Revenue", "Orders", "Order Rate"]}
          rows={products.map((p) => [
            p.productName,
            p.totalSold,
            formatCurrency(p.totalRevenue),
            p.orderCount,
            p.orderRate,
          ])}
        />
      </div>
    </div>
  );
}

export default function ProductReportPage() {
  const fetcher = useCallback((period: ReportPeriod) => reportsApi.products(period), []);
  return (
    <ReportClient
      title="Product Report"
      description="Product sales force, order rate, and out of stock rate."
      fetcher={fetcher}
    >
      {(data) => <ProductContent data={data} />}
    </ReportClient>
  );
}
