export const THRUST_AREAS = [
    "Revenue Growth",
    "Customer Excellence",
    "Operational Efficiency",
    "Talent Development",
    "Innovation",
    "Safety & Compliance",
];

export const UOM_OPTIONS = [
    { value: "numeric_min", label: "Numeric — Higher is better" },
    { value: "numeric_max", label: "Numeric — Lower is better" },
    { value: "percent_min", label: "Percent — Higher is better" },
    { value: "percent_max", label: "Percent — Lower is better" },
    { value: "timeline", label: "Timeline (date-based)" },
    { value: "zero", label: "Zero-based (0 = success)" },
];

export const PERIOD_LABELS = {
    goal_setting: "Goal Setting",
    q1: "Q1 Check-in",
    q2: "Q2 Check-in",
    q3: "Q3 Check-in",
    q4_annual: "Q4 / Annual",
};

export const STATUS_LABELS = {
    draft: "Draft",
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    locked: "Locked",
};

export const PROGRESS_LABELS = {
    not_started: "Not Started",
    on_track: "On Track",
    completed: "Completed",
};

export function statusColor(s) {
    return ({
        draft: "bg-zinc-800 text-zinc-300 border-zinc-700",
        submitted: "bg-blue-500/10 text-blue-400 border-blue-500/30",
        approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        locked: "bg-amber-400/10 text-amber-400 border-amber-400/30",
        rejected: "bg-red-500/10 text-red-400 border-red-500/30",
        not_started: "bg-zinc-800 text-zinc-300 border-zinc-700",
        on_track: "bg-amber-400/10 text-amber-400 border-amber-400/30",
        completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    })[s] || "bg-zinc-800 text-zinc-300";
}
