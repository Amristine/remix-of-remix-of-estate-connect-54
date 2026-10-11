import { useState } from "react";
import { addDays, addHours, addMinutes, format, setHours, setMinutes } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { LeadStatus } from "@/lib/crm";

export const CALL_OUTCOMES = ["Connected", "Incoming call", "Ringing", "Busy", "Not reachable", "Left message", "Wrong number"] as const;
export function parseCallOutcome(content: string) {
  const m = content.match(/^Call outcome: ([^—]+?)(?: — (.*))?$/);
  if (!m) return null;
  return { outcome: (m[1] ?? "").trim(), detail: m[2] ?? "" };
}

type Outcome = "connected" | "incoming" | "ringing" | "busy" | "off" | "message" | "wrong";
const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "connected", label: "Connected / Answered" },
  { id: "incoming", label: "Incoming call from lead" },
  { id: "ringing", label: "Ringing / No answer" },
  { id: "busy", label: "Busy / Call waiting" },
  { id: "off", label: "Switched off / Not reachable" },
  { id: "message", label: "Left message / Voicemail" },
  { id: "wrong", label: "Wrong number / Invalid" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: { id: string; status: LeadStatus };
  onDone: () => void;
}

export function CallLogDialog({ open, onOpenChange, lead, onDone }: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [fuTime, setFuTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  function reset() {
    setOutcome(null);
    setNote("");
    setFuDate("");
    setFuTime("10:00");
    setPick(null);
  }

  async function commit(label: string, opts: { followUp?: Date; status?: LeadStatus; extra?: string }) {
    setBusy(true);
    const { data: me } = await supabase.auth.getUser();
    const upd: { next_follow_up?: string; status?: LeadStatus } = {};
    if (opts.followUp) upd.next_follow_up = opts.followUp.toISOString();
    if (opts.status && opts.status !== lead.status) upd.status = opts.status;
    if (Object.keys(upd).length) {
      const { error } = await supabase.from("leads").update(upd).eq("id", lead.id);
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
    }
    const parts = [`Call outcome: ${label}`];
    const n = opts.extra ?? note.trim();
    if (n) parts.push(n);
    if (opts.followUp) parts.push(`retry ${format(opts.followUp, "d MMM yyyy, h:mm a")}`);
    const rows = [{ lead_id: lead.id, type: "call", content: parts.join(" — "), created_by: me.user?.id }];
    if (upd.status) rows.push({ lead_id: lead.id, type: "status", content: `Status changed from ${lead.status} to ${upd.status}`, created_by: me.user?.id });
    await supabase.from("lead_activities").insert(rows);
    setBusy(false);
    toast.success("Call logged");
    reset();
    onOpenChange(false);
    onDone();
  }

  const tomorrow10 = () => setMinutes(setHours(addDays(new Date(), 1), 10), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log call outcome</DialogTitle>
          <DialogDescription>How did the call go?</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {OUTCOMES.map((o) => (
            <Button key={o.id} variant={outcome === o.id ? "default" : "outline"} className="justify-start" onClick={() => { setOutcome(o.id); setPick(null); }}>
              {o.label}
            </Button>
          ))}
        </div>

        {outcome && (
          <Input placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        )}
        {outcome === "connected" && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex gap-2">
              <Input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
              <Input type="time" value={fuTime} onChange={(e) => setFuTime(e.target.value)} className="w-32" />
            </div>
            <Button className="w-full" disabled={busy} onClick={() => commit("Connected", {
              followUp: fuDate ? new Date(`${fuDate}T${fuTime || "10:00"}`) : undefined,
              status: lead.status === "New" ? "Contacted" : undefined,
            })}>Log it</Button>
          </div>
        )}
        {outcome === "busy" && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex gap-2">
              <Button className="flex-1" variant={pick === "30m" ? "default" : "outline"} onClick={() => setPick(pick === "30m" ? null : "30m")}>Retry in 30 min</Button>
              <Button className="flex-1" variant={pick === "2h" ? "default" : "outline"} onClick={() => setPick(pick === "2h" ? null : "2h")}>Retry in 2 hrs</Button>
            </div>
            <Button className="w-full" disabled={busy} onClick={() => commit("Busy", {
              followUp: pick === "30m" ? addMinutes(new Date(), 30) : pick === "2h" ? addHours(new Date(), 2) : undefined,
            })}>Log it</Button>
          </div>
        )}
        {outcome === "off" && (
          <div className="space-y-2 border-t pt-3">
            <Button className="w-full" variant={pick === "tmrw" ? "default" : "outline"} onClick={() => setPick(pick === "tmrw" ? null : "tmrw")}>Retry tomorrow 10:00 AM</Button>
            <Button className="w-full" disabled={busy} onClick={() => commit("Not reachable", { followUp: pick === "tmrw" ? tomorrow10() : undefined })}>Log it</Button>
          </div>
        )}
        {outcome === "message" && (
          <div className="border-t pt-3">
            <Button className="w-full" disabled={busy} onClick={() => commit("Left message", {})}>Log it</Button>
          </div>
        )}
        {outcome === "incoming" && (
          <div className="border-t pt-3">
            <Button className="w-full" disabled={busy} onClick={() => commit("Incoming call", { status: lead.status === "New" ? "Contacted" : undefined })}>Log it</Button>
          </div>
        )}
        {outcome === "ringing" && (
          <div className="space-y-2 border-t pt-3">
            <Button className="w-full" variant={pick === "2h" ? "default" : "outline"} onClick={() => setPick(pick === "2h" ? null : "2h")}>Retry in 2 hrs</Button>
            <Button className="w-full" disabled={busy} onClick={() => commit("Ringing", { followUp: pick === "2h" ? addHours(new Date(), 2) : undefined })}>Log it</Button>
          </div>
        )}
        {outcome === "wrong" && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex gap-2">
              <Button className="flex-1" variant={pick === "lost" ? "destructive" : "outline"} onClick={() => setPick(pick === "lost" ? null : "lost")}>Mark Lost</Button>
              <Button className="flex-1" variant={pick === "ni" ? "default" : "outline"} onClick={() => setPick(pick === "ni" ? null : "ni")}>Not Interested</Button>
            </div>
            <Button className="w-full" disabled={busy} onClick={() => commit("Wrong number", {
              status: pick === "lost" ? "Lost" : pick === "ni" ? "Not Interested" : undefined,
            })}>Log it</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
