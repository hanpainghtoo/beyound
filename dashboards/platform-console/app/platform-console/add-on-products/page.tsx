"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

import {
  ConsoleHeader,
  ConsolePage,
  ConsoleSection,
  ConsoleStatCard,
} from "@/components/platform-console-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  archivePlatformAddOnProduct,
  createPlatformAddOnProduct,
  deletePlatformAddOnProduct,
  getPlatformAddOnProducts,
  getStoredSession,
  publishPlatformAddOnProduct,
  updatePlatformAddOnProduct,
  type SubscriptionAddOnComponentDto,
  type SubscriptionAddOnProductDto,
} from "@/lib/api";

const componentOptions: Array<{
  value: SubscriptionAddOnComponentDto["componentType"];
  label: string;
  unit: SubscriptionAddOnComponentDto["unit"];
}> = [
  { value: "inbound_messages", label: "Inbound messages", unit: "messages" },
  { value: "outbound_messages", label: "Outbound messages", unit: "messages" },
  { value: "api_requests", label: "API requests", unit: "requests" },
  { value: "channel_slots", label: "Channel slots", unit: "channels" },
  { value: "storage_gb", label: "Storage", unit: "gb" },
];

type DraftComponent = {
  componentType: SubscriptionAddOnComponentDto["componentType"];
  quantity: string;
};
type Draft = {
  code: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  components: DraftComponent[];
};

