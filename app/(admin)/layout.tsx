"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { isAdmin, supabase } from "@/lib/supabase";

const nav = [
  { href: "/orders", label: "Orders" },
  { href: "/subscribers", label: "Users & subscriptions" },
  { href: "/products", label: "Shop items" },
  { href: "/crystals", label: "Crystals" },
  { href: "/dataset", label: "Dataset" },
  { href: "/training", label: "Training" },
  { href: "/test", label: "Test model" },
];

export default function AdminLayout({ children }: LayoutProps<"/">) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"checking" | "ok">("checking");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || !(await isAdmin())) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? "");
      setState("ok");
    })();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (state === "checking") return <Loading />;

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-black/5 bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="px-5 py-4 text-lg font-semibold text-brand-dark">Crystal Genie</div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "bg-brand-soft text-brand-dark" : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <button onClick={signOut} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-neutral-500 md:hidden">
            Sign out
          </button>
        </nav>
        <div className="hidden px-5 py-6 text-xs text-neutral-500 md:block">
          <div className="truncate">{email}</div>
          <button onClick={signOut} className="mt-2 font-medium text-brand-dark hover:underline">
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
