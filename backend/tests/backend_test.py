"""AtomQuest Goal Portal - Backend API tests."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://3fa81a4e-6ce7-447a-9afe-c75a13e44103.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = ("admin@atomquest.io", "Admin@2026")
MGR1 = ("manager1@atomquest.io", "Password@123")
EMP3 = ("emp3@atomquest.io", "Password@123")
EMP1 = ("emp1@atomquest.io", "Password@123")


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    a, au = login(*ADMIN)
    m, mu = login(*MGR1)
    e3, e3u = login(*EMP3)
    e1, e1u = login(*EMP1)
    return {"admin": (a, au), "mgr": (m, mu), "emp3": (e3, e3u), "emp1": (e1, e1u)}


# ---- Auth ----
def test_login_invalid():
    r = requests.post(f"{API}/auth/login", json={"email": "x@x.io", "password": "bad"})
    assert r.status_code == 401


def test_auth_me(tokens):
    t, _ = tokens["admin"]
    r = requests.get(f"{API}/auth/me", headers=H(t))
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_me_no_token():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---- Cycles ----
def test_cycles_list(tokens):
    t, _ = tokens["admin"]
    r = requests.get(f"{API}/cycles", headers=H(t))
    assert r.status_code == 200
    cycles = r.json()
    assert len(cycles) == 5
    cm = {c["period"]: c["is_open"] for c in cycles}
    assert cm["goal_setting"] is True and cm["q1"] is True


# ---- Goals: employee ----
def test_emp3_goals_drafts(tokens):
    t, _ = tokens["emp3"]
    r = requests.get(f"{API}/goals", headers=H(t))
    assert r.status_code == 200
    goals = r.json()
    drafts = [g for g in goals if g["status"] == "draft"]
    assert len(drafts) >= 3


def test_emp3_submit_fails_not_100(tokens):
    t, _ = tokens["emp3"]
    # Current weights sum: 50+30+20=100. Should pass. Add another to break it.
    r = requests.get(f"{API}/goals", headers=H(t))
    goals = r.json()
    total = sum(g["weightage"] for g in goals if g["status"] == "draft")
    # adjust one weightage to break sum
    g0 = [g for g in goals if g["status"] == "draft"][0]
    new_w = g0["weightage"] + 5
    pr = requests.patch(f"{API}/goals/{g0['id']}", headers=H(t), json={"weightage": new_w})
    assert pr.status_code == 200
    sr = requests.post(f"{API}/goals/submit", headers=H(t))
    assert sr.status_code == 400
    # restore
    requests.patch(f"{API}/goals/{g0['id']}", headers=H(t), json={"weightage": g0["weightage"]})


def test_emp3_min_weightage_validation(tokens):
    t, _ = tokens["emp3"]
    r = requests.post(f"{API}/goals", headers=H(t), json={
        "thrust_area": "Innovation", "title": "TEST_low", "uom": "numeric_min",
        "target": "1", "weightage": 5
    })
    assert r.status_code == 400


def test_emp3_create_update_delete_goal(tokens):
    t, _ = tokens["emp3"]
    cr = requests.post(f"{API}/goals", headers=H(t), json={
        "thrust_area": "Innovation", "title": "TEST_new_goal", "uom": "numeric_min",
        "target": "10", "weightage": 10
    })
    assert cr.status_code == 200, cr.text
    gid = cr.json()["id"]
    ur = requests.patch(f"{API}/goals/{gid}", headers=H(t), json={"weightage": 15})
    assert ur.status_code == 200
    assert ur.json()["weightage"] == 15
    dr = requests.delete(f"{API}/goals/{gid}", headers=H(t))
    assert dr.status_code == 200


# ---- Manager flow ----
def test_manager_lists_team_goals(tokens):
    t, _ = tokens["mgr"]
    r = requests.get(f"{API}/goals", headers=H(t))
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_manager_approve_reject(tokens):
    mt, _ = tokens["mgr"]
    # find emp2 submitted goal
    r = requests.get(f"{API}/goals?status=submitted", headers=H(mt))
    submitted = [g for g in r.json() if g["status"] == "submitted"]
    if not submitted:
        pytest.skip("no submitted goals")
    g = submitted[0]
    # manager edit weightage
    ur = requests.patch(f"{API}/goals/{g['id']}", headers=H(mt), json={"target": g["target"]})
    assert ur.status_code == 200
    rr = requests.post(f"{API}/goals/{g['id']}/reject", headers=H(mt), json={"comment": "Please refine"})
    assert rr.status_code == 200
    # approve another if exists
    submitted2 = [x for x in submitted[1:]] if len(submitted) > 1 else []
    if submitted2:
        ar = requests.post(f"{API}/goals/{submitted2[0]['id']}/approve", headers=H(mt))
        assert ar.status_code == 200


# ---- Shared goals ----
def test_share_goal(tokens):
    mt, mu = tokens["mgr"]
    # Create a goal owned by manager first
    cr = requests.post(f"{API}/goals", headers=H(mt), json={
        "thrust_area": "Customer Excellence", "title": "TEST_shared_goal",
        "uom": "numeric_min", "target": "100", "weightage": 10
    })
    assert cr.status_code == 200, cr.text
    src_id = cr.json()["id"]
    # share to emp1
    _, e1u = tokens["emp1"]
    sr = requests.post(f"{API}/goals/share", headers=H(mt), json={
        "source_goal_id": src_id, "target_user_ids": [e1u["id"]], "default_weightage": 10
    })
    assert sr.status_code == 200
    # Employee can only update weightage on shared goal
    et, _ = tokens["emp1"]
    eg = requests.get(f"{API}/goals", headers=H(et))
    shared = [g for g in eg.json() if g.get("is_shared")]
    assert len(shared) >= 1
    sgid = shared[0]["id"]
    # editing title should be ignored
    pr = requests.patch(f"{API}/goals/{sgid}", headers=H(et), json={"title": "hack", "weightage": 12})
    assert pr.status_code == 200
    assert pr.json()["title"] != "hack"
    assert pr.json()["weightage"] == 12


# ---- Check-ins ----
def test_checkin_create_and_progress(tokens):
    et, eu = tokens["emp1"]
    r = requests.get(f"{API}/goals", headers=H(et))
    approved = [g for g in r.json() if g["status"] == "approved" and not g.get("is_shared")]
    assert approved
    g = approved[0]
    cr = requests.post(f"{API}/checkins", headers=H(et), json={
        "goal_id": g["id"], "period": "q1", "actual": g["target"], "status": "completed", "note": "TEST"
    })
    assert cr.status_code == 200
    prog = cr.json()["progress"]
    # numeric_min target=target => 100%; numeric_max target=actual => 100%; zero 0 => 100%
    assert prog == 100.0 or prog >= 99.9


def test_manager_comment_on_checkin(tokens):
    mt, _ = tokens["mgr"]
    et, _ = tokens["emp1"]
    r = requests.get(f"{API}/checkins?period=q1", headers=H(et))
    ck = r.json()
    assert ck
    cr = requests.post(f"{API}/checkins/manager-comment", headers=H(mt), json={
        "goal_id": ck[0]["goal_id"], "period": "q1", "comment": "Good job"
    })
    assert cr.status_code == 200


# ---- Reports ----
def test_reports_csv(tokens):
    mt, _ = tokens["mgr"]
    r = requests.get(f"{API}/reports/achievement.csv", headers=H(mt))
    assert r.status_code == 200
    assert "Employee" in r.text


def test_completion(tokens):
    t, _ = tokens["admin"]
    r = requests.get(f"{API}/reports/completion", headers=H(t))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---- Audit / Analytics ----
def test_audit(tokens):
    t, _ = tokens["admin"]
    r = requests.get(f"{API}/audit", headers=H(t))
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_analytics(tokens):
    t, _ = tokens["admin"]
    r = requests.get(f"{API}/analytics/summary", headers=H(t))
    assert r.status_code == 200
    j = r.json()
    for k in ("qoq", "thrust_distribution", "manager_effectiveness", "heatmap"):
        assert k in j


# ---- Admin cycle toggle ----
def test_admin_toggle_cycle_blocks_submit(tokens):
    at, _ = tokens["admin"]
    # close goal_setting
    r = requests.patch(f"{API}/cycles/goal_setting", headers=H(at),
                       json={"period": "goal_setting", "is_open": False})
    assert r.status_code == 200
    # emp3 try submit
    et, _ = tokens["emp3"]
    sr = requests.post(f"{API}/goals/submit", headers=H(et))
    assert sr.status_code == 400
    # reopen
    requests.patch(f"{API}/cycles/goal_setting", headers=H(at),
                   json={"period": "goal_setting", "is_open": True})


# ---- Admin user creation ----
def test_admin_create_user(tokens):
    at, _ = tokens["admin"]
    import uuid
    email = f"TEST_{uuid.uuid4().hex[:6]}@atomquest.io"
    r = requests.post(f"{API}/users", headers=H(at), json={
        "email": email, "name": "TEST User", "password": "Password@123",
        "role": "employee", "department": "QA"
    })
    assert r.status_code == 200
    assert r.json()["email"] == email.lower()


# ---- Escalation ----
def test_escalation_rules(tokens):
    at, _ = tokens["admin"]
    r = requests.get(f"{API}/escalation/rules", headers=H(at))
    assert r.status_code == 200
    assert len(r.json()) >= 3


def test_escalation_run(tokens):
    at, _ = tokens["admin"]
    r = requests.post(f"{API}/escalation/run", headers=H(at))
    assert r.status_code == 200
    assert "fired" in r.json()


# ---- Notifications ----
def test_notifications(tokens):
    mt, _ = tokens["mgr"]
    r = requests.get(f"{API}/notifications", headers=H(mt))
    assert r.status_code == 200
    items = r.json()
    if items:
        nid = items[0]["id"]
        rr = requests.post(f"{API}/notifications/{nid}/read", headers=H(mt))
        assert rr.status_code == 200


# ---- Authorization ----
def test_employee_cannot_list_users_create(tokens):
    et, _ = tokens["emp3"]
    r = requests.post(f"{API}/users", headers=H(et), json={
        "email": "TEST_x@x.io", "name": "x", "role": "employee"
    })
    assert r.status_code == 403


def test_employee_cannot_fetch_other_user_goals(tokens):
    et, _ = tokens["emp3"]
    _, e1u = tokens["emp1"]
    r = requests.get(f"{API}/goals?user_id={e1u['id']}", headers=H(et))
    # employee endpoint forces owner_id=self, so should return empty or own goals
    assert r.status_code == 200
    for g in r.json():
        assert g["owner_id"] != e1u["id"]


# ---- NEW: Cookie auth on login ----
def test_login_sets_cookie():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=20)
    assert r.status_code == 200
    # Check Set-Cookie header for access_token
    set_cookie = r.headers.get("set-cookie", "") or r.headers.get("Set-Cookie", "")
    assert "access_token" in set_cookie.lower(), f"Set-Cookie missing access_token: {set_cookie}"
    # token also returned in body
    assert "token" in r.json()


def test_me_via_cookie_only():
    # Use a session so cookies are stored automatically
    s = requests.Session()
    lr = s.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=20)
    assert lr.status_code == 200
    # Hit /me without Authorization header — should work via cookie
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200, f"/me via cookie failed: {r.status_code} {r.text}"
    assert r.json()["role"] == "admin"


# ---- NEW: Cycle period mismatch ----
def test_cycle_patch_period_mismatch(tokens):
    at, _ = tokens["admin"]
    r = requests.patch(f"{API}/cycles/goal_setting", headers=H(at),
                       json={"period": "q1", "is_open": True})
    assert r.status_code == 400, f"expected 400 mismatch, got {r.status_code} {r.text}"


# ---- NEW: RejectIn pydantic body still works ----
def test_reject_with_pydantic_body(tokens):
    mt, _ = tokens["mgr"]
    # find a submitted goal; if none, submit one via emp1 after approving cycle is open
    r = requests.get(f"{API}/goals?status=submitted", headers=H(mt))
    submitted = [g for g in r.json() if g["status"] == "submitted"]
    if not submitted:
        pytest.skip("no submitted goals for reject test")
    g = submitted[0]
    rr = requests.post(f"{API}/goals/{g['id']}/reject", headers=H(mt), json={"comment": "pls fix"})
    assert rr.status_code == 200, rr.text

