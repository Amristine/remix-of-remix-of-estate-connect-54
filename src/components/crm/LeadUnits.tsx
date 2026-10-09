import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBudget } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./common";

export const UNIT_STATUSES = ["Available", "Blocked", "Sold"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export function unitLabel(u: { tower: string | null; unit_number: string; projects?: { name: string } | null }) {
  return [u.projects?.name, u.tower, u.unit_number].filter(Boolean).join(" · ");
}

export function LeadUnits({ leadId, meId }: { leadId: string; meId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pick, setPick] = useState("");

  const units = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*, projects(name)").order("unit_number");
      if (error) throw error;
      return data;
    },
  });
  const all = units.data ?? [];
  const mine = all.filter((u) => u.lead_id === leadId);
  const available = all.filter((u) => u.status === "Available" && !u.lead_id);

  async function log(content: string) {
    await supabase.from("lead_activities").insert({ lead_id: leadId, type: "system", content, created_by: meId });
    qc.invalidateQueries({ queryKey: ["activities", leadId] });
  }
  async function update(id: string, patch: { lead_id?: string | null; status?: UnitStatus }, msg: string) {
    const { error } = await supabase.from("units").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    await log(msg);
    qc.invalidateQueries({ queryKey: ["units"] });
    toast.success(msg);
  }

  return (
    <div className="space-y-4">
      {mine.length === 0 && <p className="text-sm text-muted-foreground">No units attached yet.</p>}
      {mine.map((u) => (
        <div key={u.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <Building className="h-4 w-4 text-gold" /> {unitLabel(u)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {u.unit_type ?? "—"} · {u.sqft ? `${u.sqft} sq ft` : "—"} · {formatBudget(u.price)}
              </div>
            </div>
            <StatusBadge status={u.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {u.status !== "Blocked" && (
              <Button size="sm" variant="outline" onClick={() => update(u.id, { status: "Blocked" }, `Unit ${unitLabel(u)} blocked`)}>Block</Button>
            )}
            {u.status === "Available" && (
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/deals", search: { leadId, unitId: u.id, dealId: undefined } })}>Create booking</Button>
            )}
            {u.status !== "Sold" && (
              <Button size="sm" variant="ghost" onClick={() => update(u.id, { lead_id: null, status: "Available" }, `Unit ${unitLabel(u)} released`)}>
                <X className="mr-1 h-3.5 w-3.5" /> Release
              </Button>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="flex-1"><SelectValue placeholder={available.length ? "Choose an available unit…" : "No available units"} /></SelectTrigger>
          <SelectContent>
            {available.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {unitLabel(u)} — {u.unit_type ?? ""} {formatBudget(u.price)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!pick}
          onClick={async () => {
            const u = available.find((x) => x.id === pick);
            if (!u) return;
            await update(u.id, { lead_id: leadId }, `Unit ${unitLabel(u)} attached`);
            setPick("");
          }}
        >
          Attach
        </Button>
      </div>
    </div>
  );
}
