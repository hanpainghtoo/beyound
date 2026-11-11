"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  Search as SearchIcon,
  TriangleAlert,
} from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { useI18n } from "@/components/providers/i18n-provider"
import { WorkspaceHeader } from "@/components/workspace-header"
import { BarcodeValue } from "@/components/barcode"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WorkspacePage, WorkspaceSplitView, WorkspaceStatStrip } from "@/components/workspace"
import {
  agentProductsApi,
  getApiErrorMessage,
  getStoredSession,
  type AgentMediaFileDto,
  type AgentProductCategoryDto,
  type AgentProductDto,
  type CreateAgentProductInput,
} from "@/lib/api"
import { toast } from "sonner"
import { productKeys, useAllProductCategories, useProductCategories, useProductStatusCounts, useProductsList } from "@/lib/queries/products"
import { useQueryClient } from "@tanstack/react-query"

const money = (value: number | string) => `MMK ${new Intl.NumberFormat("en").format(Number(value || 0))}`
type ProductSortKey = "name" | "sku" | "category" | "price" | "stockQuantity" | "status"

type ProductFormState = {
  name: string
  sku: string
  barcode: string
  type: "product" | "service"
  description: string
  shortDescription: string
  price: string
  stockQuantity: string
  lowStockThreshold: string
  status: AgentProductDto["status"]
  categoryId: string
  tags: string
  imageId: string
}

const defaultProductForm: ProductFormState = {
  name: "",
  sku: "",
  barcode: "",
  type: "product",
  description: "",
  shortDescription: "",
  price: "0",
  stockQuantity: "0",
  lowStockThreshold: "0",
  status: "active",
  categoryId: "",
  tags: "",
  imageId: "",
}

const isValidImageUrl = (value?: string | null) => {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:"
  } catch {
    return value.startsWith("/")
  }
}

const isGeneratedVerificationProduct = (product: AgentProductDto) => {
  const name = product.name.trim().toLowerCase()
  const sku = product.sku?.trim().toLowerCase() || ""
  const tags = product.tags?.map((tag) => tag.trim().toLowerCase()) || []

  return (
    name.startsWith("smoke product") ||
    name.startsWith("random product") ||
    name.startsWith("generated product") ||
    sku.startsWith("smoke-") ||
    sku.startsWith("random-") ||
    sku.startsWith("generated-") ||
    tags.includes("smoke") ||
    tags.includes("random") ||
    tags.includes("test") ||
    tags.includes("generated")
  )
}

const getReorderLevel = (product: AgentProductDto) => Number(product.lowStockThreshold ?? 5)

const isLowOrOutOfStock = (product: AgentProductDto) =>
  product.trackInventory === false
    ? false
    : product.status === "out_of_stock" || Number(product.stockQuantity || 0) <= getReorderLevel(product)

const getStockStatusLabel = (
  product: AgentProductDto,
  t: (key: string, values?: Record<string, string | number>) => string,
) => {
  if (product.status === "out_of_stock") return t("workspace.products.outOfStock")

  const stockQuantity = Number(product.stockQuantity || 0)
  return stockQuantity <= 0
    ? t("workspace.products.outOfStock")
    : t("workspace.products.lowStockLeft", { count: stockQuantity })
}

const createFormFromProduct = (product: AgentProductDto): ProductFormState => ({
  name: product.name,
  sku: product.sku || "",
  barcode: product.barcode || "",
  type: product.type || "product",
  description: product.description || "",
  shortDescription: product.shortDescription || "",
  price: String(product.price || 0),
  stockQuantity: String(product.stockQuantity || 0),
  lowStockThreshold: String(product.lowStockThreshold ?? 5),
  status: product.status,
  categoryId: product.category?.id || "",
  tags: (product.tags || []).join(", "),
  imageId: product.images?.[0] || "",
})

