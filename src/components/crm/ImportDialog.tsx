import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Upload, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/crm";
import type { Me } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FIELDS = [
  { key: "name", label: "Name", required: true, guess: /name/i },
  { key: "phone", label: "Phone", required: true, guess: /phone|mobile|contact|number/i },
  { key: "email", label: "Email", required: false, guess: /mail/i },
  { key: "location", label: "Location", required: false, guess: /locat|city|area|address/i },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

export function ImportDialog({ open, onClose, me }: { open: boolean; onClose: () => void; me: Me }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [batch, setBatch] = useState("");
  const [map, setMap] = useState<Record<FieldKey, string>>({ name: "", phone: "", email: "", location: "" });
  const [dupMode, setDupMode] = useState<"skip" | "flag">("skip");
  const [busy, setBusy] = useState(false);

  function reset() {
    setRows([]); setHeaders([]); setFileName(""); setBatch("");
    setMap({ name: "", phone: "", email: "", location: "" });
  }

  async function onFile(f: File) {
    const wb = XLSX.read(await f.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!json.length) return toast.error("The file has no rows");
    const hs = Object.keys(json[0]!);
    setRows(json);
    setHeaders(hs);
    setFileName(f.name);
    setBatch(f.name.replace(/\.[^.]+$/, ""));
    const m = { name: "", phone: "", email: "", location: "" } as Record<FieldKey, string>;
    FIELDS.forEach((fd) => (m[fd.key] = hs.find((h) => fd.guess.test(h)) ?? ""));
    setMap(m);
  }

  async function doImport() {
    if (!map.name || !map.phone) return toast.error("Map Name and Phone columns");
    if (!batch.trim()) return toast.error("Name this batch");
    setBusy(true);
    try {
      const parsed = rows.map((r) => ({
        name: String(r[map.name] ?? "").trim(),
        phone: normalizePhone(String(r[map.phone] ?? "")),
        email: map.email ? String(r[map.email] ?? "").trim() || null : null,
        location: map.location ? String(r[map.location] ?? "").trim() || null : null,
      }));
      const valid = parsed.filter((p) => p.name && p.phone) as { name: string; phone: string; email: string | null; location: string | null }[];
      const invalid = parsed.length - valid.length;
      const { data: existing } = await supabase.rpc("existing_phones", { _phones: valid.map((v) => v.phone) });
      const existingSet = new Set(existing ?? []);
      const seen = new Set<string>();
      let dups = 0;
      const toInsert: (typeof valid[number] & { is_duplicate: boolean })[] = [];
      for (const v of valid) {
        const isDup = existingSet.has(v.phone) || seen.has(v.phone);
        seen.add(v.phone);
        if (isDup) dups++;
        if (isDup && dupMode === "skip") continue;
        toInsert.push({ ...v, is_duplicate: isDup });
      }
      if (!toInsert.length) {
        setBusy(false);
        return toast.warning(`Nothing imported — ${dups} duplicates, ${invalid} invalid rows`);
      }
      const { data: b, error: be } = await supabase.from("data_batches").insert({ name: batch.trim(), created_by: me.id }).select("id").single();
      if (be) throw be;
      for (let i = 0; i < toInsert.length; i += 500) {
        const { error } = await supabase.from("data_records").insert(toInsert.slice(i, i + 500).map((r) => ({ ...r, batch_id: b.id })));
        if (error) throw error;
      }
      toast.success(`Imported ${toInsert.length} records`, {
        description: `${dups} duplicate${dups === 1 ? "" : "s"} ${dupMode === "skip" ? "skipped" : "flagged"} · ${invalid} invalid row${invalid === 1 ? "" : "s"} skipped`,
      });
      qc.invalidateQueries({ queryKey: ["data"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      reset();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-section-heading text-primary dark:text-foreground">Import Data</DialogTitle>
        </DialogHeader>

        {!rows.length ? (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors hover:border-gold">
            <Upload className="mb-3 h-8 w-8 text-gold" />
            <span className="font-medium">Choose a CSV or Excel file</span>
            <span className="mt-1 text-sm text-muted-foreground">Columns like Name, Phone, Email, Location work best</span>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4 text-gold" /> {fileName} · {rows.length} rows
              <button className="ml-auto text-gold hover:underline" onClick={reset}>Choose another file</button>
            </div>

            <div>
              <h3 className="mb-2 text-section-heading text-foreground">Preview (first 10 rows)</h3>
              <div className="max-h-56 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary">
                    <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left text-table-header">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t">
                        {headers.map((h) => <td key={h} className="whitespace-nowrap px-3 py-1.5">{String(r[h] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{f.label}{f.required && " *"}</Label>
                  <Select value={map[f.key] || "__none"} onValueChange={(v) => setMap({ ...map, [f.key]: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Don't import —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Batch name *</Label>
                <Input value={batch} onChange={(e) => setBatch(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Duplicate phone numbers</Label>
                <RadioGroup value={dupMode} onValueChange={(v) => setDupMode(v as "skip" | "flag")} className="flex gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="skip" /> Skip them</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="flag" /> Import & flag</label>
                </RadioGroup>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={doImport} disabled={!rows.length || busy}>{busy ? "Importing…" : "Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
