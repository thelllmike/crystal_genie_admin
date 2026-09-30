"use client";

import { useState } from "react";
import { Button, Empty, ErrorBox, Loading, PageHeader, Pill, Stat } from "@/components/ui";
import { check, date, money, supabase, type Subscriber } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";

const fetchSubscribers = async () => (check(await supabase.rpc("admin_subscribers")) as Subscriber[] | null) ?? [];

type Kind = "paying" | "trial" | "expired";
type Filter = "all" | Kind;
const DAY = 24 * 60 * 60 * 1000;

function kindOf(s: Subscriber, now: number): Kind {
  if (s.status === "active" || s.status === "past_due") return "paying";
  if (s.status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now) return "trial";
  return "expired";
}

function describe(s: Subscriber, now: number) {
  const kind = kindOf(s, now);
  if (kind === "paying") {
    if (s.status === "past_due")
      return { pill: <Pill color="red">Payment failed</Pill>, label: "Payment failed", detail: `Period ends ${date(s.current_period_end)}` };
    return {
      pill: <Pill color="green">Subscribed</Pill>,
      label: "Subscribed",
      detail: s.cancel_at_period_end ? `Cancels ${date(s.current_period_end)}` : `Renews ${date(s.current_period_end)}`,
    };
  }
  if (kind === "trial") {
    const days = Math.max(0, Math.ceil((new Date(s.trial_ends_at!).getTime() - now) / DAY));
    return {
      pill: <Pill color="blue">Free trial</Pill>,
      label: "Free trial",
      detail: `${days} day${days === 1 ? "" : "s"} left · ends ${date(s.trial_ends_at)}`,
    };
  }
  if (s.status === "canceled") return { pill: <Pill color="gray">Canceled</Pill>, label: "Canceled", detail: "" };
  return { pill: <Pill color="amber">Trial ended</Pill>, label: "Trial ended", detail: s.trial_ends_at ? `Ended ${date(s.trial_ends_at)}` : "" };
}

function downloadCsv(rows: Subscriber[], now: number) {
  const cells = [
    ["Name", "Email", "Status", "Details", "Joined", "Last active", "Scans", "Orders", "Spent"],
    ...rows.map((s) => {
      const d = describe(s, now);
      return [s.name ?? "", s.email ?? "", d.label, d.detail, date(s.signed_up_at), date(s.last_sign_in_at ?? null), s.scans ?? "", s.orders ?? "", s.spent ?? ""];
    }),
  ];
  const csv = cells.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `crystal-genie-users-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SubscribersPage() {
  const { data: subs, error, reload } = useLoad(fetchSubscribers);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [now] = useState(() => Date.now());

  if (error) return <ErrorBox message={error} />;
  if (!subs) return <Loading />;

  const count = (k: Kind) => subs.filter((s) => kindOf(s, now) === k).length;
  const hasDetails = subs.some((s) => s.scans !== undefined);
  const q = query.trim().toLowerCase();
  const shown = subs.filter(
    (s) =>
      (filter === "all" || kindOf(s, now) === filter) &&
      (!q || `${s.email ?? ""} ${s.name ?? ""}`.toLowerCase().includes(q)),
  );

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All users (${subs.length})` },
    { key: "trial", label: `Free trial (${count("trial")})` },
    { key: "paying", label: `Subscribed (${count("paying")})` },
    { key: "expired", label: `Trial ended / canceled (${count("expired")})` },
  ];

  return (
    <>
      <PageHeader
        title="Users & subscriptions"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => downloadCsv(shown, now)} disabled={!shown.length}>
              Export CSV
            </Button>
            <Button variant="ghost" onClick={reload}>
              Refresh
            </Button>
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="All users" value={subs.length} />
        <Stat label="On free trial" value={count("trial")} />
        <Stat label="Subscribed" value={count("paying")} />
        <Stat label="Trial ended / canceled" value={count("expired")} />
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
          placeholder="Search name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm sm:ml-auto sm:w-64"
        />
      </div>

      {!hasDetails && subs.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Run <code>sql/users_details.sql</code> in the Supabase SQL editor to also see names, last active, scans and orders.
        </p>
      )}

      {shown.length === 0 ? (
        <Empty>No users here.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/5 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Details</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                {hasDetails && (
                  <>
                    <th className="px-4 py-3 font-semibold">Last active</th>
                    <th className="px-4 py-3 text-right font-semibold">Scans</th>
                    <th className="px-4 py-3 text-right font-semibold">Orders</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((s, i) => {
                const { pill, detail } = describe(s, now);
                return (
                  <tr key={s.email ?? i} className="border-b border-neutral-50 last:border-0">
                    <td className="px-4 py-3">
                      {s.name && <div className="font-medium">{s.name}</div>}
                      <div className={`break-all ${s.name ? "text-neutral-500" : ""}`}>{s.email ?? "(no email)"}</div>
                    </td>
                    <td className="px-4 py-3">{pill}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{detail}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{date(s.signed_up_at)}</td>
                    {hasDetails && (
                      <>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{date(s.last_sign_in_at ?? null)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{s.scans ?? 0}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {s.orders ? `${s.orders} · ${money(s.spent ?? 0)}` : "—"}
                        </td>
                      </>
                    )}
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
