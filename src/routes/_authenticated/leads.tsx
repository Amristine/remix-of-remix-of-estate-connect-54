import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Plus, Download, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles, type Me, type Profile } from "@/lib/auth";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  STATUS_TONE,
  formatBudget,
  formatPhone,
  followUpBucket,
  toCsv,
  downloadFile,
  type LeadStatus,
} from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, FilterSelect, PageHeader, Pager, StatusBadge, UserName, tableHead, tableRow } from "@/components/crm/common";
import { LeadFields, emptyLead, validateLead, type Lead, type LeadFormValues } from "@/components/crm/LeadForm";
import { LeadDetail } from "@/components/crm/LeadDetail";

type Search = { q?: string };

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: typeof s.q === "string" ? s.q : undefined }),
  head: () => ({
    meta: [
      { title: "Leads — Estatery CRM" },
      { name: "description", content: "Track, assign and follow up on real estate leads." },
      { property: "og:title", content: "Leads — Estatery CRM" },
      { property: "og:description", content: "Track, assign and follow up on real estate leads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPage,
});

const PER_PAGE = 25;

function LeadsPage() {
  const { q: globalQ } = Route.useSearch();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();

  const leadsQ = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const [search, setSearch] = useState(globalQ ?? "");
  useEffect(() => setSearch(globalQ ?? ""), [globalQ]);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [assignee, setAssignee] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fu, setFu] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Everything except status filter — used for chip counts
  const baseFiltered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return (leadsQ.data ?? []).filter((l) => {
      if (s && !(l.name.toLowerCase().includes(s) || (digits && l.phone.includes(digits)))) return false;
      if (source && l.source !== source) return false;
      if (assignee === "__none" ? l.assigned_to : assignee && l.assigned_to !== assignee) return false;
      if (from && new Date(l.created_at) < new Date(from)) return false;
      if (to && new Date(l.created_at) > new Date(`${to}T23:59:59`)) return false;
      if (fu && followUpBucket(l.next_follow_up) !== fu) return false;
      return true;
    });
  }, [leadsQ.data, search, source, assignee, from, to, fu]);

  const filtered = useMemo(() => (status ? baseFiltered.filter((l) => l.status === status) : baseFiltered), [baseFiltered, status]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    baseFiltered.forEach((l) => (c[l.status] = (c[l.status] ?? 0) + 1));
    return c;
  }, [baseFiltered]);

  useEffect(() => setPage(1), [search, status, source, assignee, from, to, fu]);
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const openLead = leadsQ.data?.find((l) => l.id === openId) ?? null;
  const hasFilters = !!(search || status || source || assignee || from || to || fu);

  async function changeStatus(ids: string[], next: LeadStatus) {
    const prev = new Map((leadsQ.data ?? []).map((l) => [l.id, l.status]));
    const { error } = await supabase.from("leads").update({ status: next }).in("id", ids);
    if (error) return toast.error(error.message);
    const acts = ids.filter((id) => prev.get(id) !== next).map((id) => ({ lead_id: id, type: "status", content: `Status changed from ${prev.get(id)} to ${next}`, created_by: me?.id }));
    if (acts.length) await supabase.from("lead_activities").insert(acts);
    toast.success(ids.length > 1 ? `${ids.length} leads moved to ${next}` : `Status set to ${next}`);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
  }

  async function assign(ids: string[], userId: string) {
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).in("id", ids);
    if (error) return toast.error(error.message);
    const name = profiles.find((p) => p.id === userId)?.full_name;
    await supabase.from("lead_activities").insert(ids.map((id) => ({ lead_id: id, type: "system", content: `Assigned to ${name}`, created_by: me?.id })));
    toast.success(`${ids.length} lead${ids.length > 1 ? "s" : ""} assigned to ${name}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["leads"] });
  }

  function exportCsv() {
    const rows = filtered.map((l) => ({
      Name: l.name,
      Phone: l.phone,
      Email: l.email ?? "",
      Source: l.source,
      "Property Interest": l.property_interest ?? "",
      Budget: l.budget ?? "",
      Location: l.location ?? "",
      Status: l.status,
      "Assigned To": profiles.find((p) => p.id === l.assigned_to)?.full_name ?? "",
      "Next Follow-up": l.next_follow_up ? format(new Date(l.next_follow_up), "yyyy-MM-dd HH:mm") : "",
      "Last Updated": format(new Date(l.updated_at), "yyyy-MM-dd HH:mm"),
    }));
    if (!rows.length) return toast.error("Nothing to export");
    downloadFile(`leads-${format(new Date(), "yyyyMMdd")}.csv`, toCsv(rows));
    toast.success(`Exported ${rows.length} leads`);
  }

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const n = new Set(selected);
    pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)));
    setSelected(n);
  };
  const userOpts = profiles.map((p) => ({ value: p.id, label: p.full_name }));

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={me?.isAdmin ? "Every enquiry across your team." : "Leads assigned to you."}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            <Button className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Lead
            </Button>
          </>
        }
      />

      {/* Status chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={!status} onClick={() => setStatus("")} label="All" count={baseFiltered.length} />
        {LEAD_STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? "" : s)} label={s} count={counts[s] ?? 0} tone={STATUS_TONE[s]} />
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" className="h-9 w-[220px] bg-card" />
        <FilterSelect value={status} onChange={setStatus} placeholder="All statuses" options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect value={source} onChange={setSource} placeholder="All sources" options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))} />
        {me?.isAdmin && <FilterSelect value={assignee} onChange={setAssignee} placeholder="All users" options={[{ value: "__none", label: "Unassigned" }, ...userOpts]} />}
        <FilterSelect
          value={fu}
          onChange={setFu}
          placeholder="Any follow-up"
          className="w-[150px]"
          options={[
            { value: "today", label: "Today" },
            { value: "overdue", label: "Overdue" },
            { value: "upcoming", label: "Upcoming" },
          ]}
        />
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px] bg-card" aria-label="Created from" />
          <span>–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px] bg-card" aria-label="Created to" />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch(""); setStatus(""); setSource(""); setAssignee(""); setFrom(""); setTo(""); setFu("");
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-secondary px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {me?.isAdmin && (
            <Select onValueChange={(v) => assign([...selected], v)}>
              <SelectTrigger className="h-8 w-[170px] bg-card">Assign to…</SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select onValueChange={(v) => { changeStatus([...selected], v as LeadStatus); setSelected(new Set()); }}>
            <SelectTrigger className="h-8 w-[170px] bg-card">Change status…</SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="max-h-[calc(100vh-360px)] min-h-[300px] overflow-auto">
          <table className="w-full min-w-[1300px] text-sm">
            <thead>
              <tr className="border-b">
                <th className={cn(tableHead, "w-10 px-4 py-3")}>
                  <Checkbox checked={allOnPage} onCheckedChange={toggleAll} aria-label="Select page" />
                </th>
                {["Name", "Phone", "Email", "Source", "Interest", "Budget", "Location", "Status", "Assigned To", "Next Follow-up", "Last Updated"].map((h) => (
                  <th key={h} className={cn(tableHead, "px-3 py-3")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leadsQ.isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className={tableRow}>
                    <td colSpan={12} className="px-4"><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))}
              {pageRows.map((l) => {
                const b = followUpBucket(l.next_follow_up);
                return (
                  <tr key={l.id} className={cn(tableRow, "cursor-pointer")} onClick={() => setOpenId(l.id)}>
                    <td className="px-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(l.id)}
                        onCheckedChange={() => {
                          const n = new Set(selected);
                          n.has(l.id) ? n.delete(l.id) : n.add(l.id);
                          setSelected(n);
                        }}
                      />
                    </td>
                    <td className="px-3 font-medium text-primary dark:text-foreground">{l.name}</td>
                    <td className="whitespace-nowrap px-3 text-mono-tabular text-xs">{formatPhone(l.phone)}</td>
                    <td className="max-w-[180px] truncate px-3 text-muted-foreground">{l.email ?? "—"}</td>
                    <td className="px-3">{l.source}</td>
                    <td className="px-3">{l.property_interest ?? "—"}</td>
                    <td className="whitespace-nowrap px-3">{formatBudget(l.budget)}</td>
                    <td className="px-3">{l.location ?? "—"}</td>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <Select value={l.status} onValueChange={(v) => changeStatus([l.id], v as LeadStatus)}>
                        <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:ml-1 [&>svg]:h-3 [&>svg]:w-3">
                          <StatusBadge status={l.status} />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3"><UserName id={l.assigned_to} profiles={profiles} /></td>
                    <td className={cn("whitespace-nowrap px-3", b === "overdue" && "text-destructive", b === "today" && "font-medium text-gold")}>
                      {l.next_follow_up ? format(new Date(l.next_follow_up), "d MMM, h:mm a") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 text-muted-foreground">{formatDistanceToNow(new Date(l.updated_at))} ago</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!leadsQ.isLoading && filtered.length === 0 && (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={hasFilters ? "No leads match these filters" : "No leads yet"}
              body={hasFilters ? "Try clearing a filter or searching a different name." : me?.isAdmin ? "Add your first lead or convert records from the Data pool." : "Leads assigned to you will appear here."}
              action={!hasFilters && <Button onClick={() => setAdding(true)}>Add Lead</Button>}
            />
          )}
        </div>
        <Pager page={page} total={filtered.length} perPage={PER_PAGE} onPage={setPage} />
      </div>

      {me && <AddLeadDrawer open={adding} onClose={() => setAdding(false)} profiles={profiles} me={me} />}
      {me && <LeadDetail lead={openLead} onClose={() => setOpenId(null)} profiles={profiles} me={me} />}
    </div>
  );
}

function Chip({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs transition-all hover:border-gold/60",
        active && "border-gold ring-1 ring-gold/40",
      )}
    >
      {tone && <span className={cn("badge h-2 w-2 p-0", tone)} style={{ background: "currentColor" }} />}
      <span>{label}</span>
      <span className="font-sans text-sm font-medium tabular-nums text-primary dark:text-foreground">{count}</span>
    </button>
  );
}

function AddLeadDrawer({ open, onClose, profiles, me }: { open: boolean; onClose: () => void; profiles: Profile[]; me: Me }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<LeadFormValues>(emptyLead(me.id));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(emptyLead(me.id));
  }, [open, me.id]);

  async function submit() {
    setSaving(true);
    const payload = await validateLead(form);
    if (!payload) return setSaving(false);
    if (!me.isAdmin) payload.assigned_to = me.id;
    const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
    if (!error) await supabase.from("lead_activities").insert({ lead_id: data.id, type: "system", content: "Lead created", created_by: me.id });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead added");
    qc.invalidateQueries({ queryKey: ["leads"] });
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="text-section-heading text-primary dark:text-foreground">Add Lead</SheetTitle>
        </SheetHeader>
        <LeadFields value={form} onChange={setForm} profiles={profiles} isAdmin={me.isAdmin} />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add Lead"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
