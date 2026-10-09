import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBudget } from "@/lib/crm";
import { PageHeader, StatCard, FilterSelect, tableHead, tableRow } from "@/components/crm/common";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Bhangar Estates CRM" },
       { name: "description", content: "Inquiry velocity, inventory sold and agent performance." },
      { property: "og:title", content: "Analytics — Bhangar Estates CRM" },
       { property: "og:description", content: "Inquiry velocity, inventory sold and agent performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const ACTIVE = ["New", "Contacted", "Interested", "Site Visit Scheduled", "Site Visit Done", "Negotiation"];
const VISITED = ["Site Visit Done", "Negotiation", "Booked"];
const CONTACTED_EXCL = ["New"];
const BRACKETS = [
  { label: "< ₹50L", max: 5_000_000 },
  { label: "₹50L–1Cr", max: 10_000_000 },
  { label: "₹1–2Cr", max: 20_000_000 },
  { label: "> ₹2Cr", max: Infinity },
];

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function useAnalyticsData() {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [leads, units, projects, profiles] = await Promise.all([
        supabase.from("leads").select("id,status,source,budget,assigned_to,created_at"),
        supabase.from("units").select("id,project_id,tower,unit_type,price,status,lead_id"),
        supabase.from("projects").select("id,name"),
        supabase.from("profiles").select("id,full_name,email"),
      ]);
      for (const r of [leads, units, projects, profiles]) if (r.error) throw r.error;
      return { leads: leads.data!, units: units.data!, projects: projects.data!, profiles: profiles.data! };
    },
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card p-4 md:p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Meter({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const width = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

type SourceRow = { name: string; total: number; booked: number; value: number; rate: number };

function LeadSourceChart({ rows }: { rows: SourceRow[] }) {
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div className="min-w-0 space-y-8" data-testid="lead-source-chart">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Inquiry volume</span>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold"><i className="size-2.5 rounded-full bg-gold" /> Booked</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No inquiry data for this period.</p>
      ) : (
        rows.map((row) => (
          <div key={row.name} className="min-w-0 space-y-3 text-sm">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="break-words text-base font-semibold">{row.name}</p>
                <p className="text-xs text-muted-foreground">{formatBudget(row.value)} value</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold tabular-nums">{row.rate}%</p>
                <p className="text-xs text-muted-foreground tabular-nums">{row.booked} / {row.total} booked</p>
              </div>
            </div>
            <div
              className="relative h-1.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${row.name}: ${row.total} inquiries, ${row.booked} booked, ${row.rate}% conversion`}
              title={`${row.total} inquiries, ${row.booked} booked; longest bar = ${max} inquiries`}
            >
              {row.booked > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-gold motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${(row.booked / row.total) * 100}%` }} />}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function AnalyticsPage() {
  const { data, isLoading, error } = useAnalyticsData();
  const [range, setRange] = useState("");
  const [project, setProject] = useState("");

  const m = useMemo(() => {
    if (!data) return null;
    const cutoff = !range ? 0 : Date.now() - Number(range) * 86400000;
    const leads = data.leads.filter((l) => new Date(l.created_at).getTime() >= cutoff);
    const units = data.units.filter((u) => !project || u.project_id === project);

    const active = leads.filter((l) => ACTIVE.includes(l.status));
    const booked = leads.filter((l) => l.status === "Booked");
     const inquiryValue = active.reduce((s, l) => s + (l.budget ?? 0), 0);

    const srcMap = new Map<string, { total: number; booked: number; value: number }>();
    for (const l of leads) {
      const e = srcMap.get(l.source) ?? { total: 0, booked: 0, value: 0 };
      e.total++;
      if (l.status === "Booked") e.booked++;
      if (ACTIVE.includes(l.status)) e.value += l.budget ?? 0;
      srcMap.set(l.source, e);
    }
    const sources = [...srcMap].map(([name, v]) => ({ name, ...v, rate: pct(v.booked, v.total) })).sort((a, b) => b.total - a.total);

    const group = (key: (u: (typeof units)[number]) => string) => {
      const g = new Map<string, { Sold: number; Blocked: number; Available: number }>();
      for (const u of units) {
        const k = key(u);
        const e = g.get(k) ?? { Sold: 0, Blocked: 0, Available: 0 };
        e[u.status as "Sold"]++;
        g.set(k, e);
      }
      return [...g]
        .map(([name, v]) => ({ name, ...v, total: v.Sold + v.Blocked + v.Available, rate: pct(v.Sold, v.Sold + v.Blocked + v.Available) }))
        .sort((a, b) => b.rate - a.rate);
    };
    const pname = (id: string) => data.projects.find((p) => p.id === id)?.name ?? "—";
    const byTower = group((u) => `${pname(u.project_id)}${u.tower ? " · " + u.tower : ""}`);
    const byType = group((u) => u.unit_type ?? "Other");
    const byPrice = group((u) => BRACKETS.find((b) => (u.price ?? 0) < b.max)!.label);
    const sold = units.filter((u) => u.status === "Sold");

    const agents = data.profiles
      .map((p) => {
        const mine = leads.filter((l) => l.assigned_to === p.id);
        const mineBooked = mine.filter((l) => l.status === "Booked");
        const revenue = data.units
          .filter((u) => u.status === "Sold" && mineBooked.some((l) => l.id === u.lead_id))
          .reduce((s, u) => s + (u.price ?? 0), 0);
        return {
          id: p.id,
          name: p.full_name || p.email,
          assigned: mine.length,
          contacted: mine.filter((l) => !CONTACTED_EXCL.includes(l.status)).length,
          visits: mine.filter((l) => VISITED.includes(l.status)).length,
          closed: mineBooked.length,
          revenue,
          rate: pct(mineBooked.length, mine.length),
        };
      })
      .filter((a) => a.assigned > 0)
      .sort((a, b) => b.closed - a.closed || b.visits - a.visits);

    return {
       total: leads.length, active: active.length, booked: booked.length, inquiryValue,
      winRate: pct(booked.length, leads.length),
      sources, byTower, byType, byPrice, agents,
       inventorySold: pct(sold.length, units.length),
      soldValue: sold.reduce((s, u) => s + (u.price ?? 0), 0),
    };
  }, [data, range, project]);

  return (
     <div className="min-w-0 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Analytics"
         subtitle="Inquiry velocity, inventory sold and team performance"
        actions={
           <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <FilterSelect
               className="w-full sm:w-[160px]"
              value={range}
              onChange={setRange}
              placeholder="All time"
              options={[
                                { value: "30", label: "Last 30 days" },
                { value: "90", label: "Last 90 days" },
              ]}
            />
            <FilterSelect
               className="w-full sm:w-[160px]"
              value={project}
              onChange={setProject}
              placeholder="All projects"
              options={(data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        }
      />
      {isLoading && <p className="text-sm text-muted-foreground">Loading analytics…</p>}
      {error && <p className="text-sm text-destructive">Couldn't load analytics.</p>}
      {m && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
             <StatCard label="Inquiry value" value={formatBudget(m.inquiryValue)} />
             <StatCard label="Active inquiries" value={m.active} />
            <StatCard label="Deals booked" value={m.booked} />
            <StatCard label="Win rate" value={`${m.winRate}%`} />
             <StatCard label="Inventory sold" value={`${m.inventorySold}%`} />
            <StatCard label="Sold value" value={formatBudget(m.soldValue)} />
          </div>

          <Section title="Conversion by lead source">
             <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <LeadSourceChart rows={m.sources} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                   <thead className={tableHead}><tr><th className="py-2">Source</th><th>Leads</th><th>Booked</th><th>Conv.</th><th>Inquiries</th></tr></thead>
                  <tbody>
                    {m.sources.map((s) => (
                      <tr key={s.name} className={tableRow}>
                        <td className="font-medium">{s.name}</td><td>{s.total}</td><td>{s.booked}</td><td>{s.rate}%</td><td>{formatBudget(s.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
             <Section title="Inventory sold by unit type"><InventorySoldChart rows={m.byType} /></Section>
             <Section title="Inventory sold by price bracket"><InventorySoldChart rows={m.byPrice} /></Section>
          </div>
           <Section title="Inventory sold by project & tower">
             <div className="overflow-x-auto">
             <table className="w-full min-w-[640px] text-sm">
              <thead className={tableHead}><tr><th className="py-2">Tower</th><th>Units</th><th>Sold</th><th>Blocked</th><th>Available</th><th>Sell-through</th></tr></thead>
              <tbody>
                {m.byTower.map((r) => (
                  <tr key={r.name} className={tableRow}>
                    <td className="font-medium">{r.name}</td><td>{r.total}</td><td>{r.Sold}</td><td>{r.Blocked}</td><td>{r.Available}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-24"><Meter value={r.rate} max={100} /></div>
                        {r.rate}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
             </div>
          </Section>

          <Section title="Agent performance">
            {m.agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assigned leads in this period.</p>
            ) : (
               <div className="overflow-x-auto">
               <table className="w-full min-w-[720px] text-sm">
                <thead className={tableHead}><tr><th className="py-2">#</th><th>Agent</th><th>Assigned</th><th>Contacted</th><th>Site visits</th><th>Deals closed</th><th>Conv.</th><th>Revenue</th></tr></thead>
                <tbody>
                  {m.agents.map((a, i) => (
                    <tr key={a.id} className={tableRow}>
                      <td>{i + 1}</td><td className="font-medium">{a.name}</td><td>{a.assigned}</td><td>{a.contacted}</td><td>{a.visits}</td><td>{a.closed}</td><td>{a.rate}%</td><td>{formatBudget(a.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
               </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function InventorySoldChart({ rows }: { rows: { name: string; Sold: number; Blocked: number; Available: number; total: number; rate: number }[] }) {
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-xs text-muted-foreground">
        <span>Unit mix and sell-through</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-gold" /> Sold</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary" /> Available</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-muted-foreground" /> Blocked</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No inventory data for this period.</p>
      ) : (
        rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(88px,0.8fr)_minmax(0,2fr)_auto]">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{row.total} units</p>
            </div>
            <div className="col-span-2 row-start-2 space-y-1.5 sm:col-span-1 sm:row-start-auto" title={`${row.Sold} sold, ${row.Blocked} blocked, ${row.Available} available`}>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                {row.Sold > 0 && <div className="bg-gold" style={{ width: `${(row.Sold / max) * 100}%` }} />}
                {row.Blocked > 0 && <div className="bg-muted-foreground" style={{ width: `${(row.Blocked / max) * 100}%` }} />}
                {row.Available > 0 && <div className="bg-primary" style={{ width: `${(row.Available / max) * 100}%` }} />}
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>{row.Sold} sold</span><span>{row.Available} available</span>
              </div>
            </div>
            <div className="col-start-2 row-start-1 text-right sm:col-start-3">
              <p className="font-semibold tabular-nums">{row.rate}%</p>
              <p className="text-xs text-muted-foreground">sold</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
