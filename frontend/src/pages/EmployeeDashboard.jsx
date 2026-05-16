import React, { useCallback, useEffect, useState } from "react";
import api, { formatErr } from "../lib/api";
import { THRUST_AREAS, UOM_OPTIONS, statusColor, STATUS_LABELS } from "../lib/constants";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Send, Lock } from "lucide-react";
import { StatusBadge, ProgressBar, Stat, SectionTitle, EmptyState } from "../components/Atoms";
import { useAuth } from "../lib/auth";

export default function EmployeeDashboard() {
    const { user } = useAuth();
    const [goals, setGoals] = useState([]);
    const [checkins, setCheckins] = useState([]);
    const [cycles, setCycles] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);

    const load = useCallback(async () => {
        try {
            const [g, c, cy] = await Promise.all([
                api.get("/goals"),
                api.get("/checkins"),
                api.get("/cycles"),
            ]);
            setGoals(g.data);
            setCheckins(c.data);
            setCycles(cy.data);
        } catch (err) {
            console.error("employee load failed:", err);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const totalWeight = goals.filter(g => g.status !== "rejected").reduce((s, g) => s + g.weightage, 0);
    const draftCount = goals.filter(g => g.status === "draft").length;
    const approvedCount = goals.filter(g => g.status === "approved" || g.status === "locked").length;
    const goalSettingOpen = cycles.find(c => c.period === "goal_setting")?.is_open;

    const submitAll = async () => {
        try {
            const r = await api.post("/goals/submit");
            toast.success(`Submitted ${r.data.count} goals for approval`);
            load();
        } catch (e) {
            toast.error(formatErr(e.response?.data?.detail));
        }
    };

    const removeGoal = async (id) => {
        if (!window.confirm("Delete this draft goal?")) return;
        await api.delete(`/goals/${id}`);
        load();
    };

    return (
        <div className="space-y-8" data-testid="employee-dashboard">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-heading text-4xl font-extrabold tracking-tight">My Goals</h1>
                    <p className="text-sm text-zinc-500 mt-1">Draft, submit, and track your performance commitments.</p>
                </div>
                <div className="flex gap-2">
                    {goalSettingOpen && draftCount > 0 && (
                        <Button onClick={submitAll} data-testid="submit-all-button" className="rounded-none btn-accent font-heading uppercase tracking-wide text-xs">
                            <Send size={14} className="mr-2" /> Submit {draftCount} for approval
                        </Button>
                    )}
                    {goalSettingOpen && (
                        <Button onClick={() => { setEditing(null); setShowForm(true); }} data-testid="add-goal-button" className="rounded-none btn-primary font-heading uppercase tracking-wide text-xs">
                            <Plus size={14} className="mr-2" /> Add goal
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Active Goals" value={goals.length} accent />
                <Stat label="Total Weightage" value={`${totalWeight.toFixed(0)}%`} />
                <Stat label="Approved" value={approvedCount} />
                <Stat label="Drafts" value={draftCount} />
            </div>

            {!goalSettingOpen && (
                <div className="border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-300 font-mono" data-testid="cycle-closed-banner">
                    Goal-setting window is currently <b>CLOSED</b>. Contact admin to open it.
                </div>
            )}

            {totalWeight !== 100 && goalSettingOpen && (
                <div className={`border px-4 py-3 text-sm font-mono ${totalWeight > 100 ? "border-red-500/30 bg-red-500/5 text-red-300" : "border-zinc-800 bg-zinc-900/40 text-zinc-300"}`}>
                    Total weightage = <b>{totalWeight}%</b>. Must equal <b>100%</b> before submission.
                </div>
            )}

            {goals.length === 0 ? (
                <EmptyState
                    title="No goals yet"
                    hint="Create up to 8 goals. Each must weigh ≥10% and total 100%."
                    action={goalSettingOpen && (
                        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="rounded-none btn-primary">
                            <Plus size={14} className="mr-2" /> Create first goal
                        </Button>
                    )}
                />
            ) : (
                <div className="border border-zinc-900">
                    <table className="w-full text-sm" data-testid="goals-table">
                        <thead>
                            <tr className="text-left border-b border-zinc-900 bg-zinc-950">
                                <th className="px-4 py-3 label-tag">Thrust Area</th>
                                <th className="px-4 py-3 label-tag">Goal</th>
                                <th className="px-4 py-3 label-tag">UoM</th>
                                <th className="px-4 py-3 label-tag text-right">Target</th>
                                <th className="px-4 py-3 label-tag text-right">Weight</th>
                                <th className="px-4 py-3 label-tag">Status</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {goals.map((g) => (
                                <tr key={g.id} className="border-b border-zinc-900 hover:bg-zinc-900/40" data-testid={`goal-row-${g.id}`}>
                                    <td className="px-4 py-3 text-zinc-400">{g.thrust_area}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{g.title}</div>
                                        <div className="text-xs text-zinc-500 line-clamp-1">{g.description}</div>
                                        {g.is_shared && <span className="label-tag text-amber-400">★ Shared</span>}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{g.uom}</td>
                                    <td className="px-4 py-3 text-right font-mono">{g.target}</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold">{g.weightage}%</td>
                                    <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            {(g.status === "draft") && (
                                                <>
                                                    <Button size="icon" variant="ghost" data-testid={`edit-goal-${g.id}`} onClick={() => { setEditing(g); setShowForm(true); }} className="h-7 w-7 rounded-none">
                                                        <Edit size={14} />
                                                    </Button>
                                                    {!g.is_shared && (
                                                        <Button size="icon" variant="ghost" data-testid={`delete-goal-${g.id}`} onClick={() => removeGoal(g.id)} className="h-7 w-7 rounded-none text-red-400">
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                            {(g.status === "approved" || g.status === "locked") && (
                                                <Lock size={14} className="text-amber-400" />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CheckinsPanel goals={goals.filter(g => g.status === "approved" || g.status === "locked")} checkins={checkins} cycles={cycles} reload={load} />

            <GoalFormDialog open={showForm} onOpenChange={setShowForm} editing={editing} reload={load} />
        </div>
    );
}

function GoalFormDialog({ open, onOpenChange, editing, reload }) {
    const [form, setForm] = useState({
        thrust_area: THRUST_AREAS[0],
        title: "",
        description: "",
        uom: "numeric_min",
        target: "",
        weightage: 25,
        deadline: "",
    });
    useEffect(() => {
        if (editing) setForm({
            thrust_area: editing.thrust_area,
            title: editing.title,
            description: editing.description || "",
            uom: editing.uom,
            target: editing.target,
            weightage: editing.weightage,
            deadline: editing.deadline || "",
        });
        else setForm({ thrust_area: THRUST_AREAS[0], title: "", description: "", uom: "numeric_min", target: "", weightage: 25, deadline: "" });
    }, [editing, open]);

    const save = async () => {
        if (!form.title.trim() || !form.target.trim()) { toast.error("Title and target required"); return; }
        if (form.weightage < 10) { toast.error("Minimum weightage is 10%"); return; }
        try {
            if (editing) {
                await api.patch(`/goals/${editing.id}`, form);
                toast.success("Goal updated");
            } else {
                await api.post("/goals", form);
                toast.success("Goal added to draft");
            }
            onOpenChange(false);
            reload();
        } catch (e) {
            toast.error(formatErr(e.response?.data?.detail));
        }
    };

    const isShared = editing?.is_shared;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0c] border-zinc-800 rounded-none max-w-2xl" data-testid="goal-form-dialog">
                <DialogHeader>
                    <DialogTitle className="font-heading font-extrabold tracking-tight">{editing ? "Edit Goal" : "New Goal"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="label-tag">Thrust Area</Label>
                            <Select value={form.thrust_area} onValueChange={(v) => setForm({ ...form, thrust_area: v })} disabled={isShared}>
                                <SelectTrigger data-testid="goal-thrust-area" className="rounded-none mt-2 bg-zinc-950 border-zinc-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#121214] border-zinc-800 rounded-none">
                                    {THRUST_AREAS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="label-tag">UoM Type</Label>
                            <Select value={form.uom} onValueChange={(v) => setForm({ ...form, uom: v })} disabled={isShared}>
                                <SelectTrigger data-testid="goal-uom" className="rounded-none mt-2 bg-zinc-950 border-zinc-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#121214] border-zinc-800 rounded-none">
                                    {UOM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label className="label-tag">Goal Title</Label>
                        <Input data-testid="goal-title" value={form.title} disabled={isShared} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-none mt-2 bg-zinc-950 border-zinc-800" />
                    </div>
                    <div>
                        <Label className="label-tag">Description</Label>
                        <Textarea data-testid="goal-description" rows={2} value={form.description} disabled={isShared} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-none mt-2 bg-zinc-950 border-zinc-800" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label className="label-tag">Target</Label>
                            <Input data-testid="goal-target" value={form.target} disabled={isShared} onChange={(e) => setForm({ ...form, target: e.target.value })} className="font-mono rounded-none mt-2 bg-zinc-950 border-zinc-800" />
                        </div>
                        <div>
                            <Label className="label-tag">Weightage %</Label>
                            <Input data-testid="goal-weightage" type="number" min={10} max={100} value={form.weightage} onChange={(e) => setForm({ ...form, weightage: Number(e.target.value) })} className="font-mono rounded-none mt-2 bg-zinc-950 border-zinc-800" />
                        </div>
                        {form.uom === "timeline" && (
                            <div>
                                <Label className="label-tag">Deadline</Label>
                                <Input data-testid="goal-deadline" type="date" disabled={isShared} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="font-mono rounded-none mt-2 bg-zinc-950 border-zinc-800" />
                            </div>
                        )}
                    </div>
                    {isShared && <div className="text-xs text-amber-400 font-mono">★ Shared goal — only weightage is editable.</div>}
                </div>
                <DialogFooter>
                    <Button variant="outline" className="rounded-none border-zinc-800" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button data-testid="goal-save-button" onClick={save} className="rounded-none btn-primary font-heading uppercase text-xs tracking-wide">Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CheckinsPanel({ goals, checkins, cycles, reload }) {
    const openCycles = cycles.filter(c => ["q1", "q2", "q3", "q4_annual"].includes(c.period) && c.is_open);
    if (goals.length === 0) return null;

    return (
        <div className="space-y-4 mt-10">
            <SectionTitle sub="Log actual progress per active quarter.">Quarterly Check-ins</SectionTitle>
            {openCycles.length === 0 && (
                <div className="border border-zinc-800 px-4 py-3 text-sm text-zinc-400 font-mono">
                    No check-in window is open. Wait for admin to open Q1/Q2/Q3/Q4.
                </div>
            )}
            {openCycles.map(c => (
                <div key={c.period} className="border border-zinc-900">
                    <div className="px-4 py-3 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between">
                        <div>
                            <div className="font-heading font-bold uppercase tracking-wide text-sm">{c.period.replace("_", " ")}</div>
                            <div className="label-tag mt-0.5">Window open</div>
                        </div>
                    </div>
                    <table className="w-full text-sm" data-testid={`checkin-table-${c.period}`}>
                        <thead>
                            <tr className="border-b border-zinc-900">
                                <th className="px-4 py-2 text-left label-tag">Goal</th>
                                <th className="px-4 py-2 text-right label-tag">Target</th>
                                <th className="px-4 py-2 text-right label-tag">Actual</th>
                                <th className="px-4 py-2 text-right label-tag">Progress</th>
                                <th className="px-4 py-2 label-tag">Status</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {goals.map(g => {
                                const ck = checkins.find(x => x.goal_id === g.id && x.period === c.period);
                                return <CheckinRow key={g.id} goal={g} period={c.period} existing={ck} reload={reload} />;
                            })}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}

function CheckinRow({ goal, period, existing, reload }) {
    const [actual, setActual] = useState(existing?.actual || "");
    const [status, setStatus] = useState(existing?.status || "not_started");
    const [note, setNote] = useState(existing?.note || "");
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            await api.post("/checkins", { goal_id: goal.id, period, actual, status, note });
            toast.success("Check-in saved");
            reload();
        } catch (e) {
            toast.error(formatErr(e.response?.data?.detail));
        } finally { setBusy(false); }
    };

    return (
        <tr className="border-b border-zinc-900" data-testid={`checkin-row-${goal.id}-${period}`}>
            <td className="px-4 py-2 max-w-xs">
                <div className="font-medium truncate">{goal.title}</div>
                <div className="label-tag">{goal.thrust_area}</div>
            </td>
            <td className="px-4 py-2 text-right font-mono">{goal.target}</td>
            <td className="px-4 py-2 text-right">
                <Input value={actual} onChange={(e) => setActual(e.target.value)} data-testid={`checkin-actual-${goal.id}`} className="h-8 w-24 inline-block font-mono rounded-none bg-zinc-950 border-zinc-800 text-right" />
            </td>
            <td className="px-4 py-2 text-right font-mono font-bold w-28">
                <div className="text-amber-400">{existing ? `${existing.progress.toFixed(0)}%` : "—"}</div>
                <ProgressBar value={existing?.progress || 0} color={existing?.status === "completed" ? "emerald" : "amber"} />
            </td>
            <td className="px-4 py-2">
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger data-testid={`checkin-status-${goal.id}`} className="h-8 w-36 rounded-none bg-zinc-950 border-zinc-800 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#121214] border-zinc-800 rounded-none">
                        <SelectItem value="not_started">Not Started</SelectItem>
                        <SelectItem value="on_track">On Track</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                </Select>
            </td>
            <td className="px-4 py-2 text-right">
                <Button onClick={save} disabled={busy} data-testid={`checkin-save-${goal.id}`} size="sm" className="h-8 rounded-none btn-accent uppercase text-[10px] tracking-wide font-bold">
                    Save
                </Button>
            </td>
        </tr>
    );
}
