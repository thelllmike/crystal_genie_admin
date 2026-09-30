# Crystal Genie Admin

Web admin panel for the Crystal Genie app: orders (with shipping addresses),
subscribers, shop items and the crystal library. It talks straight to the same
Supabase project as the mobile app.

## One-time setup

In the Supabase SQL editor run, in order:

1. `sql/admin_setup.sql` – creates the admin role and makes your account an admin
2. `sql/admin_dashboard.sql` – lets admins edit crystals and read all orders/subscribers

Only accounts listed in `admin_users` can sign in; everyone else is rejected,
and the database refuses their requests anyway.

## Run locally

```sh
npm install
npm run dev        # http://localhost:3000
```

Supabase settings live in `.env.local` (copy from `.env.example`).

## Deploy

Any Next.js host works (e.g. Vercel: import the repo, set the root directory
to `admin_web`, and add the two `NEXT_PUBLIC_SUPABASE_*` env vars).
