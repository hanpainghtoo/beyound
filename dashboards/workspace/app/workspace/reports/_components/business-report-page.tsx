"use client"

import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspaceEmptyState, WorkspacePage, WorkspaceSection, WorkspaceStatCard } from "@/components/workspace"
import { getApiErrorMessage } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"
import { toast } from "sonner"
import { loadReport, type ReportKind, type ReportResult } from "../report-data"

type BusinessReportPageProps = {
  title: string
  description: string
  report: ReportKind
  icon: LucideIcon
  fileName: string
}

export function BusinessReportPage({
  title,
  description,
  report,
  icon,
  fileName,
}: BusinessReportPageProps) {
  const { t, translate } = useI18n()
  const [days, setDays] = useState(30)
  const [result, setResult] = useState<ReportResult>({ kpis: [], table: { columns: [], rows: [] } })
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    setLoadFailed(false)
    loadReport(report, days)
      .then(setResult)
      .catch((requestError) => {
        setLoadFailed(true)
        toast.error(getApiErrorMessage(requestError, t("workspace.businessReport.unableLoad")))
      })
      .finally(() => setIsLoading(false))
  }, [days, report, t])

  const { kpis, table } = result
  const exportCsv = () => {
    const rows = [table.columns, ...table.rows]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.businessReport.eyebrow")}
        title={translate(title)}
        description={translate(description)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/workspace/reports">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("workspace.businessReport.allReports")}
              </Link>
            </Button>
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("workspace.businessReport.last7days")}</SelectItem>
                <SelectItem value="30">{t("workspace.businessReport.last30days")}</SelectItem>
                <SelectItem value="90">{t("workspace.businessReport.last90days")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={table.rows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {t("workspace.businessReport.exportCsv")}
            </Button>
          </div>
        }
      />

      <WorkspacePage containerClassName="max-w-7xl">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {kpis.map((kpi) => (
            <WorkspaceStatCard
              key={kpi.label}
              label={translate(kpi.label)}
              value={kpi.value}
              note={kpi.note ? translate(kpi.note) : undefined}
              icon={icon}
              tone={kpi.tone}
            />
          ))}
        </div>

        <WorkspaceSection
          title={t("workspace.businessReport.sectionTitle")}
          description={t("workspace.businessReport.sectionDescription")}
          action={<Badge variant="secondary">{t("workspace.businessReport.recordsBadge", { count: String(table.rows.length) })}</Badge>}
        >
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">{t("workspace.businessReport.loading")}</div>
          ) : loadFailed ? (
            <WorkspaceEmptyState
              icon={FileText}
              title={t("workspace.businessReport.unavailableTitle")}
              description={t("workspace.businessReport.unavailableDescription")}
            />
          ) : table.rows.length === 0 ? (
            <WorkspaceEmptyState
              icon={FileText}
              title={t("workspace.businessReport.emptyTitle")}
              description={t("workspace.businessReport.emptyDescription")}
            />
          ) : (
            <div>
              <p className="mb-2 text-xs text-slate-500 sm:hidden">{t("workspace.businessReport.swipeHint")}</p>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <Table className="min-w-[720px]">
                <TableHeader className="bg-slate-50 dark:bg-slate-900">
                  <TableRow>
                    {table.columns.map((column) => (
                      <TableHead key={column}>{translate(column)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.map((row, rowIndex) => (
                    <TableRow key={`${row[0]}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={`${cell}-${cellIndex}`} className={cellIndex === 0 ? "font-medium" : undefined}>
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </WorkspaceSection>
      </WorkspacePage>
    </>
  )
}
