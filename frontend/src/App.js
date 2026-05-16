import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import EmployeeDashboard from "@/pages/EmployeeDashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import AnalyticsView from "@/pages/AnalyticsView";

function Protected({ roles, children }) {
    const { user, loading } = useAuth();
    const loc = useLocation();
    if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>;
    if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;
    if (roles && !roles.includes(user.role)) return <Navigate to={`/${user.role}`} replace />;
    return <AppShell>{children}</AppShell>;
}

function RootRedirect() {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={`/${user.role}`} replace />;
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/employee/*" element={<Protected roles={["employee"]}><EmployeeDashboard /></Protected>} />
                    <Route path="/manager/*" element={<Protected roles={["manager"]}><ManagerDashboard /></Protected>} />
                    <Route path="/manager/analytics" element={<Protected roles={["manager"]}><AnalyticsView /></Protected>} />
                    <Route path="/admin/*" element={<Protected roles={["admin"]}><AdminDashboard /></Protected>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <Toaster theme="dark" position="top-right" toastOptions={{
                    style: { background: "#121214", border: "1px solid #27272a", color: "#fafafa", borderRadius: 0, fontFamily: "Satoshi" },
                }} />
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
