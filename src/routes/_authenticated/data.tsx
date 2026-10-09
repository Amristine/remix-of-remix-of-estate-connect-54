import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Upload, Database, ArrowRightLeft, Trash2, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles } from "@/lib/auth";
import { DATA_STATUSES, formatPhone, type DataStatus } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, FilterSelect, PageHeader, Pager, StatCard, StatusBadge, UserName, tableHead, tableRow } from "@/components/crm/common";
import { ImportDialog } from "@/components/crm/ImportDialog";

type Search = { q?: string };

export const Route = createFileRoute("/_authenticated/data")({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: typeof s.q === "string" ? s.q : undefined }),
  head: () => ({
    meta: [
      { title: "Data Pool — Estatery CRM" },
      { name: "description", content: "Import, assign and qualify cold contact data." },
      { property: "og:title", content: "Data Pool — Estatery CRM" },
      { property: "og:description", content: "Import, assign and qualify cold contact data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataPage,
});

const PER_PAGE = 25;

function DataPage() {
  const { q: globalQ } = Route.useSearch();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();

  const dataQ = useQuery({
    queryKey: ["data"],
    queryFn: async () => {
      const { data, error } = await supabase.from("data_records").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const batchesQ = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("data_batches").select("id,name").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [search, setSearch] = useState(globalQ ?? "");
  useEffect(() => setSearch(globalQ ?? ""), [globalQ]);
  const [batch, setBatch] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const all = dataQ.data ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return all.filter((r) => {
      if (s && !(r.name.toLowerCase().includes(s) || (digits && r.phone.includes(digits)))) return false;
      if (batch && r.batch_id !== batch) return false;
      if (status === "Converted") { if (!r.converted_lead_id) return false; }
      else if (status && (r.status !== status || r.converted_lead_id)) return false;
      if (assignee === "__none" ? r.assigned_to : assignee && r.assigned_to !== assignee) return false;
      return true;
    });
  }, [all, search, batch, status, assignee]);
  useEffect(() => setPage(1), [search, batch, status, assignee]);
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const hasFilters = !!(search || batch || status || assignee);

  const stats = {
    total: all.length,
    fresh: all.filter((r) => r.status === "Fresh" && !r.converted_lead_id).length,
    called: all.filter((r) => r.status === "Called").length,
    converted: all.filter((r) => r.converted_lead_id).length,
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["data"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  async function setRecordStatus(id: string, s: DataStatus) {
    const { error } = await supabase.from("data_records").update({ status: s }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${s}`);
    refresh();
  }

  async function assign(ids: string[], userId: string) {
    const { error } = await supabase.from("data_records").update({ assigned_to: userId }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} record${ids.length > 1 ? "s" : ""} assigned to ${profiles.find((p) => p.id === userId)?.full_name}`);
    setSelected(new Set());
    refresh();
  }

  async function convert(ids: string[]) {
    const eligible = all.filter((r) => ids.includes(r.id) && !r.converted_lead_id);
    if (!eligible.length) return toast.info("Selected records are already converted");
    const { data: n, error } = await supabase.rpc("convert_data_to_leads", { _ids: eligible.map((r) => r.id) });
    if (error) return toast.error(error.message);
    const skipped = eligible.length - (n ?? 0);
    toast.success(`${n} record${n === 1 ? "" : "s"} converted to leads`, {
      description: skipped ? `${skipped} skipped — phone already exists in Leads` : "They now appear on the Leads page as New.",
    });
    setSelected(new Set());
    refresh();
  }

  async function remove() {
    const ids = [...selected];
    const { error } = await supabase.from("data_records").delete().in("id", ids);
    setConfirmDelete(false);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} record${ids.length > 1 ? "s" : ""} deleted`);
    setSelected(new Set());
    refresh();
  }

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const batchName = (id: string | null) => batchesQ.data?.find((b) => b.id === id)?.name ?? "—";
  const userOpts = profiles.map((p) => ({ value: p.id, label: p.full_name }));

  return (
    <div>
      <PageHeader
        title="Data"
        subtitle="Cold contacts waiting to be qualified."
        actions={
          me?.isAdmin && (
            <Button className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => setImporting(true)}>
              <Upload className="mr-1.5 h-4 w-4" /> Import Data
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total records" value={stats.total} />
        <StatCard label="Fresh" value={stats.fresh} />
        <StatCard label="Called" value={stats.called} />
        <StatCard label="Converted" value={stats.converted} tone="text-gold dark:text-gold" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" className="h-9 w-[220px] bg-card" />
        <FilterSelect value={batch} onChange={setBatch} placeholder="All batches" className="w-[190px]" options={(batchesQ.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        <FilterSelect value={status} onChange={setStatus} placeholder="All statuses" options={[...DATA_STATUSES, "Converted"].map((s) => ({ value: s, label: s }))} />
        {me?.isAdmin && <FilterSelect value={assignee} onChange={setAssignee} placeholder="All users" options={[{ value: "__none", label: "Unassigned" }, ...userOpts]} />}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setBatch(""); setStatus(""); setAssignee(""); }}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-secondary px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {me?.isAdmin && (
            <Select onValueChange={(v) => assign([...selected], v)}>
              <SelectTrigger className="h-8 w-[170px] bg-card">Assign to caller…</SelectTrigger>
              <SelectContent>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={() => convert([...selected])}>
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Convert to Lead
          </Button>
          {me?.isAdmin && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="max-h-[calc(100vh-380px)] min-h-[300px] overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b">
                <th className={cn(tableHead, "w-10 px-4 py-3")}>
                  <Checkbox
                    checked={allOnPage}
                    onCheckedChange={() => {
                      const n = new Set(selected);
                      pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)));
                      setSelected(n);
                    }}
                    aria-label="Select page"
                  />
                </th>
                {["Name", "Phone", "Email", "Location", "Batch", "Uploaded On", "Assigned To", "Status", ""].map((h, i) => (
                  <th key={i} className={cn(tableHead, "px-3 py-3")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataQ.isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className={tableRow}><td colSpan={10} className="px-4"><Skeleton className="h-5 w-full" /></td></tr>
                ))}
              {pageRows.map((r) => (
                <tr key={r.id} className={cn(tableRow, r.converted_lead_id && "opacity-60")}>
                  <td className="px-4">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => {
                        const n = new Set(selected);
                        n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                        setSelected(n);
                      }}
                    />
                  </td>
                  <td className="px-3 font-medium text-primary dark:text-foreground">
                    <span className="flex items-center gap-1.5">
                      {r.name}
                      {r.is_duplicate && (
                        <Tooltip>
                          <TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-gold" /></TooltipTrigger>
                          <TooltipContent>Duplicate phone number</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 text-mono-tabular text-xs">{formatPhone(r.phone)}</td>
                  <td className="max-w-[180px] truncate px-3 text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="px-3">{r.location ?? "—"}</td>
                  <td className="px-3">{batchName(r.batch_id)}</td>
                  <td className="whitespace-nowrap px-3 text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy")}</td>
                  <td className="px-3"><UserName id={r.assigned_to} profiles={profiles} /></td>
                  <td className="px-3">
                    {r.converted_lead_id ? (
                      <StatusBadge status="Converted" />
                    ) : (
                      <Select value={r.status} onValueChange={(v) => setRecordStatus(r.id, v as DataStatus)}>
                        <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:ml-1 [&>svg]:h-3 [&>svg]:w-3">
                          <StatusBadge status={r.status} />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-3 text-right">
                    {!r.converted_lead_id && (
                      <Button size="sm" variant="ghost" className="text-gold hover:text-gold" onClick={() => convert([r.id])}>
                        Convert to Lead
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!dataQ.isLoading && filtered.length === 0 && (
            <EmptyState
              icon={<Database className="h-5 w-5" />}
              title={hasFilters ? "No records match" : "Your data pool is empty"}
              body={hasFilters ? "Try another batch or clear the filters." : me?.isAdmin ? "Import a CSV or Excel sheet to start working through cold contacts." : "Records assigned to you will show up here."}
              action={!hasFilters && me?.isAdmin && <Button onClick={() => setImporting(true)}>Import Data</Button>}
            />
          )}
        </div>
        <Pager page={page} total={filtered.length} perPage={PER_PAGE} onPage={setPage} />
      </div>

      {me && <ImportDialog open={importing} onClose={() => setImporting(false)} me={me} />}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} record{selected.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes them from the data pool. Converted leads are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
