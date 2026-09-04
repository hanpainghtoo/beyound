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
  const [days, setDays] = useState(30)
  const [result, setResult] = useState<ReportResult>({ kpis: [], table: { columns: [], rows: [] } })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setIsLoading(true)
    setError("")
    loadReport(report, days)
      .then(setResult)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Unable to load report")))
      .finally(() => setIsLoading(false))
  }, [days, report])

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
        eyebrow="Reports"
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/workspace/reports">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All reports
              </Link>
            </Button>
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={table.rows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <WorkspacePage containerClassName="max-w-7xl">
        {error ? <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">{error}</div> : null}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {kpis.map((kpi) => (
            <WorkspaceStatCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              note={kpi.note}
              icon={icon}
              tone={kpi.tone}
            />
          ))}
        </div>

        <WorkspaceSection
          title="Report records"
          description="Business-readable workspace activity for the selected period."
          action={<Badge variant="secondary">{table.rows.length} records</Badge>}
        >
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Loading report data...</div>
          ) : error ? (
            <WorkspaceEmptyState
              icon={FileText}
              title="Report records are unavailable"
              description="Please refresh or try again later."
            />
          ) : table.rows.length === 0 ? (
            <WorkspaceEmptyState
              icon={FileText}
              title="No records found for this period."
              description="Business activity will appear here when records are available for this period."
            />
          ) : (
            <div>
              <p className="mb-2 text-xs text-slate-500 sm:hidden">Swipe horizontally to see more columns →</p>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <Table className="min-w-[720px]">
                <TableHeader className="bg-slate-50 dark:bg-slate-900">
                  <TableRow>
                    {table.columns.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
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
