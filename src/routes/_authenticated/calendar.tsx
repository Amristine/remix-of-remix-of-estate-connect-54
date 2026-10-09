import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin, MessageCircle, Phone } from "lucide-react";
import { useMe, useProfiles } from "@/lib/auth";
import { followUpBucket, formatPhone } from "@/lib/crm";
import { isOpenTask, taskKind } from "@/lib/agenda";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilterSelect, PageHeader, StatusBadge, UserName } from "@/components/crm/common";
import { LeadDetail } from "@/components/crm/LeadDetail";
import { useTaskLeads } from "@/components/crm/Reminders";
import type { Lead } from "@/components/crm/LeadForm";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Bhangar Estates CRM" },
      { name: "description", content: "Upcoming site visits and follow-up calls at a glance." },
      { property: "og:title", content: "Calendar — Bhangar Estates CRM" },
      { property: "og:description", content: "Upcoming site visits and follow-up calls at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { data: me } = useMe();
  const { data: profiles = [] } = useProfiles();
  const { data = [] } = useTaskLeads();
  const [view, setView] = useState<"agenda" | "month">("agenda");
  const [kind, setKind] = useState("");
  const [who, setWho] = useState("");
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState<Date | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const tasks = useMemo(
    () =>
      data
        .filter(isOpenTask)
        .filter((l) => (!kind || taskKind(l) === kind) && (!who || l.assigned_to === who))
        .sort((a, b) => +new Date(a.next_follow_up!) - +new Date(b.next_follow_up!)),
    [data, kind, who],
  );

  const now = new Date();
  const tomorrow = addDays(startOfDay(now), 1);
  const groups: [string, string, Lead[]][] = [
    ["Overdue", "text-destructive", tasks.filter((l) => followUpBucket(l.next_follow_up) === "overdue")],
    ["Today", "text-gold", tasks.filter((l) => followUpBucket(l.next_follow_up) === "today")],
    ["Tomorrow", "", tasks.filter((l) => isSameDay(new Date(l.next_follow_up!), tomorrow))],
    ["Later", "", tasks.filter((l) => new Date(l.next_follow_up!) >= addDays(tomorrow, 1))],
  ];
  const todays = groups[1]![2];
  const stats = [
    ["Site visits today", todays.filter((l) => taskKind(l) === "visit").length],
    ["Calls today", todays.filter((l) => taskKind(l) === "call").length],
    ["Overdue", groups[0]![2].length],
  ] as const;

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const openLead = data.find((l) => l.id === openId) ?? null;

  const Card = ({ l }: { l: Lead }) => (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", taskKind(l) === "visit" ? "bg-gold/15 text-gold" : "bg-secondary")}>
        {taskKind(l) === "visit" ? <MapPin className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(l.id)}>
        <div className="truncate font-medium">{l.name}</div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(l.next_follow_up!), "EEE d MMM, h:mm a")} · {taskKind(l) === "visit" ? "Site visit" : "Follow-up call"}
          {l.location ? ` · ${l.location}` : ""}
        </div>
      </button>
      <StatusBadge status={l.status} />
      {me?.isAdmin && <span className="hidden text-sm md:block"><UserName id={l.assigned_to} profiles={profiles} /></span>}
      <div className="flex gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={`Call ${formatPhone(l.phone)}`}><a href={`tel:+91${l.phone}`}><Phone className="h-4 w-4" /></a></Button>
        <Button asChild size="icon" variant="ghost" aria-label="WhatsApp"><a href={`https://wa.me/91${l.phone}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Site visits and follow-up calls"
        actions={
          <div className="flex rounded-md border p-0.5">
            <Button size="sm" variant={view === "agenda" ? "default" : "ghost"} onClick={() => setView("agenda")}><List className="mr-1.5 h-4 w-4" />Agenda</Button>
            <Button size="sm" variant={view === "month" ? "default" : "ghost"} onClick={() => setView("month")}><CalendarDays className="mr-1.5 h-4 w-4" />Month</Button>
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        {stats.map(([label, n], i) => (
          <div key={label} className="rounded-lg border bg-card px-4 py-3">
            <div className={cn("text-2xl font-semibold", i === 2 && n > 0 && "text-destructive")}>{n}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterSelect value={kind} onChange={setKind} placeholder="All tasks" options={[{ value: "visit", label: "Site visits" }, { value: "call", label: "Follow-up calls" }]} />
        {me?.isAdmin && <FilterSelect value={who} onChange={setWho} placeholder="Everyone" options={profiles.map((p) => ({ value: p.id, label: p.full_name }))} />}
      </div>

      {view === "agenda" ? (
        <div className="space-y-6">
          {groups.map(([label, tone, list]) =>
            list.length ? (
              <section key={label}>
                <h2 className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", tone)}>{label} ({list.length})</h2>
                <div className="space-y-2">{list.map((l) => <Card key={l.id} l={l} />)}</div>
              </section>
            ) : null,
          )}
          {!tasks.length && <p className="py-16 text-center text-sm text-muted-foreground">No scheduled tasks. Schedule a call or site visit from a lead's Follow-up tab.</p>}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="w-40 text-center font-medium">{format(month, "MMMM yyyy")}</h2>
            <Button size="icon" variant="outline" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(new Date())}>Today</Button>
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-lg border bg-card text-sm">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="border-b bg-secondary px-2 py-1.5 text-xs font-medium text-muted-foreground">{d}</div>
            ))}
            {days.map((d) => {
              const items = tasks.filter((l) => isSameDay(new Date(l.next_follow_up!), d));
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setDay(d)}
                  className={cn("min-h-24 border-b border-r p-1.5 text-left align-top hover:bg-secondary/60", !isSameMonth(d, month) && "opacity-40", day && isSameDay(d, day) && "bg-secondary")}
                >
                  <div className={cn("mb-1 text-xs", isSameDay(d, now) && "inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold font-semibold text-gold-foreground")}>{format(d, "d")}</div>
                  {items.slice(0, 3).map((l) => (
                    <div key={l.id} className={cn("mb-0.5 truncate rounded px-1 text-[11px]", taskKind(l) === "visit" ? "bg-gold/15" : "bg-secondary")}>
                      {format(new Date(l.next_follow_up!), "h:mm")} {l.name}
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[11px] text-muted-foreground">+{items.length - 3} more</div>}
                </button>
              );
            })}
          </div>
          {day && (
            <section className="mt-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide">{format(day, "EEEE, d MMMM")}</h2>
              <div className="space-y-2">
                {tasks.filter((l) => isSameDay(new Date(l.next_follow_up!), day)).map((l) => <Card key={l.id} l={l} />)}
                {!tasks.some((l) => isSameDay(new Date(l.next_follow_up!), day)) && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
              </div>
            </section>
          )}
        </div>
      )}
      {me && <LeadDetail lead={openLead} onClose={() => setOpenId(null)} profiles={profiles} me={me} />}
    </div>
  );
}