export default function ProductsPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const sessionRole = getStoredSession()?.user.role || "agent"
  const canManageCatalog = ["owner", "admin", "supervisor"].includes(sessionRole)
  // Categories — cached via the products domain keys (10-minute staleTime).
  const categoriesQuery = useProductCategories()
  const categories = categoriesQuery.data ?? []
  // Product images resolve server-side (primaryImageUrl/imageUrls).
  // mediaUrls stays only as a preview cache for newly picked, not-yet-saved
  // media IDs chosen via MediaPicker.
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "details">("list")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [sortKey, setSortKey] = useState<ProductSortKey>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  // "all" | "uncategorized" | <category id> — applied server-side because the
  // list is paginated, so a client-side filter would only hide the current page.
  const [categoryFilter, setCategoryFilter] = useState("all")
  // Stat-strip tabs double as the list filter. The four real statuses are sent
  // to the server, because the list is paginated and a client-side filter would
  // only ever see one page. "lowOrOut" is derived from stockQuantity versus each
  // product's own reorder threshold, which the endpoint has no status value for,
  // so it filters the loaded page and is labelled as such.
  const [statusTab, setStatusTab] = useState<"all" | "active" | "inactive" | "out_of_stock" | "lowOrOut">("all")
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isDisablingProduct, setIsDisablingProduct] = useState(false)
  const savingProductRef = useRef(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(defaultProductForm)
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false)
  const [attentionOpen, setAttentionOpen] = useState(true)
  // Category creation + management (owner/admin/supervisor only).
  const [isCategoryCreateOpen, setIsCategoryCreateOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDescription, setNewCategoryDescription] = useState("")
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [categoryNameDrafts, setCategoryNameDrafts] = useState<Record<string, string>>({})
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // Product count for the delete confirmation; null while unknown/failed so
  // the dialog never shows a number it could not verify.
  const [pendingDeleteCount, setPendingDeleteCount] = useState<number | null>(null)
  // Fetched only while the manage dialog is open; shares the categories key
  // prefix, so mutating either view invalidates both.
  const manageCategoriesQuery = useAllProductCategories(isManageCategoriesOpen)
  const manageCategories = manageCategoriesQuery.data ?? []

  // The server sorts by its whitelist; category-name sort falls back to the
  // server default (createdAt DESC).
  const serverSortBy =
    sortKey === "category"
      ? undefined
      : sortKey as "name" | "sku" | "price" | "stockQuantity" | "status"

  const listQuery = useProductsList({
    search: debouncedQuery.trim() || undefined,
    page,
    limit: pageSize,
    sortBy: serverSortBy,
    sortOrder: sortDirection === "asc" ? "ASC" : "DESC",
    categoryId: categoryFilter === "all" ? undefined : categoryFilter,
    // lowOrOut has no server-side equivalent, so it must not narrow the query
    // or the real statuses would be counted against a stock-filtered page.
    status: statusTab === "lowOrOut" || statusTab === "all" ? undefined : statusTab,
  })
  const isLoading = listQuery.isLoading
  const isFetchingPage = listQuery.isFetching && !listQuery.isLoading
  const serverTotal = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, listQuery.data?.totalPages ?? 1)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query)
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [query])

  const loadFailed = Boolean(
    (listQuery.error && !listQuery.data) || (categoriesQuery.error && !categoriesQuery.data),
  )
  const lastListToastRef = useRef<string | null>(null)
  const lastCategoriesToastRef = useRef<string | null>(null)

  useEffect(() => {
    if (listQuery.error && !listQuery.data) {
      const message = getApiErrorMessage(listQuery.error, t("workspace.products.unableLoad"))
      if (lastListToastRef.current !== message) {
        lastListToastRef.current = message
        toast.error(message)
      }
    }
    if (listQuery.data) {
      lastListToastRef.current = null
    }
  }, [listQuery.error, listQuery.data, t])

  const products = useMemo(
    () =>
      (listQuery.data?.data ?? []).filter(
        (product) => !isGeneratedVerificationProduct(product),
      ),
    [listQuery.data],
  )

  useEffect(() => {
    if (categoriesQuery.error && !categoriesQuery.data) {
      const message = getApiErrorMessage(categoriesQuery.error, t("workspace.products.unableLoad"))
      if (lastCategoriesToastRef.current !== message) {
        lastCategoriesToastRef.current = message
        toast.error(message)
      }
    }
    if (categoriesQuery.data) {
      lastCategoriesToastRef.current = null
    }
  }, [categoriesQuery.error, categoriesQuery.data, t])
  const lowStockProducts = useMemo(
    () =>
      products
        .filter(isLowOrOutOfStock)
        .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" })),
    [products],
  )
  const lowStock = lowStockProducts.length

  // Server-backed tabs narrow the query; lowOrOut cannot be, so it narrows the
  // page that already arrived. Everything else is applied before `selected`
  // is resolved so the detail pane never points at a hidden product.
  const visibleProducts = useMemo(
    () => (statusTab === "lowOrOut" ? lowStockProducts : products),
    [statusTab, lowStockProducts, products],
  )
  const selectStatusTab = (value: typeof statusTab) => {
    setStatusTab(value)
    setPage(1)
  }
  // Counts come from their own unfiltered query, never from `products` — that
  // list already carries the active tab's status, so tallying it here would
  // report 0 for every tab except the one selected.
  const statusCountsQuery = useProductStatusCounts()
  const activeCount = statusCountsQuery.data?.active ?? 0
  const inactiveCount = statusCountsQuery.data?.inactive ?? 0
  const outOfStockCount = statusCountsQuery.data?.outOfStock ?? 0
  const lowOrOutCount = statusCountsQuery.data?.lowOrOut ?? lowStock
  const countsCapped = (statusCountsQuery.data?.cappedAt ?? 0) >= 100

  const selected = visibleProducts.find((product) => product.id === selectedId) || visibleProducts[0] || null

  useEffect(() => {
    setSelectedId((current) =>
      current && visibleProducts.some((product) => product.id === current) ? current : visibleProducts[0]?.id || null,
    )
  }, [visibleProducts])

  useEffect(() => {
    setPage(1)
  }, [pageSize, sortKey, sortDirection])

  const toggleSort = (key: ProductSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDirection(key === "price" || key === "stockQuantity" ? "desc" : "asc")
  }

  const openCreateDialog = () => {
    setEditingProductId(null)
    setProductForm(defaultProductForm)
    setIsProductDialogOpen(true)
  }

  const openEditDialog = (product: AgentProductDto) => {
    setEditingProductId(product.id)
    const form = createFormFromProduct(product)
    setProductForm(form)
    const resolved = product.primaryImageUrl || product.imageUrls?.[0]
    if (form.imageId && resolved && isValidImageUrl(resolved)) {
      const imageId = form.imageId
      setMediaUrls((current) =>
        current[imageId] ? current : { ...current, [imageId]: resolved },
      )
    }
    setIsProductDialogOpen(true)
  }

  const persistProduct = async () => {
    if (savingProductRef.current) return
    savingProductRef.current = true
    setIsSavingProduct(true)
    try {
      const payload: CreateAgentProductInput = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || undefined,
        barcode: productForm.barcode.trim() || undefined,
        type: productForm.type,
        description: productForm.description.trim() || undefined,
        shortDescription: productForm.shortDescription.trim() || undefined,
        price: Number(productForm.price || 0),
        stockQuantity: Number(productForm.stockQuantity || 0),
        lowStockThreshold: Number(productForm.lowStockThreshold || 0),
        status: productForm.status,
        categoryId: productForm.categoryId || undefined,
        tags: productForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        images: productForm.imageId ? [productForm.imageId] : [],
      }

      if (editingProductId) {
        await agentProductsApi.update(editingProductId, payload)
        toast.success(t("workspace.products.productUpdated"))
      } else {
        await agentProductsApi.create(payload)
        toast.success(t("workspace.products.productCreated"))
      }

      setIsProductDialogOpen(false)
      setPage(1)
      await queryClient.invalidateQueries({ queryKey: productKeys.all })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.products.unableSave")))
    } finally {
      savingProductRef.current = false
      setIsSavingProduct(false)
    }
  }

  const disableProduct = async (product: AgentProductDto) => {
    if (savingProductRef.current) return
    savingProductRef.current = true
    setIsDisablingProduct(true)
    try {
      await agentProductsApi.update(product.id, { status: "inactive" })
      toast.success(t("workspace.products.productInactivated", { name: product.name }))
      await queryClient.invalidateQueries({ queryKey: productKeys.all })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.products.unableDisable")))
    } finally {
      savingProductRef.current = false
      setIsDisablingProduct(false)
    }
  }

  const invalidateCategories = async () => {
    await queryClient.invalidateQueries({ queryKey: productKeys.categories() })
  }

  const persistNewCategory = async () => {
    const name = newCategoryName.trim()
    if (!name || isSavingCategory) return
    setIsSavingCategory(true)
    try {
      const created = await agentProductsApi.createCategory(
        name,
        newCategoryDescription.trim() || undefined,
      )
      setIsCategoryCreateOpen(false)
      setNewCategoryName("")
      setNewCategoryDescription("")
      toast.success(t("workspace.products.categoryCreated"))
      await invalidateCategories()
      // Select the category that was just created.
      setProductForm((current) => ({ ...current, categoryId: created.id }))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.products.unableSaveCategory")))
    } finally {
      setIsSavingCategory(false)
    }
  }

  const persistCategoryName = async (categoryId: string) => {
    const name = (categoryNameDrafts[categoryId] ?? "").trim()
    if (!name || isSavingCategory) return
    setIsSavingCategory(true)
    try {
      await agentProductsApi.updateCategory(categoryId, { name })
      toast.success(t("workspace.products.categoryUpdated"))
      setCategoryNameDrafts((current) => {
        const next = { ...current }
        delete next[categoryId]
        return next
      })
      await invalidateCategories()
      // Product rows and the detail pane render product.category.name from
      // productKeys.list, which the categories prefix does not match — without
      // this the table keeps the old name until the 30s list staleTime lapses.
      await queryClient.invalidateQueries({ queryKey: productKeys.all })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.products.unableSaveCategory")))
    } finally {
      setIsSavingCategory(false)
    }
  }

  const persistCategoryActive = async (category: AgentProductCategoryDto) => {
    if (isSavingCategory) return
    setIsSavingCategory(true)
    try {
      await agentProductsApi.updateCategory(category.id, {
        isActive: !(category.isActive ?? true),
      })
      toast.success(t("workspace.products.categoryUpdated"))
      await invalidateCategories()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.products.unableSaveCategory")))
    } finally {
      setIsSavingCategory(false)
    }
  }

  // Deleting detaches the products that point at this category, so show how
  // many before the user commits — this is the consequence the plan calls for.
  const startCategoryDelete = async (categoryId: string) => {
    setPendingDeleteId(categoryId)
    setPendingDeleteCount(null)
    try {
      const result = await agentProductsApi.list({ categoryId, limit: 1 })
      setPendingDeleteCount(result.total ?? 0)
    } catch {
      setPendingDeleteCount(null)
    }
  }

  const persistCategoryDelete = async (categoryId: string) => {
    if (isSavingCategory) return
    setIsSavingCategory(true)
    try {
      await agentProductsApi.deleteCategory(categoryId)
      toast.success(t("workspace.products.categoryDeleted"))
      setPendingDeleteId(null)
      setPendingDeleteCount(null)
      // Products that pointed here are uncategorized now.
      await invalidateCategories()
      await queryClient.invalidateQueries({ queryKey: productKeys.all })
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.products.unableSaveCategory")))
    } finally {
      setIsSavingCategory(false)
    }
  }

  const openCategoryCreate = () => {
    setNewCategoryName("")
    setNewCategoryDescription("")
    setIsCategoryCreateOpen(true)
  }

  const openManageCategories = () => {
    setCategoryNameDrafts({})
    setPendingDeleteId(null)
    setPendingDeleteCount(null)
    setIsManageCategoriesOpen(true)
  }

  const selectedImageUrl =
    productForm.imageId && !productForm.imageId.startsWith("http") && !productForm.imageId.startsWith("/")
      ? mediaUrls[productForm.imageId]
      : productForm.imageId

  return (
    <>
      <WorkspaceHeader
        eyebrow={t("workspace.products.eyebrow")}
        title={t("workspace.products.title")}
        description={t("workspace.products.description")}
        actions={
          canManageCatalog ? (
            <>
              <Button variant="outline" onClick={openManageCategories}>
                {t("workspace.products.manageCategories")}
              </Button>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                {t("workspace.products.addProduct")}
              </Button>
            </>
          ) : undefined
        }
      />
      <WorkspacePage>
        {loadFailed ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <span className="flex-1">{t("workspace.products.loadFailed")}</span>
            <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>{t("workspace.products.retry")}</Button>
          </div>
        ) : null}
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <button
            type="button"
            onClick={() => setAttentionOpen((current) => !current)}
            aria-expanded={attentionOpen}
            aria-controls="attention-products-body"
            className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                <TriangleAlert className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-amber-900 dark:text-amber-100">{t("workspace.products.attentionTitle")}</span>
                <span className="block truncate text-xs text-amber-700 dark:text-amber-300">{t("workspace.products.attentionSubtitle")}</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                {lowStock === 1
                  ? t("workspace.products.attentionItemOne", { count: lowStock })
                  : t("workspace.products.attentionItemOther", { count: lowStock })}
              </span>
              <ChevronDown className={`h-4 w-4 text-amber-700 transition dark:text-amber-300 ${attentionOpen ? "" : "-rotate-90"}`} />
            </span>
          </button>
          {attentionOpen ? (
            <div id="attention-products-body">
              {lowStockProducts.length ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {lowStockProducts.slice(0, 6).map((product) => {
                    const outOfStock = product.status === "out_of_stock" || Number(product.stockQuantity || 0) <= 0
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(product.id)
                          setMobileView("details")
                        }}
                        aria-label={t("workspace.products.attentionProductAriaLabel", {
                          name: product.name,
                          status: getStockStatusLabel(product, t),
                        })}
                        className="group flex min-w-0 items-center gap-3 rounded-xl border border-amber-200/80 bg-white px-3 py-2.5 text-left transition hover:border-amber-300 hover:bg-amber-100/60 dark:border-amber-500/25 dark:bg-amber-950/30 dark:hover:bg-amber-950/60"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${outOfStock ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-amber-50">{product.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            {t("workspace.products.attentionProductMeta", {
                              status: getStockStatusLabel(product, t),
                              stock: product.stockQuantity,
                              price: money(product.price),
                            })}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-amber-500 transition group-hover:translate-x-0.5 dark:text-amber-300" />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{t("workspace.products.attentionAllStocked")}</p>
              )}
              {lowStockProducts.length > 6 ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {lowStockProducts.length - 6 === 1
                    ? t("workspace.products.moreLowStockOne", { count: lowStockProducts.length - 6 })
                    : t("workspace.products.moreLowStockOther", { count: lowStockProducts.length - 6 })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <WorkspaceSplitView className="xl:h-[calc(100svh-13rem)] xl:min-h-[680px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className={`${mobileView === "list" ? "flex" : "hidden"} min-w-0 flex-col overflow-hidden xl:flex`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="relative w-full max-w-md">
                <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  aria-label={t("workspace.products.searchAriaLabel")}
                  placeholder={t("workspace.products.searchPlaceholder")}
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={categoryFilter}
                  onValueChange={(value) => {
                    setCategoryFilter(value)
                    setPage(1)
                  }}
                  disabled={categoriesQuery.isLoading && !categoriesQuery.data}
                >
                  <SelectTrigger
                    className="w-44"
                    aria-label={t("workspace.products.categoryFilterAria")}
                  >
                    <SelectValue
                      placeholder={
                        categoriesQuery.isLoading && !categoriesQuery.data
                          ? t("workspace.products.categoryLoading")
                          : undefined
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("workspace.products.allCategories")}</SelectItem>
                    <SelectItem value="uncategorized">{t("workspace.products.uncategorized")}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8">{t("workspace.products.perPage", { count: 8 })}</SelectItem>
                    <SelectItem value="15">{t("workspace.products.perPage", { count: 15 })}</SelectItem>
                    <SelectItem value="25">{t("workspace.products.perPage", { count: 25 })}</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-slate-600">
                  {canManageCatalog ? t("workspace.products.catalogEditingEnabled") : t("workspace.products.readOnlyAccess")}
                </Badge>
              </div>
              <div className="min-w-0 border-t border-slate-200 pt-3 dark:border-slate-800">
                <WorkspaceStatStrip
                  ariaLabel={t("workspace.products.ariaLabel")}
                  className="w-full min-w-0"
                  items={[
                    { label: t("workspace.products.loaded"), value: serverTotal, active: statusTab === "all", onClick: () => selectStatusTab("all") },
                    { label: t("workspace.products.active"), value: activeCount, active: statusTab === "active", onClick: () => selectStatusTab("active") },
                    { label: t("workspace.products.inactive"), value: inactiveCount, active: statusTab === "inactive", onClick: () => selectStatusTab("inactive") },
                    { label: t("workspace.products.outOfStock"), value: outOfStockCount, active: statusTab === "out_of_stock", onClick: () => selectStatusTab("out_of_stock") },
                    {
                      label: t("workspace.products.lowOrOut"),
                      value: countsCapped ? `${lowOrOutCount}+` : lowOrOutCount,
                      active: statusTab === "lowOrOut",
                      onClick: () => selectStatusTab("lowOrOut"),
                    },
                  ]}
                />
                {/* "Low or out" filters only the loaded page, so its count carries
                    a "+" when the 100-row cap means the real number is higher.
                    The caption explaining that needs a Burmese string, which is
                    listed as pending; until then the marker stands alone. */}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto max-xl:hidden">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/95">
                  <tr>
                    <SortableProductHead label={t("workspace.products.product")} active={sortKey === "name"} onClick={() => toggleSort("name")} className="px-5" />
                    <SortableProductHead label={t("workspace.products.sku")} active={sortKey === "sku"} onClick={() => toggleSort("sku")} />
                    <SortableProductHead label={t("workspace.products.category")} active={sortKey === "category"} onClick={() => toggleSort("category")} />
                    <SortableProductHead label={t("workspace.products.price")} active={sortKey === "price"} onClick={() => toggleSort("price")} />
                    <SortableProductHead label={t("workspace.products.stock")} active={sortKey === "stockQuantity"} onClick={() => toggleSort("stockQuantity")} />
                    <SortableProductHead label={t("workspace.products.status")} active={sortKey === "status"} onClick={() => toggleSort("status")} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">{t("workspace.products.loading")}</td></tr>
                  ) : loadFailed && products.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">{t("workspace.products.unavailable")}</td></tr>
                  ) : serverTotal === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">{t("workspace.products.empty")}</td></tr>
                  ) : visibleProducts.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">{t("workspace.products.noMatch")}</td></tr>
                  ) : (
                    visibleProducts.map((product) => (
                      <tr
                        key={product.id}
                        onClick={() => setSelectedId(product.id)}
                        className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900/80 ${selected?.id === product.id ? "bg-indigo-50/70 dark:bg-indigo-500/10" : ""}`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <ProductImage product={product} mediaUrls={mediaUrls} />
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-slate-50">{product.name}</p>
                              <p className="max-w-[240px] truncate text-xs text-slate-500 dark:text-slate-400">
                                {product.shortDescription || product.description || product.type || t("workspace.products.productFallback")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{product.sku || "-"}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{product.category?.name || t("workspace.products.uncategorized")}</td>
                        <td className="px-4 py-4 font-medium text-slate-900 dark:text-slate-50">{money(product.price)}</td>
                        <td className={`px-4 py-4 font-semibold ${isLowOrOutOfStock(product) ? "text-amber-600" : "text-emerald-700"}`}>
                          {product.stockQuantity}
                        </td>
                        <td className="px-4 py-4"><ProductStatus status={product.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 xl:hidden">
              {visibleProducts.map((product) => (
                <button key={product.id} type="button" onClick={() => { setSelectedId(product.id); setMobileView("details") }} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950 dark:text-slate-50">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.sku || t("workspace.products.noSku")}</p>{product.barcode ? <BarcodeValue value={product.barcode} className="mt-1.5 items-start" /> : null}</div><ProductStatus status={product.status} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><Info label={t("workspace.products.price")} value={money(product.price)} /><Info label={t("workspace.products.stock")} value={String(product.stockQuantity)} /></div>
                </button>
              ))}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <span>
                {serverTotal === 0
                  ? t("workspace.products.noProducts")
                  : t("workspace.products.showingRange", {
                      start: (page - 1) * pageSize + 1,
                      end: Math.min(page * pageSize, serverTotal),
                      total: serverTotal,
                    })}
                {isFetchingPage ? t("workspace.products.updating") : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || listQuery.isFetching}>
                  <ChevronLeft className="h-4 w-4" />
                  {t("workspace.products.previous")}
                </Button>
                <span className="text-xs font-medium">{t("workspace.products.pageOfTotal", { page, total: totalPages })}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages || listQuery.isFetching}>
                  {t("workspace.products.next")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>

          <aside className={`${mobileView === "details" ? "block" : "hidden"} border-t border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-900/80 xl:block xl:border-l xl:border-t-0 xl:p-5`}>
            <Button variant="ghost" size="sm" className="mb-4 xl:hidden" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />{t("workspace.products.title")}</Button>
            {selected ? (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <ProductImage product={selected} mediaUrls={mediaUrls} large />
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-slate-950 dark:text-slate-50">{selected.name}</h2>
                    <p className="text-sm text-slate-500">{selected.sku || t("workspace.products.noSku")}</p>
                    <div className="mt-2"><ProductStatus status={selected.status} /></div>
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-950 dark:text-slate-50">{money(selected.price)}</p>
                  <p className="text-sm text-slate-500">{selected.category?.name || selected.type || t("workspace.products.productFallback")}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Info label={t("workspace.products.stock")} value={String(selected.stockQuantity)} />
                  <Info label={t("workspace.products.reorderLevel")} value={String(getReorderLevel(selected))} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{t("workspace.products.descriptionLabel")}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {selected.description || selected.shortDescription || t("workspace.products.noDescription")}
                  </p>
                </div>
                {selected.tags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  </div>
                ) : null}
                {canManageCatalog ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => openEditDialog(selected)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("workspace.products.editProduct")}
                    </Button>
                    {selected.status !== "inactive" ? (
                      <Button variant="outline" onClick={() => void disableProduct(selected)} disabled={isDisablingProduct}>
                        {isDisablingProduct ? t("workspace.products.disabling") : t("workspace.products.disableProduct")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-700">
                    {t("workspace.products.updatePermissionNote")}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                {loadFailed ? t("workspace.products.detailsUnavailable") : t("workspace.products.noProductsAvailable")}
              </div>
            )}
          </aside>
        </WorkspaceSplitView>
      </WorkspacePage>

      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProductId ? t("workspace.products.editProduct") : t("workspace.products.addProduct")}</DialogTitle>
            <DialogDescription>{t("workspace.products.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label={t("workspace.products.productName")}>
              <Input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label={t("workspace.products.sku")}>
              <Input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} />
            </Field>
            <Field label={t("workspace.products.barcode")}>
              <Input value={productForm.barcode} onChange={(event) => setProductForm((current) => ({ ...current, barcode: event.target.value }))} />
            </Field>
            <Field label={t("workspace.products.category")}>
              <div className="flex items-center gap-2">
                <Select value={productForm.categoryId || "uncategorized"} onValueChange={(value) => setProductForm((current) => ({ ...current, categoryId: value === "uncategorized" ? "" : value }))} disabled={categoriesQuery.isLoading && !categoriesQuery.data}>
                  <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder={categoriesQuery.isLoading && !categoriesQuery.data ? t("workspace.products.categoryLoading") : undefined} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uncategorized">{t("workspace.products.uncategorized")}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canManageCatalog ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={openCategoryCreate}
                    aria-label={t("workspace.products.newCategory")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field label={t("workspace.products.status")}>
              <Select value={productForm.status} onValueChange={(value) => setProductForm((current) => ({ ...current, status: value as AgentProductDto["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("workspace.products.active")}</SelectItem>
                  <SelectItem value="inactive">{t("workspace.products.inactive")}</SelectItem>
                  <SelectItem value="out_of_stock">{t("workspace.products.outOfStock")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("workspace.products.priceMmk")}>
              <Input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} />
            </Field>
            <Field label={t("workspace.products.stockQuantity")}>
              <Input type="number" min="0" value={productForm.stockQuantity} onChange={(event) => setProductForm((current) => ({ ...current, stockQuantity: event.target.value }))} />
            </Field>
            <Field label={t("workspace.products.lowStockThreshold")}>
              <Input type="number" min="0" value={productForm.lowStockThreshold} onChange={(event) => setProductForm((current) => ({ ...current, lowStockThreshold: event.target.value }))} />
            </Field>
            <Field label={t("workspace.products.type")}>
              <Select value={productForm.type} onValueChange={(value) => setProductForm((current) => ({ ...current, type: value as "product" | "service" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">{t("workspace.products.productFallback")}</SelectItem>
                  <SelectItem value="service">{t("workspace.products.service")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("workspace.products.shortDescription")}>
                <Input value={productForm.shortDescription} onChange={(event) => setProductForm((current) => ({ ...current, shortDescription: event.target.value }))} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("workspace.products.descriptionLabel")}>
                <Textarea rows={4} value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} />
              </Field>
            </div>
            {editingProductId ? (
              <div className="sm:col-span-2">
                <Field label={t("workspace.products.tags")}>
                  <Input value={productForm.tags} onChange={(event) => setProductForm((current) => ({ ...current, tags: event.target.value }))} placeholder={t("workspace.products.tagsPlaceholder")} />
                </Field>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Field label={t("workspace.products.productImage")}>
                <div className="flex flex-wrap items-center gap-3">
                  {selectedImageUrl && isValidImageUrl(selectedImageUrl) ? (
                    <img src={selectedImageUrl} alt="" className="h-20 w-20 rounded-lg border bg-white object-cover" />
                  ) : (
                    <ProductImagePlaceholder large />
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsMediaPickerOpen(true)}>
                      {t("workspace.products.chooseMedia")}
                    </Button>
                    {productForm.imageId ? (
                      <Button type="button" variant="outline" onClick={() => setProductForm((current) => ({ ...current, imageId: "" }))}>
                        {t("workspace.products.remove")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsProductDialogOpen(false)} disabled={isSavingProduct}>{t("workspace.products.cancel")}</Button>
            <Button onClick={() => void persistProduct()} disabled={isSavingProduct || !productForm.name.trim()}>
              {isSavingProduct ? t("workspace.products.saving") : editingProductId ? t("workspace.products.saveChanges") : t("workspace.products.createProduct")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryCreateOpen} onOpenChange={setIsCategoryCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workspace.products.newCategory")}</DialogTitle>
            <DialogDescription>{t("workspace.products.newCategoryHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label={t("workspace.products.categoryName")}>
              <Input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label={t("workspace.products.descriptionLabel")}>
              <Textarea
                rows={3}
                value={newCategoryDescription}
                onChange={(event) => setNewCategoryDescription(event.target.value)}
                maxLength={500}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsCategoryCreateOpen(false)} disabled={isSavingCategory}>
              {t("workspace.products.cancel")}
            </Button>
            <Button onClick={() => void persistNewCategory()} disabled={isSavingCategory || !newCategoryName.trim()}>
              {isSavingCategory ? t("workspace.products.saving") : t("workspace.products.createCategory")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isManageCategoriesOpen} onOpenChange={setIsManageCategoriesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("workspace.products.manageCategories")}</DialogTitle>
            <DialogDescription>{t("workspace.products.manageCategoriesHint")}</DialogDescription>
          </DialogHeader>

          {manageCategoriesQuery.isLoading && !manageCategories.length ? (
            <p className="text-sm text-slate-500">{t("workspace.products.categoryLoading")}</p>
          ) : null}

          {manageCategoriesQuery.error && !manageCategories.length ? (
            <p className="text-sm text-red-600">
              {getApiErrorMessage(manageCategoriesQuery.error, t("workspace.products.unableLoad"))}
            </p>
          ) : null}

          {!manageCategoriesQuery.isLoading && !manageCategoriesQuery.error && !manageCategories.length ? (
            <p className="text-sm text-slate-500">{t("workspace.products.noCategories")}</p>
          ) : null}

          <ul className="space-y-3">
            {manageCategories.map((category) => {
              const draft = categoryNameDrafts[category.id] ?? category.name
              const isActive = category.isActive ?? true
              const isDirty = draft.trim().length > 0 && draft.trim() !== category.name

              return (
                <li key={category.id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Input
                      value={draft}
                      onChange={(event) =>
                        setCategoryNameDrafts((current) => ({ ...current, [category.id]: event.target.value }))
                      }
                      aria-label={t("workspace.products.categoryName")}
                      maxLength={120}
                      disabled={isSavingCategory}
                    />
                    <Badge variant={isActive ? "outline" : "secondary"}>
                      {isActive ? t("workspace.products.active") : t("workspace.products.inactive")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void persistCategoryName(category.id)}
                      disabled={isSavingCategory || !isDirty}
                    >
                      {t("workspace.products.saveChanges")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void persistCategoryActive(category)}
                      disabled={isSavingCategory}
                    >
                      {isActive ? t("workspace.products.hideCategory") : t("workspace.products.showCategory")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void startCategoryDelete(category.id)}
                      disabled={isSavingCategory}
                    >
                      {t("workspace.products.deleteCategory")}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          {pendingDeleteId ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {pendingDeleteCount !== null ? (
                <p className="font-semibold">
                  {pendingDeleteCount === 1
                    ? t("workspace.products.categoryUsedByOne", { count: pendingDeleteCount })
                    : t("workspace.products.categoryUsedByOther", { count: pendingDeleteCount })}
                </p>
              ) : null}
              <p>{t("workspace.products.deleteCategoryWarning")}</p>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPendingDeleteId(null)
                    setPendingDeleteCount(null)
                  }}
                  disabled={isSavingCategory}
                >
                  {t("workspace.products.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void persistCategoryDelete(pendingDeleteId)}
                  disabled={isSavingCategory}
                >
                  {t("workspace.products.deleteCategory")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={isMediaPickerOpen}
        onOpenChange={setIsMediaPickerOpen}
        purpose="product-media"
        onSelect={(file: AgentMediaFileDto) => {
          setProductForm((current) => ({ ...current, imageId: file.id }))
          if (file.download?.url && isValidImageUrl(file.download.url)) {
            setMediaUrls((current) => ({ ...current, [file.id]: file.download!.url }))
          }
        }}
      />
    </>
  )
}

function ProductImage({ product, mediaUrls = {}, large = false }: { product: AgentProductDto; mediaUrls?: Record<string, string>; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  const backendUrl = product.primaryImageUrl || product.imageUrls?.[0]
  const imageReference = product.images?.[0]
  const legacyUrl =
    imageReference?.startsWith("http") || imageReference?.startsWith("/")
      ? imageReference
      : imageReference
        ? mediaUrls[imageReference]
        : undefined
  const image =
    backendUrl && isValidImageUrl(backendUrl) ? backendUrl : legacyUrl

  useEffect(() => {
    setImageFailed(false)
  }, [image])

  if (image && isValidImageUrl(image) && !imageFailed) {
    return (
      <img
        src={image}
        alt={product.name}
        className={`${large ? "h-20 w-20" : "h-11 w-11"} rounded-lg border bg-white object-cover`}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return <ProductImagePlaceholder large={large} />
}

function ProductImagePlaceholder({ large = false }: { large?: boolean }) {
  return (
    <span className={`${large ? "h-20 w-20" : "h-11 w-11"} flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300`}>
      <Package className={large ? "h-8 w-8" : "h-5 w-5"} />
    </span>
  )
}

function ProductStatus({ status }: { status: AgentProductDto["status"] }) {
  const style = status === "active" ? "bg-emerald-50 text-emerald-700" : status === "out_of_stock" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
  return <Badge className={style}>{status.replaceAll("_", " ")}</Badge>
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">{value}</p>
    </div>
  )
}

function SortableProductHead({ label, active, onClick, className = "px-4" }: { label: string; active: boolean; onClick: () => void; className?: string }) {
  return (
    <th className={`${className} py-3`}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 font-semibold ${active ? "text-indigo-700 dark:text-indigo-200" : ""}`}>
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </th>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
