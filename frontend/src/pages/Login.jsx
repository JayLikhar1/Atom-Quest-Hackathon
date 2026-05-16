import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatErr } from "../lib/api";

const DEMO_ACCOUNTS = [
    {
        role: "Admin",
        email: process.env.REACT_APP_DEMO_ADMIN_EMAIL || "",
        password: process.env.REACT_APP_DEMO_ADMIN_PASSWORD || "",
    },
    {
        role: "Manager",
        email: process.env.REACT_APP_DEMO_MANAGER_EMAIL || "",
        password: process.env.REACT_APP_DEMO_MANAGER_PASSWORD || "",
    },
    {
        role: "Employee",
        email: process.env.REACT_APP_DEMO_EMPLOYEE_EMAIL || "",
        password: process.env.REACT_APP_DEMO_EMPLOYEE_PASSWORD || "",
    },
].filter((a) => a.email && a.password);

export default function Login() {
    const { login } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    const doLogin = async (creds) => {
        if (!creds.email || !creds.password) {
            toast.error("Email and password are required");
            return;
        }
        setBusy(true);
        try {
            const user = await login(creds.email, creds.password);
            toast.success(`Welcome, ${user.name}`);
            nav(`/${user.role}`);
        } catch (err) {
            console.error("login failed:", err);
            const msg = formatErr(err.response?.data?.detail) ||
                err.message ||
                "Login failed — please check your credentials";
            toast.error(msg);
        } finally {
            setBusy(false);
        }
    };

    const submit = async (e) => {
        e?.preventDefault();
        await doLogin({ email, password });
    };

    const quickSignIn = async (acc) => {
        setEmail(acc.email);
        setPassword(acc.password);
        await doLogin(acc);
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-[#09090b]" data-testid="login-page">
            <div className="hidden lg:flex relative overflow-hidden border-r border-zinc-900">
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-50"
                    style={{
                        backgroundImage:
                            "url('https://static.prod-images.emergentagent.com/jobs/4a7c524d-ef31-4e20-a341-89debbd68151/images/bf47680f34680b71ac444695cf0c006bf95590f9f011fe9e8450aedf35f226b4.png')",
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[#09090b] via-[#09090b]/80 to-transparent" />
                <div className="relative z-10 flex flex-col justify-between p-12 w-full">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-400 flex items-center justify-center">
                            <span className="font-heading font-extrabold text-[#451a03] text-xl">A</span>
                        </div>
                        <div>
                            <div className="font-heading font-extrabold text-lg tracking-tight">ATOMQUEST</div>
                            <div className="label-tag mt-0.5">Goal Setting & Tracking</div>
                        </div>
                    </div>
                    <div>
                        <h1 className="font-heading text-5xl xl:text-6xl font-extrabold leading-[0.95] tracking-tight">
                            Align every<br />
                            objective.<br />
                            <span className="text-amber-400">Audit</span> every<br />
                            outcome.
                        </h1>
                        <p className="text-zinc-400 mt-6 max-w-md text-base leading-relaxed">
                            Replace fragmented spreadsheets with a structured goal lifecycle —
                            from creation and alignment to quarterly check-ins and audit-ready reporting.
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-6 max-w-md">
                        <Stat label="Phases" value="2" />
                        <Stat label="Roles" value="3" />
                        <Stat label="Cycles" value="Q1–Q4" />
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-center p-6 lg:p-12 relative">
                <div className="absolute inset-0 bg-grid bg-grid-fade opacity-50" />
                <div className="w-full max-w-md relative">
                    <h2 className="font-heading text-3xl font-extrabold tracking-tight">Sign in</h2>
                    <p className="text-zinc-400 text-sm mt-1">Use your work email or pick a demo account below.</p>
                    <form onSubmit={submit} className="mt-8 space-y-4">
                        <div>
                            <Label htmlFor="email" className="label-tag">Email</Label>
                            <Input id="email" data-testid="login-email" type="email" value={email}
                                onChange={(e) => setEmail(e.target.value)} placeholder="you@atomquest.io"
                                className="mt-2 rounded-none bg-zinc-950 border-zinc-800 focus-visible:ring-amber-400/40 focus-visible:border-amber-400/50"
                                required />
                        </div>
                        <div>
                            <Label htmlFor="password" className="label-tag">Password</Label>
                            <Input id="password" data-testid="login-password" type="password" value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-2 rounded-none bg-zinc-950 border-zinc-800 focus-visible:ring-amber-400/40 focus-visible:border-amber-400/50"
                                required />
                        </div>
                        <Button type="submit" data-testid="login-submit" disabled={busy}
                            className="w-full rounded-none btn-primary font-heading font-bold tracking-wide uppercase text-xs h-11">
                            {busy ? "Signing in…" : "Sign in →"}
                        </Button>
                    </form>

                    {DEMO_ACCOUNTS.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-zinc-900">
                            <div className="label-tag mb-3">Quick demo access</div>
                            <div className="grid gap-2">
                                {DEMO_ACCOUNTS.map((a) => (
                                    <button key={a.role} type="button"
                                        data-testid={`demo-${a.role.toLowerCase()}`}
                                        disabled={busy}
                                        onClick={() => quickSignIn(a)}
                                        className="flex items-center justify-between px-3 py-2 border border-zinc-900 hover:border-amber-400/40 hover:bg-zinc-900/60 transition-colors text-left disabled:opacity-50">
                                        <div>
                                            <div className="text-sm font-medium">{a.role}</div>
                                            <div className="text-xs text-zinc-500 font-mono">{a.email}</div>
                                        </div>
                                        <span className="label-tag">sign in →</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="border-l-2 border-amber-400 pl-3">
            <div className="font-mono font-bold text-2xl">{value}</div>
            <div className="label-tag mt-0.5">{label}</div>
        </div>
    );
}
