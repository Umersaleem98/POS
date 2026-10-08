"use client";
import { useEffect, useState } from "react";
import { Search, X, ArrowUpRight } from "lucide-react";
import { useDebounced } from "./shared";
import type { WorkspaceData } from "@/lib/types";
import { can } from "@/lib/permissions";
type Result = {
  id: number;
  title: string;
  subtitle: string;
  destination: string;
};
export default function GlobalSearch({
  data,
  demo,
  onSelect,
}: {
  data: WorkspaceData;
  demo: boolean;
  onSelect: (result: Result) => void;
}) {
  const [q, setQ] = useState(""),
    [results, setResults] = useState<Result[]>([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const search = useDebounced(q);
  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (demo) {
      const items: Result[] = [
        ...data.products.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.sku,
          destination: "Products",
        })),
        ...data.customers.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: c.email,
          destination: "Customers",
        })),
        ...data.sales.map((s) => ({
          id: s.id,
          title: `Receipt #${s.id}`,
          subtitle: s.customer,
          destination: "Sales history",
        })),
        ...data.users.map((u) => ({
          id: u.id,
          title: u.name,
          subtitle: u.email,
          destination: "Team & access",
        })),
      ];
      setResults(
        items
          .filter((i) =>
            `${i.title} ${i.subtitle}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .slice(0, 12),
      );
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/search?${new URLSearchParams({ q: search, storeId: String(data.storeId) })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setResults(j.results);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, data, demo]);
  return (
    <div className="global-search">
      <div className="global-search-input">
        <Search size={17} />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search your workspace…"
          aria-label="Search your workspace"
        />
        {q ? (
          <button
            className="icon-button"
            aria-label="Clear workspace search"
            onClick={() => {
              setQ("");
              setOpen(false);
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <span>Search</span>
        )}
      </div>
      {open && q.length >= 2 && (
        <>
          <button
            className="search-dismiss"
            aria-label="Close search results"
            onClick={() => setOpen(false)}
          />
          <div
            className="global-search-results"
            role="region"
            aria-label="Workspace search results"
          >
            <div className="search-result-heading">
              {loading
                ? "Searching…"
                : `${results.length} results in your accessible modules`}
            </div>
            {error ? (
              <div className="empty">{error}</div>
            ) : (
              results.map((r) => (
                <button
                  key={`${r.destination}-${r.id}`}
                  onClick={() => {
                    onSelect(r);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span>
                    <strong>{r.title}</strong>
                    <small>{r.subtitle}</small>
                  </span>
                  <span>
                    {r.destination}
                    <ArrowUpRight size={13} />
                  </span>
                </button>
              ))
            )}
            {!loading && !results.length && !error && (
              <div className="empty">
                No matches. Try a name, SKU, receipt number or invoice.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
