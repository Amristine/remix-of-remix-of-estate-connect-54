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
- Data access uses the browser Supabase client with RLS (admin sees all, caller sees rows where assigned_to = self); cross-role checks (duplicate phones, convert-to-lead) go through SECURITY DEFINER SQL functions — why: callers can't see others' rows.
- Phone numbers are stored normalised to 10 digits via normalizePhone in src/lib/crm.ts — why: consistent duplicate detection.
- First signup becomes admin via handle_new_user trigger; roles live in user_roles — why: avoid privilege escalation.
