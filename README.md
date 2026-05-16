<div align="center">

# ATOMQUEST — Goal Setting & Tracking Portal

**ATOMQUEST HACKATHON 1.0 — In-House Goal Setting & Tracking Portal**

A structured, audit-ready digital portal that replaces fragmented spreadsheets with a complete employee-goal lifecycle: creation, alignment, quarterly check-ins, and performance visibility.

`FastAPI` · `React 19` · `MongoDB` · `JWT` · `Tailwind + shadcn/ui` · `Recharts` · `Resend`

</div>

---

## Table of Contents

1. [Problem context](#1-problem-context)
2. [What's built](#2-whats-built)
3. [Architecture](#3-architecture)
4. [Tech stack](#4-tech-stack)
5. [Roles & permissions](#5-roles--permissions)
6. [User flows](#6-user-flows)
7. [Validation & scoring rules](#7-validation--scoring-rules)
8. [Project structure](#8-project-structure)
9. [Running locally](#9-running-locally)
10. [Demo credentials](#10-demo-credentials)
11. [API reference](#11-api-reference)
12. [Cycle windows](#12-cycle-windows)
13. [Audit trail & governance](#13-audit-trail--governance)
14. [Bonus features](#14-bonus-features)
15. [Testing](#15-testing)
16. [Cost-optimisation notes](#16-cost-optimisation-notes)
17. [Roadmap](#17-roadmap)

---

## 1. Problem context

Organisations relying on manual or fragmented goal-tracking (spreadsheets, e-mail threads, offline reviews) lose alignment, visibility and accountability. Managers can't see team progress in real time, employees lack clarity on how their work maps to org priorities, and HR scrambles to assemble data at appraisal time.

**AtomQuest** eliminates these pain points with a single, role-aware portal that enforces the goal lifecycle end-to-end.

## 2. What's built

### Phase 1 — Goal Creation & Approval (must-have)
- Employee goal-sheet creation: pick Thrust Area, define title/description, choose UoM (Numeric / % / Timeline / Zero-based), set target and weightage
- Hard validations: **total weightage = 100 %**, **min 10 % per goal**, **max 8 goals**
- Manager (L1) approval workflow with **inline edit of target/weightage** and return-for-rework with comment
- On approval, goals are **locked** — only Admin can unlock
- **Shared goals**: manager/admin pushes a goal to multiple employees; recipients may edit only weightage; achievement updates from the source sync to all linked sheets

### Phase 2 — Achievement Tracking & Quarterly Check-ins (must-have)
- Quarterly check-in interface (Q1 / Q2 / Q3 / Q4 / Annual) for employees to log Actual vs Planned and pick status (Not Started / On Track / Completed)
- Manager check-in module: view planned-vs-actual per report, log a structured **check-in comment**
- System-computed progress score per goal (see [§ 7](#7-validation--scoring-rules))

### Reporting & governance
- **Achievement Report** — CSV export of planned vs actual for every employee × goal × quarter
- **Completion Dashboard** — real-time view of check-in completion per employee per period
- **Audit Trail** — every change after lock is logged (who / what / when / before / after)

### Bonus features (all implemented)
- **Email notifications** via Resend (goal submission, approval, rework, check-in, escalation)
- **Escalation module** — rule-based, configurable thresholds, admin-triggerable, with a persistent log
- **Analytics** — QoQ trend, thrust/status/UoM distributions, manager-effectiveness table, achievement heatmap
- **Notifications inbox** — in-app bell with unread count and 20-second poll

## 3. Architecture

```
                   ┌─────────────────────────────────────────┐
                   │           React 19 SPA (frontend/)       │
                   │  ─ AuthContext (JWT in localStorage)     │
                   │  ─ Role-routed dashboards                │
                   │  ─ shadcn/ui + Tailwind + Recharts       │
                   └────────────────┬────────────────────────┘
                                    │  HTTPS (Bearer token)
                                    │  /api/*
                   ┌────────────────▼────────────────────────┐
                   │       FastAPI app (backend/server.py)    │
                   │  ─ JWT auth (bcrypt + PyJWT)             │
                   │  ─ RBAC dependency: require_roles(...)   │
                   │  ─ Audit + notification side-effects     │
                   │  ─ Resend email (httpx)                  │
                   └────────────────┬────────────────────────┘
                                    │  Motor (async)
                   ┌────────────────▼────────────────────────┐
                   │              MongoDB                     │
                   │  users · cycles · goals · checkins ·     │
                   │  audit_logs · notifications ·            │
                   │  escalation_rules · escalation_log       │
                   └─────────────────────────────────────────┘
```

Single-process backend, single-page React app, single MongoDB instance — minimal infra, low cost, easy to host on any container platform.

## 4. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, React Router 7, Tailwind 3, shadcn/ui, Recharts, sonner, axios, Lucide icons |
| Typography | Cabinet Grotesk (headings) · Satoshi (body) · JetBrains Mono (data) |
| Backend | FastAPI, Pydantic v2, Motor (async MongoDB), PyJWT, bcrypt, httpx |
| Database | MongoDB (UUID primary keys, no `_id` leakage in responses) |
| Email | Resend HTTP API (graceful no-op when key absent) |
| Auth | Stateless JWT (12 h) — Bearer token in `Authorization` header |

## 5. Roles & permissions

| Capability | Employee | Manager (L1) | Admin / HR |
|---|:---:|:---:|:---:|
| Draft / edit own goals | ✓ | ✓ | ✓ |
| Submit goal sheet (≤ 8, sum = 100 %) | ✓ | — | — |
| Review & inline-edit team goals | — | ✓ | ✓ |
| Approve / return-for-rework | — | ✓ | ✓ |
| Push shared goals to team | — | ✓ | ✓ |
| Log own quarterly check-in | ✓ | ✓ | — |
| Manager comment on team check-in | — | ✓ | ✓ |
| Unlock approved/locked goal | — | — | ✓ |
| Open / close cycle windows | — | — | ✓ |
| Create / manage users | — | — | ✓ |
| View full audit trail | — | (own team) | ✓ |
| Configure escalation rules | — | — | ✓ |
| Export CSV achievement report | — | ✓ | ✓ |

## 6. User flows

### Employee
`Login → My Goals → Add Goal (×n, sum to 100 %) → Submit for approval → Wait → Goals locked on approval → Open quarter → Log Actual + Status → View manager feedback`

### Manager
`Login → Team Goals → Approvals tab → Inline-edit / Approve / Return → Check-ins tab → Review planned vs actual → Add check-in comment → Shared Goals tab → Push cascaded KPI to reports`

### Admin
`Login → Overview (completion %) → Cycles tab → Toggle goal_setting + Q1–Q4 windows → Users tab → Add member → Audit Trail → Escalation → Add rule + Run now → Analytics`

## 7. Validation & scoring rules

### Hard validations (enforced server-side)
- Max **8** goals per employee in active states (draft / submitted / approved / locked)
- Min **10 %** weightage per goal
- Total weightage **must equal 100 %** before submission
- Once approved, goals are immutable for the employee (Admin unlock returns them to draft and logs an audit entry)

### Progress scoring per UoM

| UoM type | Meaning | Formula |
|---|---|---|
| `numeric_min` / `percent_min` | Higher is better (sales, NPS) | `Actual ÷ Target` |
| `numeric_max` / `percent_max` | Lower is better (TAT, cost) | `Target ÷ Actual` |
| `timeline` | Date-based completion | `100 %` if `actual_date ≤ deadline`, else linearly penalised |
| `zero` | Zero = success (safety incidents) | `100 %` if `actual = 0`, else `0 %` |

Computed values are capped at `200 %` to absorb extreme over-achievement and surface them in analytics without breaking visualisations.

## 8. Project structure

```
/app
├── backend/
│   ├── server.py               # Single-file FastAPI app — auth, routes, helpers, seed
│   ├── requirements.txt
│   └── .env                    # MONGO_URL, DB_NAME, JWT_SECRET, RESEND_API_KEY, …
├── frontend/
│   ├── public/index.html
│   ├── src/
│   │   ├── App.js              # Router + AuthProvider + Toaster
│   │   ├── index.css           # Dark theme, fonts, grid background, utilities
│   │   ├── lib/
│   │   │   ├── api.js          # axios instance w/ Bearer interceptor
│   │   │   ├── auth.jsx        # AuthContext, login/logout/fetchMe
│   │   │   └── constants.js    # Thrust areas, UoM options, period labels, status colours
│   │   ├── components/
│   │   │   ├── AppShell.jsx    # Sidebar + topbar layout
│   │   │   ├── NotificationsBell.jsx
│   │   │   ├── Atoms.jsx       # StatusBadge, ProgressBar, Stat, SectionTitle, EmptyState
│   │   │   └── ui/             # shadcn/ui primitives
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── EmployeeDashboard.jsx
│   │       ├── ManagerDashboard.jsx
│   │       ├── AdminDashboard.jsx
│   │       └── AnalyticsView.jsx
│   ├── package.json
│   └── tailwind.config.js
├── memory/
│   ├── PRD.md                  # Product spec + backlog
│   └── test_credentials.md     # All seeded accounts
└── README.md                   # ← you are here
```

## 9. Running locally

### Prerequisites
- Python 3.11+
- Node 18+ and Yarn 1.22+
- MongoDB 5+ running locally on `mongodb://localhost:27017`

### Backend
```bash
cd backend
pip install -r requirements.txt
# .env must contain MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The first startup auto-seeds:
- 1 admin · 2 managers · 5 employees
- ~17 sample goals across thrust areas
- 12 Q1 check-ins
- 3 default escalation rules
- 5 cycle records (`goal_setting` + `q1` open by default)

### Frontend
```bash
cd frontend
yarn install
# .env must contain REACT_APP_BACKEND_URL pointing to your backend
yarn start          # http://localhost:3000
```

### Environment variables

**backend/.env**
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="atomquest_goals"
JWT_SECRET="<random-64-char-hex>"
ADMIN_EMAIL="admin@atomquest.io"
ADMIN_PASSWORD="Admin@2026"
FRONTEND_URL="http://localhost:3000"
RESEND_API_KEY="<optional>"
RESEND_FROM_EMAIL="AtomQuest <onboarding@resend.dev>"
```

**frontend/.env**
```
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_DEMO_ADMIN_EMAIL=admin@atomquest.io
REACT_APP_DEMO_ADMIN_PASSWORD=Admin@2026
REACT_APP_DEMO_MANAGER_EMAIL=manager1@atomquest.io
REACT_APP_DEMO_MANAGER_PASSWORD=Password@123
REACT_APP_DEMO_EMPLOYEE_EMAIL=emp1@atomquest.io
REACT_APP_DEMO_EMPLOYEE_PASSWORD=Password@123
REACT_APP_DEFAULT_USER_PASSWORD=Password@123
```

## 10. Demo credentials

The login page exposes a **Quick Demo Access** panel — one-click sign-in for each role.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@atomquest.io` | `Admin@2026` |
| Manager | `manager1@atomquest.io` | `Password@123` |
| Manager | `manager2@atomquest.io` | `Password@123` |
| Employee | `emp1@atomquest.io` | `Password@123` |
| Employee | `emp2@atomquest.io` | `Password@123` |
| Employee | `emp3@atomquest.io` | `Password@123` |
| Employee | `emp4@atomquest.io` | `Password@123` |
| Employee | `emp5@atomquest.io` | `Password@123` |

## 11. API reference

All routes are prefixed with `/api`. Authenticated routes require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Body | Role |
|---|---|---|---|
| `POST` | `/auth/login` | `{email, password}` | any |
| `POST` | `/auth/logout` | — | any |
| `GET` | `/auth/me` | — | any (auth) |

### Users
| Method | Path | Body | Role |
|---|---|---|---|
| `GET` | `/users` | — | any (scoped) |
| `POST` | `/users` | `UserCreateIn` | admin |

### Cycles
| Method | Path | Body | Role |
|---|---|---|---|
| `GET` | `/cycles` | — | any |
| `PATCH` | `/cycles/{period}` | `{period, is_open}` | admin |

### Goals
| Method | Path | Body | Role |
|---|---|---|---|
| `GET` | `/goals?user_id&status` | — | any (scoped) |
| `POST` | `/goals` | `GoalIn` | any |
| `PATCH` | `/goals/{id}` | partial fields (scope-aware) | any |
| `DELETE` | `/goals/{id}` | — | owner (draft) / admin |
| `POST` | `/goals/submit` | — | employee |
| `POST` | `/goals/{id}/approve` | — | manager/admin |
| `POST` | `/goals/{id}/reject` | `{comment}` | manager/admin |
| `POST` | `/goals/{id}/unlock` | — | admin |
| `POST` | `/goals/share` | `ShareGoalIn` | manager/admin |

### Check-ins
| Method | Path | Body | Role |
|---|---|---|---|
| `POST` | `/checkins` | `CheckinIn` | owner / admin |
| `GET` | `/checkins?owner_id&period` | — | scoped |
| `POST` | `/checkins/manager-comment` | `ManagerCheckinIn` | manager/admin |

### Reports & analytics
| Method | Path | Role |
|---|---|---|
| `GET` | `/reports/achievement.csv` | manager/admin |
| `GET` | `/reports/completion` | any |
| `GET` | `/audit?entity_id&limit` | manager/admin |
| `GET` | `/analytics/summary` | any |

### Notifications & escalation
| Method | Path | Role |
|---|---|---|
| `GET` | `/notifications` | auth |
| `POST` | `/notifications/{id}/read` | auth |
| `GET` | `/escalation/rules` | admin |
| `POST` | `/escalation/rules` | admin |
| `DELETE` | `/escalation/rules/{id}` | admin |
| `GET` | `/escalation/log` | admin |
| `POST` | `/escalation/run` | admin |

## 12. Cycle windows

The portal enforces the BRD's quarterly schedule via toggleable cycle records. Admin can open/close any window independently for demo flexibility.

| Period | Real-world calendar | Purpose |
|---|---|---|
| `goal_setting` | 1 st May → end May | Goal creation, submission, approval |
| `q1` | July | Q1 progress update |
| `q2` | October | Q2 progress update |
| `q3` | January | Q3 progress update |
| `q4_annual` | March / April | Final achievement capture |

Out-of-window writes return **HTTP 400** with a clear error.

## 13. Audit trail & governance

Every state-changing action persists an entry to `audit_logs`:

```
{
  id, actor_id, actor_name, actor_role,
  action,                              # goal.create | goal.update | goal.approve | …
  entity, entity_id,
  before, after, note, timestamp
}
```

Edits made **after a goal is locked** are double-logged (`goal.update` + `goal.post_lock_edit`) so HR can spot post-lock tampering at a glance. The Admin → Audit Trail page renders this as a vertical timeline.

## 14. Bonus features

### Email notifications (Resend)
- Goal submitted → manager
- Goal approved → employee
- Goal returned for rework → employee
- Escalations → role-based recipients

Drops to a console no-op log line if `RESEND_API_KEY` is empty — never blocks the request.

### Escalation module
Three built-in rule conditions, fully configurable:
- `goals_not_submitted` — employee hasn't submitted any goals
- `approval_pending` — manager has pending approvals
- `checkin_pending` — open cycle has missing check-ins

Each rule can independently target employee / manager / admin. Admin can **Run now** to evaluate all enabled rules immediately and persist a log of every fired event.

### Analytics module
- **QoQ Achievement Trend** — average % achievement across Q1–Q4
- **Goal Distribution** — pie chart by thrust area
- **Status Mix** — bar chart of Not Started / On Track / Completed
- **UoM Mix** — bar chart by UoM type
- **Manager Effectiveness** — comment-coverage % per L1 manager
- **Achievement Heatmap** — employee × quarter colour-graded grid

## 15. Testing

Automated pytest suite at `/app/backend/tests/backend_test.py` — **26 tests, 100 % pass**.

Coverage:
- Auth (login, /me, bad creds, cookie + Bearer flows)
- Cycle list + admin toggle (incl. body/path period-mismatch 400)
- Goal CRUD, submit validations (min 10 %, sum 100 %, ≤ 8)
- Manager approve / reject (with `RejectIn` Pydantic body) / inline edit
- Shared-goal weightage-only restriction for employees
- Check-in upsert + progress computation per UoM type
- Manager check-in comment
- CSV report, completion dashboard
- Audit log
- Analytics summary structure
- Admin cycle toggle → submit blocked when closed
- Admin user creation (email lowercased, unique constraint)
- Escalation list + run + log
- Notifications list + mark-read
- Authorization (employee blocked from admin routes, cross-team goal access denied)

Run locally:
```bash
cd backend && pytest tests/backend_test.py -v
```

## 16. Cost-optimisation notes

- **Single FastAPI process** — no microservices, no message broker, no Redis. One container is enough for the entire backend at hackathon scale.
- **MongoDB UUIDs as primary keys** — readable, JSON-safe, no ObjectId leakage, indexable.
- **No background workers** — escalation evaluation is an idempotent on-demand admin action. A cron can be wired later without rearchitecture.
- **Stateless JWT** — no session store, no DB hit on every authenticated request beyond the user lookup that's mostly cache-friendly.
- **Resend pay-per-email** — graceful no-op when no key, so demos cost zero.
- **React dev server only for preview** — production build is a static bundle that any CDN can serve for cents.
- **Wildcard CORS** — works everywhere (iframe / mobile WebView / Postman) without per-environment config.

## 17. Roadmap

| Priority | Item |
|:---:|---|
| P0 | Real cron for `/escalation/run` (currently admin-triggered) |
| P0 | WebSocket push for approvals & notifications (currently 20-s poll) |
| P1 | Microsoft Entra ID SSO + org-hierarchy auto-sync |
| P1 | Microsoft Teams adaptive cards w/ deep-links |
| P1 | Audit-trail filters (actor / entity / date) + export |
| P1 | Bulk shared-goal push via CSV import |
| P2 | Peer 360 feedback rounds |
| P2 | Custom UoM formulas (admin-defined) |
| P2 | Multi-cycle annual roll-up reports |

---

<div align="center">

**AtomQuest Goal Portal** — built for the AtomQuest Hackathon 1.0  
FastAPI · React · MongoDB · designed for clarity, audit-readiness, and speed.

</div>
