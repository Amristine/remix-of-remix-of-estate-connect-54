import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Banknote, CalendarDays, Check, ChevronRight, CircleAlert, Download, Handshake, Pencil, Plus, Printer, ReceiptText, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { formatBudget } from "@/lib/crm";
import { canManageDeal, CONSTRUCTION_PAYMENT_PLAN, getMilestoneState, isValidMilestoneSchedule, splitMilestoneAmounts, toDealsCsv, type MilestoneDraft } from "@/lib/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, StatCard } from "@/components/crm/common";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/deals")({
  validateSearch: (search: Record<string, unknown>) => ({
    leadId: typeof search.leadId === "string" ? search.leadId : undefined,
    unitId: typeof search.unitId === "string" ? search.unitId : undefined,
    dealId: typeof search.dealId === "string" ? search.dealId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Deals & Bookings — Bhangar Estates CRM" },
      { name: "description", content: "Manage real estate bookings, construction milestones, collections and payment receipts." },
      { property: "og:title", content: "Deals & Bookings — Bhangar Estates CRM" },
      { property: "og:description", content: "Manage real estate bookings, construction milestones, collections and payment receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DealsPage,
});

type Payment = { id: string; amount: number; paid_on: string; payment_method: string; reference_no: string | null; receipt_number: string; notes: string | null };
type Milestone = { id: string; deal_id: string; name: string; percentage: number; amount_due: number; due_date: string | null; order_index: number; deal_payments: Payment[] };
type Deal = {
  id: string; lead_id: string; unit_id: string; assigned_to: string; booking_date: string; base_price: number; discount_amount: number;
  agreed_price: number; payment_plan: string; status: string; notes: string | null; updated_at: string;
  leads: { id: string; name: string; phone: string; email: string | null } | null;
  units: { id: string; unit_number: string; tower: string | null; projects: { name: string } | null } | null;
  payment_milestones: Milestone[];
};
type Lead = { id: string; name: string; phone: string; assigned_to: string | null; status: string };
type Unit = { id: string; unit_number: string; tower: string | null; price: number | null; project_id: string; projects: { name: string } | null };

const CURRENCY = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const STATUS_LABEL: Record<string, string> = { booked: "Booked", agreement_signed: "Agreement signed", registered: "Registered", cancelled: "Cancelled" };
const STATUS_STYLE: Record<string, string> = { booked: "badge-blue", agreement_signed: "badge-amber", registered: "badge-green", cancelled: "badge-grey" };
const formatDate = (value: string | null) => value ? format(new Date(`${value.slice(0, 10)}T12:00:00`), "d MMM yyyy") : "No date set";
const allPayments = (deal: Deal) => deal.payment_milestones.flatMap((stage) => stage.deal_payments ?? []);
const amountPaid = (deal: Deal) => allPayments(deal).reduce((sum, payment) => sum + Number(payment.amount), 0);
const outstanding = (deal: Deal) => Math.max(0, Number(deal.agreed_price) - amountPaid(deal));
const stagePaid = (stage: Milestone) => (stage.deal_payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);

function DealsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const { data: me } = useMe();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentStage, setPaymentStage] = useState<Milestone | null>(null);
  const [receipt, setReceipt] = useState<{ deal: Deal; stage: Milestone; payment: Payment } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const dealsQuery = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*, leads:leads(id,name,phone,email), units:units(id,unit_number,tower,projects:projects(name)), payment_milestones:payment_milestones(*, deal_payments:deal_payments(*))").order("booking_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Deal[];
    },
  });
  const leadsQuery = useQuery({
    queryKey: ["booking-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id,name,phone,assigned_to,status").order("name");
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
  const unitsQuery = useQuery({
    queryKey: ["booking-units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("id,unit_number,tower,price,project_id,projects(name)").eq("status", "Available").order("unit_number");
      if (error) throw error;
      return (data ?? []) as unknown as Unit[];
    },
  });
  useEffect(() => {
    if ((searchParams.leadId || searchParams.unitId) && !leadsQuery.isLoading && !unitsQuery.isLoading) setCreateOpen(true);
  }, [searchParams.leadId, searchParams.unitId, leadsQuery.isLoading, unitsQuery.isLoading]);
  const deals = dealsQuery.data ?? [];
  useEffect(() => {
    if (!searchParams.dealId || dealsQuery.isLoading) return;
    if (deals.some((deal) => deal.id === searchParams.dealId)) setSelectedId(searchParams.dealId);
  }, [searchParams.dealId, dealsQuery.isLoading, deals]);
  const activeDeals = deals.filter((deal) => deal.status !== "cancelled");
  const filteredDeals = useMemo(() => {
    const needle = searchText.trim().toLocaleLowerCase();
    return deals.filter((deal) => {
      const matchesStatus = statusFilter === "all" || deal.status === statusFilter;
      const haystack = [deal.leads?.name, deal.leads?.phone, deal.units?.unit_number, deal.units?.tower, deal.units?.projects?.name].filter(Boolean).join(" ").toLocaleLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [deals, searchText, statusFilter]);
  const selectedDeal = deals.find((deal) => deal.id === selectedId) ?? null;
  const summary = useMemo(() => ({
    booked: activeDeals.reduce((sum, deal) => sum + Number(deal.agreed_price), 0),
    collected: activeDeals.reduce((sum, deal) => sum + amountPaid(deal), 0),
    due: activeDeals.reduce((sum, deal) => sum + outstanding(deal), 0),
    overdue: activeDeals.reduce((sum, deal) => sum + deal.payment_milestones.reduce((stageSum, stage) => getMilestoneState(Number(stage.amount_due), stagePaid(stage), stage.due_date) === "Overdue" ? stageSum + Number(stage.amount_due) - stagePaid(stage) : stageSum, 0), 0),
  }), [activeDeals]);

  const refreshDeals = () => {
    void queryClient.invalidateQueries({ queryKey: ["deals"] });
    void queryClient.invalidateQueries({ queryKey: ["units"] });
    void queryClient.invalidateQueries({ queryKey: ["booking-units"] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  async function updateStatus(deal: Deal, nextStatus: string) {
    const { error } = await supabase.rpc("update_deal_status", { _deal_id: deal.id, _status: nextStatus });
    if (error) return toast.error(error.message);
    toast.success(`Booking updated to ${STATUS_LABEL[nextStatus] ?? nextStatus}`);
    refreshDeals();
  }

  async function cancelBooking(deal: Deal) {
    const { error } = await supabase.rpc("cancel_deal_booking", { _deal_id: deal.id });
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled and unit released");
    refreshDeals();
  }

  async function recordPayment(values: { dealId: string; milestoneId: string; amount: number; paidOn: string; method: string; reference: string; notes: string }) {
    const { data, error } = await supabase.rpc("record_deal_payment", {
      _deal_id: values.dealId,
      _milestone_id: values.milestoneId,
      _amount: values.amount,
      _paid_on: values.paidOn,
      _payment_method: values.method,
      _reference_no: values.reference || "",
      _notes: values.notes || "",
    });
    if (error) return toast.error(error.message);
    setPaymentStage(null);
    refreshDeals();
    const paymentResult = data?.[0];
    toast.success(paymentResult?.receipt_number ? `Payment recorded · receipt ${paymentResult.receipt_number}` : "Payment recorded");
  }

  async function rescheduleMilestone(milestoneId: string, dueDate: string) {
    const { error } = await supabase.rpc("reschedule_payment_milestone", { _milestone_id: milestoneId, _due_date: dueDate });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Milestone date updated");
    refreshDeals();
  }

  function exportBookings() {
    const rows = [
      ["Client", "Phone", "Project", "Unit", "Status", "Booking date", "Agreed price", "Collected", "Outstanding", "Milestones"],
      ...filteredDeals.map((deal) => [
        deal.leads?.name ?? "",
        deal.leads?.phone ?? "",
        deal.units?.projects?.name ?? "",
        [deal.units?.tower, deal.units?.unit_number].filter(Boolean).join(" "),
        STATUS_LABEL[deal.status] ?? deal.status,
        deal.booking_date,
        Number(deal.agreed_price).toFixed(2),
        amountPaid(deal).toFixed(2),
        outstanding(deal).toFixed(2),
        deal.payment_milestones.map((stage) => `${stage.name}: ${getMilestoneState(Number(stage.amount_due), stagePaid(stage), stage.due_date)} (${Math.max(0, Number(stage.amount_due) - stagePaid(stage)).toFixed(2)} due)`).join("; "),
      ]),
    ];
    const csv = toDealsCsv(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "deals-bookings.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearBookingSearch() {
    void navigate({ to: "/deals", search: { leadId: undefined, unitId: undefined, dealId: undefined }, replace: true });
  }

  const dueStages = activeDeals.flatMap((deal) => deal.payment_milestones
    .filter((stage) => getMilestoneState(Number(stage.amount_due), stagePaid(stage), stage.due_date) !== "Paid")
    .map((stage) => ({ deal, stage, remaining: Number(stage.amount_due) - stagePaid(stage) })))
    .sort((a, b) => (a.stage.due_date ?? "9999-12-31").localeCompare(b.stage.due_date ?? "9999-12-31"));

  return (
    <div className="min-w-0">
      <PageHeader title="Deals & bookings" subtitle="Bookings, collections and construction-linked payment schedules." actions={
        <Button onClick={() => setCreateOpen(true)} disabled={leadsQuery.isLoading || unitsQuery.isLoading}>
          <Plus className="mr-1.5 h-4 w-4" /> New booking
        </Button>
      } />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Booked value" value={formatBudget(summary.booked)} />
        <StatCard label="Collected" value={formatBudget(summary.collected)} />
        <StatCard label="Outstanding" value={formatBudget(summary.due)} />
        <StatCard label="Overdue" value={formatBudget(summary.overdue)} tone={summary.overdue > 0 ? "text-destructive" : undefined} />
      </div>

      <section className="mb-8 min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-section-heading">Bookings <span className="ml-1 text-sm font-normal text-muted-foreground">{filteredDeals.length}</span></h2>
          <Button variant="outline" size="sm" onClick={exportBookings} disabled={!filteredDeals.length}><Download className="mr-1.5 h-4 w-4" /> Export CSV</Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search bookings" className="pl-9" placeholder="Search client, phone, unit or project" value={searchText} onChange={(event) => setSearchText(event.target.value)} /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-52" aria-label="Filter bookings by status"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          {dealsQuery.isLoading ? <div className="space-y-3 p-5"><div className="h-5 w-1/2 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div>
            : dealsQuery.error ? <p className="p-6 text-sm text-destructive">Bookings could not be loaded: {(dealsQuery.error as Error).message}</p>
              : filteredDeals.length === 0 ? <EmptyState icon={<Handshake className="h-5 w-5" />} title={deals.length ? "No bookings match" : "No bookings yet"} body={deals.length ? "Try another search or status." : "Create a booking to reserve a unit and set its payment schedule."} action={deals.length ? undefined : <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New booking</Button>} />
                : <div className="overflow-x-auto">
                  <table className="w-full min-w-[740px] text-sm">
                    <thead><tr className="border-b">{["Client / unit", "Agreed price", "Collected", "Next milestone", "Status", ""].map((heading) => <th key={heading} className="px-4 py-3 text-left text-table-header">{heading}</th>)}</tr></thead>
                    <tbody>{filteredDeals.map((deal) => {
                      const paid = amountPaid(deal);
                      const next = [...deal.payment_milestones].sort((a, b) => a.order_index - b.order_index).find((stage) => getMilestoneState(Number(stage.amount_due), stagePaid(stage), stage.due_date) !== "Paid");
                      const ratio = deal.agreed_price ? Math.min(100, (paid / Number(deal.agreed_price)) * 100) : 0;
                      return <tr key={deal.id} className="h-[76px] cursor-pointer border-b last:border-0 hover:bg-accent/50" onClick={() => setSelectedId(deal.id)}>
                        <td className="px-4"><p className="font-semibold">{deal.leads?.name ?? "Lead"}</p><p className="mt-1 text-xs text-muted-foreground">{[deal.units?.projects?.name, deal.units?.tower, deal.units?.unit_number].filter(Boolean).join(" · ")}</p></td>
                        <td className="px-4 font-medium tabular-nums">{formatBudget(Number(deal.agreed_price))}<p className="mt-1 text-xs font-normal text-muted-foreground">{deal.status === "cancelled" ? "Cancelled" : "Booked"} {formatDate(deal.status === "cancelled" ? deal.updated_at : deal.booking_date)}</p></td>
                        <td className="w-44 px-4"><div className="flex justify-between text-xs"><span>{formatBudget(paid)}</span><span className="text-muted-foreground">{Math.round(ratio)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold" style={{ width: `${ratio}%` }} /></div></td>
                        <td className="px-4">{next ? <><p className="font-medium">{next.name}</p><p className={cn("mt-1 text-xs", getMilestoneState(Number(next.amount_due), stagePaid(next), next.due_date) === "Overdue" ? "text-destructive" : "text-muted-foreground")}>{formatDate(next.due_date)} · {formatBudget(Number(next.amount_due) - stagePaid(next))}</p></> : <span className="text-muted-foreground">All milestones paid</span>}</td>
                        <td className="px-4"><span className={cn("badge", STATUS_STYLE[deal.status] ?? "badge-grey")}>{STATUS_LABEL[deal.status] ?? deal.status}</span></td>
                        <td className="px-4 text-right"><Button size="icon" variant="ghost" aria-label={`Open booking for ${deal.leads?.name ?? "lead"}`} onClick={(event) => { event.stopPropagation(); setSelectedId(deal.id); }}><ChevronRight className="h-4 w-4" /></Button></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>}
        </div>
      </section>

      <section className="min-w-0">
        <div className="mb-3 flex items-center gap-2"><h2 className="text-section-heading">Upcoming collections</h2><CalendarDays className="h-4 w-4 text-muted-foreground" /></div>
        {dueStages.length === 0 ? <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">No outstanding milestones.</p> : <div className="divide-y border-y">
          {dueStages.slice(0, 6).map(({ deal, stage, remaining }) => {
            const state = getMilestoneState(Number(stage.amount_due), stagePaid(stage), stage.due_date);
            return <Button type="button" variant="ghost" key={stage.id} className="h-auto w-full flex-wrap justify-between gap-3 rounded-none px-0 py-3 text-left hover:bg-accent/40" onClick={() => setSelectedId(deal.id)}>
              <span className="flex min-w-0 items-center gap-3"><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", state === "Overdue" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{state === "Overdue" ? <CircleAlert className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{deal.leads?.name} · {stage.name}</span><span className="block text-xs text-muted-foreground">{deal.units?.projects?.name} · {formatDate(stage.due_date)}</span></span></span>
              <span className="shrink-0 text-right"><span className="block text-sm font-semibold tabular-nums">{formatBudget(remaining)}</span>{state === "Overdue" && <span className="text-xs text-destructive">Overdue</span>}</span>
            </Button>;
          })}
        </div>}
      </section>

      {createOpen && <BookingDialog leads={leadsQuery.data ?? []} units={unitsQuery.data ?? []} initialLeadId={searchParams.leadId} initialUnitId={searchParams.unitId} onClose={() => { setCreateOpen(false); clearBookingSearch(); }} onCreated={() => { setCreateOpen(false); clearBookingSearch(); refreshDeals(); toast.success("Booking created and unit reserved"); }} />}
      {selectedDeal && <DealDetailDialog deal={selectedDeal} isAdmin={me?.isAdmin ?? false} meId={me?.id ?? ""} onClose={() => { setSelectedId(null); void navigate({ to: "/deals", search: { leadId: undefined, unitId: undefined, dealId: undefined }, replace: true }); }} onRecordPayment={setPaymentStage} onCancel={() => cancelBooking(selectedDeal)} onStatus={(next) => updateStatus(selectedDeal, next)} onReschedule={rescheduleMilestone} onReceipt={(stage, payment) => setReceipt({ deal: selectedDeal, stage, payment })} />}
      {paymentStage && selectedDeal && <PaymentDialog deal={selectedDeal} stage={paymentStage} onClose={() => setPaymentStage(null)} onSave={recordPayment} />}
      {receipt && <ReceiptPrint receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function BookingDialog({ leads, units, initialLeadId, initialUnitId, onClose, onCreated }: { leads: Lead[]; units: Unit[]; initialLeadId?: string; initialUnitId?: string; onClose: () => void; onCreated: () => void }) {
  const [leadId, setLeadId] = useState(initialLeadId ?? "");
  const [unitId, setUnitId] = useState(initialUnitId ?? "");
  const [basePrice, setBasePrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<MilestoneDraft[]>(CONSTRUCTION_PAYMENT_PLAN.map((stage) => ({ ...stage })));
  const [saving, setSaving] = useState(false);
  const selectedUnit = units.find((unit) => unit.id === unitId);
  const agreed = Number(basePrice || 0) - Number(discount || 0);
  const percentTotal = plan.reduce((sum, stage) => sum + (Number(stage.percentage) || 0), 0);

  useEffect(() => {
    if (initialUnitId && selectedUnit?.price) setBasePrice(String(selectedUnit.price));
  }, [initialUnitId, selectedUnit]);

  function changeStage(index: number, field: keyof MilestoneDraft, value: string) {
    setPlan((previous) => previous.map((stage, i) => i !== index ? stage : field === "percentage" ? { ...stage, percentage: Number(value) } : field === "due_date" ? { ...stage, due_date: value || null } : { ...stage, name: value }));
  }

  async function createBooking() {
    if (!leadId || !unitId) return toast.error("Choose a client and available unit");
    if (Number(basePrice) <= 0 || Number(discount) < 0 || agreed <= 0) return toast.error("Enter a valid price and discount");
    if (!isValidMilestoneSchedule(plan)) return toast.error("Milestone percentages must total 100% and have names");
    setSaving(true);
    const { error } = await supabase.rpc("create_deal_booking", {
      _lead_id: leadId,
      _unit_id: unitId,
      _base_price: Number(basePrice),
      _discount_amount: Number(discount),
      _payment_plan: "Construction-linked",
      _booking_date: bookingDate,
      _notes: notes || "",
      _milestones: plan.map((stage) => ({ ...stage, due_date: stage.due_date || null })),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    onCreated();
  }

  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle className="text-section-heading">New booking</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client"><Select value={leadId} onValueChange={setLeadId}><SelectTrigger><SelectValue placeholder="Select a lead" /></SelectTrigger><SelectContent>{leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.name} · {lead.phone}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Available unit"><Select value={unitId} onValueChange={(value) => { setUnitId(value); const unit = units.find((entry) => entry.id === value); if (unit?.price) setBasePrice(String(unit.price)); }}><SelectTrigger><SelectValue placeholder="Select a unit" /></SelectTrigger><SelectContent>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{[unit.projects?.name, unit.tower, unit.unit_number].filter(Boolean).join(" · ")}{unit.price ? ` · ${formatBudget(Number(unit.price))}` : ""}</SelectItem>)}</SelectContent></Select></Field>
        {selectedUnit && <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">Unit booking makes this inventory unavailable for other bookings.</p>}
        <Field label="Base price"><Input type="number" min="1" step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} placeholder="0.00" /></Field>
        <Field label="Discount"><Input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></Field>
        <Field label="Booking date"><Input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} /></Field>
        <div className="flex items-end justify-between pb-2"><span className="text-sm text-muted-foreground">Agreed price</span><span className="text-xl font-semibold tabular-nums">{formatBudget(agreed)}</span></div>
      </div>
      <div className="border-t pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Construction-linked schedule</h3><p className="text-xs text-muted-foreground">{percentTotal}% of agreed price</p></div><Button type="button" size="sm" variant="outline" onClick={() => setPlan((old) => [...old, { name: "New milestone", percentage: 0, due_date: null }])} disabled={plan.length >= 20}><Plus className="mr-1 h-3.5 w-3.5" /> Stage</Button></div>
        <div className="space-y-2">{plan.map((stage, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_76px_130px_32px] items-center gap-2"><Input aria-label={`Milestone ${index + 1} name`} value={stage.name} onChange={(event) => changeStage(index, "name", event.target.value)} /><div className="relative"><Input aria-label={`Milestone ${index + 1} percentage`} className="pr-6 text-right tabular-nums" type="number" min="0" max="100" step="0.01" value={stage.percentage} onChange={(event) => changeStage(index, "percentage", event.target.value)} /><span className="pointer-events-none absolute right-2 top-2 text-xs text-muted-foreground">%</span></div><Input aria-label={`Milestone ${index + 1} due date`} type="date" value={stage.due_date ?? ""} onChange={(event) => changeStage(index, "due_date", event.target.value)} /><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${stage.name}`} onClick={() => setPlan((old) => old.filter((_, i) => i !== index))} disabled={plan.length <= 1}><X className="h-4 w-4" /></Button></div>)}</div>
        <div className="mt-3 flex justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">Final installment rounding adjusted automatically</span><span className={cn("font-semibold tabular-nums", percentTotal === 100 ? "text-foreground" : "text-destructive")}>{formatBudget(agreed)} total</span></div>
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Booking terms or internal notes" /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" onClick={createBooking} disabled={saving || !isValidMilestoneSchedule(plan)}>{saving ? "Creating…" : "Create booking"}</Button></div>
    </DialogContent>
  </Dialog>;
}

function DealDetailDialog({ deal, isAdmin, meId, onClose, onRecordPayment, onCancel, onStatus, onReschedule, onReceipt }: {
  deal: Deal; isAdmin: boolean; meId: string; onClose: () => void; onRecordPayment: (stage: Milestone) => void; onCancel: () => void;
  onStatus: (status: string) => void; onReschedule: (milestoneId: string, dueDate: string) => Promise<void>; onReceipt: (stage: Milestone, payment: Payment) => void;
}) {
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [editingDueDate, setEditingDueDate] = useState("");
  const paid = amountPaid(deal);
  const canEdit = canManageDeal(isAdmin, deal.assigned_to, meId);
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle className="text-section-heading">Booking details</DialogTitle></DialogHeader>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div><p className="text-lg font-semibold">{deal.leads?.name}</p><p className="mt-1 text-sm text-muted-foreground">{[deal.units?.projects?.name, deal.units?.tower, deal.units?.unit_number].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs text-muted-foreground">{deal.leads?.phone} · Booked {formatDate(deal.booking_date)}</p></div>
        <span className={cn("badge", STATUS_STYLE[deal.status] ?? "badge-grey")}>{STATUS_LABEL[deal.status] ?? deal.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 border-b py-4 sm:grid-cols-4">
        <SummaryValue label="Agreed price" value={formatBudget(Number(deal.agreed_price))} />
        <SummaryValue label="Discount" value={formatBudget(Number(deal.discount_amount))} />
        <SummaryValue label="Collected" value={formatBudget(paid)} />
        <SummaryValue label="Outstanding" value={formatBudget(outstanding(deal))} />
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">{deal.payment_plan} schedule</h3><span className="text-xs text-muted-foreground">{deal.payment_milestones.length} milestones</span></div>
        {[...deal.payment_milestones].sort((a, b) => a.order_index - b.order_index).map((stage, index) => {
          const received = stagePaid(stage);
          const remaining = Math.max(0, Number(stage.amount_due) - received);
          const state = getMilestoneState(Number(stage.amount_due), received, stage.due_date);
          return <div key={stage.id} className="border-t py-3 first:border-t-0">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", state === "Paid" ? "bg-secondary text-secondary-foreground" : state === "Overdue" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{state === "Paid" ? <Check className="h-4 w-4" /> : index + 1}</span><div className="min-w-0"><p className="font-medium">{stage.name} <span className="font-normal text-muted-foreground">· {stage.percentage}%</span></p>{editingMilestone === stage.id ? <div className="mt-1 flex flex-wrap items-center gap-2"><Input aria-label={`Due date for ${stage.name}`} className="h-8 w-40" type="date" value={editingDueDate} onChange={(event) => setEditingDueDate(event.target.value)} /><Button size="sm" disabled={!canEdit || !editingDueDate} onClick={async () => { await onReschedule(stage.id, editingDueDate); setEditingMilestone(null); }}>Save date</Button><Button size="sm" variant="ghost" onClick={() => setEditingMilestone(null)}>Cancel</Button></div> : <div className="mt-1 flex items-center gap-1"><p className={cn("text-xs", state === "Overdue" ? "text-destructive" : "text-muted-foreground")}>{formatDate(stage.due_date)} · {formatBudget(remaining)} outstanding</p>{canEdit && deal.status !== "cancelled" && <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label={`Reschedule ${stage.name}`} title="Reschedule milestone" onClick={() => { setEditingDueDate(stage.due_date?.slice(0, 10) ?? ""); setEditingMilestone(stage.id); }}><Pencil className="h-3 w-3" /></Button>}</div>}</div></div><div className="flex items-center gap-2"><span className={cn("badge", state === "Paid" ? "badge-green" : state === "Overdue" ? "badge-red" : state === "Partially paid" ? "badge-amber" : "badge-grey")}>{state}</span>{remaining > 0 && deal.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => onRecordPayment(stage)}><Plus className="mr-1 h-3.5 w-3.5" /> Payment</Button>}</div></div>
            <div className="ml-10 mt-3 space-y-2">{(stage.deal_payments ?? []).map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs"><span><span className="font-medium">{payment.receipt_number}</span><span className="mx-2 text-muted-foreground">{formatDate(payment.paid_on)} · {payment.payment_method}</span>{payment.reference_no && <span className="text-muted-foreground">Ref. {payment.reference_no}</span>}</span><span className="flex items-center gap-3"><strong className="tabular-nums">{formatBudget(Number(payment.amount))}</strong><Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onReceipt(stage, payment)}><Printer className="mr-1 h-3.5 w-3.5" /> Receipt</Button></span></div>)}</div>
          </div>;
        })}
      </section>
      {deal.notes && <div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground">Booking notes</p><p className="mt-1 whitespace-pre-wrap text-sm">{deal.notes}</p></div>}
      {deal.status !== "cancelled" && deal.status !== "registered" && <div className="flex flex-wrap justify-end gap-2 border-t pt-4">{canEdit && deal.status === "booked" && <Button variant="outline" onClick={() => onStatus("agreement_signed")}>Mark agreement signed</Button>}{canEdit && deal.status === "agreement_signed" && <Button variant="outline" onClick={() => onStatus("registered")}>Mark registered</Button>}{canEdit && allPayments(deal).length === 0 && <Button variant="destructive" onClick={() => { if (window.confirm("Cancel this booking and release the unit?")) onCancel(); }}>Cancel booking & release unit</Button>}</div>}
    </DialogContent>
  </Dialog>;
}

function PaymentDialog({ deal, stage, onClose, onSave }: { deal: Deal; stage: Milestone; onClose: () => void; onSave: (values: { dealId: string; milestoneId: string; amount: number; paidOn: string; method: string; reference: string; notes: string }) => void }) {
  const paid = stagePaid(stage);
  const remaining = Math.max(0, Number(stage.amount_due) - paid);
  const [amount, setAmount] = useState(String(remaining));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle className="text-section-heading">Record payment</DialogTitle></DialogHeader>
      <div className="rounded-md bg-muted/50 px-4 py-3 text-sm"><p className="font-medium">{deal.leads?.name} · {stage.name}</p><p className="mt-1 text-muted-foreground">Remaining: <strong className="text-foreground">{formatBudget(remaining)}</strong></p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount"><Input type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="Payment date"><Input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} /></Field>
        <Field label="Payment method"><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Bank transfer", "UPI", "Cheque", "Cash", "Other"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Transaction / cheque reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional" /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional receipt note" /></Field>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave({ dealId: deal.id, milestoneId: stage.id, amount: Number(amount), paidOn, method, reference, notes })} disabled={!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > remaining || !paidOn}>Record & create receipt</Button></div>
    </DialogContent>
  </Dialog>;
}

function ReceiptPrint({ receipt, onClose }: { receipt: { deal: Deal; stage: Milestone; payment: Payment }; onClose: () => void }) {
  const { deal, stage, payment } = receipt;
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-section-heading"><ReceiptText className="h-5 w-5" /> Payment receipt</DialogTitle></DialogHeader>
      <div className="receipt-printable space-y-5 border-y py-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xl font-semibold">Bhangar Estates</p><p className="mt-1 text-sm text-muted-foreground">Payment receipt</p></div><div className="text-right"><p className="font-mono text-sm font-semibold">{payment.receipt_number}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(payment.paid_on)}</p></div></div>
        <div className="grid grid-cols-2 gap-4 border-y py-4 text-sm"><SummaryValue label="Received from" value={deal.leads?.name ?? "—"} /><SummaryValue label="Unit" value={[deal.units?.tower, deal.units?.unit_number].filter(Boolean).join(" · ") || "—"} /><SummaryValue label="Project" value={deal.units?.projects?.name ?? "—"} /><SummaryValue label="Milestone" value={stage.name} /></div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Amount received · {payment.payment_method}</span><strong className="text-xl tabular-nums">{CURRENCY.format(Number(payment.amount))}</strong></div>
        {payment.reference_no && <p className="text-sm text-muted-foreground">Transaction reference: {payment.reference_no}</p>}
        {payment.notes && <p className="text-sm text-muted-foreground">{payment.notes}</p>}
        <div className="border-t pt-4 text-xs text-muted-foreground"><p>Agreed price: {formatBudget(Number(deal.agreed_price))}</p><p className="mt-1">Total received: {formatBudget(amountPaid(deal))}</p><p className="mt-1">Balance outstanding: {formatBudget(outstanding(deal))}</p></div>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Print receipt</Button></div>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</p></div>;
}