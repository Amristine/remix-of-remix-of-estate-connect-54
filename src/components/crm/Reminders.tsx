import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Bell, BellOff, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { followUpBucket } from "@/lib/crm";
import { isOpenTask, taskKind } from "@/lib/agenda";
import type { Lead } from "./LeadForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function useTaskLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
    refetchInterval: 5 * 60_000,
  });
}

/** Daily agenda popup (once per day) + browser notifications 15 min before / when overdue. */
export function Reminders() {
  const { data = [] } = useTaskLeads();
  const tasks = data.filter(isOpenTask);
  const today = tasks.filter((l) => followUpBucket(l.next_follow_up) === "today");
  const overdue = tasks.filter((l) => followUpBucket(l.next_follow_up) === "overdue");
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const notified = useRef(new Set<string>());

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (!data.length) return;
    const key = format(new Date(), "yyyy-MM-dd");
    if (localStorage.getItem("agendaShown") !== key && (today.length || overdue.length)) {
      localStorage.setItem("agendaShown", key);
      setOpen(true);
    }
  }, [data.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (perm !== "granted") return;
    const check = () => {
      const now = Date.now();
      tasks.forEach((l) => {
        const t = new Date(l.next_follow_up!).getTime();
        const id = `${l.id}-${l.next_follow_up}`;
        if (t - now <= 15 * 60_000 && t - now > -60 * 60_000 && !notified.current.has(id)) {
          notified.current.add(id);
          new Notification(taskKind(l) === "visit" ? `Site visit: ${l.name}` : `Call ${l.name}`, {
            body: `${t < now ? "Overdue since" : "At"} ${format(t, "h:mm a")}${l.location ? ` · ${l.location}` : ""}`,
            tag: id,
          });
        }
      });
    };
    check();
    const iv = setInterval(check, 60_000);
    return () => clearInterval(iv);
  }, [perm, tasks]);

  async function enable() {
    if (perm === "unsupported") return toast.error("This browser doesn't support notifications");
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") toast.success("Reminders on — you'll be alerted 15 minutes before each task");
    else toast.error("Notifications blocked in browser settings");
  }

  const Row = ({ l }: { l: Lead }) => (
    <li className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
      {taskKind(l) === "visit" ? <MapPin className="h-4 w-4 text-gold" /> : <Phone className="h-4 w-4 text-muted-foreground" />}
      <span className="flex-1 truncate font-medium">{l.name}</span>
      <span className="text-xs text-muted-foreground">{format(new Date(l.next_follow_up!), "d MMM, h:mm a")}</span>
    </li>
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={() => (perm === "granted" ? setOpen(true) : enable())} aria-label="Reminders" className="relative">
            {perm === "granted" ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {today.length + overdue.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                {today.length + overdue.length}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{perm === "granted" ? "Today's agenda" : "Turn on reminders"}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Today's agenda · {format(new Date(), "EEE, d MMM")}</DialogTitle>
          </DialogHeader>
          {overdue.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-destructive">Overdue ({overdue.length})</h3>
              <ul className="space-y-1.5">{overdue.slice(0, 8).map((l) => <Row key={l.id} l={l} />)}</ul>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gold">Today ({today.length})</h3>
            {today.length ? <ul className="space-y-1.5">{today.map((l) => <Row key={l.id} l={l} />)}</ul> : <p className="text-sm text-muted-foreground">Nothing else scheduled today.</p>}
          </section>
          <div className="flex justify-between gap-2">
            {perm !== "granted" && <Button variant="outline" onClick={enable}><Bell className="mr-1.5 h-4 w-4" /> Turn on reminders</Button>}
            <Button asChild className="ml-auto" onClick={() => setOpen(false)}><Link to="/calendar">Open calendar</Link></Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
