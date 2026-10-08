"use client";
import { useEffect, useState, useId } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  LoaderCircle,
} from "lucide-react";
export const money = (n: number) =>
  `Rs. ${Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
export const day = (s: string | Date) =>
  new Date(s).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
export const date = (s: string) =>
  new Date(s).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function useDebounced<T>(value: T, delay = 250) {
  const [v, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return v;
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="icon-button"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function Pagination({
  page,
  total,
  size,
  onChange,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`
          : "No results"}
      </span>
      <div>
        <button
          className="secondary"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={15} />
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          className="secondary"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal advanced-dialog ${wide ? "wide-dialog" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="section-loading">
      <LoaderCircle size={25} />
      <span>Loading your data…</span>
    </div>
  );
}
export function RevenueChart({
  points,
}: {
  points: { date: string; revenue: number }[];
}) {
  const id = useId();
  const max = Math.max(1, ...points.map((p) => p.revenue));
  const width = 680,
    height = 165;
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${(i * width) / Math.max(1, points.length - 1)} ${height - (p.revenue / max) * (height - 20)}`,
    )
    .join(" ");
  return (
    <div className="revenue-chart">
      <div className="chart-scale">
        <span>{money(max)}</span>
        <span>{money(max / 2)}</span>
        <span>Rs. 0</span>
      </div>
      <div className="chart-svg">
        <svg
          viewBox={`-3 -8 ${width + 6} ${height + 16}`}
          role="img"
          aria-label="Revenue trend. Detailed totals are shown in the report table."
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4277ed" stopOpacity=".2" />
              <stop offset="100%" stopColor="#4277ed" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((v) => (
            <line
              key={v}
              x1="0"
              x2={width}
              y1={height * v}
              y2={height * v}
              stroke="#e9edf5"
              strokeDasharray="4 5"
            />
          ))}
          <path
            d={`${path} L ${width} ${height} L 0 ${height} Z`}
            fill={`url(#${id})`}
          />
          <path
            d={path}
            fill="none"
            stroke="#4a79e8"
            strokeWidth="3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={(i * width) / Math.max(1, points.length - 1)}
              cy={height - (p.revenue / max) * (height - 20)}
              r="3"
              fill="#4a79e8"
            >
              <title>
                {p.date}: {money(p.revenue)}
              </title>
            </circle>
          ))}
        </svg>
        <div className="chart-dates">
          {points
            .filter(
              (_, i) =>
                i === 0 ||
                i === Math.floor(points.length / 2) ||
                i === points.length - 1,
            )
            .map((p) => (
              <span key={p.date}>
                {new Date(`${p.date}T12:00:00`).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function downloadFrom(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const json = await response.json();
    throw new Error(json.error || "Download failed");
  }
  downloadBlob(await response.blob(), name);
}
