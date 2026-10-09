<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Analytics chart tracks use the shared chart-empty semantic token and a single positioned track for source overlays — why: consistent empty states and accurately aligned total/booked bars.
- Data access uses the browser Supabase client with RLS (admin sees all, caller sees rows where assigned_to = self); cross-role checks (duplicate phones, convert-to-lead) go through SECURITY DEFINER SQL functions — why: callers can't see others' rows.
- Phone numbers are stored normalised to 10 digits via normalizePhone in src/lib/crm.ts — why: consistent duplicate detection.
- First signup becomes admin via handle_new_user trigger; roles live in user_roles — why: avoid privilege escalation.
- Deal and milestone reads use the browser client under RLS; booking, payment, and status mutations use authenticated transactional SQL functions — why: prevent double-booking and overpayment while preserving caller-specific access.
- Milestone due-date changes use an authenticated SECURITY DEFINER function with the same admin-or-assigned-deal boundary — why: keep writes consistent with the read policy while the tables remain directly read-only.
