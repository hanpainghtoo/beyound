"use client"

import { useEffect, useMemo, useState } from "react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConsoleHeader, ConsolePage, ConsoleSection, ConsoleStatCard } from "@/components/platform-console-shell"
import { BusinessBadge, FoundationNote } from "@/components/business-ops-foundation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getPlatformProductCatalogSummary,
  getPlatformProducts,
  type PlatformProductCatalogSummaryDto,
  type PlatformProductDto,
} from "@/lib/api"

const formatMoney = (value: number | string, currency = "MMK") => `${currency} ${Number(value || 0).toLocaleString()}`
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "Not updated"

export default function Page() {
  const [products, setProducts] = useState<PlatformProductDto[]>([])
  const [catalogs, setCatalogs] = useState<PlatformProductCatalogSummaryDto[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const [productsResult, summaryResult] = await Promise.all([
          getPlatformProducts({ search, status: statusFilter, limit: 100 }),
          getPlatformProductCatalogSummary(search),
        ])
        setProducts(productsResult.data)
        setCatalogs(summaryResult)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load platform product visibility.")
        setProducts([])
        setCatalogs([])
      } finally {
        setLoading(false)
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [search, statusFilter])

  const stats = useMemo(
    () => ({
      catalogs: catalogs.length,
      products: catalogs.reduce((sum, row) => sum + row.productCount, 0),
      lowStock: catalogs.reduce((sum, row) => sum + row.lowStockProducts, 0),
      inactive: catalogs.reduce((sum, row) => sum + row.inactiveProducts + row.outOfStockProducts, 0),
    }),
    [catalogs],
  )

  return (
    <>
      <ConsoleHeader
        eyebrow="Business Operations"
        title="Products"
        description="Platform-level merchant catalog visibility with live product counts, status mix, and low-stock signals."
      />
      <ConsolePage>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ConsoleStatCard label="Catalogs" value={loading ? "…" : stats.catalogs} note="Merchants with real product records" tone="blue" />
          <ConsoleStatCard label="Products" value={loading ? "…" : stats.products.toLocaleString()} note="Across visible merchant catalogs" tone="cyan" />
          <ConsoleStatCard label="Low stock" value={loading ? "…" : stats.lowStock.toLocaleString()} note="Inventory needs attention" tone="amber" />
          <ConsoleStatCard label="Inactive / OOS" value={loading ? "…" : stats.inactive.toLocaleString()} note="Unavailable for new sales" tone="slate" />
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-2">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, product, or SKU" className="border-white/10 bg-slate-950/40 text-white" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="border-white/10 bg-slate-950/40 text-white"><SelectValue placeholder="Product status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All product statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="out_of_stock">Out of stock</SelectItem></SelectContent>
          </Select>
        </div>

        <ConsoleSection title="Catalog visibility" description="Read-only merchant product summary from the live platform-admin product API.">
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table>
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Merchant</TableHead>
                  <TableHead className="text-slate-300">Products</TableHead>
                  <TableHead className="text-slate-300">Active</TableHead>
                  <TableHead className="text-slate-300">Inactive</TableHead>
                  <TableHead className="text-slate-300">Out of stock</TableHead>
                  <TableHead className="text-slate-300">Low stock</TableHead>
                  <TableHead className="text-slate-300">Last updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">Loading merchant catalogs…</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-rose-200">{error}</TableCell></TableRow> : catalogs.length === 0 ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">No merchant catalogs match the current filters.</TableCell></TableRow> : catalogs.map((catalog) => (
                  <TableRow key={catalog.tenantId} className="border-white/10 hover:bg-white/5">
                    <TableCell className="font-medium text-white">{catalog.companyName}</TableCell>
                    <TableCell className="text-slate-300">{catalog.productCount.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-300">{catalog.activeProducts.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-300">{catalog.inactiveProducts.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-300">{catalog.outOfStockProducts.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-300">{catalog.lowStockProducts.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-300">{formatDate(catalog.lastUpdatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>

        <ConsoleSection title="Recent product visibility" description="Product-level visibility helps platform operators confirm which merchant catalogs are active without exposing merchant editing.">
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <Table>
              <TableHeader className="bg-slate-950/70">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Merchant</TableHead>
                  <TableHead className="text-slate-300">Product</TableHead>
                  <TableHead className="text-slate-300">SKU</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Stock</TableHead>
                  <TableHead className="text-slate-300">Price</TableHead>
                  <TableHead className="text-slate-300">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white/[0.03]">
                {loading ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">Loading recent products…</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-rose-200">{error}</TableCell></TableRow> : products.length === 0 ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-slate-400">No product rows match the current filters.</TableCell></TableRow> : products.map((product) => (
                  <TableRow key={product.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="text-slate-300">{product.tenant.companyName}</TableCell>
                    <TableCell className="font-medium text-white">{product.name}</TableCell>
                    <TableCell className="text-slate-300">{product.sku || "No SKU"}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <BusinessBadge value={product.status} />
                        {product.isLowStock ? <p className="text-xs text-amber-200">Low stock</p> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">{product.trackInventory ? product.stockQuantity.toLocaleString() : "Not tracked"}</TableCell>
                    <TableCell className="text-slate-300">{formatMoney(product.price)}</TableCell>
                    <TableCell className="text-slate-300">{formatDate(product.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ConsoleSection>

        <FoundationNote title="Read-only platform visibility" description="The platform console can now inspect real merchant catalog summaries and recent products. Product creation, editing, and inventory operations remain merchant-owned workflows." />
      </ConsolePage>
    </>
  )
}
