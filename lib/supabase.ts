import { createClient } from "@supabase/supabase-js";

// Browser-side client. Everything this panel can read or change is decided by
// the database (RLS policies + is_admin() checks in backend/admin_dashboard.sql),
// so a non-admin who logs in here simply gets nothing.
//
// Defaults are the app's own project (the anon key is public, same as in the
// Flutter app) so a host like Vercel builds even with no env vars set.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ifrzpnhqjeczhrposdmw.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmcnpwbmhxamVjemhycG9zZG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDczNzMsImV4cCI6MjA5MDE4MzM3M30.D7f2mET_XMiIt6IgttH8D-mQVP6Z8Iy3eR2SuTcrZv8",
);

export type Crystal = {
  name: string;
  headline: string | null;
  description: string | null;
  star_sign: string | null;
  chakras: string | null;
  image_url?: string | null; // missing until sql/crystal_images.sql is run
};

export type Product = {
  id: number;
  name: string;
  headline: string | null;
  price: number;
  image_url: string | null;
  stock: number;
};

export type OrderItem = { name: string; quantity: number; unit_price: number };

export type Order = {
  id: number;
  created_at: string;
  total: number;
  status: string;
  email: string | null;
  ship_name: string;
  ship_phone: string;
  ship_address: string;
  ship_city: string;
  ship_postal: string;
  items: OrderItem[];
};

export type Subscriber = {
  email: string | null;
  signed_up_at: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  // From sql/users_details.sql; missing until it's run.
  name?: string | null;
  last_sign_in_at?: string | null;
  scans?: number;
  orders?: number;
  spent?: number;
};

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

/** Throws a readable Error for a Supabase { error } result. */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const money = (n: number) => `$${Number(n).toFixed(2)}`;

export const date = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export const dateTime = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
