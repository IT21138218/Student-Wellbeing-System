---
name: qa
description: Full QA pass for Student Wellbeing — verifies every role (admin, teacher, counselor, student, parent) can reach exactly the features it should and nothing else, runs the backend test suite, the role-matrix consistency check, and the frontend lint/build, then walks a per-role manual smoke checklist. Use when asked to "check all roles", "QA the app", "make sure everything works", or before a release/demo.
---

# QA — Student Wellbeing

Goal: prove all 5 roles work end-to-end and the backend route gates, the
frontend `permissions.js` table, and this checklist all agree.

## Roles

`admin` (School Admin — always full access), `teacher`, `counselor`,
`student`, `parent`. Defined in `backend/app/models/user.py`.
Admin is never listed per-module; `require_roles()` and
`canAccessTool()` grant it everything implicitly.

## The role → feature matrix (single source of truth)

| Feature (frontend tool)        | Backend gate            | admin | teacher | counselor | student | parent |
|--------------------------------|-------------------------|:---:|:---:|:---:|:---:|:---:|
| Wellbeing Indicator            | `wellbeing._ALLOWED`    | ✅ | ✅ | ✅ | ❌ | ✅¹ |
| Risk Classification (`classification`) | `risk._ALLOWED`  | ✅ | ✅ | ✅ | ❌ | ✅² |
| — escalate a decision          | `risk._STAFF_ONLY`      | ✅ | ✅ | ✅ | ❌ | ❌ |
| — `/risk/admin/overview`       | `risk._ADMIN_ONLY`      | ✅ | ❌ | ❌ | ❌ | ❌ |
| Forecasting & Trends (`risk`)  | `forecast._ALLOWED`     | ✅ | ✅ | ✅ | ❌ | ✅² |
| Adaptive Quiz (`quiz`)         | `quiz._ALLOWED`         | ✅ | ✅ | ❌ | ✅ | ❌ |
| Question Bank (`topic`)        | `quiz._ALLOWED`         | ✅ | ✅ | ❌ | ✅ | ❌ |
| — `/quiz/marks`                | `quiz._ADMIN_ONLY`      | ✅ | ❌ | ❌ | ❌ | ❌ |
| Coping Strategies (`coping`)   | `coping._ALLOWED`       | ✅ | ✅ | ✅ | ✅ | ❌ |
| Social Isolation (`social`)    | `social._ALLOWED`       | ✅ | ✅ | ✅ | ❌ | ❌ |
| Reports / Cohort Report (`reports`) | `report._ALLOWED`  | ✅ | ❌ | ✅ | ❌ | ❌ |
| Alerts (`alerts`)              | `alerts._ALLOWED`       | ✅ | ✅ | ✅ | ❌ | ❌ |
| Student picker list `/students`| `students._ALLOWED`     | ✅ | ✅ | ✅ | ❌ | ✅¹ |
| Manage Guardians `/students/parents`,`/guardians/*` | `students._ADMIN_ONLY` | ✅ | ❌ | ❌ | ❌ | ❌ |

¹ Parent is allowed through the role gate but the **service layer** narrows
  results to their `linked_student_ids` only (`student_service.can_access_student`).
² Parent receives a **reduced response shape** — `{summary, risk_label}` /
  `{summary, trend}` instead of the full breakdown. Frontend components
  (`RiskClassification.jsx`, `RiskAnalysis.jsx`, `WellbeingIndicator.jsx`)
  branch on the missing fields to render the parent view.

Not role-gated at all (deliberately): `/overview/stats`,
`/forecast/students?source=csv`, `/social/students?source=csv`,
`/auth/*` (own account).

## Automated checks — run all of these

```bash
# 1. Backend suite + role matrix (must be 100% green)
cd backend && ./.venv/Scripts/python.exe -m pytest -q

# 2. Just the gate consistency check (fails if a route and permissions.js disagree)
./.venv/Scripts/python.exe -m pytest tests/test_role_matrix.py -q

# 3. Frontend build (must succeed)
cd ../frontend && npm run build

# 4. Frontend lint (known pre-existing: 4 react-hooks/set-state-in-effect
#    errors in RiskClassification/CopingRecommendation/RiskAnalysis — not
#    role-related; flag any NEW errors)
npm run lint
```

`tests/test_role_matrix.py` is the guardrail: it exercises every gate's real
`checker` for all 5 roles and asserts `frontend/src/constants/permissions.js`
`TOOL_ROLES` matches byte-for-byte. **If you change any `require_roles(...)`
call or `TOOL_ROLES`, update the `GATES` / `FRONTEND_TOOL_TO_GATE` tables in
that test and this matrix in the same commit.**

## Manual smoke test — one pass per role

Prereqs: Mongo up, models trained (`python -m ml.risk_classification.train`
etc. — endpoints 503 until then), backend on :8000, frontend on :5173.

Register one account per role (`/auth/register` accepts a `role` field, or
use the Login screen). For parent, also link a child via **Manage Guardians**
while logged in as admin.

For each role, log in and confirm:

1. **Sidebar** shows exactly the ✅ rows for that role from the matrix — no
   more, no fewer. (`Dashboard.jsx` `visible()` / `quickActions`.)
2. **Quick Actions** on Overview match the sidebar.
3. Open every visible tool and run its primary action once:
   - Wellbeing Indicator → run a check-in → result renders (parent: short
     summary card only).
   - Risk Classification → Make Decision → result; History tab loads;
     HIGH result shows Escalate (staff only).
   - Forecasting → pick a student (CSV + real) → forecast renders.
   - Adaptive Quiz → generate → answer → submit → score saved.
   - Question Bank → list loads, filters work, add a note; Review tab.
   - Coping Strategies → recommend → result; History; submit feedback.
   - Social Isolation → detect (CSV + real) → result; History.
   - Reports → Cohort Report renders with real numbers.
   - Alerts → feed loads; badge count matches.
   - Manage Guardians (admin) → list parents, link/unlink a child.
4. **Negative check**: hit one forbidden endpoint directly and expect 403,
   e.g. as `student`:
   `curl -s localhost:8000/api/v1/alerts -H "Authorization: Bearer $TOKEN"`
   → `403` with `Role 'student' cannot access this`.
5. **Unauthenticated**: home page loads, `/overview/stats` and the student
   search bar work with no token; any gated call → 401 → redirect to Login.
6. Profile panel: edit name, change password, upload/remove avatar.
7. Log out → returns home, token cleared, gated calls 401.

## Known issues / watch list

- `/auth/register` accepts `role: "admin"` from the client — anyone can
  self-register as admin. Acceptable for the demo; lock down before any real
  deployment (server-side role allow-list or admin-only provisioning).
- Forecast/Social "class-level vs full-trajectory" distinction between
  teacher and counselor is documented but not implemented — both get the
  same full payload. No dedicated class-aggregate endpoint yet.
- Frontend lint has 4 pre-existing `react-hooks/set-state-in-effect` errors
  (loading-step animations). Cosmetic; don't let them mask new lint errors.

## Definition of done

- [ ] `pytest -q` — all green
- [ ] `tests/test_role_matrix.py` — all green
- [ ] `npm run build` — succeeds
- [ ] `npm run lint` — no NEW errors beyond the 4 known
- [ ] Manual smoke pass completed for all 5 roles + unauthenticated
- [ ] Matrix above updated if any gate changed
