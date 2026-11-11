"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { agentMediaApi, type AgentOrderDto } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"
type ProofState = { status: "loading" | "ready" | "error"; url?: string }
export function ProofViewer({ order }: { order: AgentOrderDto }) {
  const { t } = useI18n()
  const proofs = (order.attachments ?? []).filter((item) => item.role === "payment_proof")
  const [states, setStates] = useState<Record<string, ProofState>>({})
  const load = (key: string, fileId: string) => { setStates((current) => ({ ...current, [key]: { status: "loading" } })); void agentMediaApi.download(fileId, "order-payment-proof").then((result) => setStates((current) => ({ ...current, [key]: { status: "ready", url: result.download.url } }))).catch(() => setStates((current) => ({ ...current, [key]: { status: "error" } }))) }
  useEffect(() => { const next: Record<string, ProofState> = {}; for (const [index, item] of proofs.entries()) { const fileId = typeof item.fileId === "string" ? item.fileId : null; if (fileId) { const key = `${fileId}-${index}`; next[key] = { status: "loading" }; load(key, fileId) } } setStates((current) => ({ ...current, ...next })); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.attachments])
  if (!proofs.length) return <p className="text-sm text-muted-foreground">{t("workspace.orders.proofViewer.noProof")}</p>
  return <div className="space-y-2"><p className="text-xs text-muted-foreground">{t("workspace.orders.proofViewer.proofCount", { count: proofs.length })}</p><div className="flex flex-wrap gap-2">{proofs.map((item, index) => { const fileId = typeof item.fileId === "string" ? item.fileId : null; const key = `${fileId}-${index}`; const state = states[key]; const contentType = typeof item.contentType === "string" ? item.contentType : ""; if (!fileId) return <p key={key} className="text-sm text-destructive">{t("workspace.orders.proofViewer.invalidAttachment")}</p>; if (!state || state.status === "loading") return <div key={key} className="h-20 w-20 animate-pulse rounded-md border bg-muted" aria-label={t("workspace.orders.proofViewer.loadingProof")} />; if (state.status === "error") return <div key={key} className="rounded-md border p-2 text-xs"><p>{t("workspace.orders.proofViewer.loadFailed")}</p><Button size="sm" variant="outline" onClick={() => load(key, fileId)}>{t("common.retry")}</Button></div>; return <a key={key} href={state.url} target="_blank" rel="noreferrer" className="block">{contentType === "application/pdf" ? <span className="inline-flex h-20 w-28 items-center justify-center rounded-md border text-xs">{t("workspace.orders.proofViewer.openPdf")}</span> : <img src={state.url} alt={t("workspace.orders.proofViewer.proofAlt")} className="h-20 w-20 rounded-md border object-cover" />}</a> })}</div></div>
}
