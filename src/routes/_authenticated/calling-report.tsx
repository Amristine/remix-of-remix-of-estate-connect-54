import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Download, Phone, PhoneCall, PhoneMissed, PhoneIncoming, MessageSquare, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProfiles } from "@/lib/auth";
import { LEAD_STATUSES, toCsv, downloadFile } from "@/lib/crm";
import { PageHeader, FilterSelect, StatusBadge, UserAvatar, UserName, tableHead, tableRow } from "@/components/crm/common";
import { parseCallOutcome } from "@/components/crm/CallLogDialog";
import { LeadDetail } from "@/components/crm/LeadDetail";
import type { Lead } from "@/components/crm/LeadForm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];
function rangeStart(r: string): Date | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "today") return d;
  if (r === "week") { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  if (r === "month") { d.setDate(1); return d; }
  return null;
}

export const Route = createFileRoute("/_authenticated/calling-report")({
  head: () => ({
    meta: [
      { title: "Calling Report — Bhangar Estates CRM" },
      { name: "description", content: "Per-lead calls, messages and lead temperature." },
      { property: "og:title", content: "Calling Report — Bhangar Estates CRM" },
      { property: "og:description", content: "Per-lead calls, messages and lead temperature." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CallingReport,
});

type Temp = "Hot" | "Warm" | "Cold";
const TEMP_LABEL: Record<Temp, string> = { Hot: "🔥 Hot", Warm: "🟡 Warm", Cold: "❄️ Cold" };
const UNANSWERED = ["Ringing", "Busy", "Not reachable", "Left message"];
const HOT_STATUS = ["Site Visit Scheduled", "Site Visit Done", "Negotiation", "Booked"];
const MSG_TYPES = ["whatsapp", "sms", "email"];

function temperature(l: Lead, s: { connected: number; incoming: number; unanswered: number; messages: number; last?: string }): Temp {
  const days = s.last ? (Date.now() - new Date(s.last).getTime()) / 86_400_000 : Infinity;
  if (l.status === "Not Interested" || l.status === "Lost") return "Cold";
  if (HOT_STATUS.includes(l.status) || s.incoming > 0 || (s.connected >= 2 && days < 7)) return "Hot";
  if (s.connected >= 1 || l.status === "Interested" || l.status === "Callback" || (s.messages > 0 && days < 14)) return "Warm";
  return "Cold";
}

function CallingReport() {
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const [q, setQ] = useState("");
  const [temp, setTemp] = useState("");
  const [activity, setActivity] = useState("");
  const [agent, setAgent] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [range, setRange] = useState("all");

  const leadsQ = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });
  const actQ = useQuery({
    queryKey: ["activities", "report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("lead_id,type,content,created_at")
        .in("type", ["call", ...MSG_TYPES])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const since = rangeStart(range);
    const stats = new Map<string, { total: number; connected: number; incoming: number; unanswered: number; messages: number; last?: string; lastOutcome?: string }>();
    for (const a of actQ.data ?? []) {
      if (since && new Date(a.created_at) < since) continue;
      const s = stats.get(a.lead_id) ?? { total: 0, connected: 0, incoming: 0, unanswered: 0, messages: 0 };
      if (a.type === "call") {
        const o = parseCallOutcome(a.content)?.outcome ?? "";
        s.total++;
        if (o === "Connected") s.connected++;
        else if (o === "Incoming call") s.incoming++;
        else if (UNANSWERED.includes(o)) s.unanswered++;
        if (!s.lastOutcome) s.lastOutcome = o || "Call";
      } else s.messages++;
      if (!s.last) s.last = a.created_at;
      stats.set(a.lead_id, s);
    }
    return (leadsQ.data ?? []).map((l) => {
      const s = stats.get(l.id) ?? { total: 0, connected: 0, incoming: 0, unanswered: 0, messages: 0 };
      return { lead: l, ...s, temp: temperature(l, s) };
    });
  }, [leadsQ.data, actQ.data, range]);

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    if (t && !`${r.lead.name} ${r.lead.phone} ${r.lead.email ?? ""}`.toLowerCase().includes(t)) return false;
    if (temp && r.temp !== temp) return false;
    if (agent && r.lead.assigned_to !== agent) return false;
    if (status && r.lead.status !== status) return false;
    if (activity === "connected" && !r.connected) return false;
    if (activity === "unanswered" && !(r.unanswered && !r.connected)) return false;
    if (activity === "incoming" && !r.incoming) return false;
    if (activity === "none" && r.total) return false;
    return true;
  });

  const sum = (k: "total" | "connected" | "incoming" | "unanswered" | "messages") => filtered.reduce((a, r) => a + r[k], 0);
  const totals = { total: sum("total"), connected: sum("connected"), incoming: sum("incoming"), unanswered: sum("unanswered"), messages: sum("messages") };
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.full_name || profiles.find((p) => p.id === id)?.email || "—";

  function exportCsv() {
    const data = filtered.map((r) => ({
      Name: r.lead.name, Phone: r.lead.phone, Status: r.lead.status, Temperature: r.temp,
      "Total calls": r.total, Connected: r.connected, "Ringing/Unanswered": r.unanswered, Incoming: r.incoming,
      Messages: r.messages, "Last call": r.lastOutcome ?? "", "Last activity": r.last ?? "", Agent: name(r.lead.assigned_to),
    }));
    downloadFile("calling-report.csv", toCsv(data), "text/csv");
  }

  const openLead = leadsQ.data?.find((l) => l.id === openId) ?? null;
  const tempCount = (t: Temp) => filtered.filter((r) => r.temp === t).length;
  const outcomeTone = (o?: string) =>
    o === "Connected" ? "badge-green" : o === "Incoming call" ? "badge-blue" : o === "Wrong number" ? "badge-red" : o ? "badge-amber" : "badge-grey";
  const TEMP_TONE: Record<Temp, string> = { Hot: "badge-red", Warm: "badge-amber", Cold: "badge-blue" };

  const kpis = [
    { label: "Total calls", value: totals.total, icon: Phone, tone: "badge-indigo" },
    { label: "Connected", value: totals.connected, icon: PhoneCall, tone: "badge-green", bar: pct(totals.connected, totals.total) },
    { label: "Unanswered", value: totals.unanswered, icon: PhoneMissed, tone: "badge-amber", bar: pct(totals.unanswered, totals.total) },
    { label: "Incoming", value: totals.incoming, icon: PhoneIncoming, tone: "badge-blue" },
    { label: "Messages sent", value: totals.messages, icon: MessageSquare, tone: "badge-teal" },
  ];

  return (
    <div>
      <PageHeader
        title="Calling Report"
        subtitle="Calls, messages and temperature for every lead"
        actions={<Button variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>}
      />

      <div className="mb-5 inline-flex rounded-lg border bg-card p-1">
        {RANGES.map((r) => (
          <button key={r.value} onClick={() => setRange(r.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-helper uppercase">{k.label}</span>
              <span className={`badge ${k.tone} !p-1.5`}><k.icon className="h-3.5 w-3.5" /></span>
            </div>
            <div className="mt-2 text-stat-number text-primary dark:text-foreground">{k.value}</div>
            {k.bar !== undefined && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`badge ${k.tone} h-full !rounded-full !p-0`} style={{ width: `${k.bar}%`, background: "var(--tone)" }} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{k.bar}% of calls</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {(["Hot", "Warm", "Cold"] as Temp[]).map((t) => (
          <button key={t} onClick={() => setTemp(temp === t ? "" : t)}
            className={`flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-left transition-shadow hover:shadow-soft ${temp === t ? "ring-2 ring-primary" : ""}`}>
            <span className={`badge ${TEMP_TONE[t]}`}>{TEMP_LABEL[t]}</span>
            <span className="text-xl font-semibold">{tempCount(t)}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-[240px] pl-8" />
        </div>
        <FilterSelect value={activity} onChange={setActivity} placeholder="Any call activity" className="w-[190px]" options={[
          { value: "connected", label: "Has connected call" },
          { value: "unanswered", label: "Only ringing / unanswered" },
          { value: "incoming", label: "Has incoming call" },
          { value: "none", label: "Not called yet" },
        ]} />
        <FilterSelect value={status} onChange={setStatus} placeholder="Any status" options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))} />
        {me?.isAdmin && (
          <FilterSelect value={agent} onChange={setAgent} placeholder="Any agent" options={profiles.map((p) => ({ value: p.id, label: p.full_name || p.email }))} />
        )}
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} leads</span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className={tableHead}>
              {["Lead", "Temperature", "Status", "Calls", "Messages", "Last call", "Agent", ""].map((h, i) => (
                <th key={i} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.lead.id} className={`${tableRow} cursor-pointer`} onClick={() => setOpenId(r.lead.id)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={r.lead.name} />
                    <div><div className="font-medium">{r.lead.name}</div><div className="text-xs text-muted-foreground">{r.lead.phone}</div></div>
                  </div>
                </td>
                <td className="px-4"><span className={`badge ${TEMP_TONE[r.temp]}`}>{TEMP_LABEL[r.temp]}</span></td>
                <td className="px-4"><StatusBadge status={r.lead.status} /></td>
                <td className="px-4">
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 font-semibold">{r.total}</span>
                    {r.connected > 0 && <span className="badge badge-green" title="Connected"><PhoneCall className="h-3 w-3" />{r.connected}</span>}
                    {r.unanswered > 0 && <span className="badge badge-amber" title="Unanswered"><PhoneMissed className="h-3 w-3" />{r.unanswered}</span>}
                    {r.incoming > 0 && <span className="badge badge-blue" title="Incoming"><PhoneIncoming className="h-3 w-3" />{r.incoming}</span>}
                  </div>
                </td>
                <td className="px-4">{r.messages > 0 ? <span className="badge badge-teal"><MessageSquare className="h-3 w-3" />{r.messages}</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4">
                  {r.lastOutcome ? <><span className={`badge ${outcomeTone(r.lastOutcome)}`}>{r.lastOutcome}</span>{r.last && <div className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.last), { addSuffix: true })}</div>}</> : <span className="text-muted-foreground">Not called</span>}
                </td>
                <td className="px-4"><UserName id={r.lead.assigned_to} profiles={profiles} /></td>
                <td className="px-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Call"><a href={`tel:+91${r.lead.phone}`}><Phone className="h-4 w-4" /></a></Button>
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="WhatsApp"><a href={`https://wa.me/91${r.lead.phone}`} target="_blank" rel="noreferrer"><MessageSquare className="h-4 w-4" /></a></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!leadsQ.isLoading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No leads match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {me && <LeadDetail lead={openLead} onClose={() => setOpenId(null)} profiles={profiles} me={me} />}
    </div>
  );
}
