import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Phone, MessageCircle, Mail, MapPin, StickyNote, CalendarClock, PhoneCall, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatPhone, formatBudget } from "@/lib/crm";
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

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: PhoneCall,
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
  const [fuDate, setFuDate] = useState("");
  const [fuTime, setFuTime] = useState("11:00");
  const [fuRemark, setFuRemark] = useState("");
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

  async function addNote() {
    if (!note.trim()) return;
    await log("note", note.trim());
    setNote("");
    toast.success("Note added");
    refresh();
  }

  async function logCall() {
    await log("call", "Call placed");
    refresh();
  }

  async function scheduleFollowUp() {
    if (!fuDate) return toast.error("Pick a date");
    const when = new Date(`${fuDate}T${fuTime || "10:00"}`);
    const { error } = await supabase.from("leads").update({ next_follow_up: when.toISOString() }).eq("id", lead!.id);
    if (error) return toast.error(error.message);
    await log("followup", `Follow-up scheduled for ${format(when, "d MMM yyyy, h:mm a")}${fuRemark ? ` — ${fuRemark}` : ""}`);
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
              <div className="mt-4 flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="sm" onClick={logCall}>
                      <a href={`tel:+91${lead.phone}`}>
                        <Phone className="mr-1.5 h-4 w-4" /> Call
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Call {formatPhone(lead.phone)}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="sm" variant="outline">
                      <a href={`https://wa.me/91${lead.phone}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open WhatsApp chat</TooltipContent>
                </Tooltip>
              </div>
            </SheetHeader>

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

            <Tabs defaultValue="timeline" className="px-6 py-4">
              <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                {["timeline", "followup", "edit"].map((t) => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="rounded-none border-b-2 border-transparent px-0 pb-2 capitalize shadow-none data-[state=active]:border-gold data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    {t === "followup" ? "Follow-up" : t === "edit" ? "Edit details" : "Timeline"}
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
                      return (
                        <li key={a.id} className="mb-5 ml-6">
                          <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-gold">
                            <Icon className="h-3 w-3" />
                          </span>
                          <p className="text-sm">{a.content}</p>
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
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
                  <Input type="time" value={fuTime} onChange={(e) => setFuTime(e.target.value)} />
                </div>
                <Textarea value={fuRemark} onChange={(e) => setFuRemark(e.target.value)} placeholder="Remark (e.g. share brochure, confirm site visit)" rows={2} />
                <Button className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={scheduleFollowUp}>
                  <CalendarClock className="mr-1.5 h-4 w-4" /> Schedule follow-up
                </Button>
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
