"use client";

import { useState } from "react";
import { Button, Empty, ErrorBox, Loading, PageHeader, Pill, Stat } from "@/components/ui";
import { check, dateTime, money, supabase, type Order } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";

const fetchOrders = async () => (check(await supabase.rpc("admin_orders")) as Order[] | null) ?? [];

type Filter = "all" | "pending" | "shipped";

function addressOf(o: Order) {
  return [o.ship_name, o.ship_address, [o.ship_city, o.ship_postal].filter(Boolean).join(" "), o.ship_phone]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n");
}

export default function OrdersPage() {
  const { data: orders, error, reload, setData: setOrders } = useLoad(fetchOrders);
  const [filter, setFilter] = useState<Filter>("pending");
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function setStatus(o: Order, status: string) {
    try {
      check(await supabase.from("orders").update({ status }).eq("id", o.id));
      setOrders((prev) => prev?.map((x) => (x.id === o.id ? { ...x, status } : x)) ?? null);
    } catch (e) {
      alert(`Could not update order: ${(e as Error).message}`);
    }
  }

  async function copy(o: Order) {
    await navigator.clipboard.writeText(addressOf(o));
    setCopied(o.id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (error) return <ErrorBox message={error} />;
  if (!orders) return <Loading />;

  const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const toShip = orders.filter((o) => o.status === "pending").length;
  const shown = orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <>
      <PageHeader title="Orders" action={<Button variant="ghost" onClick={reload}>Refresh</Button>} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total orders" value={orders.length} />
        <Stat label="Waiting to ship" value={toShip} />
        <Stat label="Revenue" value={money(revenue)} />
      </div>

      <div className="mb-4 flex gap-2">
        {(["pending", "shipped", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${
              filter === f ? "bg-brand text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            {f === "pending" ? "To ship" : f}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty>No orders here.</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((o) => {
            const expanded = open === o.id;
            const shipped = o.status === "shipped";
            const address = addressOf(o);
            return (
              <div key={o.id} className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm">
                <button
                  onClick={() => setOpen(expanded ? null : o.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-neutral-50"
                >
                  <span className="font-semibold">#{o.id}</span>
                  <Pill color={shipped ? "green" : "amber"}>{shipped ? "Shipped" : "To ship"}</Pill>
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-600">
                    {o.ship_name || o.email} · {dateTime(o.created_at)}
                  </span>
                  <span className="font-semibold text-brand-dark">{money(o.total)}</span>
                </button>

                {expanded && (
                  <div className="grid gap-6 border-t border-neutral-100 px-4 py-4 sm:grid-cols-3">
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Items</h3>
                      <ul className="space-y-1 text-sm">
                        {o.items.map((i, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span>
                              {i.quantity} × {i.name}
                            </span>
                            <span className="text-neutral-500">{money(i.unit_price * i.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer</h3>
                      <p className="break-all text-sm">
                        {o.email ? <a className="text-brand-dark hover:underline" href={`mailto:${o.email}`}>{o.email}</a> : "(no email)"}
                      </p>
                    </section>
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Ship to</h3>
                      <p className="whitespace-pre-line text-sm">{address || "(no address given)"}</p>
                    </section>
                    <div className="flex flex-wrap gap-2 sm:col-span-3">
                      <Button variant="ghost" disabled={!address} onClick={() => copy(o)}>
                        {copied === o.id ? "Copied!" : "Copy address"}
                      </Button>
                      <Button onClick={() => setStatus(o, shipped ? "pending" : "shipped")}>
                        {shipped ? "Mark as not shipped" : "Mark as shipped"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
