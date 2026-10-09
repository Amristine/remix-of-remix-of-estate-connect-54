import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { PROPERTY_TYPES, formatBudget, type PropertyType } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, FilterSelect, PageHeader, StatCard, StatusBadge, tableHead, tableRow } from "@/components/crm/common";
import { UNIT_STATUSES, type UnitStatus } from "@/components/crm/LeadUnits";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Bhangar Estates CRM" },
      { name: "description", content: "Track projects, towers, units, pricing and availability." },
      { property: "og:title", content: "Inventory — Bhangar Estates CRM" },
      { property: "og:description", content: "Track projects, towers, units, pricing and availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryPage,
});

type UnitRow = {
  id: string; project_id: string; tower: string | null; unit_number: string; unit_type: PropertyType | null;
  sqft: number | null; price: number | null; status: UnitStatus; lead_id: string | null; notes: string | null;
  projects: { name: string } | null; leads: { name: string } | null;
};

function InventoryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [project, setProject] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [projOpen, setProjOpen] = useState(false);
  const [editing, setEditing] = useState<UnitRow | "new" | null>(null);

  const projectsQ = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const unitsQ = useQuery({
    queryKey: ["units", "full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*, projects(name), leads(name)").order("unit_number");
      if (error) throw error;
      return data as unknown as UnitRow[];
    },
  });

  const all = unitsQ.data ?? [];
  const units = useMemo(
    () =>
      all.filter(
        (u) =>
          (!project || u.project_id === project) &&
          (!status || u.status === status) &&
          (!type || u.unit_type === type) &&
          (!q || `${u.unit_number} ${u.tower ?? ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [all, project, status, type, q],
  );
  const count = (s: string) => all.filter((u) => u.status === s).length;
  const value = all.filter((u) => u.status !== "Sold").reduce((s, u) => s + (Number(u.price) || 0), 0);

  async function remove(id: string) {
    if (!confirm("Delete this unit?")) return;
    const { error } = await supabase.from("units").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["units"] });
  }

  const projects = projectsQ.data ?? [];
  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Projects, towers and units with live availability."
        actions={
          me?.isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setProjOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Project
              </Button>
              <Button className="bg-gold text-gold-foreground hover:bg-gold/90" disabled={!projects.length} onClick={() => setEditing("new")}>
                <Plus className="mr-1.5 h-4 w-4" /> Unit
              </Button>
            </div>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total units" value={all.length} />
        <StatCard label="Available" value={count("Available")} />
        <StatCard label="Blocked" value={count("Blocked")} />
        <StatCard label="Sold" value={count("Sold")} />
        <StatCard label="Unsold value" value={formatBudget(value)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="h-9 w-[200px] bg-card" placeholder="Search unit / tower" value={q} onChange={(e) => setQ(e.target.value)} />
        <FilterSelect value={project} onChange={setProject} placeholder="All projects" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect value={type} onChange={setType} placeholder="All types" options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))} />
        <FilterSelect value={status} onChange={setStatus} placeholder="All statuses" options={UNIT_STATUSES.map((s) => ({ value: s, label: s }))} />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b">
                {["Project", "Tower", "Unit", "Type", "Sq ft", "Price", "Status", "Lead", ""].map((h) => (
                  <th key={h} className={cn(tableHead, "px-4 py-3")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className={tableRow}>
                  <td className="px-4 font-medium text-primary dark:text-foreground">{u.projects?.name}</td>
                  <td className="px-4">{u.tower ?? "—"}</td>
                  <td className="px-4 tabular-nums">{u.unit_number}</td>
                  <td className="px-4">{u.unit_type ?? "—"}</td>
                  <td className="px-4 tabular-nums">{u.sqft ?? "—"}</td>
                  <td className="px-4 tabular-nums">{formatBudget(u.price)}</td>
                  <td className="px-4"><StatusBadge status={u.status} /></td>
                  <td className="px-4">{u.leads?.name ?? "—"}</td>
                  <td className="px-4 text-right">
                    {u.status === "Available" && <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => navigate({ to: "/deals", search: { leadId: u.lead_id ?? undefined, unitId: u.id, dealId: undefined } })}>Book unit</Button>}
                    {me?.isAdmin && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(u)} aria-label="Edit unit"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(u.id)} aria-label="Delete unit"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!unitsQ.isLoading && units.length === 0 && (
            <EmptyState
              icon={<Building className="h-5 w-5" />}
              title={all.length ? "No units match" : "No inventory yet"}
              body={projects.length ? "Add units to start tracking availability." : "Create a project first, then add its units."}
            />
          )}
        </div>
      </div>
      <ProjectDialog open={projOpen} onClose={() => setProjOpen(false)} />
      {editing && <UnitDialog unit={editing === "new" ? null : editing} projects={projects} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  async function save() {
    if (!name.trim()) return toast.error("Project name is required");
    const { error } = await supabase.from("projects").insert({ name: name.trim(), location: location.trim() || null, description: description.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("Project created");
    setName(""); setLocation(""); setDescription("");
    qc.invalidateQueries({ queryKey: ["projects"] });
    onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-section-heading">New project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Green Valley Residency" /></Field>
          <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UnitDialog({ unit, projects, onClose }: { unit: UnitRow | null; projects: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    project_id: unit?.project_id ?? projects[0]?.id ?? "",
    tower: unit?.tower ?? "",
    unit_number: unit?.unit_number ?? "",
    unit_type: (unit?.unit_type ?? "") as string,
    sqft: unit?.sqft?.toString() ?? "",
    price: unit?.price?.toString() ?? "",
    status: (unit?.status ?? "Available") as UnitStatus,
    notes: unit?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    if (!f.project_id || !f.unit_number.trim()) return toast.error("Project and unit number are required");
    const payload = {
      project_id: f.project_id,
      tower: f.tower.trim() || null,
      unit_number: f.unit_number.trim(),
      unit_type: (f.unit_type || null) as PropertyType | null,
      sqft: f.sqft ? Number(f.sqft) : null,
      price: f.price ? Number(f.price) : null,
      status: f.status,
      notes: f.notes.trim() || null,
    };
    const { error } = unit ? await supabase.from("units").update(payload).eq("id", unit.id) : await supabase.from("units").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(unit ? "Unit updated" : "Unit added");
    qc.invalidateQueries({ queryKey: ["units"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-section-heading">{unit ? "Edit unit" : "New unit"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project" className="col-span-2">
            <Select value={f.project_id} onValueChange={set("project_id")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Tower / Block"><Input value={f.tower} onChange={(e) => set("tower")(e.target.value)} placeholder="Tower A" /></Field>
          <Field label="Unit / Plot no."><Input value={f.unit_number} onChange={(e) => set("unit_number")(e.target.value)} placeholder="402" /></Field>
          <Field label="Type">
            <Select value={f.unit_type} onValueChange={set("unit_type")}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNIT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Area (sq ft)"><Input type="number" value={f.sqft} onChange={(e) => set("sqft")(e.target.value)} /></Field>
          <Field label="Price (₹)"><Input type="number" value={f.price} onChange={(e) => set("price")(e.target.value)} /></Field>
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
