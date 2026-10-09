import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import { LEAD_STATUSES, formatBudget, formatPhone, followUpBucket, type LeadStatus } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { StatusBadge, UserName } from "@/components/crm/common";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { Lead } from "@/components/crm/LeadForm";
import type { Profile } from "@/lib/auth";

type Props = {
  leads: Lead[];
  profiles: Profile[];
  onOpen: (id: string) => void;
  onMove: (id: string, status: LeadStatus) => void;
};

export function LeadKanban({ leads, profiles, onOpen, onMove }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex min-h-[calc(100vh-360px)] gap-3">
        {LEAD_STATUSES.map((s) => {
          const items = leads.filter((l) => l.status === s);
          const total = items.reduce((sum, l) => sum + (Number(l.budget) || 0), 0);
          return (
            <div
              key={s}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOver(null);
                setDragId(null);
                const lead = leads.find((l) => l.id === id);
                if (lead && lead.status !== s) onMove(lead.id, s);
              }}
              className={cn(
                "flex w-[270px] shrink-0 flex-col rounded-xl border bg-secondary/50 transition-colors",
                over === s && "border-gold bg-gold/10",
              )}
            >
              <div className="border-b px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={s} />
                  <span className="text-sm font-semibold tabular-nums">{items.length}</span>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  Total value <span className="font-medium text-foreground">{total ? formatBudget(total) : "—"}</span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {items.map((l) => {
                  const b = followUpBucket(l.next_follow_up);
                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", l.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(l.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onClick={() => onOpen(l.id)}
                      className={cn(
                        "cursor-grab rounded-lg border bg-card p-3 text-sm shadow-soft transition hover:border-gold/60 active:cursor-grabbing",
                        dragId === l.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-primary dark:text-foreground">{l.name}</div>
                          <div className="text-mono-tabular text-xs text-muted-foreground">{formatPhone(l.phone)}</div>
                        </div>
                        <div onClick={(e) => e.stopPropagation()} className="md:hidden">
                          <Select value={l.status} onValueChange={(v) => onMove(l.id, v as LeadStatus)}>
                            <SelectTrigger className="h-7 w-auto px-2 text-xs">Move</SelectTrigger>
                            <SelectContent>
                              {LEAD_STATUSES.map((x) => (
                                <SelectItem key={x} value={x}>{x}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        {l.property_interest && <span className="rounded bg-secondary px-1.5 py-0.5">{l.property_interest}</span>}
                        {l.budget != null && <span className="rounded bg-gold/15 px-1.5 py-0.5 font-medium">{formatBudget(l.budget)}</span>}
                        <span className="rounded border px-1.5 py-0.5 text-muted-foreground">{l.source}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <UserName id={l.assigned_to} profiles={profiles} />
                        {l.next_follow_up && (
                          <span className={cn("flex items-center gap-1", b === "overdue" && "text-destructive", b === "today" && "font-medium text-gold")}>
                            <CalendarClock className="h-3 w-3" />
                            {format(new Date(l.next_follow_up), "d MMM")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Drop leads here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
