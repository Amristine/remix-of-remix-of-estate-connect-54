import type { Lead } from "@/components/crm/LeadForm";

/** A lead's next_follow_up is a site visit when its stage is "Site Visit Scheduled"; otherwise a call. */
export type TaskKind = "visit" | "call";
export const taskKind = (l: Pick<Lead, "status">): TaskKind => (l.status === "Site Visit Scheduled" ? "visit" : "call");

/** Leads that are closed don't need reminders. */
export const isOpenTask = (l: Lead) => !!l.next_follow_up && !["Booked", "Lost", "Not Interested"].includes(l.status);
