"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Wallet,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConsoleHeader, ConsolePage, ConsoleSection } from "@/components/platform-console-shell"
import { toast } from "sonner"
import {
  activatePlatformBillingAccount,
  createPlatformBillingAccount,
  deactivatePlatformBillingAccount,
  getPlatformBillingAccounts,
  getPlatformMediaDownloadUrl,
  getStoredSession,
  updatePlatformBillingAccount,
  uploadPlatformMedia,
  PlatformApiError,
  type BillingAccountDto,
  type BillingAccountType,
  type PaginatedResult,
} from "@/lib/api"

const PAGE_SIZE = 10
const IMAGE_PURPOSE = "platform-billing-account"

const canManageAccounts = (role?: string) =>
  role === "super_admin" || role === "ops_admin"

const typeLabels: Record<BillingAccountType, string> = {
  bank_account: "Bank account",
  digital_wallet: "Digital wallet",
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

function maskValue(value: string | null | undefined) {
  const trimmed = (value || "").trim()
  if (!trimmed) return "-"
  if (trimmed.length <= 4) return `****${trimmed}`
  return `****${trimmed.slice(-4)}`
}

type AccountFormState = {
  accountName: string
  type: BillingAccountType
  accountNo: string
  phno: string
  qrFileId: string
  qrFileName: string
  iconFileId: string
  iconFileName: string
  isPublic: boolean
}

const emptyForm: AccountFormState = {
  accountName: "",
  type: "bank_account",
  accountNo: "",
  phno: "",
  qrFileId: "",
  qrFileName: "",
  iconFileId: "",
  iconFileName: "",
  isPublic: true,
}

function formFromAccount(account: BillingAccountDto) {
  return {
    accountName: account.accountName,
    type: account.type,
    accountNo: account.accountNo || "",
    phno: account.phno || "",
    qrFileId: account.qr ?? "",
    qrFileName: account.qr ? "Current QR image" : "",
    iconFileId: account.icon ?? "",
    iconFileName: account.icon ? "Current logo" : "",
    isPublic: account.isPublic,
  }
}

function validateForm(form: AccountFormState) {
  if (!form.accountName.trim()) return "Account name is required."
  if (!form.type) return "Account type is required."
  if (form.type === "bank_account" && !form.accountNo.trim()) {
    return "Account number is required for bank accounts."
  }
  if (form.type === "digital_wallet") {
    if (!form.phno.trim()) return "Phone number is required for digital wallets."
    if (!form.qrFileId.trim()) return "A QR image is required for digital wallets."
  }
  return ""
}


export default function BillingAccountsPage() {
  const [result, setResult] = useState<PaginatedResult<BillingAccountDto> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [role, setRole] = useState<string>()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<BillingAccountType | "all">("all")
  const [publicFilter, setPublicFilter] = useState<"all" | "public" | "private">("all")
  const [includeInactive, setIncludeInactive] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BillingAccountDto | null>(null)
  const [form, setForm] = useState<AccountFormState>(emptyForm)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  const [qrUploading, setQrUploading] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState<BillingAccountDto | null>(null)
  const [deactivateError, setDeactivateError] = useState("")
  const [deactivating, setDeactivating] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [imageCache, setImageCache] = useState<Map<string, string | null>>(new Map())
  const imageCacheRef = useRef<Map<string, string | null>>(new Map())
  const inflightRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    imageCacheRef.current = imageCache
  }, [imageCache])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    setPermissionDenied(false)
    try {
      setResult(
        await getPlatformBillingAccounts({
          page,
          limit: PAGE_SIZE,
          search,
          type: typeFilter,
          isPublic: publicFilter === "all" ? "all" : publicFilter === "public",
          includeInactive,
        }),
      )
    } catch (requestError) {
      if (requestError instanceof PlatformApiError && requestError.status === 403) {
        setPermissionDenied(true)
      }
      setError(errorMessage(requestError, "Billing accounts could not be loaded."))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [includeInactive, page, publicFilter, search, typeFilter])

  useEffect(() => {
    setRole(getStoredSession()?.user.role)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    void load()
  }, [load])

  const isFileId = useCallback((value: string) => {
    if (!value) return false
    // File ids are bare identifiers (e.g. file-123-abc); historic data stored
    // full objectKeys like "tenants/platform/file-.../logo.png" which contain
    // slashes. Those must not be fetched as ids — they break the proxy route
    // and always 404.
    return !value.includes('/') && !value.includes('\\')
  }, [])

  const prefetchImage = useCallback(
    async (fileId: string) => {
      if (!fileId) return
      if (imageCacheRef.current.has(fileId) || inflightRef.current.has(fileId)) return
      // Defensive: stale objectKey values (contain "/") are not valid file ids.
      // Cache them as null immediately so the UI shows the "no image"
      // placeholder instead of a stuck spinner and we avoid a malformed
      // GET /platform-admin/media/:id/download-url request (slashes would be
      // split into extra path segments if not encoded).
      if (!isFileId(fileId)) {
        setImageCache((current) => {
          if (current.has(fileId)) return current
          return new Map(current).set(fileId, null)
        })
        return
      }
      inflightRef.current.add(fileId)
      try {
        const signed = await getPlatformMediaDownloadUrl(fileId)
        setImageCache((current) => {
          if (current.has(fileId)) return current
          return new Map(current).set(fileId, signed.download.url)
        })
      } catch {
        setImageCache((current) => {
          if (current.has(fileId)) return current
          return new Map(current).set(fileId, null)
        })
      } finally {
        inflightRef.current.delete(fileId)
      }
    },
    [isFileId],
  )

  useEffect(() => {
    if (!result?.data?.length) return
    for (const account of result.data) {
      if (account.icon) void prefetchImage(account.icon)
      if (account.qr) void prefetchImage(account.qr)
    }
  }, [result, prefetchImage])

  useEffect(() => {
    if (form.iconFileId) void prefetchImage(form.iconFileId)
    if (form.qrFileId) void prefetchImage(form.qrFileId)
  }, [form.iconFileId, form.qrFileId, prefetchImage])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError("")
    setFormOpen(true)
  }

  const openEdit = (account: BillingAccountDto) => {
    setEditing(account)
    setForm(formFromAccount(account))
    setFormError("")
    setFormOpen(true)
  }

  const uploadImage = async (
    file: File | undefined,
    field: "icon" | "qr",
    setUploading: (uploading: boolean) => void,
  ) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.")
      return
    }

    setUploading(true)
    try {
      const signed = await uploadPlatformMedia(file, IMAGE_PURPOSE)
      const fileId = signed.file.id
      setForm((current) => ({
        ...current,
        [`${field}FileId`]: fileId,
        [`${field}FileName`]: file.name,
      }))
      void prefetchImage(fileId)
      toast.success("Image uploaded")
    } catch (requestError) {
      toast.error(errorMessage(requestError, "Image upload failed."))
    } finally {
      setUploading(false)
    }
  }

  const submitForm = async () => {
    const validationMessage = validateForm(form)
    if (validationMessage) {
      setFormError(validationMessage)
      return
    }

    const payload: Record<string, unknown> = {
      accountName: form.accountName.trim(),
      type: form.type,
      isPublic: form.isPublic,
    }

    if (form.type === "bank_account") {
      payload.accountNo = form.accountNo.trim()
    } else {
      payload.phno = form.phno.trim()
      payload.qr = form.qrFileId || undefined
    }

    if (form.iconFileId) payload.icon = form.iconFileId

    setSaving(true)
    setFormError("")
    try {
      if (editing) {
        await updatePlatformBillingAccount(editing.id, payload)
        toast.success("Billing account updated")
      } else {
        await createPlatformBillingAccount(payload as never)
        toast.success("Billing account created")
      }
      setFormOpen(false)
      setEditing(null)
      await load()
    } catch (requestError) {
      setFormError(errorMessage(requestError, "The billing account could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    setDeactivateError("")
    try {
      await deactivatePlatformBillingAccount(deactivateTarget.id)
      toast.success("Billing account deactivated")
      setDeactivateTarget(null)
      await load()
    } catch (requestError) {
      setDeactivateError(errorMessage(requestError, "The billing account could not be deactivated."))
    } finally {
      setDeactivating(false)
    }
  }

  const handleActivate = async (account: BillingAccountDto) => {
    setActivatingId(account.id)
    try {
      await activatePlatformBillingAccount(account.id)
      toast.success("Billing account activated")
      await load()
    } catch (requestError) {
      toast.error(errorMessage(requestError, "The billing account could not be activated."))
    } finally {
      setActivatingId(null)
    }
  }

  const accounts = result?.data ?? []
  const total = result?.total ?? 0
  const totalPages = result?.totalPages ?? 1
  const hasNext = result?.hasNext ?? false
  const hasPrev = result?.hasPrev ?? false

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Billing Accounts"
        description="Manage the company's payment-receiving bank accounts and digital wallets shown to merchants during subscribe and upgrade flows."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={openCreate}
              disabled={!canManageAccounts(role)}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add account
            </Button>
          </div>
        }
      />

      <ConsolePage>
        <ConsoleSection
          title="Payment accounts"
          description="Bank accounts and digital wallets used to collect subscription payments."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search account name"
                  aria-label="Search billing accounts"
                  className="w-56 border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500"
                />
              </div>
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value as BillingAccountType | "all")
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[160px] border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="bank_account">Bank account</SelectItem>
                  <SelectItem value="digital_wallet">Digital wallet</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={publicFilter}
                onValueChange={(value) => {
                  setPublicFilter(value as "all" | "public" | "private")
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[150px] border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All visibility</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                <Switch
                  checked={includeInactive}
                  onCheckedChange={(checked) => {
                    setIncludeInactive(checked)
                    setPage(1)
                  }}
                  aria-label="Show inactive accounts"
                />
                Show inactive
              </label>
            </div>
          }
        >
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <Table>
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Icon</TableHead>
                  <TableHead className="text-slate-300">Account</TableHead>
                  <TableHead className="text-slate-300">Type</TableHead>
                  <TableHead className="text-slate-300">Number</TableHead>
                  <TableHead className="text-slate-300">Visibility</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Created</TableHead>
                  <TableHead className="text-right text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                      Loading billing accounts...
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-rose-200">
                      {permissionDenied
                        ? "Your platform role cannot view billing accounts."
                        : error}
                    </TableCell>
                  </TableRow>
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                      <Wallet className="mx-auto mb-3 h-6 w-6" />
                      {total === 0
                        ? "No billing accounts have been created yet."
                        : "No billing accounts match these filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => {
                    const iconSrc = account.icon ? imageCache.get(account.icon) ?? null : null
                    const hasIcon = Boolean(account.icon)
                    const isIconLoading = hasIcon && !imageCache.has(account.icon as string)
                    return (
                      <TableRow key={account.id} className="border-white/10 hover:bg-white/5">
                        <TableCell>
                          {iconSrc ? (
                            <img
                              key={`icon-${account.id}-${iconSrc}`}
                              src={iconSrc}
                              alt={`${account.accountName} logo`}
                              className="h-9 w-9 rounded-lg border border-white/10 bg-slate-950/60 object-contain"
                            />
                          ) : isIconLoading ? (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-slate-950/60 text-slate-500">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            </span>
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-slate-950/60 text-slate-500">
                              <Wallet className="h-4 w-4" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-white">{account.accountName}</p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              account.type === "bank_account"
                                ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
                                : "border-violet-400/30 bg-violet-500/10 text-violet-100"
                            }
                          >
                            {typeLabels[account.type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-slate-300">
                          {account.type === "bank_account"
                            ? maskValue(account.accountNo)
                            : maskValue(account.phno)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              account.isPublic
                                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                : "border-white/10 bg-white/5 text-slate-300"
                            }
                          >
                            {account.isPublic ? "Public" : "Private"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              account.isActive
                                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                : "border-rose-400/30 bg-rose-500/10 text-rose-200"
                            }
                          >
                            {account.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-300">
                          {new Date(account.createdDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(account)}
                              disabled={!canManageAccounts(role)}
                              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                            {account.isActive ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setDeactivateTarget(account)
                                  setDeactivateError("")
                                }}
                                disabled={!canManageAccounts(role)}
                                className="border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                              >
                                <ShieldOff className="mr-2 h-4 w-4" />
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleActivate(account)}
                                disabled={!canManageAccounts(role) || activatingId === account.id}
                                className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                              >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {activatingId === account.id ? "Activating..." : "Activate"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && !error && totalPages > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                Page {page} of {totalPages} · {total} account{total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!hasPrev || loading}
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasNext || loading}
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </ConsoleSection>
      </ConsolePage>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false)
            setEditing(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit billing account" : "Add billing account"}</DialogTitle>
            <DialogDescription className="text-slate-300">
              These accounts are shown to merchants so they know where to send subscription
              payments.
            </DialogDescription>
          </DialogHeader>

          {formError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{formError}</p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-300">Account name</Label>
              <Input
                value={form.accountName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, accountName: event.target.value }))
                }
                placeholder="e.g. KBZPay Business"
                className="border-white/10 bg-slate-950/40"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Account type</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    type: value as BillingAccountType,
                  }))
                }
              >
                <SelectTrigger className="border-white/10 bg-slate-950/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_account">Bank account</SelectItem>
                  <SelectItem value="digital_wallet">Digital wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === "bank_account" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-slate-300">Account number</Label>
                <Input
                  value={form.accountNo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, accountNo: event.target.value }))
                  }
                  placeholder="Keep leading zeroes as written"
                  className="border-white/10 bg-slate-950/40"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-300">Phone number</Label>
                  <Input
                    value={form.phno}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, phno: event.target.value }))
                    }
                    placeholder="Wallet phone number"
                    className="border-white/10 bg-slate-950/40"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-300">QR image</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="billing-qr-upload"
                      onChange={(event) => {
                        void uploadImage(event.target.files?.[0], "qr", setQrUploading)
                        event.target.value = ""
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={qrUploading || saving}
                      onClick={() => document.getElementById("billing-qr-upload")?.click()}
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                    >
                      {qrUploading ? "Uploading..." : "Upload QR"}
                    </Button>
                    {form.qrFileId ? (
                      imageCache.has(form.qrFileId) ? (
                        imageCache.get(form.qrFileId) ? (
                          <img
                            key={`form-qr-${form.qrFileId}-${imageCache.get(form.qrFileId)}`}
                            src={imageCache.get(form.qrFileId) as string}
                            alt="QR preview"
                            className="h-16 w-16 rounded-lg border border-white/10 bg-slate-950/60 object-contain"
                          />
                        ) : (
                          <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/10 bg-slate-950/60 text-slate-500" title="Image not available — re-upload to replace">
                            <Wallet className="h-5 w-5" />
                          </span>
                        )
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/10 bg-slate-950/60 text-slate-500">
                          <RefreshCw className="h-5 w-5 animate-spin" />
                        </span>
                      )
                    ) : (
                      <p className="text-sm text-slate-500">Required for digital wallets.</p>
                    )}
                    {form.qrFileName ? (
                      <p className="text-xs text-slate-500">{form.qrFileName}</p>
                    ) : null}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-slate-300">Icon (optional)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="billing-icon-upload"
                  onChange={(event) => {
                    void uploadImage(event.target.files?.[0], "icon", setIconUploading)
                    event.target.value = ""
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={iconUploading || saving}
                  onClick={() => document.getElementById("billing-icon-upload")?.click()}
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  {iconUploading ? "Uploading..." : "Upload icon"}
                </Button>
                {form.iconFileId ? (
                  imageCache.has(form.iconFileId) ? (
                    imageCache.get(form.iconFileId) ? (
                      <img
                        key={`form-icon-${form.iconFileId}-${imageCache.get(form.iconFileId)}`}
                        src={imageCache.get(form.iconFileId) as string}
                        alt="Icon preview"
                        className="h-12 w-12 rounded-lg border border-white/10 bg-slate-950/60 object-contain"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-slate-950/60 text-slate-500" title="Image not available — re-upload to replace">
                        <Wallet className="h-4 w-4" />
                      </span>
                    )
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-slate-950/60 text-slate-500">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    </span>
                  )
                ) : (
                  <p className="text-sm text-slate-500">Shown next to the account name.</p>
                )}
                {form.iconFileName ? (
                  <p className="text-xs text-slate-500">{form.iconFileName}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 sm:col-span-2">
              <div>
                <p className="text-sm font-medium text-white">Public</p>
                <p className="text-sm text-slate-400">
                  Public accounts are visible to merchants in subscribe and upgrade flows.
                </p>
              </div>
              <Switch
                checked={form.isPublic}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isPublic: checked }))
                }
                aria-label="Public visibility"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitForm()}
              disabled={saving || iconUploading || qrUploading}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null)
        }}
      >
        <DialogContent className="border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>Deactivate billing account</DialogTitle>
            <DialogDescription className="text-slate-300">
              The account will be hidden from merchants but its record is kept for payment
              history. You can re-enable it later by editing it.
            </DialogDescription>
          </DialogHeader>
          {deactivateError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{deactivateError}</p>
            </div>
          ) : null}
          <p className="text-sm text-slate-300">
            {deactivateTarget
              ? `Deactivate "${deactivateTarget.accountName}"?`
              : "Deactivate this account?"}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmDeactivate()}
              disabled={deactivating}
              className="bg-rose-500 text-white hover:bg-rose-400"
            >
              {deactivating ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
