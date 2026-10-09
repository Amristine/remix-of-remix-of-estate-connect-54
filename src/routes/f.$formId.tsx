import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/f/$formId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Enquire Now — Bhangar Estates" },
      { name: "description", content: "Share your details and our team will call you back shortly." },
      { property: "og:title", content: "Enquire Now — Bhangar Estates" },
      { property: "og:description", content: "Share your details and our team will call you back shortly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicForm,
});

function PublicForm() {
  const { formId } = Route.useParams();
  const [state, setState] = useState<"loading" | "open" | "closed" | "done">("loading");
  const [headline, setHeadline] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.rpc("get_public_form", { _id: formId }).then(({ data }) => {
      const f = data?.[0];
      if (!f || !f.is_active) return setState("closed");
      setHeadline(f.headline);
      setState("open");
    });
  }, [formId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const { error } = await supabase.rpc("submit_lead_form", {
      _form_id: formId,
      _name: name,
      _phone: phone,
      _email: email.trim() || (null as unknown as string),
    });
    setSending(false);
    if (error) return setError(error.message);
    setState("done");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-soft">
        <div className="mb-6 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-gold" />
          <span className="font-sans text-lg font-semibold">Bhangar Estates</span>
        </div>
        {state === "loading" && <p className="text-helper">Loading…</p>}
        {state === "closed" && <p className="text-sm text-muted-foreground">This form is no longer accepting responses.</p>}
        {state === "done" && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gold" />
            <h1 className="text-page-title">Thank you!</h1>
            <p className="mt-2 text-sm text-muted-foreground">Our team will call you shortly.</p>
          </div>
        )}
        {state === "open" && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-page-title">{headline || "Enquire now"}</h1>
              <p className="text-helper mt-1">Leave your details and we’ll get back to you.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n">Name</Label>
              <Input id="n" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Mobile number</Label>
              <Input id="p" required type="tel" inputMode="tel" className="text-mono-tabular" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e">Email</Label>
              <Input id="e" type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-gold text-gold-foreground hover:bg-gold/90" disabled={sending}>
              {sending ? "Sending…" : "Submit"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
