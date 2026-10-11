import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, addMinutes, addHours, addDays, setHours, setMinutes } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Phone, MessageCircle, MessageSquare, Mail, MapPin, StickyNote, CalendarClock, PhoneCall, RefreshCw, Sparkles, Activity, Clock, ClipboardList, Pin, PinOff, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatPhone, formatBudget, LEAD_STATUSES, type LeadStatus } from "@/lib/crm";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { Me, Profile } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge, UserName } from "./common";
import { LeadFields, leadToForm, validateLead, type Lead, type LeadFormValues } from "./LeadForm";
import { LeadUnits } from "./LeadUnits";
import { getMilestoneState } from "@/lib/deals";
import { CallLogDialog, parseCallOutcome } from "./CallLogDialog";

function activityMeta(type: string, content: string): { label: string; tone: string } {
  if (type === "call") {
    const o = (parseCallOutcome(content)?.outcome ?? "").toLowerCase();
    if (o.includes("connect") || o.includes("answer")) return { label: "Call · Connected", tone: "badge-green" };
    if (o.includes("busy")) return { label: "Call · Busy", tone: "badge-amber" };
    if (o.includes("switch") || o.includes("reach")) return { label: "Call · Not reachable", tone: "badge-amber" };
    if (o.includes("message") || o.includes("voicemail")) return { label: "Call · Left message", tone: "badge-blue" };
    if (o.includes("wrong") || o.includes("invalid")) return { label: "Call · Wrong number", tone: "badge-red" };
    return { label: "Call", tone: "badge-slate" };
  }
  const map: Record<string, { label: string; tone: string }> = {
    whatsapp: { label: "WhatsApp", tone: "badge-teal" },
    sms: { label: "SMS", tone: "badge-teal" },
    email: { label: "Email", tone: "badge-blue" },
    status: { label: "Status change", tone: "badge-violet" },
    followup: /site visit/i.test(content) ? { label: "Site visit", tone: "badge-indigo" } : { label: "Follow-up", tone: "badge-indigo" },
    pin: { label: "Pinned note", tone: "badge-gold" },
    system: { label: "System", tone: "badge-grey" },
  };
  return map[type] ?? { label: "Note", tone: "badge-slate" };
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pin: Pin,
  note: StickyNote,
  call: PhoneCall,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  email: Mail,
  status: RefreshCw,
  followup: CalendarClock,
  system: Sparkles,
};

