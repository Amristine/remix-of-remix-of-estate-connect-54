# Remix of Remix of Estate Connect

Build a lightweight CRM web app for a real estate sales team, inspired by LeadRat. 
It must have ONLY two main pages: "Leads" and "Data". No dashboard, no billing, 
no extra modules. Use a left sidebar with just these two items, plus a top bar 
with search, a user avatar and a logout option.

AUTH & ROLES
- Email/password login (use Supabase auth).
- Two roles: Admin and Caller. Admin sees everything and can assign. 
  Caller sees only leads/data assigned to them.

PAGE 1: LEADS
- Table view of all leads with columns: Name, Phone, Email, Source 
  (Facebook, Google, 99acres, MagicBricks, Walk-in, Referral, Other), 
  Property Interest (1BHK/2BHK/3BHK/Plot/Commercial), Budget, Location, 
  Status, Assigned To, Next Follow-up, Last Updated.
- Statuses: New, Contacted, Interested, Site Visit Scheduled, Site Visit Done, 
  Negotiation, Booked, Not Interested, Lost. Show each as a colored badge. 
  Allow inline status change from the table.
- Top filters: status, source, assigned user, date range, follow-up 
  (Today / Overdue / Upcoming). Plus a search box for name/phone.
- Status summary chips above the table showing the count per status; 
  clicking a chip filters the table.
- "Add Lead" button opening a side drawer form with all fields.
- Clicking a lead opens a detail drawer with: contact info, edit fields, 
  a timeline of activity (calls, notes, status changes), "Add note", 
  "Schedule follow-up" (date + time + remark), and quick buttons for 
  Call (tel: link) and WhatsApp (wa.me link).
- Bulk actions: select multiple leads, then assign to a user or change status.
- Pagination (25 per page) and export of the filtered list to CSV.

PAGE 2: DATA (raw/cold data pool)
- This is a pool of unqualified contacts that are not yet leads.
- Table columns: Name, Phone, Email, Location, Source/Batch name, 
  Uploaded On, Assigned To, Status (Fresh, Called, Not Reachable, Wrong Number).
- "Import Data" button: upload CSV/Excel, preview the first 10 rows, 
  map columns to fields, name the batch, and detect duplicate phone numbers 
  (skip or flag them).
- Filter by batch, status, assigned user. Search by name/phone.
- Bulk actions: assign to a caller, delete, and "Convert to Lead".
- Per-row action "Convert to Lead" moves the record into the Leads page 
  with status "New" and keeps the history.
- Show a small stats bar: Total records, Fresh, Called, Converted.

GENERAL
- Prevent duplicate phone numbers across Leads and Data (warn the user).
- Phone number validation for Indian numbers (10 digits, optional +91).
- Responsive layout, loading skeletons, empty states with helpful messages, 
  and toast notifications for actions.
- Seed the app with realistic sample data (about 30 leads, 50 data records) 
  so I can see how it looks.
- Store everything in Supabase with proper tables: profiles, leads, 
  lead_activities, data_records, data_batches.

DESIGN & UI (Modern Classic Aesthetic)
- Colors:
  - Background: warm off-white (#FAF8F5). Cards and tables: pure white with a subtle 1px border (#E8E4DD).
  - Primary: deep navy (#1B2A41) for sidebar, headings and primary buttons.
  - Accent: muted gold/brass (#B8925A) for highlights, active nav item, and key actions.
  - Text: charcoal (#2B2B2B) for body, warm grey (#7A756C) for secondary text.
  - Status badges use soft pastel backgrounds with darker text (green for Booked, blue for New, amber for Follow-up/Negotiation, red for Lost, grey for Not Interested).
  - Support a dark mode toggle using the same palette in deep navy tones.
- Typography:
  - Headings: a classic serif such as "Playfair Display" or "Cormorant Garamond", used for page titles and numbers in stat cards.
  - Body/UI/tables: "Inter" for clarity and readability.
  - Comfortable sizing: 14px table text, generous line height, clear hierarchy.
- Layout & Components:
  - Fixed navy sidebar (240px) with a small logo at the top, nav items with line icons (lucide), and a gold left-border indicator on the active item. Collapsible on mobile.
  - Top bar: white, thin bottom border, global search with rounded corners.
  - Tables: airy rows (52px), subtle hover highlight, sticky header, no heavy gridlines, only thin horizontal dividers.
  - Buttons: 8px rounded corners; primary is navy with white text, secondary is outlined; gold is used sparingly for the main call to action.
  - Drawers slide in from the right with a soft shadow and smooth 200ms transitions.
  - Cards with 12px radius and very soft shadows (no harsh drop shadows).
  - Small touches: avatar circles with initials, tooltips on icon buttons, and a thin gold underline on active tabs.
- Feel:
  - Elegant, calm and uncluttered, with lots of whitespace. Avoid neon colors, heavy gradients and glassmorphism. Subtle micro-interactions only (hover, focus rings in gold, smooth drawers).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0d2a0a11-80f7-45e3-af9a-4e39b0811b69).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
