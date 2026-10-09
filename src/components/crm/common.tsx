import type { ReactNode } from "react";
import { STATUS_TONE, initials } from "@/lib/crm";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("badge", STATUS_TONE[status] ?? "badge-grey")}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function UserAvatar({ name, size = "sm" }: { name?: string | null; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground ring-1 ring-border",
        size === "sm" ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-sm",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function UserName({ id, profiles }: { id: string | null; profiles: Profile[] }) {
  if (!id) return <span className="text-muted-foreground">Unassigned</span>;
  const p = profiles.find((x) => x.id === id);
  return (
    <span className="flex items-center gap-2">
      <UserAvatar name={p?.full_name} />
      <span className="truncate">{p?.full_name ?? "—"}</span>
    </span>
  );
}

export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
      <SelectTrigger className={cn("h-9 w-[160px] bg-card", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 shadow-soft">
      <div className="text-helper uppercase">{label}</div>
      <div className={cn("mt-1 text-stat-number text-primary dark:text-foreground", tone)}>{value}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-gold">{icon}</div>
      <h3 className="text-section-heading">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-page-title">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Pager({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        {total === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button className="rounded-md border px-3 py-1 hover:bg-accent disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} / {pages}
        </span>
        <button className="rounded-md border px-3 py-1 hover:bg-accent disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export const tableHead = "sticky top-0 z-10 bg-card text-left text-table-header";
export const tableRow = "h-[52px] border-b transition-colors last:border-0 hover:bg-accent/50";