export function LeadDetail({
  lead,
  onClose,
  profiles,
  me,
}: {
  lead: Lead | null;
  onClose: () => void;
  profiles: Profile[];
  me: Me;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<LeadFormValues | null>(null);
  const [note, setNote] = useState("");
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [cbOpen, setCbOpen] = useState(false);
  const [cbDate, setCbDate] = useState("");
  const [cbTime, setCbTime] = useState("10:00");
  const [cbNote, setCbNote] = useState("");
  const [pinEditing, setPinEditing] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [fuTime, setFuTime] = useState("11:00");
  const [fuRemark, setFuRemark] = useState("");
  const [fuKind, setFuKind] = useState<"call" | "visit">("call");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) setForm(leadToForm(lead));
    setNote("");
    setFuRemark("");
    setFuDate("");
  }, [lead]);

  const activities = useQuery({
    queryKey: ["activities", lead?.id],
    enabled: !!lead,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_activities").select("*").eq("lead_id", lead!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const bookingQuery = useQuery({
    queryKey: ["lead-booking-summary", lead?.id],
    enabled: !!lead,
    queryFn: async () => {
      if (!lead) return [];
      const { data, error } = await supabase.from("deals").select("id,status,agreed_price,booking_date,units:units(unit_number,tower,projects:projects(name)),payment_milestones:payment_milestones(id,name,amount_due,due_date,deal_payments:deal_payments(amount))").eq("lead_id", lead.id).neq("status", "cancelled").order("booking_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const activeBooking = bookingQuery.data?.[0];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["activities", lead?.id] });
  };

  async function log(type: string, content: string) {
    await supabase.from("lead_activities").insert({ lead_id: lead!.id, type, content, created_by: me.id });
  }

  async function save() {
    if (!lead || !form) return;
    setSaving(true);
    const payload = await validateLead(form, lead.id, lead.phone);
    if (!payload) return setSaving(false);
    const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
    if (!error && payload.status !== lead.status) await log("status", `Status changed from ${lead.status} to ${payload.status}`);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead updated");
    refresh();
  }

  async function saveCallback() {
    if (!lead) return;
    const when = new Date(`${cbDate}T${cbTime}`);
    if (isNaN(when.getTime())) return toast.error("Pick a valid date & time");
    const prev = lead.status;
    const { error } = await supabase.from("leads").update({ status: "Callback", next_follow_up: when.toISOString() }).eq("id", lead.id);
    if (error) return toast.error(error.message);
    if (prev !== "Callback") await log("status", `Status changed from ${prev} to Callback`);
    await log("followup", `Callback scheduled for ${format(when, "d MMM, h:mm a")}${cbNote.trim() ? ` — ${cbNote.trim()}` : ""}`);
    toast.success(`Callback set for ${format(when, "d MMM, h:mm a")}`);
    setCbOpen(false);
    setCbNote("");
    refresh();
  }

  async function quickStatus(next: LeadStatus) {
    if (!lead || next === lead.status) return;
    const { error } = await supabase.from("leads").update({ status: next }).eq("id", lead.id);
    if (error) return toast.error(error.message);
    await log("status", `Status changed from ${lead.status} to ${next}`);
    toast.success(`Status set to ${next}`);
    refresh();
  }

  async function savePin(text: string) {
    await log("pin", text.trim());
    setPinEditing(false);
    toast.success(text.trim() ? "Note pinned" : "Note unpinned");
    refresh();
  }

  async function addNote() {
    if (!note.trim()) return;
    await log("note", note.trim());
    setNote("");
    toast.success("Note added");
    refresh();
  }

  async function logContact(type: string, label: string) {
    await log(type, type === "call" ? "Call placed" : `${label} opened`);
    refresh();
  }

  async function scheduleFollowUp() {
    if (!fuDate) return toast.error("Pick a date");
    const when = new Date(`${fuDate}T${fuTime || "10:00"}`);
    const visit = fuKind === "visit";
    const upd = visit ? { next_follow_up: when.toISOString(), status: "Site Visit Scheduled" as const } : { next_follow_up: when.toISOString() };
    const { error } = await supabase.from("leads").update(upd).eq("id", lead!.id);
    if (error) return toast.error(error.message);
    if (visit && lead!.status !== "Site Visit Scheduled") await log("status", `Status changed from ${lead!.status} to Site Visit Scheduled`);
    await log("followup", `${visit ? "Site visit" : "Follow-up"} scheduled for ${format(when, "d MMM yyyy, h:mm a")}${fuRemark ? ` — ${fuRemark}` : ""}`);
    toast.success("Follow-up scheduled");
    setFuRemark("");
    setFuDate("");
    refresh();
  }

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {lead && form && (
          <>
            <SheetHeader className="border-b px-6 py-5 text-left">
              <div className="flex items-start justify-between gap-4 pr-6">
                <div>
                  <SheetTitle className="text-section-heading text-primary dark:text-foreground">{lead.name}</SheetTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={lead.status} />
                    <span className="text-xs text-muted-foreground">Updated {formatDistanceToNow(new Date(lead.updated_at))} ago</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(() => {
                  const count = (t: string) => activities.data?.filter((a) => a.type === t).length ?? 0;
                  const items = [
                    { type: "call", label: "Call", icon: Phone, href: `tel:+91${lead.phone}`, tip: `Call ${formatPhone(lead.phone)}`, primary: true },
                    { type: "whatsapp", label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/91${lead.phone}`, tip: "Open WhatsApp chat", external: true },
                    { type: "sms", label: "SMS", icon: MessageSquare, href: `sms:+91${lead.phone}`, tip: "Send SMS" },
                    ...(lead.email ? [{ type: "email", label: "Email", icon: Mail, href: `mailto:${lead.email}`, tip: `Email ${lead.email}` }] : []),
                  ];
                  return items.map((it) => {
                    const n = count(it.type);
                    const Icon = it.icon;
                    return (
                      <Tooltip key={it.type}>
                        <TooltipTrigger asChild>
                          <Button asChild size="sm" variant={it.primary ? "default" : "outline"} onClick={() => logContact(it.type, it.label)}>
                            <a href={it.href} {...(it.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                              <Icon className="mr-1.5 h-4 w-4" /> {it.label}
                              {n > 0 && <span className="ml-1.5 rounded-full bg-gold/20 px-1.5 text-xs font-semibold tabular-nums">{n}</span>}
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{it.tip} · used {n} {n === 1 ? "time" : "times"}</TooltipContent>
                      </Tooltip>
                    );
                  });
                })()}
                <Button size="sm" variant="outline" onClick={() => setCallLogOpen(true)}>
                  <ClipboardList className="mr-1.5 h-4 w-4" /> Log call
                </Button>
              </div>
              <CallLogDialog open={callLogOpen} onOpenChange={setCallLogOpen} lead={lead} onDone={refresh} />
            </SheetHeader>

            {(() => {
              const pin = activities.data?.find((a) => a.type === "pin");
              const text = pin?.content ?? "";
              if (pinEditing) {
                return (
                  <section className="border-b px-6 py-4" aria-label="Pinned note">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gold">
                      <Pin className="h-4 w-4" /> Key note / objection
                    </div>
                    <Input autoFocus maxLength={160} value={pinDraft} onChange={(e) => setPinDraft(e.target.value)} placeholder="e.g. Prefers 3BHK east-facing, budget tight at 1.2 Cr" onKeyDown={(e) => e.key === "Enter" && savePin(pinDraft)} />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setPinEditing(false)}>Cancel</Button>
                      <Button size="sm" onClick={() => savePin(pinDraft)} disabled={!pinDraft.trim()}>Pin it</Button>
                    </div>
                  </section>
                );
              }
              return text ? (
                <section className="border-b px-6 py-3" aria-label="Pinned note">
                  <div className="badge-amber flex items-start gap-3 rounded-lg px-4 py-3">
                    <Pin className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Key note / objection</p>
                      <p className="break-words text-sm font-medium">{text}</p>
                      <p className="mt-1 text-xs opacity-70">
                        {profiles.find((p) => p.id === pin!.created_by)?.full_name || "Someone"} · {formatDistanceToNow(new Date(pin!.created_at))} ago
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit pinned note" onClick={() => { setPinDraft(text); setPinEditing(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Unpin note" onClick={() => savePin("")}>
                        <PinOff className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </section>
              ) : (
                <div className="border-b px-6 py-2">
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => { setPinDraft(""); setPinEditing(true); }}>
                    <Pin className="mr-1.5 h-4 w-4" /> Add key note or objection
                  </Button>
                </div>
              );
            })()}

            <section className="border-b px-6 py-4" aria-label="Lead status">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gold">
                <Activity className="h-4 w-4" /> Lead status
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2.5 text-sm">
                  <div className="flex items-start gap-2.5">
                    <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-semibold">{lead.status}</span>
                  </div>
                  {lead.next_follow_up && (
                    <div className="flex items-center gap-2.5">
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{format(new Date(lead.next_follow_up), "d MMM, yyyy | h:mm a")}</span>
                    </div>
                  )}
                  {(() => {
                    const call = activities.data?.map((a) => ({ a, p: a.type === "call" ? parseCallOutcome(a.content) : null })).find((x) => x.p);
                    return call?.p ? (
                      <div className="flex items-start gap-2.5">
                        <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="break-words">
                          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold">{call.p.outcome}</span>{" "}
                          <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(call.a.created_at))} ago</span>
                          {call.p.detail && <span className="mt-1 block">{call.p.detail}</span>}
                        </span>
                      </div>
                    ) : null;
                  })()}
                  {(() => {
                    const latest = activities.data?.find((a) => a.type === "note" || a.type === "followup");
                    return latest ? (
                      <div className="flex items-start gap-2.5">
                        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="break-words">{latest.content}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
                <Select value={lead.status} onValueChange={(v) => (v === "Callback" ? setCbOpen(true) : quickStatus(v as LeadStatus))}>
                  <SelectTrigger className="h-auto w-auto shrink-0 rounded-full border-0 bg-primary px-5 py-2 text-sm font-medium text-primary-foreground [&>svg]:hidden">
                    Change status
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={cbOpen} onOpenChange={setCbOpen}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>When to call back?</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { l: "In 30 min", d: () => addMinutes(new Date(), 30) },
                        { l: "In 2 hrs", d: () => addHours(new Date(), 2) },
                        { l: "Tomorrow 10 AM", d: () => setMinutes(setHours(addDays(new Date(), 1), 10), 0) },
                      ].map((c) => (
                        <Button key={c.l} type="button" variant="outline" size="sm" className="rounded-full"
                          onClick={() => { const d = c.d(); setCbDate(format(d, "yyyy-MM-dd")); setCbTime(format(d, "HH:mm")); }}>
                          {c.l}
                        </Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="date" value={cbDate} onChange={(e) => setCbDate(e.target.value)} />
                      <Input type="time" value={cbTime} onChange={(e) => setCbTime(e.target.value)} />
                    </div>
                    <Input placeholder="Note (optional)" value={cbNote} onChange={(e) => setCbNote(e.target.value)} />
                    <Button disabled={!cbDate || !cbTime} onClick={saveCallback}>Save callback</Button>
                  </DialogContent>
                </Dialog>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-4 border-b px-6 py-4 text-sm">
              <Info icon={Phone} label="Phone" value={formatPhone(lead.phone)} valueClassName="text-mono-tabular text-xs" />
              <Info icon={Mail} label="Email" value={lead.email ?? "—"} />
              <Info icon={MapPin} label="Location" value={lead.location ?? "—"} />
              <div>
                <div className="text-xs text-muted-foreground">Budget · Interest</div>
                <div>
                  {formatBudget(lead.budget)} · {lead.property_interest ?? "—"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">Assigned to</div>
                <UserName id={lead.assigned_to} profiles={profiles} />
              </div>
            </div>

            {activeBooking && <section className="border-b px-6 py-4" aria-label="Active booking summary">
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Active booking</h3><span className="badge badge-blue">{activeBooking.status === "agreement_signed" ? "Agreement signed" : activeBooking.status === "registered" ? "Registered" : "Booked"}</span></div>
              <p className="text-xs text-muted-foreground">{[activeBooking.units?.projects?.name, activeBooking.units?.tower, activeBooking.units?.unit_number].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 text-sm font-medium">Agreed {formatBudget(Number(activeBooking.agreed_price))}</p>
              {(() => {
                const stages = activeBooking.payment_milestones ?? [];
                const collected = stages.reduce((sum, stage) => sum + (stage.deal_payments ?? []).reduce((stageSum, payment) => stageSum + Number(payment.amount), 0), 0);
                const next = stages.find((stage) => {
                  const amountPaid = (stage.deal_payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
                  return getMilestoneState(Number(stage.amount_due), amountPaid, stage.due_date) !== "Paid";
                });
                return <><p className="mt-1 text-xs text-muted-foreground">Collected {formatBudget(collected)} · Balance {formatBudget(Math.max(0, Number(activeBooking.agreed_price) - collected))}</p>{next && <p className="mt-1 text-xs text-muted-foreground">Next: {next.name} · {formatBudget(Math.max(0, Number(next.amount_due) - (next.deal_payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0)))}</p>}</>;
              })()}
              <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0"><Link to="/deals" search={{ leadId: undefined, unitId: undefined, dealId: activeBooking.id }}>Open booking</Link></Button>
            </section>}

            <Tabs defaultValue="timeline" className="px-6 py-4">
              <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                {["timeline", "followup", "units", "edit"].map((t) => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="rounded-none border-b-2 border-transparent px-0 pb-2 capitalize shadow-none data-[state=active]:border-gold data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    {t === "followup" ? "Follow-up" : t === "edit" ? "Edit details" : t === "units" ? "Units" : "Timeline"}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="timeline" className="mt-5 space-y-5">
                <div className="space-y-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this lead…" rows={3} />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={addNote} disabled={!note.trim()}>
                      Add note
                    </Button>
                  </div>
                </div>
                {activities.isLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <ol className="relative ml-3 border-l">
                    {activities.data?.map((a) => {
                      const Icon = ICONS[a.type] ?? StickyNote;
                      const meta = activityMeta(a.type, a.content);
                      return (
                        <li key={a.id} className="mb-5 ml-6">
                          <span className={cn("absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border", meta.tone)}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <span className={cn("mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.tone)}>{meta.label}</span>
                          <p className="text-sm">{a.type === "pin" ? (a.content ? `Pinned: ${a.content}` : "Pinned note removed") : a.content}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(a.created_at), "d MMM yyyy, h:mm a")}
                            {a.created_by && ` · ${profiles.find((p) => p.id === a.created_by)?.full_name ?? ""}`}
                          </p>
                        </li>
                      );
                    })}
                    {!activities.data?.length && <p className="ml-6 text-sm text-muted-foreground">No activity yet.</p>}
                  </ol>
                )}
              </TabsContent>

              <TabsContent value="followup" className="mt-5 space-y-4">
                {lead.next_follow_up && (
                  <p className="rounded-lg bg-secondary px-4 py-3 text-sm">
                    Next follow-up: <strong>{format(new Date(lead.next_follow_up), "EEE, d MMM yyyy · h:mm a")}</strong>
                  </p>
                )}
                <div className="flex gap-2">
                  {(["call", "visit"] as const).map((k) => (
                    <Button key={k} type="button" size="sm" variant={fuKind === k ? "default" : "outline"} onClick={() => setFuKind(k)}>
                      {k === "call" ? "Follow-up call" : "Site visit"}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
                  <Input type="time" value={fuTime} onChange={(e) => setFuTime(e.target.value)} />
                </div>
                <Textarea value={fuRemark} onChange={(e) => setFuRemark(e.target.value)} placeholder={fuKind === "visit" ? "Site / project and notes" : "Remark (e.g. share brochure)"} rows={2} />
                <Button className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={scheduleFollowUp}>
                  <CalendarClock className="mr-1.5 h-4 w-4" /> {fuKind === "visit" ? "Schedule site visit" : "Schedule follow-up"}
                </Button>
              </TabsContent>

              <TabsContent value="units" className="mt-5">
                <LeadUnits leadId={lead.id} meId={me.id} />
              </TabsContent>

              <TabsContent value="edit" className="mt-5 space-y-5">
                <LeadFields value={form} onChange={setForm} profiles={profiles} isAdmin={me.isAdmin} />
                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ icon: Icon, label, value, valueClassName }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("truncate", valueClassName)}>{value}</div>
    </div>
  );
}
