"use client";

import { useState } from "react";
import { Button, Empty, ErrorBox, Loading, PageHeader, Pill, Stat } from "@/components/ui";
import { check, date, supabase, type Subscriber } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";

const fetchSubscribers = async () => (check(await supabase.rpc("admin_subscribers")) as Subscriber[] | null) ?? [];

type Kind = "paying" | "trial" | "expired";
type Filter = "all" | Kind;

function kindOf(s: Subscriber): Kind {
  if (s.status === "active" || s.status === "past_due") return "paying";
  if (s.status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at) > new Date()) return "trial";
  return "expired";
}

function describe(s: Subscriber) {
  const kind = kindOf(s);
  if (kind === "paying") {
    if (s.status === "past_due") return { pill: <Pill color="red">Payment failed</Pill>, detail: `Period ends ${date(s.current_period_end)}` };
    return {
      pill: <Pill color="green">Paying</Pill>,
      detail: `${s.cancel_at_period_end ? "Cancels" : "Renews"} ${date(s.current_period_end)}`,
    };
  }
  if (kind === "trial") return { pill: <Pill color="blue">Free trial</Pill>, detail: `Trial ends ${date(s.trial_ends_at)}` };
  return { pill: <Pill color="gray">{s.status === "canceled" ? "Canceled" : "Trial expired"}</Pill>, detail: "" };
}

export default function SubscribersPage() {
  const { data: subs, error, reload } = useLoad(fetchSubscribers);
  const [filter, setFilter] = useState<Filter>("paying");
  const [query, setQuery] = useState("");

  if (error) return <ErrorBox message={error} />;
  if (!subs) return <Loading />;

  const count = (k: Kind) => subs.filter((s) => kindOf(s) === k).length;
  const q = query.trim().toLowerCase();
  const shown = subs.filter(
    (s) => (filter === "all" || kindOf(s) === filter) && (!q || (s.email ?? "").toLowerCase().includes(q)),
  );

  const filters: { key: Filter; label: string }[] = [
    { key: "paying", label: `Paying (${count("paying")})` },
    { key: "trial", label: `Free trial (${count("trial")})` },
    { key: "expired", label: `Expired (${count("expired")})` },
    { key: "all", label: `All (${subs.length})` },
  ];

  return (
    <>
      <PageHeader title="Subscribers" action={<Button variant="ghost" onClick={reload}>Refresh</Button>} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Accounts" value={subs.length} />
        <Stat label="Paying" value={count("paying")} />
        <Stat label="On free trial" value={count("trial")} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              filter === f.key ? "bg-brand text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          placeholder="Search email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm sm:w-64"
        />
      </div>

      {shown.length === 0 ? (
        <Empty>Nobody here yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/5 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Details</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s, i) => {
                const { pill, detail } = describe(s);
                return (
                  <tr key={i} className="border-b border-neutral-50 last:border-0">
                    <td className="break-all px-4 py-3">{s.email ?? "(no email)"}</td>
                    <td className="px-4 py-3">{pill}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{detail}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{date(s.signed_up_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
