import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Bell, LogOut, Target, Users, Sliders, Activity, FileText, Bot, Bug, ChevronRight, Send } from "lucide-react";
import { Button } from "./ui/button";
import NotificationsBell from "./NotificationsBell";

const NAV = {
    employee: [
        { to: "/employee", label: "My Goals", icon: Target },
        { to: "/employee/checkins", label: "Check-ins", icon: Activity },
    ],
    manager: [
        { to: "/manager", label: "Team Goals", icon: Users },
        { to: "/manager/approvals", label: "Approvals", icon: Send },
        { to: "/manager/checkins", label: "Check-ins", icon: Activity },
        { to: "/manager/analytics", label: "Analytics", icon: Bot },
    ],
    admin: [
        { to: "/admin", label: "Overview", icon: Target },
        { to: "/admin/users", label: "Users", icon: Users },
        { to: "/admin/cycles", label: "Cycles", icon: Sliders },
        { to: "/admin/audit", label: "Audit Trail", icon: FileText },
        { to: "/admin/escalation", label: "Escalation", icon: Bug },
        { to: "/admin/analytics", label: "Analytics", icon: Bot },
    ],
};

export default function AppShell({ children }) {
    const { user, logout } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    if (!user) return children;
    const links = NAV[user.role] || [];

    return (
        <div className="min-h-screen flex" data-testid="app-shell">
            {/* Sidebar */}
            <aside className="w-64 border-r border-zinc-900 bg-[#0a0a0c] flex flex-col">
                <div className="px-5 py-5 border-b border-zinc-900">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-amber-400 flex items-center justify-center">
                            <span className="font-heading font-extrabold text-[#451a03] text-lg">A</span>
                        </div>
                        <div>
                            <div className="font-heading font-extrabold tracking-tight">ATOMQUEST</div>
                            <div className="label-tag mt-0.5">Goal Portal</div>
                        </div>
                    </div>
                </div>
                <nav className="flex-1 py-4 px-2">
                    {links.map((l) => {
                        const Icon = l.icon;
                        const active = loc.pathname === l.to || (l.to !== `/${user.role}` && loc.pathname.startsWith(l.to));
                        return (
                            <Link
                                key={l.to}
                                to={l.to}
                                data-testid={`nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                                className={`flex items-center gap-3 px-3 py-2 mb-1 text-sm transition-colors ${
                                    active ? "bg-zinc-900 text-white border-l-2 border-amber-400" : "text-zinc-400 hover:text-white hover:bg-zinc-900/60"
                                }`}
                            >
                                <Icon size={16} />
                                <span>{l.label}</span>
                                {active && <ChevronRight size={14} className="ml-auto text-amber-400" />}
                            </Link>
                        );
                    })}
                </nav>
                <div className="p-3 border-t border-zinc-900">
                    <div className="flex items-center gap-2 px-2 py-2">
                        <div className="w-8 h-8 bg-zinc-800 flex items-center justify-center font-heading font-bold text-sm">
                            {user.name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{user.name}</div>
                            <div className="label-tag truncate">{user.role}</div>
                        </div>
                        <Button
                            data-testid="logout-button"
                            variant="ghost"
                            size="icon"
                            onClick={async () => { await logout(); nav("/login"); }}
                            className="text-zinc-400 hover:text-white"
                        >
                            <LogOut size={16} />
                        </Button>
                    </div>
                </div>
            </aside>
            {/* Main */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-14 border-b border-zinc-900 px-6 flex items-center justify-between bg-[#0a0a0c]/80 backdrop-blur-xl">
                    <div className="label-tag">
                        {user.role} dashboard · {user.department || ""}
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationsBell />
                    </div>
                </header>
                <main className="flex-1 p-6 lg:p-8 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
}
