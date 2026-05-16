import React, { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import api from "../lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export default function NotificationsBell() {
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.get("/notifications");
            setItems(r.data);
        } catch (err) {
            console.error("notifications load failed:", err);
        }
    }, []);

    useEffect(() => {
        load();
        const timer = setInterval(load, 20000);
        return () => clearInterval(timer);
    }, [load]);

    const unread = items.filter((x) => !x.read).length;

    const markRead = async (id) => {
        try {
            await api.post(`/notifications/${id}/read`);
            load();
        } catch (err) {
            console.error("mark read failed:", err);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    data-testid="notifications-bell"
                    className="relative w-9 h-9 flex items-center justify-center border border-zinc-800 hover:bg-zinc-900"
                >
                    <Bell size={16} />
                    {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-mono font-bold bg-amber-400 text-[#451a03] flex items-center justify-center">
                            {unread}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 p-0 bg-[#121214] border-zinc-800 rounded-none">
                <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
                    <span className="font-heading font-bold">Notifications</span>
                    <span className="label-tag">{unread} unread</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {items.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">All clear.</div>}
                    {items.map((n) => (
                        <button
                            key={n.id}
                            onClick={() => markRead(n.id)}
                            data-testid={`notification-${n.id}`}
                            className={`w-full text-left px-4 py-3 border-b border-zinc-900 hover:bg-zinc-900/60 ${!n.read ? "bg-amber-400/[0.03]" : ""}`}
                        >
                            <div className="flex items-start gap-2">
                                {!n.read && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-2 shrink-0" />}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium">{n.title}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.body}</div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
