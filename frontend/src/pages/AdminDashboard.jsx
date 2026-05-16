import React, { useCallback, useEffect, useState } from "react";
import api, { formatErr } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { PERIOD_LABELS } from "../lib/constants";
import { Stat, SectionTitle, StatusBadge } from "../components/Atoms";
import { Plus, Play, Trash2, Unlock } from "lucide-react";
import AnalyticsView from "./AnalyticsView";

export default function AdminDashboard({ initialTab = "overview" }) {
    const [tab, setTab] = useState(initialTab);
    const [users, setUsers] = useState([]);
    const [cycles, setCycles] = useState([]);
    const [goals, setGoals] = useState([]);
    const [completion, setCompletion] = useState([]);
    const [audit, setAudit] = useState([]);
    const [rules, setRules] = useState([]);
    const [escLog, setEscLog] = useState([]);

    const load = async () => {
        const reqs = [
            api.get("/users"),
            api.get("/cycles"),
            api.get("/goals"),
            api.get("/reports/completion"),
            api.get("/audit"),
            api.get("/escalation/rules"),
            api.get("/escalation/log"),
        ];
        const [u, cy, g, co, au, r, el] = await Promise.all(reqs);
        setUsers(u.data); setCycles(cy.data); setGoals(g.data);
        setCompletion(co.data); setAudit(au.data);
        setRules(r.data); setEscLog(el.data);
    };
    useEffect(() => { load(); }, []);

    return (
        <div className="space-y-8" data-testid="admin-dashboard">
            <div>
                <h1 className="font-heading text-4xl font-extrabold tracking-tight">Admin Control</h1>
                <p className="text-sm text-zinc-500 mt-1">Configure cycles, users, escalation, and audit oversight.</p>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="rounded-none bg-zinc-950 border border-zinc-900 h-auto p-0">
                    {["overview", "users", "cycles", "audit", "escalation", "analytics"].map(t => (
                        <TabsTrigger key={t} data-testid={`tab-${t}`} value={t} className="rounded-none px-5 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-amber-400 font-heading uppercase text-xs">
                            {t}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="overview" className="mt-6">
                    <Overview users={users} goals={goals} completion={completion} cycles={cycles} />
                </TabsContent>
                <TabsContent value="users" className="mt-6">
                    <UsersAdmin users={users} reload={load} />
                </TabsContent>
                <TabsContent value="cycles" className="mt-6">
                    <CyclesAdmin cycles={cycles} reload={load} />
                </TabsContent>
                <TabsContent value="audit" className="mt-6">
                    <AuditTrail logs={audit} />
                </TabsContent>
                <TabsContent value="escalation" className="mt-6">
                    <EscalationAdmin rules={rules} log={escLog} reload={load} />
                </TabsContent>
                <TabsContent value="analytics" className="mt-6">
                    <AnalyticsView />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function Overview({ users, goals, completion, cycles }) {
    const employees = users.filter(u => u.role === "employee").length;
    const managers = users.filter(u => u.role === "manager").length;
    const approved = goals.filter(g => g.status === "approved" || g.status === "locked").length;
    const pending = goals.filter(g => g.status === "submitted").length;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <Stat label="Employees" value={employees} accent />
                <Stat label="Managers" value={managers} />
                <Stat label="Approved Goals" value={approved} />
                <Stat label="Pending Approvals" value={pending} />
                <Stat label="Open Cycles" value={cycles.filter(c => c.is_open).length} />
            </div>
            <div className="border border-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-900 bg-zinc-950"><span className="font-heading font-bold">Completion · check-ins by quarter</span></div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zinc-900">
                            <th className="px-4 py-2 text-left label-tag">Employee</th>
                            <th className="px-4 py-2 text-left label-tag">Period</th>
                            <th className="px-4 py-2 text-right label-tag">Goals</th>
                            <th className="px-4 py-2 text-right label-tag">Checked-in</th>
                            <th className="px-4 py-2 text-right label-tag">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {completion.filter(r => r.total_goals > 0).map((r) => (
                            <tr key={`${r.employee_id}-${r.period}`} className="border-b border-zinc-900">
                                <td className="px-4 py-2">{r.employee_name}</td>
                                <td className="px-4 py-2 font-mono text-xs">{r.period}</td>
                                <td className="px-4 py-2 text-right font-mono">{r.total_goals}</td>
                                <td className="px-4 py-2 text-right font-mono">{r.checked_in}</td>
                                <td className="px-4 py-2 text-right font-mono font-bold text-amber-400">{r.pct}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function UsersAdmin({ users, reload }) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        email: "", name: "", role: "employee", manager_id: "", department: "General",
        password: process.env.REACT_APP_DEFAULT_USER_PASSWORD || "",
    });
    const managers = users.filter(u => u.role === "manager");

    const save = async () => {
        try {
            const payload = { ...form };
            if (!payload.manager_id) payload.manager_id = null;
            await api.post("/users", payload);
            toast.success("User created");
            setShowForm(false);
            reload();
        } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <SectionTitle sub="View and add team members.">Org Members</SectionTitle>
                <Button data-testid="add-user" onClick={() => setShowForm(true)} className="rounded-none btn-primary font-heading uppercase text-xs">
                    <Plus size={14} className="mr-2" /> Add user
                </Button>
            </div>
            <div className="border border-zinc-900">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zinc-900 bg-zinc-950">
                            <th className="px-4 py-2 text-left label-tag">Name</th>
                            <th className="px-4 py-2 text-left label-tag">Email</th>
                            <th className="px-4 py-2 text-left label-tag">Role</th>
                            <th className="px-4 py-2 text-left label-tag">Department</th>
                            <th className="px-4 py-2 text-left label-tag">Reports To</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} className="border-b border-zinc-900">
                                <td className="px-4 py-2">{u.name}</td>
                                <td className="px-4 py-2 font-mono text-xs text-zinc-400">{u.email}</td>
                                <td className="px-4 py-2"><StatusBadge status={u.role === "admin" ? "locked" : u.role === "manager" ? "approved" : "draft"} /> </td>
                                <td className="px-4 py-2">{u.department}</td>
                                <td className="px-4 py-2 text-zinc-500">{users.find(x => x.id === u.manager_id)?.name || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="bg-[#0a0a0c] border-zinc-800 rounded-none">
                    <DialogHeader><DialogTitle className="font-heading">Add User</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div><Label className="label-tag">Name</Label><Input data-testid="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none mt-1 bg-zinc-950 border-zinc-800" /></div>
                        <div><Label className="label-tag">Email</Label><Input data-testid="user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-none mt-1 bg-zinc-950 border-zinc-800" /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="label-tag">Role</Label>
                                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                                    <SelectTrigger data-testid="user-role" className="rounded-none mt-1 bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-[#121214] border-zinc-800 rounded-none">
                                        <SelectItem value="employee">Employee</SelectItem>
                                        <SelectItem value="manager">Manager</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="label-tag">Department</Label>
                                <Input data-testid="user-dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="rounded-none mt-1 bg-zinc-950 border-zinc-800" />
                            </div>
                        </div>
                        {form.role === "employee" && (
                            <div>
                                <Label className="label-tag">Reports To</Label>
                                <Select value={form.manager_id} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                                    <SelectTrigger data-testid="user-manager" className="rounded-none mt-1 bg-zinc-950 border-zinc-800"><SelectValue placeholder="Pick manager" /></SelectTrigger>
                                    <SelectContent className="bg-[#121214] border-zinc-800 rounded-none">
                                        {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div><Label className="label-tag">Initial Password</Label><Input data-testid="user-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="font-mono rounded-none mt-1 bg-zinc-950 border-zinc-800" /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-none border-zinc-800" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button data-testid="user-save" onClick={save} className="rounded-none btn-primary">Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function CyclesAdmin({ cycles, reload }) {
    const toggle = async (period, is_open) => {
        await api.patch(`/cycles/${period}`, { period, is_open });
        toast.success(`${period} ${is_open ? "opened" : "closed"}`);
        reload();
    };
    return (
        <div className="grid lg:grid-cols-5 gap-4">
            {["goal_setting", "q1", "q2", "q3", "q4_annual"].map(p => {
                const c = cycles.find(x => x.period === p);
                const isOpen = c?.is_open || false;
                return (
                    <div key={p} className={`border p-5 ${isOpen ? "border-amber-400/40 bg-amber-400/5" : "border-zinc-900"}`}>
                        <div className="label-tag">{PERIOD_LABELS[p]}</div>
                        <div className="font-heading font-extrabold text-2xl mt-2">{isOpen ? "OPEN" : "CLOSED"}</div>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Active window</span>
                            <Switch data-testid={`cycle-toggle-${p}`} checked={isOpen} onCheckedChange={(v) => toggle(p, v)} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function AuditTrail({ logs }) {
    return (
        <div>
            <SectionTitle sub="Full change history. Filterable by entity in API.">Audit Trail</SectionTitle>
            <div className="border-l-2 border-zinc-800 ml-3 pl-6 space-y-4">
                {logs.length === 0 && <div className="text-zinc-500 text-sm">No audit entries yet.</div>}
                {logs.map(l => (
                    <div key={l.id} className="relative" data-testid={`audit-${l.id}`}>
                        <div className="absolute -left-[33px] top-1 w-3 h-3 bg-amber-400 border-2 border-[#09090b]" />
                        <div className="flex items-baseline gap-3">
                            <span className="font-mono text-xs text-zinc-500">{new Date(l.timestamp).toLocaleString()}</span>
                            <span className="font-heading font-bold text-sm">{l.action}</span>
                            <span className="text-xs text-zinc-400">by {l.actor_name} ({l.actor_role})</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 font-mono">{l.entity}:{l.entity_id?.slice(0, 8)} {l.note && `· ${l.note}`}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EscalationAdmin({ rules, log, reload }) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: "", condition: "goals_not_submitted", days_threshold: 3, notify_employee: true, notify_manager: true, notify_admin: false, enabled: true });

    const save = async () => {
        await api.post("/escalation/rules", form);
        toast.success("Rule added");
        setShowForm(false);
        reload();
    };
    const remove = async (id) => {
        await api.delete(`/escalation/rules/${id}`);
        reload();
    };
    const run = async () => {
        const r = await api.post("/escalation/run");
        toast.success(`Escalation evaluated. ${r.data.fired} alerts fired.`);
        reload();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <SectionTitle sub="Rule-based reminders. Run on-demand or manually.">Escalation Rules</SectionTitle>
                <div className="flex gap-2">
                    <Button data-testid="run-escalation" onClick={run} className="rounded-none btn-accent font-heading uppercase text-xs"><Play size={14} className="mr-2" /> Run now</Button>
                    <Button data-testid="add-rule" onClick={() => setShowForm(true)} className="rounded-none btn-primary font-heading uppercase text-xs"><Plus size={14} className="mr-2" /> Add rule</Button>
                </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
                {rules.map(r => (
                    <div key={r.id} className="border border-zinc-900 p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="font-heading font-bold">{r.name}</div>
                                <div className="label-tag mt-1">{r.condition} · {r.days_threshold} days</div>
                            </div>
                            <Button size="icon" variant="ghost" data-testid={`del-rule-${r.id}`} onClick={() => remove(r.id)} className="h-7 w-7 text-red-400"><Trash2 size={14} /></Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3 text-xs">
                            {r.notify_employee && <span className="px-2 py-0.5 bg-zinc-900 font-mono">→ employee</span>}
                            {r.notify_manager && <span className="px-2 py-0.5 bg-zinc-900 font-mono">→ manager</span>}
                            {r.notify_admin && <span className="px-2 py-0.5 bg-zinc-900 font-mono">→ admin</span>}
                            <span className={`px-2 py-0.5 font-mono ${r.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-900 text-zinc-500"}`}>{r.enabled ? "ENABLED" : "OFF"}</span>
                        </div>
                    </div>
                ))}
            </div>

            <SectionTitle sub="Recent escalation events.">Escalation Log</SectionTitle>
            <div className="border border-zinc-900">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-zinc-900 bg-zinc-950">
                            <th className="px-4 py-2 text-left label-tag">When</th>
                            <th className="px-4 py-2 text-left label-tag">Rule</th>
                            <th className="px-4 py-2 text-left label-tag">Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {log.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-zinc-500">No escalations yet.</td></tr>}
                        {log.map(l => (
                            <tr key={l.id} className="border-b border-zinc-900">
                                <td className="px-4 py-2 font-mono text-xs">{new Date(l.created_at).toLocaleString()}</td>
                                <td className="px-4 py-2">{l.rule}</td>
                                <td className="px-4 py-2 text-zinc-400">{l.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="bg-[#0a0a0c] border-zinc-800 rounded-none">
                    <DialogHeader><DialogTitle className="font-heading">Add Escalation Rule</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div><Label className="label-tag">Rule Name</Label><Input data-testid="rule-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none mt-1 bg-zinc-950 border-zinc-800" /></div>
                        <div>
                            <Label className="label-tag">Condition</Label>
                            <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                                <SelectTrigger data-testid="rule-condition" className="rounded-none mt-1 bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-[#121214] border-zinc-800 rounded-none">
                                    <SelectItem value="goals_not_submitted">Goals not submitted</SelectItem>
                                    <SelectItem value="approval_pending">Approval pending</SelectItem>
                                    <SelectItem value="checkin_pending">Check-in pending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div><Label className="label-tag">Days Threshold</Label><Input data-testid="rule-days" type="number" value={form.days_threshold} onChange={(e) => setForm({ ...form, days_threshold: Number(e.target.value) })} className="font-mono rounded-none mt-1 bg-zinc-950 border-zinc-800" /></div>
                        <div className="flex gap-4 pt-2">
                            <label className="flex items-center gap-2 text-sm"><Switch checked={form.notify_employee} onCheckedChange={(v) => setForm({ ...form, notify_employee: v })} /> Employee</label>
                            <label className="flex items-center gap-2 text-sm"><Switch checked={form.notify_manager} onCheckedChange={(v) => setForm({ ...form, notify_manager: v })} /> Manager</label>
                            <label className="flex items-center gap-2 text-sm"><Switch checked={form.notify_admin} onCheckedChange={(v) => setForm({ ...form, notify_admin: v })} /> Admin</label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-none border-zinc-800" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button data-testid="rule-save" onClick={save} className="rounded-none btn-primary">Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
