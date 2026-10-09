import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_SOURCES, LEAD_STATUSES, PROPERTY_TYPES, normalizePhone } from "@/lib/crm";
import type { Profile } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

export type Lead = Tables<"leads">;

export type LeadFormValues = {
  name: string;
  phone: string;
  email: string;
  source: string;
  property_interest: string;
  budget: string;
  location: string;
  status: string;
  assigned_to: string;
  next_follow_up: string;
};

export function emptyLead(meId?: string): LeadFormValues {
  return { name: "", phone: "", email: "", source: "Other", property_interest: "", budget: "", location: "", status: "New", assigned_to: meId ?? "", next_follow_up: "" };
}

export function leadToForm(l: Lead): LeadFormValues {
  return {
    name: l.name,
    phone: l.phone,
    email: l.email ?? "",
    source: l.source,
    property_interest: l.property_interest ?? "",
    budget: l.budget?.toString() ?? "",
    location: l.location ?? "",
    status: l.status,
    assigned_to: l.assigned_to ?? "",
    next_follow_up: l.next_follow_up ? toLocalInput(l.next_follow_up) : "",
  };
}

export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/** Validates + checks duplicates. Returns payload or null (after toasting). */
export async function validateLead(v: LeadFormValues, excludeLeadId?: string, originalPhone?: string) {
  if (!v.name.trim()) return toast.error("Name is required"), null;
  const phone = normalizePhone(v.phone);
  if (!phone) return toast.error("Enter a valid Indian mobile number (10 digits, optional +91)"), null;
  if (phone !== originalPhone) {
    const { data } = await supabase.rpc("find_phone", { _phone: phone });
    const hit = data?.[0];
    void excludeLeadId;
    if (hit) return toast.warning(`Duplicate: ${phone} already exists in ${hit.kind === "lead" ? "Leads" : "Data"} (${hit.name})`), null;
  }
  return {
    name: v.name.trim(),
    phone,
    email: v.email.trim() || null,
    source: v.source as Lead["source"],
    property_interest: (v.property_interest || null) as Lead["property_interest"],
    budget: v.budget ? Number(v.budget) : null,
    location: v.location.trim() || null,
    status: v.status as Lead["status"],
    assigned_to: v.assigned_to || null,
    next_follow_up: v.next_follow_up ? new Date(v.next_follow_up).toISOString() : null,
  };
}

export function LeadFields({
  value,
  onChange,
  profiles,
  isAdmin,
}: {
  value: LeadFormValues;
  onChange: (v: LeadFormValues) => void;
  profiles: Profile[];
  isAdmin: boolean;
}) {
  const set = (k: keyof LeadFormValues) => (val: string) => onChange({ ...value, [k]: val });
  const sel = (k: keyof LeadFormValues, opts: readonly string[], placeholder: string) => (
    <Select value={value[k] || undefined} onValueChange={set(k)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Name *" className="col-span-2">
        <Input value={value.name} onChange={(e) => set("name")(e.target.value)} />
      </Field>
      <Field label="Phone *">
        <Input value={value.phone} className="text-mono-tabular" placeholder="+91 98765 43210" onChange={(e) => set("phone")(e.target.value)} />
      </Field>
      <Field label="Email">
        <Input type="email" value={value.email} onChange={(e) => set("email")(e.target.value)} />
      </Field>
      <Field label="Source">{sel("source", LEAD_SOURCES, "Source")}</Field>
      <Field label="Property interest">{sel("property_interest", PROPERTY_TYPES, "Select")}</Field>
      <Field label="Budget (₹)">
        <Input type="number" min={0} value={value.budget} placeholder="7500000" onChange={(e) => set("budget")(e.target.value)} />
      </Field>
      <Field label="Location">
        <Input value={value.location} onChange={(e) => set("location")(e.target.value)} />
      </Field>
      <Field label="Status">{sel("status", LEAD_STATUSES, "Status")}</Field>
      <Field label="Assigned to">
        <Select value={value.assigned_to || undefined} onValueChange={set("assigned_to")} disabled={!isAdmin}>
          <SelectTrigger>
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Next follow-up" className="col-span-2">
        <Input type="datetime-local" value={value.next_follow_up} onChange={(e) => set("next_follow_up")(e.target.value)} />
      </Field>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function useSaving() {
  return useState(false);
}

export { Button };
