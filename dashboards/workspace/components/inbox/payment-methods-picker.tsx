"use client";

import { useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkspacePaymentMethod } from "@/lib/api";

export function PaymentMethodsPicker({
  open,
  onOpenChange,
  methods,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: WorkspacePaymentMethod[];
  onSelect: (method: WorkspacePaymentMethod) => void;
}) {
  const online = useMemo(
    () => methods.filter((m) => ((m.metadata?.category as string) ?? (m.kind === "other" ? "bank" : "online")) === "online"),
    [methods],
  );
  const bank = useMemo(
    () => methods.filter((m) => ((m.metadata?.category as string) ?? (m.kind === "other" ? "bank" : "online")) === "bank"),
    [methods],
  );
  const [tab, setTab] = useState<"online" | "bank">("online");

  const list = tab === "online" ? online : bank;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment methods</DialogTitle>
          <DialogDescription>Select a payment method to send to the chat.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "online" | "bank")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="online">Online payment</TabsTrigger>
            <TabsTrigger value="bank">Bank transfer</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            {list.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No {tab === "online" ? "online payment" : "bank transfer"} methods yet.
              </p>
            ) : (
              <div className="grid gap-2">
                {list.map((method, index) => (
                  <button
                    key={method.id || index}
                    type="button"
                    onClick={() => {
                      onSelect(method);
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  >
                    {method.image?.downloadUrl ? (
                      <img src={method.image.downloadUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <CreditCard className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{method.name || "Custom method"}</span>
                      <span className="block truncate text-xs text-slate-500">{method.accountName} · {method.accountNumber}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}