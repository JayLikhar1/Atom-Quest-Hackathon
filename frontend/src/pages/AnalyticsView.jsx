import React, { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { SectionTitle, Stat } from "../components/Atoms";
import { PERIOD_LABELS } from "../lib/constants";

const TOOLTIP_STYLE = { background: "#09090b", border: "1px solid #27272a", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 };
const PIE_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];

export default function AnalyticsView() {
    const [data, setData] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const r = await api.get("/analytics/summary");
            setData(r.data);
        } catch (err) {
            console.error("analytics load failed:", err);
        }
    }, []);
    useEffect(() => { fetchData(); }, [fetchData]);
    if (!data) return <div className="text-zinc-500">Loading analytics…</div>;

    const qoq = Object.entries(data.qoq).map(([k, v]) => ({ period: PERIOD_LABELS[k] || k, value: v }));
    const thrust = Object.entries(data.thrust_distribution).map(([k, v]) => ({ name: k, value: v }));
    const status = Object.entries(data.status_distribution).map(([k, v]) => ({ name: k, value: v }));
    const uom = Object.entries(data.uom_distribution).map(([k, v]) => ({ name: k, value: v }));

    return (
        <div className="space-y-8" data-testid="analytics-view">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Total Goals" value={data.totals.goals} accent />
                <Stat label="Approved Goals" value={data.totals.approved_goals} />
                <Stat label="Check-ins" value={data.totals.checkins} />
                <Stat label="Active Users" value={data.totals.users} />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="border border-zinc-900 p-5">
                    <SectionTitle sub="Average % achievement per quarter.">QoQ Achievement Trend</SectionTitle>
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={qoq}>
                            <CartesianGrid stroke="#1f1f23" strokeDasharray="2 2" />
                            <XAxis dataKey="period" tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                            <YAxis tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="linear" dataKey="value" stroke="#fbbf24" strokeWidth={2} dot={{ fill: "#fbbf24", r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="border border-zinc-900 p-5">
                    <SectionTitle sub="Goals by thrust area.">Goal Distribution</SectionTitle>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie data={thrust} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                                {thrust.map((entry, i) => <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="border border-zinc-900 p-5">
                    <SectionTitle sub="Check-in status distribution.">Status Mix</SectionTitle>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={status}>
                            <CartesianGrid stroke="#1f1f23" strokeDasharray="2 2" />
                            <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                            <YAxis tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="value" fill="#34d399" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="border border-zinc-900 p-5">
                    <SectionTitle sub="UoM distribution.">UoM Mix</SectionTitle>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={uom}>
                            <CartesianGrid stroke="#1f1f23" strokeDasharray="2 2" />
                            <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                            <YAxis tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="value" fill="#60a5fa" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="border border-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-900 bg-zinc-950"><span className="font-heading font-bold">Manager Effectiveness</span><span className="label-tag ml-3">check-in comment coverage</span></div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zinc-900">
                            <th className="px-4 py-2 text-left label-tag">Manager</th>
                            <th className="px-4 py-2 text-right label-tag">Reports</th>
                            <th className="px-4 py-2 text-right label-tag">Check-ins</th>
                            <th className="px-4 py-2 text-right label-tag">Comments</th>
                            <th className="px-4 py-2 text-right label-tag">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.manager_effectiveness.map((m) => (
                            <tr key={`mgr-${m.manager}`} className="border-b border-zinc-900">
                                <td className="px-4 py-2">{m.manager}</td>
                                <td className="px-4 py-2 text-right font-mono">{m.reports}</td>
                                <td className="px-4 py-2 text-right font-mono">{m.checkins_total}</td>
                                <td className="px-4 py-2 text-right font-mono">{m.comments_given}</td>
                                <td className="px-4 py-2 text-right font-mono font-bold text-amber-400">{m.pct}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="border border-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-900 bg-zinc-950"><span className="font-heading font-bold">Achievement Heatmap</span></div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zinc-900">
                            <th className="px-4 py-2 text-left label-tag">Employee</th>
                            {["q1", "q2", "q3", "q4_annual"].map(p => <th key={p} className="px-4 py-2 text-right label-tag">{p.toUpperCase()}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.heatmap.map((r) => (
                            <tr key={r.employee_id || r.employee} className="border-b border-zinc-900">
                                <td className="px-4 py-2">{r.employee}</td>
                                {["q1", "q2", "q3", "q4_annual"].map(p => {
                                    const v = r[p];
                                    const bg = v >= 90 ? "bg-emerald-500/30" : v >= 60 ? "bg-amber-400/30" : v > 0 ? "bg-red-500/20" : "bg-zinc-900/60";
                                    return <td key={p} className={`px-4 py-2 text-right font-mono font-bold ${bg}`}>{v.toFixed(0)}%</td>;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
