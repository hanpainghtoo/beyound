import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  agentProductsApi,
  type AgentProductCategoryDto,
  type AgentProductDto,
  type AgentProductListOptions,
  type PaginatedResponse,
} from "@/lib/api"

// ---------------------------------------------------------------------------
// Query keys — every filter combo caches separately + shared dropdown options
// ---------------------------------------------------------------------------

export const productKeys = {
  all: ["products"] as const,
  list: (filters: AgentProductListOptions) =>
    [...productKeys.all, "list", filters] as const,
  options: (activeOnly: boolean) =>
    [...productKeys.all, "options", activeOnly ? "active" : "all"] as const,
  categories: () => [...productKeys.all, "categories"] as const,
}

// ---------------------------------------------------------------------------
// List query — server paginates/filters; stale rows kept while refetching
// ---------------------------------------------------------------------------

export function useProductsList(filters: AgentProductListOptions) {
  return useQuery<PaginatedResponse<AgentProductDto>>({
    queryKey: productKeys.list(filters),
    queryFn: () => agentProductsApi.list(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

/**
 * Catalog-wide status counts for the products filter tabs.
 *
 * Deliberately independent of the list query: that one carries the active tab's
 * `status`, so counting statuses off it would report every non-active tab as 0
 * the moment you filtered. Requests one unfiltered page instead and tallies
 * client-side. The endpoint clamps `limit` to 100, so these are exact up to 100
 * products and under-report beyond that — `cappedAt` lets the UI say so rather
 * than silently showing a wrong number.
 */
export function useProductStatusCounts() {
  return useQuery<{
    active: number
    inactive: number
    outOfStock: number
    lowOrOut: number
    cappedAt: number
  }>({
    queryKey: [...productKeys.all, "statusCounts"] as const,
    queryFn: async () => {
      const page = await agentProductsApi.list({ limit: 100 })
      const rows = page.data
      const lowOrOut = rows.filter(
        (product) =>
          product.trackInventory !== false &&
          (product.status === "out_of_stock" ||
            Number(product.stockQuantity || 0) <= Number(product.lowStockThreshold ?? 5)),
      ).length
      return {
        active: rows.filter((product) => product.status === "active").length,
        inactive: rows.filter((product) => product.status === "inactive").length,
        outOfStock: rows.filter((product) => product.status === "out_of_stock").length,
        lowOrOut,
        cappedAt: rows.length,
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Dropdown options — single cache entry shared across every product selector
// (order dialogs, inbox composer/order dialog, dashboard setup counts).
// activeOnly=true preserves existing active-only dialog behavior.
// ---------------------------------------------------------------------------

export function useProductOptions(activeOnly = true) {
  return useQuery<AgentProductDto[]>({
    queryKey: productKeys.options(activeOnly),
    queryFn: async () => {
      const page = await agentProductsApi.list({ limit: 100 })
      const rows = page.data
      return activeOnly ? rows.filter((product) => product.status === "active") : rows
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

/** Product categories — 10-minute cache, changes rarely. */
export function useProductCategories() {
  return useQuery<AgentProductCategoryDto[]>({
    queryKey: productKeys.categories(),
    queryFn: () => agentProductsApi.categories(),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
  })
}

/**
 * Every category, including soft-hidden ones — management views only.
 * Shares the `categories` key prefix, so invalidating `productKeys.categories()`
 * refreshes this too.
 */
export function useAllProductCategories(enabled = true) {
  return useQuery<AgentProductCategoryDto[]>({
    queryKey: [...productKeys.categories(), "includingInactive"] as const,
    queryFn: () => agentProductsApi.categoriesIncludingInactive(),
    enabled,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutations — precise invalidation of product lists only
// ---------------------------------------------------------------------------

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof agentProductsApi.create>[0]) =>
      agentProductsApi.create(data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof agentProductsApi.update>[1]
    }) => agentProductsApi.update(id, data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}
