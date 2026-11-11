"use client";
import { useI18n } from "@/components/providers/i18n-provider"

import { useMemo, useState } from "react";
import { Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentProductCategoryDto, AgentProductDto } from "@/lib/api";
import { formatCurrencyPlain } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Multi-select product picker for the inbox composer.
 *
 * Customer-safe fields only: name, SKU, price, thumbnail, category, short
 * description, and an availability word. Internal fields (`costPrice`, exact
 * `stockQuantity`, thresholds, status raw value, tags, timestamps) are never
 * rendered here and never reach the composer text.
 *
 * Both footer buttons close the dialog; only Select writes to the composer
 * (append, never overwrite). Selection is local state, reset on close.
 */
export function SendProductDialog({
  open,
  onOpenChange,
  products,
  categories,
  loading,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: AgentProductDto[];
  categories: AgentProductCategoryDto[];
  loading: boolean;
  onSelect: (selected: AgentProductDto[]) => void;
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryId !== "all" && product.category?.id !== categoryId) return false;
      if (!needle) return true;
      const haystack =
        `${product.name || ""} ${product.sku || ""} ${product.category?.name || ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [products, query, categoryId]);

  const close = () => {
    setQuery("");
    setCategoryId("all");
    setSelectedIds(new Set());
    onOpenChange(false);
  };

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = () => {
    const picked = products.filter((product) => selectedIds.has(product.id));
    onSelect(picked);
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setCategoryId("all");
          setSelectedIds(new Set());
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send product</DialogTitle>
          <DialogDescription>
            Tick one or more products, then Select to append them to the reply composer.
            {selectedIds.size > 0 ? ` ${selectedIds.size} selected.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("workspace.inbox.sendProduct.search")}
              aria-label={t("workspace.inbox.sendProduct.search")}
              className="pl-9"
            />
          </div>
          {categories.length > 0 ? (
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("workspace.inbox.sendProduct.allCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="grid gap-3 pr-4 md:grid-cols-2">
            {filtered.length === 0 ? (
              <p className="px-1 py-6 text-sm text-slate-500 dark:text-slate-400">
                {loading ? t("workspace.inbox.sendProduct.loading") : t("workspace.inbox.sendProduct.empty")}
              </p>
            ) : (
              filtered.map((product) => {
                const checked = selectedIds.has(product.id);
                const image = product.primaryImageUrl || product.imageUrls?.[0] || product.images?.[0];
                const blurb = product.shortDescription || product.description || "";
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggle(product.id)}
                    aria-pressed={checked}
                    className={cn(
                      "flex gap-3 rounded-xl border p-3 text-left transition-colors",
                      checked
                        ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900",
                    )}
                  >
                    <Checkbox checked={checked} tabIndex={-1} aria-hidden className="mt-1 pointer-events-none" />
                    {image ? (
                      <img src={image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <Package className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                        {product.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                        {[product.sku || t("workspace.inbox.sendProduct.noSku"), product.category?.name].filter(Boolean).join(" · ")}
                      </span>
                      {blurb ? (
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {blurb.length > 120 ? `${blurb.slice(0, 120)}…` : blurb}
                        </span>
                      ) : null}
                      <span className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {formatCurrencyPlain(product.price)}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            product.status === "active"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-400",
                          )}
                        >
                          {product.status === "active" ? t("workspace.inbox.sendProduct.inStock") : t("workspace.inbox.sendProduct.unavailable")}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={selectedIds.size === 0} onClick={handleSelect}>
            Select{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Customer-safe composer block. Appended to existing text, never overwrites.
 * Only name / SKU / price / category / short description — no cost, no stock
 * counts, no internal fields.
 */
export function formatProductsForComposer(selected: AgentProductDto[]): string {
  return selected
    .map((product, index) => {
      const head = `${index + 1}. ${product.name}${product.sku ? ` (${product.sku})` : ""} - ${formatCurrencyPlain(product.price)}`;
      const blurb = product.shortDescription || product.description || "";
      const meta = product.category?.name ? `   ${product.category.name}` : "";
      const detail = blurb
        ? `${meta ? `${meta} · ` : "   "}${blurb.length > 200 ? `${blurb.slice(0, 200)}…` : blurb}`
        : meta;
      return detail ? `${head}\n${detail}` : head;
    })
    .join("\n");
}
