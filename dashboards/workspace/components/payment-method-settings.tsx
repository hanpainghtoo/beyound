"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { getApiErrorMessage, getStoredSession, tenantPaymentMethodsApi, type WorkspacePaymentMethod, type WorkspacePaymentSettings } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]

/**
 * The only kinds the API accepts (chk_payment_method_kind). There is no cap
 * on how many methods a tenant may save — duplicate kinds are allowed, each
 * card carries its own active/inactive toggle.
 */
const BUILT_IN_KINDS = [{ kind: "kbzpay" }, { kind: "aya_pay" }] as const

const base = (kind: WorkspacePaymentMethod["kind"], order: number): WorkspacePaymentMethod => ({ kind, name: kind === "kbzpay" ? "KBZPay" : kind === "aya_pay" ? "AYA Pay" : "", enabled: false, displayOrder: order, accountName: "", accountNumber: "", qrMediaId: null, image: null })

export function PaymentMethodSettings({ showOnline = true, showBank = true }: { showOnline?: boolean; showBank?: boolean }) {
  // Empty on purpose. This used to seed four blank methods (two built-in plus
  // two placeholder "other" cards), so a tenant that had configured nothing
  // still saw four cards reading as if they had. `load()` now shows exactly
  // what the published version contains.
  const [state, setState] = useState<WorkspacePaymentSettings>({ version: null, methods: [] })
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState<number | null>(null)
  const [error, setError] = useState("")
  const fileInputs = useRef<Array<HTMLInputElement | null>>([])
  const { t } = useI18n()

  const load = useCallback(async () => {
    try {
      const data = await tenantPaymentMethodsApi.get()
      // Render only the published methods. No padding, no cap: whatever the
      // backend returns is the answer, including zero.
      setState({ ...data, methods: data.methods })
    } catch {
      setError(t("workspace.paymentMethods.errors.load"))
    } finally {
      setLoaded(true)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const sessionUser = getStoredSession()?.user
  const canEdit = state.canEdit ?? (["owner", "admin"].includes(sessionUser?.role || "") || sessionUser?.permissions?.["tenant.payment_methods.edit"] === true)
  if (loaded && !canEdit) return <Card className="workspace-card"><CardHeader><CardTitle>{t("workspace.paymentMethods.title")}</CardTitle><CardDescription>{t("workspace.paymentMethods.noPermission")}</CardDescription></CardHeader><CardContent><p className="text-sm text-slate-600 dark:text-slate-300">{t("workspace.paymentMethods.askOwner")} <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">tenant.payment_methods.edit</code>.</p></CardContent></Card>

  const update = (index: number, patch: Partial<WorkspacePaymentMethod>) => setState((current) => ({ ...current, methods: current.methods.map((method, i) => i === index ? { ...method, ...patch } : method) }))

  const addMethod = (kind: WorkspacePaymentMethod["kind"]) =>
    setState((current) => ({
      ...current,
      methods: [...current.methods, base(kind, current.methods.length)],
    }))

  const upload = async (index: number, file?: File) => {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) { setError(t("workspace.paymentMethods.errors.imageType")); return }
    if (file.size > MAX_IMAGE_BYTES) { setError(t("workspace.paymentMethods.errors.imageSize")); return }
    setError("")
    setUploading(index)
    try {
      const result = await tenantPaymentMethodsApi.uploadImage(file)
      update(index, { qrMediaId: result.fileId, image: result.downloadUrl ? { fileId: result.fileId, downloadUrl: result.downloadUrl, expiresAt: result.expiresAt } : null })
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t("workspace.paymentMethods.errors.upload")))
    } finally {
      setUploading(null)
      if (fileInputs.current[index]) fileInputs.current[index]!.value = ""
    }
  }

  const removeImage = (index: number) => update(index, { qrMediaId: null, image: null })
  const save = async () => {
    if (!state.methods.some((method) => method.enabled)) return toast.error(t("workspace.paymentMethods.errors.enableOne"))
    setSaving(true)
    setError("")
    try {
      const next = await tenantPaymentMethodsApi.save({ expectedVersion: state.version, methods: state.methods })
      setState(next)
      toast.success(t("workspace.paymentMethods.published"))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t("workspace.paymentMethods.errors.publish")))
    } finally { setSaving(false) }
  }

  const addable: Array<{ kind: WorkspacePaymentMethod["kind"] }> = [
    ...BUILT_IN_KINDS,
    { kind: "other" as const },
  ]

  return <Card className="workspace-card"><CardHeader><CardTitle>{t("workspace.paymentMethods.title")}</CardTitle><CardDescription>{t("workspace.paymentMethods.description")}</CardDescription></CardHeader><CardContent className="space-y-5">{error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<div className="flex flex-wrap items-center justify-between gap-3"><Badge variant="outline">{state.version ? `Published v${state.version}` : t("workspace.paymentMethods.noVersion")}</Badge>{state.publishedAt ? <span className="text-xs text-slate-500">{t("workspace.paymentMethods.lastChanged", { when: new Date(state.publishedAt).toLocaleString() })}</span> : null}</div>
    {state.methods.length === 0 ? (
      <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">{t("workspace.paymentMethods.empty")}</p>
    ) : null}
    <div className="grid gap-4 md:grid-cols-2">{state.methods.map((method, index) => { const __cat = (method.metadata?.category as string) ?? (method.kind === "other" ? "bank" : "online"); if ((__cat === "online" && !showOnline) || (__cat === "bank" && !showBank)) return null; return (<div key={`${method.id || method.kind}-${index}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="mb-4 flex items-center justify-between"><div><p className="font-semibold">{method.name || t("workspace.paymentMethods.addCustom")}</p><p className="text-xs text-slate-500">{method.kind === "other" ? t("workspace.paymentMethods.tenantDefined") : t("workspace.paymentMethods.builtIn")}</p></div><Switch checked={method.enabled} onCheckedChange={(checked) => update(index, { enabled: checked })} /></div>{method.kind === "other" ? <Field label={t("workspace.paymentMethods.fields.displayName")}><Input value={method.name || ""} onChange={(event) => update(index, { name: event.target.value })} /></Field> : null}<Field label={t("workspace.paymentMethods.fields.accountName")}><Input value={method.accountName} onChange={(event) => update(index, { accountName: event.target.value })} /></Field><Field label={t("workspace.paymentMethods.fields.accountNumber")}><Input value={method.accountNumber} onChange={(event) => update(index, { accountNumber: event.target.value })} /></Field><Field label={t("workspace.paymentMethods.fields.category")}><Select value={(method.metadata?.category as string) ?? (method.kind === "other" ? "bank" : "online")} onValueChange={(value) => update(index, { metadata: { ...(method.metadata || {}), category: value } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="online">{t("workspace.paymentMethods.categories.online")}</SelectItem><SelectItem value="bank">{t("workspace.paymentMethods.categories.bank")}</SelectItem></SelectContent></Select></Field><div className="mt-3 space-y-2"><Label className="text-xs">{t("workspace.paymentMethods.fields.paymentImage")}</Label><input ref={(element) => { fileInputs.current[index] = element }} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { void upload(index, event.target.files?.[0]) }} disabled={uploading !== null || saving} /><Button type="button" variant="outline" size="sm" onClick={() => fileInputs.current[index]?.click()} disabled={uploading !== null || saving}>{uploading === index ? t("workspace.paymentMethods.uploading") : t("workspace.paymentMethods.chooseImage")}</Button>{method.image?.downloadUrl ? <img src={method.image.downloadUrl} alt={`${method.name || t("workspace.paymentMethods.addCustom")} QR code`} className="h-32 w-32 rounded-lg border object-contain" onError={() => { void load() }} /> : method.qrMediaId ? <p className="text-xs text-amber-700">{t("workspace.paymentMethods.imagePending")}</p> : null}{method.qrMediaId ? <Button type="button" variant="outline" size="sm" onClick={() => removeImage(index)} disabled={uploading !== null || saving}>{t("workspace.paymentMethods.removeImage")}</Button> : null}<p className="text-xs text-slate-500">{t("workspace.paymentMethods.imageHint")}</p></div></div>)})}</div>
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t("workspace.paymentMethods.addMethod")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {addable.map((option) => (
            <DropdownMenuItem key={option.kind} onSelect={() => addMethod(option.kind)}>
              {t(option.kind === "other" ? "workspace.paymentMethods.addCustom" : `workspace.paymentMethods.builtInKind.${option.kind}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{t("workspace.paymentMethods.maskedNote")}</p><Button onClick={save} disabled={saving || uploading !== null || state.methods.length === 0}>{saving ? t("workspace.paymentMethods.publishing") : t("workspace.paymentMethods.saveAndPublish")}</Button></div></CardContent></Card>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="mt-3 space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div> }
