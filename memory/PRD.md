# AtomQuest — Goal Setting & Tracking Portal (PRD)

## Original Problem Statement
ATOMQUEST HACKATHON 1.0: Build a structured digital Goal Setting & Tracking Portal that supports the full lifecycle of employee goals — creation, alignment, quarterly check-ins, performance visibility — replacing fragmented spreadsheets with role-aware workflows, validation, scoring, and audit logs.

## User Personas
- **Employee** — drafts up to 8 goals (weightage 10–100%, sum = 100%), submits for approval, logs Q1–Q4 actuals against planned targets.
- **Manager (L1)** — reviews/edits team submissions inline, approves or returns for rework, conducts quarterly check-ins with structured feedback, pushes shared/cascaded goals to direct reports.
- **Admin / HR** — opens/closes cycle windows, manages org hierarchy, unlocks locked goals, oversees completion rates, reviews audit trail, configures escalation rules.

## Core Requirements (status)
| # | Requirement | Status |
|---|-------------|--------|
| Phase 1 | Goal creation w/ Thrust Area, UoM (Numeric/%/Timeline/Zero), Target, Weightage | Done |
| Phase 1 | Validation: ≤8 goals, ≥10% per goal, sum = 100% | Done |
| Phase 1 | Manager approval with inline edit & return-for-rework | Done |
| Phase 1 | Shared / cascaded goals (weightage-only edit for recipients, achievement sync) | Done |
| Phase 1 | Lock-on-approval; Admin-only unlock | Done |
| Phase 2 | Quarterly check-in (Q1–Q4) windows enforced via cycle toggle | Done |
| Phase 2 | Planned-vs-Actual logging with status & note | Done |
| Phase 2 | Manager check-in comments | Done |
| Phase 2 | Progress scoring (Min, Max, Timeline, Zero formulas) | Done |
| Reports | CSV achievement export | Done |
| Reports | Completion dashboard | Done |
| Reports | Audit trail (incl. post-lock edit flag) | Done |
| Bonus | Email notifications (Resend) | Done |
| Bonus | Escalation module (rules + on-demand run + log) | Done |
| Bonus | Analytics (QoQ trend, distributions, heatmap, manager effectiveness) | Done |
| Bonus | Notifications inbox | Done |
| Bonus | Microsoft Entra SSO / Teams cards | Deferred |

## Implementation Snapshot (2026-05-16)
**Backend** — FastAPI + Motor/MongoDB. JWT auth via bcrypt + httpOnly cookies (Bearer header fallback). Single `server.py` with refactored seed/analytics/escalation helpers. Resend HTTP API for transactional email (graceful no-op without key). 26/26 backend tests pass.

**Frontend** — React 19 + shadcn/ui + Tailwind. Dark "Swiss / Control-Room" theme using Cabinet Grotesk, Satoshi, JetBrains Mono. Sidebar shell + role-specific dashboards (Employee, Manager, Admin) with tabs. Recharts for analytics, sonner toasts, popover notifications. All interactive elements carry `data-testid`.

**Seeded demo data** — 1 admin, 2 managers, 5 employees, sample goals across thrust areas, Q1 check-ins, 3 escalation rules. `goal_setting` + `q1` windows pre-opened.

## Test Credentials → `/app/memory/test_credentials.md`

## Prioritized Backlog
**P0 (next pickup)**
- Real-time WebSocket for notifications + approval queue
- Server-side scheduled escalation cron (currently admin-triggered)

**P1**
- Microsoft Entra ID SSO + Teams adaptive cards
- Audit trail filters (by actor, entity, date range) + export
- Bulk shared-goal push (CSV import)
- Goal versioning beyond audit log

**P2**
- Manager 360 feedback rounds (peer review)
- Custom UoM formulas (admin-defined)
- Multi-cycle annual roll-up reports
