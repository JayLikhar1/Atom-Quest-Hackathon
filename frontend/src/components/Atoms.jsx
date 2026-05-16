import React from "react";
import { Badge } from "./ui/badge";
import { statusColor, STATUS_LABELS, PROGRESS_LABELS } from "../lib/constants";

export function StatusBadge({ status, type = "goal" }) {
    const labels = type === "progress" ? PROGRESS_LABELS : STATUS_LABELS;
    return (
        <Badge
            data-testid={`badge-${status}`}
            variant="outline"
            className={`rounded-none uppercase text-[10px] tracking-widest font-mono font-bold border ${statusColor(status)}`}
        >
            {labels[status] || status}
        </Badge>
    );
}

export function ProgressBar({ value, color = "amber" }) {
    const v = Math.max(0, Math.min(100, value || 0));
    const colors = {
        amber: "bg-amber-400",
        emerald: "bg-emerald-400",
        red: "bg-red-400",
        zinc: "bg-zinc-500",
    };
    return (
        <div className="w-full h-[2px] bg-zinc-900">
            <div className={`h-full ${colors[color]} transition-all`} style={{ width: `${v}%` }} />
        </div>
    );
}

export function Stat({ label, value, mono = true, accent }) {
    return (
        <div className="border border-zinc-900 p-5 surface">
            <div className="label-tag">{label}</div>
            <div className={`mt-2 font-heading font-extrabold text-3xl ${accent ? "text-amber-400" : ""} ${mono ? "font-mono" : ""}`}>
                {value}
            </div>
        </div>
    );
}

export function SectionTitle({ children, sub }) {
    return (
        <div className="mb-5">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight">{children}</h2>
            {sub && <p className="text-sm text-zinc-500 mt-1">{sub}</p>}
        </div>
    );
}

export function EmptyState({ title, hint, action }) {
    return (
        <div className="border border-dashed border-zinc-800 p-10 text-center">
            <div className="font-heading text-lg font-bold">{title}</div>
            {hint && <div className="text-sm text-zinc-500 mt-1">{hint}</div>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
