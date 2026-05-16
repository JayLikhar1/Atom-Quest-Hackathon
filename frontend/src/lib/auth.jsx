import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { setToken, getToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchMe = useCallback(async () => {
        if (!getToken()) {
            setLoading(false);
            return;
        }
        try {
            const r = await api.get("/auth/me");
            setUser(r.data);
        } catch (err) {
            if (err?.response?.status !== 401) {
                console.error("auth/me failed:", err);
            }
            setToken(null);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMe();
    }, [fetchMe]);

    const login = useCallback(async (email, password) => {
        const r = await api.post("/auth/login", { email, password });
        // Persist token as cookie-fallback for browsers that block cross-site cookies.
        if (r.data?.token) setToken(r.data.token);
        setUser(r.data.user);
        return r.data.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post("/auth/logout");
        } catch (err) {
            console.error("logout failed:", err);
        }
        setToken(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
