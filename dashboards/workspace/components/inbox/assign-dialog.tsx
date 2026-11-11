"use client";
import { useI18n } from "@/components/providers/i18n-provider"

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, UserCheck, UserMinus, UserPlus } from "lucide-react";
import type { TenantAgentDto } from "@/lib/api";

/**
 * Assignment dialog for one conversation.
 *
 * Three actions, one place: take it yourself, hand it to a teammate, or
 * release it to the pool. The member list only renders when the caller can
 * see the team (owner/admin/supervisor today) — agents get self + unassign,
 * which matches the existing team-visibility rule rather than inventing a
 * new one. Unassign is two-step (arm, then confirm) because dropping
 * ownership orphans the thread and should never happen on a misclick.
 *
 * Permission is open by product decision; the future supervisor-only rule
 * has its seam server-side (`unassignConversation`), not here.
 */
export function AssignDialog({
  open,
  onOpenChange,
  customerName,
  assignedAgentId,
  assignedAgentName,
  currentUserId,
  teamMembers,
  assigning,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  assignedAgentId?: string | null;
  assignedAgentName: string;
  currentUserId: string | null;
  teamMembers: TenantAgentDto[];
  assigning: boolean;
  onAssign: (agentId: string | null) => void;
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("");
  const [confirmingUnassign, setConfirmingUnassign] = useState(false);
  const isMine = !!assignedAgentId && assignedAgentId === currentUserId;

  const visibleMembers = teamMembers.filter((member) => {
    if (member.id === currentUserId) return false;
    if (!query.trim()) return true;
    const haystack =
      `${member.fullName || ""} ${member.email || ""} ${member.phone || ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const close = () => {
    setConfirmingUnassign(false);
    setQuery("");
    onOpenChange(false);
  };

  const pick = (agentId: string | null) => {
    onAssign(agentId);
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmingUnassign(false);
          setQuery("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {assignedAgentId ? t("workspace.inbox.assign.assignedTo", { name: assignedAgentName }) : t("workspace.inbox.assign.assignTitle")}
          </DialogTitle>
          <DialogDescription>
            {customerName} · assignment is info-only, the thread stays open.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {!isMine ? (
            <Button
              className="w-full justify-start"
              disabled={assigning || !currentUserId}
              onClick={() => currentUserId && pick(currentUserId)}
            >
              {assigning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="mr-2 h-4 w-4" />
              )}
              Assign to me
            </Button>
          ) : null}

          {teamMembers.length > 0 ? (
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("workspace.inbox.assign.searchTeam")}
                  aria-label={t("workspace.inbox.assign.searchTeam")}
                  className="pl-9"
                />
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {visibleMembers.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-slate-500 dark:text-slate-400">
                    No team members match.
                  </p>
                ) : (
                  visibleMembers.map((member) => (
                    <Button
                      key={member.id}
                      variant={member.id === assignedAgentId ? "secondary" : "ghost"}
                      className="w-full justify-start font-normal"
                      disabled={assigning || member.id === assignedAgentId}
                      onClick={() => pick(member.id)}
                    >
                      <UserPlus className="mr-2 h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        {member.fullName || member.email || member.phone || t("workspace.inbox.staff")}
                      </span>
                      {member.id === assignedAgentId ? (
                        <span className="ml-auto shrink-0 text-xs text-slate-500">
                          Current
                        </span>
                      ) : null}
                    </Button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {assignedAgentId ? (
            confirmingUnassign ? (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={assigning}
                  onClick={() => pick(null)}
                >
                  {assigning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserMinus className="mr-2 h-4 w-4" />
                  )}
                  Confirm unassign
                </Button>
                <Button
                  variant="outline"
                  disabled={assigning}
                  onClick={() => setConfirmingUnassign(false)}
                >
                  Keep
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={assigning}
                onClick={() => setConfirmingUnassign(true)}
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Unassign (back to pool)
              </Button>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
