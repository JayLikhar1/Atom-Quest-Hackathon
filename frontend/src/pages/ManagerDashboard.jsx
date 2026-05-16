import React, { useCallback, useEffect, useState } from "react";
import api, { formatErr } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Check, X, MessageSquare, Download, Share2 } from "lucide-react";
import { StatusBadge, ProgressBar, Stat, SectionTitle } from "../components/Atoms";

export default function ManagerDashboard() {
    const [users, setUsers] = useState([]);
    const [goals, setGoals] = useState([]);
    const [checkins, setCheckins] = useState([]);
    const [cycles, setCycles] = useState([]);

    const load = useCallback(async () => {
        try {
            const [u, g, c, cy] = await Promise.all([
                api.get("/users"),
                api.get("/goals"),
                api.get("/checkins"),
                api.get("/cycles"),
            ]);
            setUsers(u.data);
            setGoals(g.data);
            setCheckins(c.data);
            setCycles(cy.data);
        } catch (err) {
            console.error("manager load failed:", err);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const reports = users.filter(u => u.role === "employee");
    const pendingApprovals = goals.filter(g => g.status === "submitted");
    const approvedCount = goals.filter(g => g.status === "approved" || g.status === "locked").length;
    const openCycle = cycles.find(c => ["q1", "q2", "q3", "q4_annual"].includes(c.period) && c.is_open);

    const exportCsv = async () => {
        try {
            const url = `${process.env.REACT_APP_BACKEND_URL}/api/reports/achievement.csv`;
            const token = localStorage.getItem("atomquest_token");
            const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const blob = await r.blob();
            const dl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = dl; a.download = "achievement_report.csv"; a.click();
            URL.revokeObjectURL(dl);
        } catch (err) {
            console.error("csv export failed:", err);
            toast.error("Export failed");
        }
    };

    return (
        <div className="space-y-8" data-testid="manager-dashboard">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-heading text-4xl font-extrabold tracking-tight">Team Goals</h1>
                    <p className="text-sm text-zinc-500 mt-1">Review approvals, log feedback, and track team progress.</p>
                </div>
                <Button onClick={exportCsv} data-testid="export-csv-button" className="rounded-none btn-primary font-heading uppercase text-xs tracking-wide">
                    <Download size={14} className="mr-2" /> Export CSV
                </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Direct Reports" value={reports.length} />
                <Stat label="Pending Approvals" value={pendingApprovals.length} accent />
                <Stat label="Approved Goals" value={approvedCount} />
                <Stat label="Open Cycle" value={openCycle?.period?.toUpperCase() || "—"} mono={false} />
            </div>

            <Tabs defaultValue="approvals">
                <TabsList className="rounded-none bg-zinc-950 border border-zinc-900 h-auto p-0">
                    <TabsTrigger data-testid="tab-approvals" value="approvals" className="rounded-none px-5 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-amber-400 font-heading uppercase text-xs">Approvals</TabsTrigger>
                    <TabsTrigger data-testid="tab-team" value="team" className="rounded-none px-5 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-amber-400 font-heading uppercase text-xs">Team Goals</TabsTrigger>
                    <TabsTrigger data-testid="tab-checkins" value="checkins" className="rounded-none px-5 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-amber-400 font-heading uppercase text-xs">Check-ins</TabsTrigger>
                    <TabsTrigger data-testid="tab-share" value="share" className="rounded-none px-5 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-amber-400 font-heading uppercase text-xs">Shared Goals</TabsTrigger>
                </TabsList>

                <TabsContent value="approvals" className="mt-6">
                    <ApprovalQueue goals={pendingApprovals} users={users} reload={load} />
                </TabsContent>
                <TabsContent value="team" className="mt-6">
                    <TeamGoals goals={goals} users={reports} />
                </TabsContent>
                <TabsContent value="checkins" className="mt-6">
                    <ManagerCheckins reports={reports} goals={goals} checkins={checkins} reload={load} openCycle={openCycle} />
                </TabsContent>
                <TabsContent value="share" className="mt-6">
                    <ShareGoals myGoals={goals.filter(g => !g.is_shared)} reports={reports} reload={load} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function ApprovalQueue({ goals, users, reload }) {
    const [editingId, setEditingId] = useState(null);
    const [editVals, setEditVals] = useState({});
    const [rejectId, setRejectId] = useState(null);
    const [rejectComment, setRejectComment] = useState("");

    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const startEdit = (g) => {
        setEditingId(g.id);
        setEditVals({ weightage: g.weightage, target: g.target });
    };
    const saveEdit = async (id) => {
        try {
            await api.patch(`/goals/${id}`, editVals);
            setEditingId(null);
            reload();
            toast.success("Updated");
        } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    };
    const approve = async (id) => {
        await api.post(`/goals/${id}/approve`);
        toast.success("Approved");
        reload();
    };
    const submitReject = async () => {
        await api.post(`/goals/${rejectId}/reject`, { comment: rejectComment });
        setRejectId(null);
        setRejectComment("");
        toast.success("Returned for rework");
        reload();
    };

    if (goals.length === 0) return <div className="border border-dashed border-zinc-800 p-10 text-center text-zinc-500">No pending approvals.</div>;

    // Group by owner
    const grouped = goals.reduce((acc, g) => {
        (acc[g.owner_id] = acc[g.owner_id] || []).push(g);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {Object.entries(grouped).map(([uid, list]) => {
                const total = list.reduce((s, g) => s + g.weightage, 0);
                const u = userMap[uid];
                return (
                    <div key={uid} className="border border-zinc-900" data-testid={`approval-group-${uid}`}>
                        <div className="px-4 py-3 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between">
                            <div>
                                <div className="font-heading font-bold">{u?.name || uid}</div>
                                <div className="label-tag mt-0.5">{u?.department} · {list.length} goals · total {total}%</div>
                            </div>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-900">
                                    <th className="px-4 py-2 text-left label-tag">Goal</th>
                                    <th className="px-4 py-2 text-right label-tag">Target</th>
                                    <th className="px-4 py-2 text-right label-tag">Weight</th>
                                    <th className="px-4 py-2 text-right label-tag">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(g => (
                                    <tr key={g.id} className="border-b border-zinc-900">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{g.title}</div>
                                            <div className="label-tag">{g.thrust_area} · {g.uom}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {editingId === g.id ? (
                                                <Input value={editVals.target} onChange={(e) => setEditVals({ ...editVals, target: e.target.value })} className="h-7 w-24 inline-block font-mono rounded-none bg-zinc-950 border-zinc-800 text-right" />
                                            ) : g.target}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-bold">
                                            {editingId === g.id ? (
                                                <Input type="number" value={editVals.weightage} onChange={(e) => setEditVals({ ...editVals, weightage: Number(e.target.value) })} className="h-7 w-16 inline-block font-mono rounded-none bg-zinc-950 border-zinc-800 text-right" />
                                            ) : `${g.weightage}%`}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex gap-1 justify-end">
                                                {editingId === g.id ? (
                                                    <>
                                                        <Button size="sm" onClick={() => saveEdit(g.id)} className="h-7 rounded-none btn-primary text-[10px] uppercase">Save</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 rounded-none text-[10px]">Cancel</Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button size="sm" variant="outline" data-testid={`edit-${g.id}`} onClick={() => startEdit(g)} className="h-7 rounded-none border-zinc-800 text-[10px] uppercase">Edit</Button>
                                                        <Button size="sm" data-testid={`approve-${g.id}`} onClick={() => approve(g.id)} className="h-7 rounded-none bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] uppercase">
                                                            <Check size={12} className="mr-1" /> Approve
                                                        </Button>
                                                        <Button size="sm" variant="ghost" data-testid={`reject-${g.id}`} onClick={() => setRejectId(g.id)} className="h-7 rounded-none text-red-400 hover:text-red-300 text-[10px] uppercase">
                                                            <X size={12} className="mr-1" /> Return
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })}

            <Dialog open={!!rejectId} onOpenChange={(v) => !v && setRejectId(null)}>
                <DialogContent className="bg-[#0a0a0c] border-zinc-800 rounded-none">
                    <DialogHeader><DialogTitle className="font-heading">Return for Rework</DialogTitle></DialogHeader>
                    <Textarea data-testid="reject-comment" rows={3} value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder="Reason for rework…" className="rounded-none bg-zinc-950 border-zinc-800" />
                    <DialogFooter>
                        <Button variant="outline" className="rounded-none border-zinc-800" onClick={() => setRejectId(null)}>Cancel</Button>
                        <Button data-testid="reject-confirm" onClick={submitReject} className="rounded-none bg-red-500/20 text-red-400 hover:bg-red-500/30">Return</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function TeamGoals({ goals, users }) {
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    return (
        <div className="border border-zinc-900">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-950">
                        <th className="px-4 py-3 text-left label-tag">Employee</th>
                        <th className="px-4 py-3 text-left label-tag">Goal</th>
                        <th className="px-4 py-3 text-right label-tag">Weight</th>
                        <th className="px-4 py-3 text-left label-tag">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {goals.map(g => (
                        <tr key={g.id} className="border-b border-zinc-900">
                            <td className="px-4 py-2">{userMap[g.owner_id]?.name || "—"}</td>
                            <td className="px-4 py-2">
                                <div>{g.title}</div>
                                <div className="label-tag">{g.thrust_area}</div>
                            </td>
                            <td className="px-4 py-2 text-right font-mono">{g.weightage}%</td>
                            <td className="px-4 py-2"><StatusBadge status={g.status} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ManagerCheckins({ reports, goals, checkins, reload, openCycle }) {
    const [commentDialog, setCommentDialog] = useState(null);
    const [comment, setComment] = useState("");

    const saveComment = async () => {
        await api.post("/checkins/manager-comment", {
            goal_id: commentDialog.goal_id,
            period: commentDialog.period,
            comment,
        });
        toast.success("Comment saved");
        setCommentDialog(null);
        setComment("");
        reload();
    };

    return (
        <div className="space-y-6">
            {!openCycle && <div className="border border-zinc-800 px-4 py-3 text-sm text-zinc-400 font-mono">No check-in window open.</div>}
            {reports.map(r => {
                const myGoals = goals.filter(g => g.owner_id === r.id && (g.status === "approved" || g.status === "locked"));
                if (myGoals.length === 0) return null;
                return (
                    <div key={r.id} className="border border-zinc-900" data-testid={`checkin-team-${r.id}`}>
                        <div className="px-4 py-3 border-b border-zinc-900 bg-zinc-950">
                            <div className="font-heading font-bold">{r.name}</div>
                            <div className="label-tag">{r.department}</div>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-900">
                                    <th className="px-4 py-2 text-left label-tag">Goal</th>
                                    <th className="px-4 py-2 text-right label-tag">Target</th>
                                    {openCycle && <th className="px-4 py-2 text-right label-tag">{openCycle.period.toUpperCase()} Actual</th>}
                                    {openCycle && <th className="px-4 py-2 text-right label-tag">Progress</th>}
                                    {openCycle && <th className="px-4 py-2 label-tag">Status</th>}
                                    <th className="px-4 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {myGoals.map(g => {
                                    const ck = openCycle ? checkins.find(c => c.goal_id === g.id && c.period === openCycle.period) : null;
                                    return (
                                        <tr key={g.id} className="border-b border-zinc-900">
                                            <td className="px-4 py-2">
                                                <div>{g.title}</div>
                                                <div className="label-tag">{g.thrust_area}</div>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">{g.target}</td>
                                            {openCycle && <td className="px-4 py-2 text-right font-mono">{ck?.actual || "—"}</td>}
                                            {openCycle && (
                                                <td className="px-4 py-2 text-right font-mono font-bold w-32">
                                                    <div className="text-amber-400">{ck ? `${ck.progress.toFixed(0)}%` : "—"}</div>
                                                    <ProgressBar value={ck?.progress || 0} color={ck?.status === "completed" ? "emerald" : "amber"} />
                                                </td>
                                            )}
                                            {openCycle && <td className="px-4 py-2">{ck ? <StatusBadge status={ck.status} type="progress" /> : <span className="text-zinc-600 text-xs">—</span>}</td>}
                                            <td className="px-4 py-2 text-right">
                                                {openCycle && ck && (
                                                    <Button size="sm" variant="outline" data-testid={`comment-${g.id}`} onClick={() => { setCommentDialog({ goal_id: g.id, period: openCycle.period, goal_title: g.title }); setComment(ck.manager_comment || ""); }} className="h-7 rounded-none border-zinc-800 text-[10px] uppercase">
                                                        <MessageSquare size={12} className="mr-1" /> {ck.manager_comment ? "Edit" : "Comment"}
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })}

            <Dialog open={!!commentDialog} onOpenChange={(v) => !v && setCommentDialog(null)}>
                <DialogContent className="bg-[#0a0a0c] border-zinc-800 rounded-none">
                    <DialogHeader><DialogTitle className="font-heading">Check-in Feedback · {commentDialog?.goal_title}</DialogTitle></DialogHeader>
                    <Textarea data-testid="manager-comment-input" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Document the discussion…" className="rounded-none bg-zinc-950 border-zinc-800" />
                    <DialogFooter>
                        <Button variant="outline" className="rounded-none border-zinc-800" onClick={() => setCommentDialog(null)}>Cancel</Button>
                        <Button data-testid="manager-comment-save" onClick={saveComment} className="rounded-none btn-primary">Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ShareGoals({ myGoals, reports, reload }) {
    const [selected, setSelected] = useState(null);
    const [targets, setTargets] = useState([]);
    const [weight, setWeight] = useState(10);

    const toggle = (id) => setTargets(targets.includes(id) ? targets.filter(x => x !== id) : [...targets, id]);

    const share = async () => {
        if (!selected || targets.length === 0) { toast.error("Select goal and targets"); return; }
        await api.post("/goals/share", { source_goal_id: selected, target_user_ids: targets, default_weightage: weight });
        toast.success("Goal shared with team");
        setTargets([]);
        setSelected(null);
        reload();
    };

    return (
        <div className="grid lg:grid-cols-2 gap-6">
            <div className="border border-zinc-900 p-4">
                <SectionTitle sub="Select one of your goals to push to teammates.">Source Goal</SectionTitle>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {myGoals.length === 0 && <div className="text-sm text-zinc-500">You have no goals yet.</div>}
                    {myGoals.map(g => (
                        <button key={g.id} data-testid={`source-goal-${g.id}`} onClick={() => setSelected(g.id)} className={`w-full text-left px-3 py-2 border ${selected === g.id ? "border-amber-400 bg-amber-400/5" : "border-zinc-900 hover:border-zinc-700"}`}>
                            <div className="font-medium text-sm">{g.title}</div>
                            <div className="label-tag">{g.thrust_area} · {g.target}</div>
                        </button>
                    ))}
                </div>
            </div>
            <div className="border border-zinc-900 p-4">
                <SectionTitle sub="Recipients can edit only weightage.">Targets</SectionTitle>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                    {reports.map(r => (
                        <label key={r.id} className="flex items-center gap-3 px-3 py-2 border border-zinc-900 hover:bg-zinc-900/40 cursor-pointer">
                            <input data-testid={`target-${r.id}`} type="checkbox" checked={targets.includes(r.id)} onChange={() => toggle(r.id)} className="accent-amber-400" />
                            <div>
                                <div className="text-sm">{r.name}</div>
                                <div className="label-tag">{r.department}</div>
                            </div>
                        </label>
                    ))}
                </div>
                <div className="mt-4 flex items-end gap-3">
                    <div>
                        <label className="label-tag">Default Weight %</label>
                        <Input type="number" min={10} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="font-mono mt-1 w-24 rounded-none bg-zinc-950 border-zinc-800" />
                    </div>
                    <Button onClick={share} data-testid="share-button" className="rounded-none btn-accent font-heading uppercase text-xs">
                        <Share2 size={14} className="mr-2" /> Push to {targets.length} member{targets.length === 1 ? "" : "s"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