const emptyDraft: Draft = {
  code: "",
  name: "",
  description: "",
  price: "0",
  currency: "MMK",
  components: [{ componentType: "inbound_messages", quantity: "10000" }],
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The top-up catalog request could not be completed.";
const canWrite = (role?: string) =>
  role === "super_admin" || role === "ops_admin";
const formatMoney = (value: number, currency: string) =>
  `${currency} ${Number(value || 0).toLocaleString()}`;
const labelFor = (type: string) =>
  componentOptions.find((option) => option.value === type)?.label ||
  type.replaceAll("_", " ");
const unitFor = (type: DraftComponent["componentType"]) =>
  componentOptions.find((option) => option.value === type)?.unit || "messages";

function draftFrom(product: SubscriptionAddOnProductDto): Draft {
  return {
    code: product.code,
    name: product.name,
    description: product.description || "",
    price: String(product.price),
    currency: product.currency,
    components: product.components.map((component) => ({
      componentType: component.componentType,
      quantity: String(component.quantity),
    })),
  };
}

export default function AddOnProductsPage() {
  const [products, setProducts] = useState<SubscriptionAddOnProductDto[]>([]);
  const [role, setRole] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<SubscriptionAddOnProductDto | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const writable = canWrite(role);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await getPlatformAddOnProducts());
    } catch (requestError) {
      setProducts([]);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRole(getStoredSession()?.user.role);
    void load();
  }, [load]);

  const activeCount = useMemo(
    () => products.filter((product) => product.status === "active").length,
    [products],
  );
  const totalComponents = useMemo(
    () => products.reduce((sum, product) => sum + product.components.length, 0),
    [products],
  );

  const openCreate = () => {
    setSelected(null);
    setDraft(emptyDraft);
    setFormError("");
    setDialogOpen(true);
  };
  const openEdit = (product: SubscriptionAddOnProductDto) => {
    setSelected(product);
    setDraft(draftFrom(product));
    setFormError("");
    setDialogOpen(true);
  };

  const updateComponent = (index: number, patch: Partial<DraftComponent>) =>
    setDraft((current) => ({
      ...current,
      components: current.components.map((component, componentIndex) =>
        componentIndex === index ? { ...component, ...patch } : component,
      ),
    }));
  const addComponent = () => {
    const unused = componentOptions.find(
      (option) =>
        !draft.components.some(
          (component) => component.componentType === option.value,
        ),
    );
    if (unused)
      setDraft((current) => ({
        ...current,
        components: [
          ...current.components,
          { componentType: unused.value, quantity: "1000" },
        ],
      }));
  };
  const removeComponent = (index: number) =>
    setDraft((current) => ({
      ...current,
      components: current.components.filter(
        (_, componentIndex) => componentIndex !== index,
      ),
    }));

  const save = async () => {
    if (!draft.code.trim() || !draft.name.trim()) {
      setFormError("Code and product name are required.");
      return;
    }
    if (draft.components.length === 0) {
      setFormError("Add at least one component.");
      return;
    }
    const components = draft.components.map((component, index) => ({
      componentType: component.componentType,
      quantity: Number(component.quantity),
      unit: unitFor(component.componentType),
      displayOrder: index,
    }));
    if (
      components.some(
        (component) =>
          !Number.isInteger(component.quantity) || component.quantity <= 0,
      )
    ) {
      setFormError("Every component quantity must be a positive whole number.");
      return;
    }
    if (
      new Set(components.map((component) => component.componentType)).size !==
      components.length
    ) {
      setFormError(
        "Each component dimension can appear only once in a product.",
      );
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        code: draft.code.trim(),
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        price: Number(draft.price),
        currency: draft.currency.trim().toUpperCase() || "MMK",
        components,
      };
      const saved = selected
        ? await updatePlatformAddOnProduct(selected.id, payload)
        : await createPlatformAddOnProduct(payload);
      setProducts((current) =>
        selected
          ? current.map((product) =>
              product.id === saved.id ? saved : product,
            )
          : [saved, ...current],
      );
      setDialogOpen(false);
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    product: SubscriptionAddOnProductDto,
    action: "publish" | "archive" | "delete",
  ) => {
    setActionId(product.id);
    setError("");
    try {
      const updated =
        action === "publish"
          ? await publishPlatformAddOnProduct(product.id)
          : action === "archive"
            ? await archivePlatformAddOnProduct(product.id)
            : null;
      if (action === "delete") {
        await deletePlatformAddOnProduct(product.id);
        setProducts((current) =>
          current.filter((item) => item.id !== product.id),
        );
      } else if (updated)
        setProducts((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <ConsoleHeader
        eyebrow="Platform Console"
        title="Add On Packages"
        description="Define reusable bundles of inbound, outbound, API, channel, and storage capacity. Products expire with the active Yangon month and never activate a prepaid period."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="border-white/10 bg-white/5 text-white"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={openCreate}
              disabled={!writable}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create product
            </Button>
          </div>
        }
      />
      <ConsolePage>
        {error ? (
          <StateMessage
            title="Catalog request failed"
            message={error}
            destructive
          />
        ) : null}
        {!writable ? (
          <StateMessage
            title="Read-only catalog access"
            message="You can inspect top-up bundles, but only platform super admins and operations admins can change the catalog."
          />
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <ConsoleStatCard
            label="Products"
            value={loading ? "..." : products.length}
            note="Platform catalog records"
            tone="blue"
          />
          <ConsoleStatCard
            label="Published"
            value={loading ? "..." : activeCount}
            note="Available to eligible workspaces"
            tone="emerald"
          />
          <ConsoleStatCard
            label="Components"
            value={loading ? "..." : totalComponents}
            note="Stacked dimensions defined"
            tone="amber"
          />
        </div>
        <ConsoleSection
          title="Reusable top-up bundles"
          description="A bundle may combine multiple dimensions, while repeated purchases remain independent grants."
        >
          {loading ? (
            <StatePanel message="Loading top-up catalog..." />
          ) : products.length === 0 ? (
            <StatePanel message="No top-up products have been created yet." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <PackagePlus className="h-5 w-5 text-sky-300" />
                        <h2 className="font-semibold text-white">
                          {product.name}
                        </h2>
                        <Badge
                          variant="outline"
                          className={
                            product.status === "active"
                              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                              : product.status === "archived"
                                ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                                : "border-white/10 bg-white/5 text-slate-300"
                          }
                        >
                          {product.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.code} · v{product.version}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-white">
                      {formatMoney(product.price, product.currency)}
                    </p>
                  </div>
                  {product.description ? (
                    <p className="mt-4 text-sm text-slate-400">
                      {product.description}
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {product.components.map((component) => (
                      <div
                        key={component.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <p className="text-xs text-slate-400">
                          {labelFor(component.componentType)}
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {component.quantity.toLocaleString()} {component.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {writable && product.status === "inactive" ? (
                      <Button
                        size="sm"
                        onClick={() => void runAction(product, "publish")}
                        disabled={actionId === product.id}
                        className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Publish
                      </Button>
                    ) : null}
                    {writable && product.status !== "archived" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(product)}
                        className="border-white/10 bg-white/5 text-white"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    ) : null}
                    {writable && product.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runAction(product, "archive")}
                        disabled={actionId === product.id}
                        className="border-amber-400/30 bg-amber-500/10 text-amber-100"
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </Button>
                    ) : null}
                    {writable && product.status === "inactive" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runAction(product, "delete")}
                        disabled={actionId === product.id}
                        className="border-rose-400/30 bg-rose-500/10 text-rose-100"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ConsoleSection>
      </ConsolePage>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1727] text-white">
          <DialogHeader>
            <DialogTitle>
              {selected ? `Edit ${selected.name}` : "Create top-up product"}
            </DialogTitle>
            <DialogDescription>
              Define the complete bundle. An active product must contain at
              least one positive component.
            </DialogDescription>
          </DialogHeader>
          {formError ? (
            <StateMessage
              title="Check product details"
              message={formError}
              destructive
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product code">
              <Input
                value={draft.code}
                onChange={(event) =>
                  setDraft({ ...draft, code: event.target.value })
                }
                placeholder="message_boost_10000"
                className="border-white/10 bg-slate-950/40"
              />
            </Field>
            <Field label="Product name">
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                className="border-white/10 bg-slate-950/40"
              />
            </Field>
            <Field label="Price">
              <Input
                type="number"
                min="0"
                value={draft.price}
                onChange={(event) =>
                  setDraft({ ...draft, price: event.target.value })
                }
                className="border-white/10 bg-slate-950/40"
              />
            </Field>
            <Field label="Currency">
              <Input
                value={draft.currency}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    currency: event.target.value.toUpperCase(),
                  })
                }
                maxLength={3}
                className="border-white/10 bg-slate-950/40"
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              className="min-h-20 border-white/10 bg-slate-950/40"
            />
          </Field>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">
                  Bundle components
                </p>
                <p className="text-xs text-slate-400">
                  Each dimension appears once; repeated purchases stack.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addComponent}
                disabled={draft.components.length >= componentOptions.length}
                className="border-white/10 bg-white/5"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add component
              </Button>
            </div>
            {draft.components.map((component, index) => (
              <div
                key={`${component.componentType}-${index}`}
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"
              >
                <select
                  value={component.componentType}
                  onChange={(event) =>
                    updateComponent(index, {
                      componentType: event.target
                        .value as DraftComponent["componentType"],
                    })
                  }
                  className="h-10 rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-white"
                >
                  {componentOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={draft.components.some(
                        (item, itemIndex) =>
                          itemIndex !== index &&
                          item.componentType === option.value,
                      )}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="1"
                  value={component.quantity}
                  onChange={(event) =>
                    updateComponent(index, { quantity: event.target.value })
                  }
                  className="border-white/10 bg-slate-950/40"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => removeComponent(index)}
                  disabled={draft.components.length === 1}
                  className="border-white/10 bg-white/5"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-white/10 bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving
                ? "Saving..."
                : selected
                  ? "Save changes"
                  : "Create product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-slate-300">{label}</Label>
      {children}
    </div>
  );
}
function StatePanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-10 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}
function StateMessage({
  title,
  message,
  destructive = false,
}: {
  title: string;
  message: string;
  destructive?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${destructive ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 opacity-80">{message}</p>
      </div>
    </div>
  );
}
