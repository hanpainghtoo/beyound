"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X } from "lucide-react";
import type { ReportPeriod, ReportDateRange } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api";
import { useI18n } from "@/components/providers/i18n-provider";
import { formatDateValue } from "@/lib/formatters";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const PERIOD_VALUES: ReportPeriod[] = ["weekly", "monthly", "yearly"];

type ReportClientProps<T> = {
  title: string;
  description?: string;
  fetcher: (period: ReportPeriod, dateRange?: ReportDateRange) => Promise<T>;
  children: (data: T, period: ReportPeriod) => React.ReactNode;
};

export function ReportClient<T>({ title, description, fetcher, children }: ReportClientProps<T>) {
      const { t, locale, translate } = useI18n();
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const effectiveDateRange: ReportDateRange | undefined = useMemo(() =>
    dateRange.from && dateRange.to
      ? { startDate: dateRange.from.toISOString(), endDate: dateRange.to.toISOString() }
      : undefined,
    [dateRange.from, dateRange.to],
  );

  const doFetch = useCallback(
    (p: ReportPeriod, dr?: ReportDateRange) => {
      let cancelled = false;
      setLoading(true);
      setLoadFailed(false);
      fetcher(p, dr)
        .then((res) => {
          if (!cancelled) setData(res);
        })
        .catch((err) => {
          if (!cancelled) {
            setLoadFailed(true);
            toast.error(getApiErrorMessage(err, t("workspace.reports.loadError")));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => { cancelled = true; };
    },
    [fetcher, t],
  );

  useEffect(() => {
    return doFetch(period, effectiveDateRange);
  }, [period, effectiveDateRange, doFetch]);

  const handleClearDates = () => {
    setDateRange({ from: undefined, to: undefined });
  };

  const dateLabel =
    dateRange.from && dateRange.to
      ? `${formatDateValue(dateRange.from, locale)} - ${formatDateValue(dateRange.to, locale)}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{translate(title)}</h1>
          {description && <p className="text-muted-foreground mt-1">{translate(description)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_VALUES.map((value) => (
                <SelectItem key={value} value={value}>{t(`workspace.reports.period.${value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[160px] max-w-[240px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateLabel || t("workspace.reports.pickDateRange")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                defaultMonth={dateRange.from}
                selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                onSelect={(range) => {
                  setDateRange({ from: range?.from, to: range?.to });
                  if (range?.from && range?.to) setCalendarOpen(false);
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {dateLabel && (
            <Button variant="ghost" size="icon" onClick={handleClearDates} title={t("workspace.reports.clearDates")}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {dateLabel && (
        <p className="text-sm text-muted-foreground">
          {t("workspace.reports.showingDataFrom", { range: dateLabel })}
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {loadFailed && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t("workspace.reports.loadFailed")}</CardContent>
        </Card>
      )}

      {!loading && !loadFailed && data && children(data, period)}
    </div>
  );
}

export function StatCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  const { translate } = useI18n();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{translate(label)}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {note && <p className="text-xs text-muted-foreground mt-1">{translate(note)}</p>}
      </CardContent>
    </Card>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  const { t, translate } = useI18n();
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 text-left font-medium text-muted-foreground">{translate(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{t("workspace.reports.noData")}</td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-3">{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
