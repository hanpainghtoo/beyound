"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpDown,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  Search as SearchIcon,
  TriangleAlert,
} from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { WorkspaceHeader } from "@/components/workspace-header"
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
import { WorkspacePage, WorkspaceSplitView, WorkspaceStatCard } from "@/components/workspace"
import {
  csrMediaApi,
  csrProductsApi,
  getApiErrorMessage,
  getStoredSession,
  type CsrMediaFileDto,
  type CsrProductCategoryDto,
  type CsrProductDto,
  type CreateCsrProductInput,
} from "@/lib/api"

const money = (value: number | string) => `MMK ${new Intl.NumberFormat("en").format(Number(value || 0))}`
type ProductSortKey = "name" | "sku" | "category" | "price" | "stockQuantity" | "status"

type ProductFormState = {
  name: string
  sku: string
  type: "product" | "service"
  description: string
  shortDescription: string
  price: string
  stockQuantity: string
  lowStockThreshold: string
  status: CsrProductDto["status"]
  categoryId: string
  tags: string
  imageId: string
}

const defaultProductForm: ProductFormState = {
  name: "",
  sku: "",
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

const isGeneratedVerificationProduct = (product: CsrProductDto) => {
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

const getReorderLevel = (product: CsrProductDto) => Number(product.lowStockThreshold ?? 5)

const isLowOrOutOfStock = (product: CsrProductDto) =>
  product.trackInventory === false
    ? false
    : product.status === "out_of_stock" || Number(product.stockQuantity || 0) <= getReorderLevel(product)

const getStockStatusLabel = (product: CsrProductDto) => {
  if (product.status === "out_of_stock") return "Out of stock"

  const stockQuantity = Number(product.stockQuantity || 0)
  return stockQuantity <= 0 ? "Out of stock" : `Low stock (${stockQuantity} left)`
}

const createFormFromProduct = (product: CsrProductDto): ProductFormState => ({
  name: product.name,
  sku: product.sku || "",
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
  const sessionRole = getStoredSession()?.user.role || "csr"
  const canManageCatalog = ["owner", "admin", "supervisor"].includes(sessionRole)
  const [products, setProducts] = useState<CsrProductDto[]>([])
  const [categories, setCategories] = useState<CsrProductCategoryDto[]>([])
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "details">("list")
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<ProductSortKey>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isDisablingProduct, setIsDisablingProduct] = useState(false)
  const savingProductRef = useRef(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(defaultProductForm)
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false)

  const loadProducts = async () => {
    setIsLoading(true)
    setError("")
    try {
      const [productData, categoryData, mediaData] = await Promise.all([
        csrProductsApi.list(),
        csrProductsApi.categories(),
        csrMediaApi.list(),
      ])
      const runtimeProducts = productData.filter((product) => !isGeneratedVerificationProduct(product))
      setProducts(runtimeProducts)
      setCategories(categoryData)
      setMediaUrls(
        Object.fromEntries(
          mediaData.data
            .filter((file) => file.download && isValidImageUrl(file.download.url))
            .map((file) => [file.id, file.download!.url]),
        ),
      )
      setSelectedId((current) => (current && runtimeProducts.some((product) => product.id === current) ? current : runtimeProducts[0]?.id || null))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load products"))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [])

  const filtered = useMemo(
    () =>
      products.filter((product) =>
        `${product.name} ${product.sku || ""} ${product.category?.name || ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [products, query],
  )

  const sorted = useMemo(() => {
    return [...filtered].sort((first, second) => {
      const firstValue = sortKey === "category" ? first.category?.name || "" : first[sortKey]
      const secondValue = sortKey === "category" ? second.category?.name || "" : second[sortKey]
      const normalizedFirst = typeof firstValue === "number" ? firstValue : String(firstValue || "").toLowerCase()
      const normalizedSecond = typeof secondValue === "number" ? secondValue : String(secondValue || "").toLowerCase()
      if (normalizedFirst < normalizedSecond) return sortDirection === "asc" ? -1 : 1
      if (normalizedFirst > normalizedSecond) return sortDirection === "asc" ? 1 : -1
      return 0
    })
  }, [filtered, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)
  const selected = products.find((product) => product.id === selectedId) || filtered[0] || null
  const lowStockProducts = useMemo(
    () =>
      products
        .filter(isLowOrOutOfStock)
        .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" })),
    [products],
  )
  const lowStock = lowStockProducts.length

  useEffect(() => {
    setPage(1)
  }, [pageSize, query])

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

  const openEditDialog = (product: CsrProductDto) => {
    setEditingProductId(product.id)
    setProductForm(createFormFromProduct(product))
    setIsProductDialogOpen(true)
  }

  const persistProduct = async () => {
    if (savingProductRef.current) return
    savingProductRef.current = true
    setIsSavingProduct(true)
    setError("")
    setSuccessMessage("")
    try {
      const payload: CreateCsrProductInput = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || undefined,
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
        await csrProductsApi.update(editingProductId, payload)
        setSuccessMessage("Product updated.")
      } else {
        await csrProductsApi.create(payload)
        setSuccessMessage("Product created.")
      }

      setIsProductDialogOpen(false)
      await loadProducts()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to save product"))
    } finally {
      savingProductRef.current = false
      setIsSavingProduct(false)
    }
  }

  const disableProduct = async (product: CsrProductDto) => {
    if (savingProductRef.current) return
    savingProductRef.current = true
    setIsDisablingProduct(true)
    setError("")
    setSuccessMessage("")
    try {
      await csrProductsApi.update(product.id, { status: "inactive" })
      setSuccessMessage(`${product.name} is now inactive.`)
      await loadProducts()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to disable product"))
    } finally {
      savingProductRef.current = false
      setIsDisablingProduct(false)
    }
  }

  const selectedImageUrl =
    productForm.imageId && !productForm.imageId.startsWith("http") && !productForm.imageId.startsWith("/")
      ? mediaUrls[productForm.imageId]
      : productForm.imageId

  return (
    <>
      <WorkspaceHeader
        eyebrow="Daily Work"
        title="Products"
        description="Create, update, and manage the catalog used by workspace orders."
        actions={
          canManageCatalog ? (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add product
            </Button>
          ) : undefined
        }
      />
      <WorkspacePage>
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            {successMessage}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <WorkspaceStatCard label="Loaded products" value={products.length} icon={Package} tone="indigo" />
          <WorkspaceStatCard label="Active" value={products.filter((product) => product.status === "active").length} icon={Boxes} tone="emerald" />
          <WorkspaceStatCard label="Low or out of stock" value={lowStock} icon={TriangleAlert} tone="amber" />
        </div>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Products that need attention</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">Click a product to jump to it in the catalog.</p>
            </div>
            <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
              {lowStock} item{lowStock === 1 ? "" : "s"}
            </span>
          </div>
          {lowStockProducts.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {lowStockProducts.slice(0, 8).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(product.id)
                    setMobileView("details")
                  }}
                  className="max-w-full rounded-full border border-amber-300 bg-white px-3 py-1.5 text-left text-sm text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <span className="block truncate">{product.name}</span>
                  <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300">{getStockStatusLabel(product)}</span>
                </button>
              ))}
              {lowStockProducts.length > 8 ? (
                <span className="rounded-full border border-dashed border-amber-300 px-3 py-1.5 text-sm text-amber-700 dark:border-amber-500/30 dark:text-amber-300">
                  +{lowStockProducts.length - 8} more
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">Everything looks stocked above the low-stock threshold.</p>
          )}
        </div>

        <WorkspaceSplitView className="xl:h-[calc(100svh-13rem)] xl:min-h-[680px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className={`${mobileView === "list" ? "flex" : "hidden"} min-w-0 flex-col overflow-hidden xl:flex`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="relative w-full max-w-md">
                <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  aria-label="Search products"
                  placeholder="Search products, SKU, categories..."
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8">8 / page</SelectItem>
                    <SelectItem value="15">15 / page</SelectItem>
                    <SelectItem value="25">25 / page</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-slate-600">
                  {canManageCatalog ? "Catalog editing enabled" : "Read-only access"}
                </Badge>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto max-xl:hidden">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/95">
                  <tr>
                    <SortableProductHead label="Product" active={sortKey === "name"} onClick={() => toggleSort("name")} className="px-5" />
                    <SortableProductHead label="SKU" active={sortKey === "sku"} onClick={() => toggleSort("sku")} />
                    <SortableProductHead label="Category" active={sortKey === "category"} onClick={() => toggleSort("category")} />
                    <SortableProductHead label="Price" active={sortKey === "price"} onClick={() => toggleSort("price")} />
                    <SortableProductHead label="Stock" active={sortKey === "stockQuantity"} onClick={() => toggleSort("stockQuantity")} />
                    <SortableProductHead label="Status" active={sortKey === "status"} onClick={() => toggleSort("status")} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">Loading products...</td></tr>
                  ) : error ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">Products are unavailable right now.</td></tr>
                  ) : products.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">No products available yet. Add your first product to start creating orders.</td></tr>
                  ) : sorted.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-500">No products match this search.</td></tr>
                  ) : (
                    paginated.map((product) => (
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
                                {product.shortDescription || product.description || product.type || "Product"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{product.sku || "-"}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{product.category?.name || "Uncategorized"}</td>
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
              {paginated.map((product) => (
                <button key={product.id} type="button" onClick={() => { setSelectedId(product.id); setMobileView("details") }} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950 dark:text-slate-50">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.sku || "No SKU"}</p></div><ProductStatus status={product.status} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><Info label="Price" value={money(product.price)} /><Info label="Stock" value={String(product.stockQuantity)} /></div>
                </button>
              ))}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <span>{sorted.length === 0 ? "No products" : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-xs font-medium">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>

          <aside className={`${mobileView === "details" ? "block" : "hidden"} border-t border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-900/80 xl:block xl:border-l xl:border-t-0 xl:p-5`}>
            <Button variant="ghost" size="sm" className="mb-4 xl:hidden" onClick={() => setMobileView("list")}><ArrowLeft className="mr-2 h-4 w-4" />Products</Button>
            {selected ? (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <ProductImage product={selected} mediaUrls={mediaUrls} large />
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-slate-950 dark:text-slate-50">{selected.name}</h2>
                    <p className="text-sm text-slate-500">{selected.sku || "No SKU"}</p>
                    <div className="mt-2"><ProductStatus status={selected.status} /></div>
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-950 dark:text-slate-50">{money(selected.price)}</p>
                  <p className="text-sm text-slate-500">{selected.category?.name || selected.type || "Product"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Stock" value={String(selected.stockQuantity)} />
                  <Info label="Reorder level" value={String(getReorderLevel(selected))} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Description</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {selected.description || selected.shortDescription || "No description has been recorded."}
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
                      Edit product
                    </Button>
                    {selected.status !== "inactive" ? (
                      <Button variant="outline" onClick={() => void disableProduct(selected)} disabled={isDisablingProduct}>
                        {isDisablingProduct ? "Disabling..." : "Disable product"}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-700">
                    Product updates require a workspace owner, admin, or supervisor role.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                {error ? "Product details are unavailable right now." : "No products available yet."}
              </div>
            )}
          </aside>
        </WorkspaceSplitView>
      </WorkspacePage>

      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProductId ? "Edit product" : "Add product"}</DialogTitle>
            <DialogDescription>Persist product details used across workspace orders and product sharing.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label="Product name">
              <Input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="SKU">
              <Input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} />
            </Field>
            <Field label="Category">
              <Select value={productForm.categoryId || "uncategorized"} onValueChange={(value) => setProductForm((current) => ({ ...current, categoryId: value === "uncategorized" ? "" : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={productForm.status} onValueChange={(value) => setProductForm((current) => ({ ...current, status: value as CsrProductDto["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="out_of_stock">Out of stock</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Price (MMK)">
              <Input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} />
            </Field>
            <Field label="Stock quantity">
              <Input type="number" min="0" value={productForm.stockQuantity} onChange={(event) => setProductForm((current) => ({ ...current, stockQuantity: event.target.value }))} />
            </Field>
            <Field label="Low stock threshold">
              <Input type="number" min="0" value={productForm.lowStockThreshold} onChange={(event) => setProductForm((current) => ({ ...current, lowStockThreshold: event.target.value }))} />
            </Field>
            <Field label="Type">
              <Select value={productForm.type} onValueChange={(value) => setProductForm((current) => ({ ...current, type: value as "product" | "service" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Short description">
                <Input value={productForm.shortDescription} onChange={(event) => setProductForm((current) => ({ ...current, shortDescription: event.target.value }))} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description">
                <Textarea rows={4} value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Tags">
                <Input value={productForm.tags} onChange={(event) => setProductForm((current) => ({ ...current, tags: event.target.value }))} placeholder="new, popular, bundle" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Product image">
                <div className="flex flex-wrap items-center gap-3">
                  {selectedImageUrl && isValidImageUrl(selectedImageUrl) ? (
                    <img src={selectedImageUrl} alt="" className="h-20 w-20 rounded-lg border bg-white object-cover" />
                  ) : (
                    <ProductImagePlaceholder large />
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsMediaPickerOpen(true)}>
                      Choose media
                    </Button>
                    {productForm.imageId ? (
                      <Button type="button" variant="outline" onClick={() => setProductForm((current) => ({ ...current, imageId: "" }))}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsProductDialogOpen(false)} disabled={isSavingProduct}>Cancel</Button>
            <Button onClick={() => void persistProduct()} disabled={isSavingProduct || !productForm.name.trim()}>
              {isSavingProduct ? "Saving..." : editingProductId ? "Save changes" : "Create product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={isMediaPickerOpen}
        onOpenChange={setIsMediaPickerOpen}
        purpose="product-media"
        onSelect={(file: CsrMediaFileDto) => {
          setProductForm((current) => ({ ...current, imageId: file.id }))
          if (file.download?.url && isValidImageUrl(file.download.url)) {
            setMediaUrls((current) => ({ ...current, [file.id]: file.download!.url }))
          }
        }}
      />
    </>
  )
}

function ProductImage({ product, mediaUrls, large = false }: { product: CsrProductDto; mediaUrls: Record<string, string>; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageReference = product.images?.[0]
  const image = imageReference?.startsWith("http") || imageReference?.startsWith("/") ? imageReference : imageReference ? mediaUrls[imageReference] : undefined

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

function ProductStatus({ status }: { status: CsrProductDto["status"] }) {
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
