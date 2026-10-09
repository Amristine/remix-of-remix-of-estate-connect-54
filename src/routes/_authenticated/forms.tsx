import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { LEAD_SOURCES } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, tableHead, tableRow } from "@/components/crm/common";

export const Route = createFileRoute("/_authenticated/forms")({
  head: () => ({
    meta: [
      { title: "Lead Forms — Estatery CRM" },
      { name: "description", content: "Create a lead form per ad platform and track where every lead comes from." },
      { property: "og:title", content: "Lead Forms — Estatery CRM" },
      { property: "og:description", content: "Create a lead form per ad platform and track where every lead comes from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FormsPage,
});

const PLATFORMS = ["Facebook", "Instagram", "Google", "YouTube", "Other"] as const;

function FormsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);

  const formsQ = useQuery({
    queryKey: ["lead_forms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_forms").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const countsQ = useQuery({
    queryKey: ["lead_form_counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("form_id").not("form_id", "is", null);
      if (error) throw error;
      const c: Record<string, number> = {};
      data.forEach((r) => r.form_id && (c[r.form_id] = (c[r.form_id] ?? 0) + 1));
      return c;
    },
  });

  const linkFor = (id: string) => `${window.location.origin}/f/${id}`;
  const copy = async (id: string) => {
    await navigator.clipboard.writeText(linkFor(id));
    toast.success("Link copied — paste it into your ad");
  };
  async function toggle(id: string, is_active: boolean) {
    const { error } = await supabase.from("lead_forms").update({ is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lead_forms"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this form? Leads already collected stay in Leads.")) return;
    const { error } = await supabase.from("lead_forms").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Form deleted");
    qc.invalidateQueries({ queryKey: ["lead_forms"] });
  }

  const forms = formsQ.data ?? [];
  return (
    <div>
      <PageHeader
        title="Lead Forms"
        subtitle="One link per ad platform. Every response lands in Leads, tagged with its source."
        actions={
          me?.isAdmin && (
            <Button className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New Form
            </Button>
          )
        }
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="overflow-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b">
                {["Form", "Platform", "Leads", "Link", "Active", ""].map((h) => (
                  <th key={h} className={cn(tableHead, "px-4 py-3")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id} className={tableRow}>
                  <td className="px-4 font-medium text-primary dark:text-foreground">{f.name}</td>
                  <td className="px-4">{f.platform}</td>
                  <td className="px-4 tabular-nums">{countsQ.data?.[f.id] ?? 0}</td>
                  <td className="px-4">
                    <div className="flex items-center gap-1">
                      <span className="max-w-[260px] truncate text-mono-tabular text-xs text-muted-foreground">/f/{f.id}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(f.id)} aria-label="Copy link">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                        <a href={`/f/${f.id}`} target="_blank" rel="noreferrer" aria-label="Open form">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </td>
                  <td className="px-4">
                    <Switch checked={f.is_active} disabled={!me?.isAdmin} onCheckedChange={(v) => toggle(f.id, v)} />
                  </td>
                  <td className="px-4 text-right">
                    {me?.isAdmin && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(f.id)} aria-label="Delete form">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!formsQ.isLoading && forms.length === 0 && (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No lead forms yet"
              body="Create one form for each platform you advertise on — e.g. “Facebook – Diwali Offer”."
              action={me?.isAdmin && <Button onClick={() => setOpen(true)}>New Form</Button>}
            />
          )}
        </div>
      </div>
      <NewFormDialog open={open} onClose={() => setOpen(false)} meId={me?.id} />
    </div>
  );
}

function NewFormDialog({ open, onClose, meId }: { open: boolean; onClose: () => void; meId?: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<string>("Facebook");
  const [headline, setHeadline] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Give the form a name");
    setSaving(true);
    const { error } = await supabase.from("lead_forms").insert({
      name: name.trim(),
      platform: platform as (typeof LEAD_SOURCES)[number],
      headline: headline.trim() || null,
      created_by: meId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Form created — copy its link into your ad");
    setName(""); setHeadline("");
    qc.invalidateQueries({ queryKey: ["lead_forms"] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-section-heading">New lead form</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Form name (only you see this)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Facebook – Diwali Offer" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p === "Other" ? "Custom / Other" : p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Heading shown to visitors (optional)</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Get pricing & floor plans" />
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create form"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
