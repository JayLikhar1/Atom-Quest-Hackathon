import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "atomquest_token";

export function setToken(t) {
    if (t) {
        try { localStorage.setItem(TOKEN_KEY, t); } catch (_) {}
    } else {
        try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    }
}
export function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
}

// JWT Bearer-token authentication. No cookies (works inside any iframe/embed).
const api = axios.create({ baseURL: API, withCredentials: false });
api.interceptors.request.use((cfg) => {
    const t = getToken();
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
});

export default api;

export function formatErr(detail) {
    if (!detail) return "Something went wrong";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
    if (detail?.msg) return detail.msg;
    return String(detail);
}
