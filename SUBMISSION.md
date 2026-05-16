# AtomQuest Hackathon 1.0 — Submission Document

---

## 1. Working Link

**Live Application:** https://atom-quest-hackathon-two.vercel.app

### Demo Credentials

| Role     | Email                        | Password      |
|----------|------------------------------|---------------|
| Admin    | admin@atomquest.io           | Admin@2026    |
| Manager  | manager1@atomquest.io        | Password@123  |
| Manager  | manager2@atomquest.io        | Password@123  |
| Employee | emp1@atomquest.io            | Password@123  |
| Employee | emp2@atomquest.io            | Password@123  |
| Employee | emp3@atomquest.io            | Password@123  |

> A **Quick Demo Access** panel on the login page allows one-click sign-in for each role.

---

## 2. Source Code Repository

**GitHub:** https://github.com/JayLikhar1/Atom-Quest-Hackathon

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                         │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │           React 19 SPA                              │   │
│   │   ─ Login / Employee / Manager / Admin Dashboards   │   │
│   │   ─ Analytics View                                  │   │
│   │   ─ AuthContext (JWT in localStorage)               │   │
│   │   ─ shadcn/ui + Tailwind CSS + Recharts             │   │
│   │   ─ Notifications Bell (20s poll)                   │   │
│   └─────────────────────────────────────────────────────┘   │
│                  Hosted on: Vercel                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │  HTTPS  /api/*
                           │  Authorization: Bearer <JWT>
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     FastAPI Backend                         │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│   │  Auth Module │  │  RBAC Layer  │  │  Email (Resend) │  │
│   │  JWT / bcrypt│  │require_roles │  │  httpx HTTP API │  │
│   └──────────────┘  └──────────────┘  └─────────────────┘  │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │                   API Routes                         │  │
│   │  /auth  /users  /cycles  /goals  /checkins           │  │
│   │  /reports  /audit  /analytics                        │  │
│   │  /notifications  /escalation                         │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │              Side Effects                            │  │
│   │  ─ Audit log on every state change                   │  │
│   │  ─ In-app notification creation                      │  │
│   │  ─ Email dispatch via Resend (graceful no-op)        │  │
│   └──────────────────────────────────────────────────────┘  │
│                  Hosted on: Render                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │  Motor (async driver)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     MongoDB Atlas                           │
│                                                             │
│   Collections:                                              │
│   ┌──────────┐ ┌────────┐ ┌───────┐ ┌──────────┐           │
│   │  users   │ │ cycles │ │ goals │ │ checkins │           │
│   └──────────┘ └────────┘ └───────┘ └──────────┘           │
│   ┌────────────┐ ┌───────────────┐ ┌──────────────────┐    │
│   │ audit_logs │ │ notifications │ │ escalation_rules │    │
│   └────────────┘ └───────────────┘ └──────────────────┘    │
│   ┌────────────────┐                                        │
│   │ escalation_log │                                        │
│   └────────────────┘                                        │
│                  Hosted on: MongoDB Atlas (Free Tier)       │
└─────────────────────────────────────────────────────────────┘


Data Flow — Goal Lifecycle:
───────────────────────────
Employee creates goal → Draft
       │
       ▼
Employee submits (validates: ≤8 goals, sum=100%, min 10% each)
       │
       ▼
Manager reviews → Approve / Return for Rework
       │
       ▼
Goals locked → Employee logs quarterly check-ins (Q1/Q2/Q3/Q4)
       │
       ▼
Manager adds check-in comments → Analytics updated
       │
       ▼
Admin exports CSV Achievement Report / views Audit Trail


Role Permissions Summary:
─────────────────────────
  Employee  →  Create/submit own goals, log own check-ins
  Manager   →  Approve/reject team goals, push shared goals,
               comment on team check-ins, export CSV
  Admin     →  Full access + unlock goals, manage users,
               open/close cycle windows, configure escalation rules
```

---

## Tech Stack Summary

| Layer      | Technology                                              |
|------------|---------------------------------------------------------|
| Frontend   | React 19, React Router 7, Tailwind 3, shadcn/ui, Recharts |
| Backend    | FastAPI, Pydantic v2, Motor, PyJWT, bcrypt, httpx       |
| Database   | MongoDB Atlas                                           |
| Auth       | Stateless JWT (12h), Bearer token                       |
| Email      | Resend HTTP API (graceful no-op when key absent)        |
| Hosting    | Vercel (frontend) + Render (backend)                    |

---

*AtomQuest Goal Portal — built for AtomQuest Hackathon 1.0*
