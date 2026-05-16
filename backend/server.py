"""AtomQuest Goal Setting & Tracking Portal - FastAPI backend."""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import csv
import uuid
import bcrypt
import jwt as pyjwt
import httpx
import logging
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr

logger = logging.getLogger("atomquest")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
RESEND_FROM = os.environ.get("RESEND_FROM_EMAIL", "AtomQuest <onboarding@resend.dev>")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

app = FastAPI(title="AtomQuest Goals API")
api = APIRouter(prefix="/api")


# ===== Helpers =====
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()


def verify_password(pwd: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str, ttl_minutes: int = 60 * 12) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": now_utc() + timedelta(minutes=ttl_minutes), "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def public_user(u: dict) -> dict:
    return {
        "id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"],
        "manager_id": u.get("manager_id"), "department": u.get("department"),
        "avatar_url": u.get("avatar_url"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires one of: {roles}")
        return user
    return dep


async def write_audit(actor: dict, action: str, entity: str, entity_id: str, before=None, after=None, note: str = ""):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "actor_id": actor["id"], "actor_name": actor["name"],
        "actor_role": actor["role"], "action": action, "entity": entity, "entity_id": entity_id,
        "before": before, "after": after, "note": note, "timestamp": now_utc().isoformat(),
    })


async def push_notification(user_id: str, title: str, body: str, link: str = ""):
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": user_id, "title": title, "body": body,
        "link": link, "read": False, "created_at": now_utc().isoformat(),
    })


async def send_email(to_email: str, subject: str, html: str):
    if not RESEND_API_KEY:
        logger.info(f"[email-noop] to={to_email} subject={subject}")
        return
    try:
        async with httpx.AsyncClient(timeout=10) as hx:
            r = await hx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={"from": RESEND_FROM, "to": [to_email], "subject": subject, "html": html},
            )
            if r.status_code >= 400:
                logger.warning(f"resend failed: {r.status_code} {r.text}")
    except Exception as e:
        logger.warning(f"resend error: {e}")


# ===== Models =====
UoMType = Literal["numeric_min", "numeric_max", "percent_min", "percent_max", "timeline", "zero"]
ProgressStatus = Literal["not_started", "on_track", "completed"]
CyclePeriod = Literal["goal_setting", "q1", "q2", "q3", "q4_annual"]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoalIn(BaseModel):
    thrust_area: str
    title: str
    description: str = ""
    uom: UoMType
    target: str
    weightage: float
    deadline: Optional[str] = None


class GoalUpdateIn(BaseModel):
    thrust_area: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    uom: Optional[UoMType] = None
    target: Optional[str] = None
    weightage: Optional[float] = None
    deadline: Optional[str] = None


class CheckinIn(BaseModel):
    goal_id: str
    period: CyclePeriod
    actual: str
    status: ProgressStatus
    note: str = ""


class ManagerCheckinIn(BaseModel):
    goal_id: str
    period: CyclePeriod
    comment: str


class CycleIn(BaseModel):
    period: CyclePeriod
    is_open: bool


class ShareGoalIn(BaseModel):
    source_goal_id: str
    target_user_ids: List[str]
    default_weightage: float = 10.0


class EscalationRuleIn(BaseModel):
    name: str
    condition: Literal["goals_not_submitted", "approval_pending", "checkin_pending"]
    days_threshold: int = 3
    notify_employee: bool = True
    notify_manager: bool = True
    notify_admin: bool = False
    enabled: bool = True


class RejectIn(BaseModel):
    comment: str = ""


class UserCreateIn(BaseModel):
    email: EmailStr
    name: str
    password: str = "Password@123"
    role: Literal["employee", "manager", "admin"]
    manager_id: Optional[str] = None
    department: Optional[str] = "General"


# ===== Scoring =====
def compute_progress(uom: str, target: str, actual: str, deadline: Optional[str]) -> float:
    try:
        if uom == "zero":
            return 100.0 if float(actual or 0) == 0 else 0.0
        if uom == "timeline":
            if not actual or not deadline:
                return 0.0
            a = datetime.fromisoformat(actual).date()
            d = datetime.fromisoformat(deadline).date()
            return 100.0 if a <= d else max(0.0, 100.0 - (a - d).days * 5)
        t = float(target)
        a = float(actual or 0)
        if t == 0:
            return 0.0
        if uom in ("numeric_min", "percent_min"):
            return max(0.0, min(200.0, (a / t) * 100.0))
        if uom in ("numeric_max", "percent_max"):
            if a == 0:
                return 0.0
            return max(0.0, min(200.0, (t / a) * 100.0))
    except Exception:
        return 0.0
    return 0.0


COOKIE_KW = dict(httponly=True, samesite="none", secure=True, max_age=60 * 60 * 12, path="/")


# ===== Auth routes =====
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = create_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", token, **COOKIE_KW)
    return {"token": token, "user": public_user(user)}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# ===== Users =====
@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "manager":
        q = {"$or": [{"manager_id": user["id"]}, {"id": user["id"]}]}
    elif user["role"] == "employee":
        q = {"id": user["id"]}
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


@api.post("/users")
async def create_user(body: UserCreateIn, user: dict = Depends(require_roles("admin"))):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email already exists")
    u = {
        "id": str(uuid.uuid4()), "email": body.email.lower(), "name": body.name, "role": body.role,
        "password_hash": hash_password(body.password), "manager_id": body.manager_id,
        "department": body.department or "General", "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(u)
    await write_audit(user, "user.create", "user", u["id"], after=public_user(u))
    return public_user(u)


# ===== Cycles =====
@api.get("/cycles")
async def list_cycles(user: dict = Depends(get_current_user)):
    cycles = await db.cycles.find({}, {"_id": 0}).to_list(20)
    order = ["goal_setting", "q1", "q2", "q3", "q4_annual"]
    return sorted(cycles, key=lambda c: order.index(c["period"]))


@api.patch("/cycles/{period}")
async def toggle_cycle(period: str, body: CycleIn, user: dict = Depends(require_roles("admin"))):
    if body.period != period:
        raise HTTPException(400, "Period mismatch")
    await db.cycles.update_one(
        {"period": period},
        {"$set": {"period": period, "is_open": body.is_open, "updated_at": now_utc().isoformat()}},
        upsert=True,
    )
    await write_audit(user, "cycle.toggle", "cycle", period, after={"is_open": body.is_open})
    return {"ok": True}


async def is_cycle_open(period: str) -> bool:
    c = await db.cycles.find_one({"period": period})
    return bool(c and c.get("is_open"))


# ===== Goals =====
def _allowed_fields_for_update(user: dict, goal: dict) -> Optional[set]:
    """Return the set of fields the user may patch on a goal, or None if forbidden."""
    role = user["role"]
    if role == "employee":
        if goal["owner_id"] != user["id"]:
            return None
        if goal["status"] in ("approved", "locked"):
            raise HTTPException(400, "Goal is locked. Ask admin to unlock.")
        if goal.get("is_shared"):
            return {"weightage"}
        return {"thrust_area", "title", "description", "uom", "target", "weightage", "deadline"}
    if role == "manager":
        if goal["status"] not in ("submitted", "draft"):
            raise HTTPException(400, "Can only edit during review")
        return {"target", "weightage", "deadline"}
    # admin
    return {"thrust_area", "title", "description", "uom", "target", "weightage", "deadline"}


@api.get("/goals")
async def list_goals(user: dict = Depends(get_current_user), user_id: Optional[str] = None, status: Optional[str] = None):
    q = {}
    if user["role"] == "employee":
        q["owner_id"] = user["id"]
    elif user["role"] == "manager":
        if user_id:
            target = await db.users.find_one({"id": user_id})
            if not target or (target.get("manager_id") != user["id"] and user_id != user["id"]):
                raise HTTPException(403, "Not your report")
            q["owner_id"] = user_id
        else:
            reports = await db.users.find({"manager_id": user["id"]}, {"id": 1, "_id": 0}).to_list(500)
            ids = [r["id"] for r in reports] + [user["id"]]
            q["owner_id"] = {"$in": ids}
    else:
        if user_id:
            q["owner_id"] = user_id
    if status:
        q["status"] = status
    return await db.goals.find(q, {"_id": 0}).sort("created_at", 1).to_list(1000)


@api.post("/goals")
async def create_goal(body: GoalIn, user: dict = Depends(get_current_user)):
    owner_id = user["id"]
    existing = await db.goals.count_documents({"owner_id": owner_id, "status": {"$in": ["draft", "submitted", "approved", "locked"]}})
    if existing >= 8:
        raise HTTPException(400, "Maximum 8 goals allowed")
    if body.weightage < 10:
        raise HTTPException(400, "Minimum weightage per goal is 10%")
    g = {
        "id": str(uuid.uuid4()), "owner_id": owner_id, "thrust_area": body.thrust_area,
        "title": body.title, "description": body.description, "uom": body.uom,
        "target": body.target, "weightage": body.weightage, "deadline": body.deadline,
        "status": "draft", "is_shared": False, "source_goal_id": None, "shared_with": [],
        "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
        "submitted_at": None, "approved_at": None, "approved_by": None, "manager_comment": "",
    }
    await db.goals.insert_one(g)
    g.pop("_id", None)
    await write_audit(user, "goal.create", "goal", g["id"], after={"title": g["title"]})
    return g


@api.patch("/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdateIn, user: dict = Depends(get_current_user)):
    goal = await db.goals.find_one({"id": goal_id}, {"_id": 0})
    if not goal:
        raise HTTPException(404)
    if user["role"] == "manager":
        owner = await db.users.find_one({"id": goal["owner_id"]})
        if not owner or (owner.get("manager_id") != user["id"] and owner["id"] != user["id"]):
            raise HTTPException(403)
    allowed = _allowed_fields_for_update(user, goal)
    if allowed is None:
        raise HTTPException(403)
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if k in allowed and v is not None}
    if "weightage" in patch and patch["weightage"] < 10:
        raise HTTPException(400, "Minimum weightage per goal is 10%")
    patch["updated_at"] = now_utc().isoformat()
    before = {k: goal.get(k) for k in patch}
    await db.goals.update_one({"id": goal_id}, {"$set": patch})
    await write_audit(user, "goal.update", "goal", goal_id, before=before, after=patch)
    if goal["status"] in ("approved", "locked"):
        await write_audit(user, "goal.post_lock_edit", "goal", goal_id, before=before, after=patch, note="Edit after lock")
    return await db.goals.find_one({"id": goal_id}, {"_id": 0})


@api.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(get_current_user)):
    goal = await db.goals.find_one({"id": goal_id})
    if not goal:
        raise HTTPException(404)
    if user["role"] == "employee" and (goal["owner_id"] != user["id"] or goal["status"] != "draft"):
        raise HTTPException(403)
    await db.goals.delete_one({"id": goal_id})
    await write_audit(user, "goal.delete", "goal", goal_id, before={"title": goal["title"]})
    return {"ok": True}


@api.post("/goals/submit")
async def submit_goals(user: dict = Depends(get_current_user)):
    if user["role"] != "employee":
        raise HTTPException(403)
    if not await is_cycle_open("goal_setting"):
        raise HTTPException(400, "Goal-setting cycle is not open")
    goals = await db.goals.find({"owner_id": user["id"], "status": "draft"}).to_list(20)
    if not goals:
        raise HTTPException(400, "No draft goals to submit")
    if len(goals) > 8:
        raise HTTPException(400, "Maximum 8 goals allowed")
    total = sum(g["weightage"] for g in goals)
    if abs(total - 100.0) > 0.01:
        raise HTTPException(400, f"Total weightage must equal 100%. Current: {total}%")
    for g in goals:
        if g["weightage"] < 10:
            raise HTTPException(400, "All goals must have weightage >= 10%")
    ts = now_utc().isoformat()
    await db.goals.update_many(
        {"owner_id": user["id"], "status": "draft"},
        {"$set": {"status": "submitted", "submitted_at": ts}},
    )
    await write_audit(user, "goal.submit", "goal_sheet", user["id"], after={"count": len(goals)})
    me_user = await db.users.find_one({"id": user["id"]})
    if me_user.get("manager_id"):
        mgr = await db.users.find_one({"id": me_user["manager_id"]})
        if mgr:
            await push_notification(mgr["id"], "Goals submitted for review", f"{me_user['name']} submitted {len(goals)} goals.", "/manager")
            await send_email(mgr["email"], "Goals submitted for review",
                             f"<p>Hi {mgr['name']},</p><p><b>{me_user['name']}</b> has submitted {len(goals)} goals for your approval.</p>")
    return {"ok": True, "count": len(goals)}


@api.post("/goals/{goal_id}/approve")
async def approve_goal(goal_id: str, user: dict = Depends(require_roles("manager", "admin"))):
    goal = await db.goals.find_one({"id": goal_id})
    if not goal:
        raise HTTPException(404)
    if user["role"] == "manager":
        owner = await db.users.find_one({"id": goal["owner_id"]})
        if owner.get("manager_id") != user["id"]:
            raise HTTPException(403)
    if goal["status"] not in ("submitted", "draft"):
        raise HTTPException(400, "Goal not in reviewable state")
    await db.goals.update_one({"id": goal_id}, {"$set": {
        "status": "approved", "approved_at": now_utc().isoformat(), "approved_by": user["id"],
    }})
    await write_audit(user, "goal.approve", "goal", goal_id)
    owner = await db.users.find_one({"id": goal["owner_id"]})
    if owner:
        await push_notification(owner["id"], "Goal approved", f"Your goal '{goal['title']}' was approved.", "/employee")
        await send_email(owner["email"], "Goal approved",
                         f"<p>Hi {owner['name']},</p><p>Your goal <b>{goal['title']}</b> has been approved.</p>")
    return {"ok": True}


@api.post("/goals/{goal_id}/reject")
async def reject_goal(goal_id: str, body: RejectIn, user: dict = Depends(require_roles("manager", "admin"))):
    goal = await db.goals.find_one({"id": goal_id})
    if not goal:
        raise HTTPException(404)
    await db.goals.update_one({"id": goal_id}, {"$set": {"status": "draft", "manager_comment": body.comment}})
    await write_audit(user, "goal.reject", "goal", goal_id, note=body.comment)
    owner = await db.users.find_one({"id": goal["owner_id"]})
    if owner:
        await push_notification(owner["id"], "Goal returned for rework", f"'{goal['title']}': {body.comment}", "/employee")
        await send_email(owner["email"], "Goal returned for rework",
                         f"<p>Hi {owner['name']},</p><p>Your goal <b>{goal['title']}</b> was returned for rework.</p><p>{body.comment}</p>")
    return {"ok": True}


@api.post("/goals/{goal_id}/unlock")
async def unlock_goal(goal_id: str, user: dict = Depends(require_roles("admin"))):
    goal = await db.goals.find_one({"id": goal_id})
    if not goal:
        raise HTTPException(404)
    await db.goals.update_one({"id": goal_id}, {"$set": {"status": "draft"}})
    await write_audit(user, "goal.unlock", "goal", goal_id, note="Admin unlocked goal")
    return {"ok": True}


@api.post("/goals/share")
async def share_goal(body: ShareGoalIn, user: dict = Depends(require_roles("manager", "admin"))):
    src = await db.goals.find_one({"id": body.source_goal_id})
    if not src:
        raise HTTPException(404, "Source goal not found")
    created = []
    for uid in body.target_user_ids:
        target = await db.users.find_one({"id": uid})
        if not target:
            continue
        existing = await db.goals.find_one({"source_goal_id": src["id"], "owner_id": uid})
        if existing:
            continue
        g = {
            "id": str(uuid.uuid4()), "owner_id": uid, "thrust_area": src["thrust_area"],
            "title": src["title"], "description": src.get("description", ""), "uom": src["uom"],
            "target": src["target"], "weightage": body.default_weightage, "deadline": src.get("deadline"),
            "status": "draft", "is_shared": True, "source_goal_id": src["id"],
            "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            "submitted_at": None, "approved_at": None, "approved_by": None, "manager_comment": "",
        }
        await db.goals.insert_one(g)
        created.append(uid)
        await push_notification(uid, "Shared goal assigned", f"'{src['title']}' was assigned to you (read-only target).", "/employee")
    await db.goals.update_one({"id": src["id"]}, {"$addToSet": {"shared_with": {"$each": created}}})
    await write_audit(user, "goal.share", "goal", src["id"], after={"shared_with": created})
    return {"ok": True, "shared_with": created}


# ===== Check-ins =====
async def _mirror_to_shared(parent_goal: dict, period: str, doc: dict, ts: str):
    children = await db.goals.find({"source_goal_id": parent_goal["id"]}).to_list(100)
    for ch in children:
        mirror = {**doc, "goal_id": ch["id"], "owner_id": ch["owner_id"], "note": f"[Synced] {doc.get('note', '')}"}
        existing = await db.checkins.find_one({"goal_id": ch["id"], "period": period})
        if existing:
            await db.checkins.update_one({"_id": existing["_id"]}, {"$set": mirror})
        else:
            mirror["id"] = str(uuid.uuid4())
            mirror["created_at"] = ts
            await db.checkins.insert_one(mirror)


@api.post("/checkins")
async def upsert_checkin(body: CheckinIn, user: dict = Depends(get_current_user)):
    goal = await db.goals.find_one({"id": body.goal_id})
    if not goal:
        raise HTTPException(404)
    if user["role"] == "employee" and goal["owner_id"] != user["id"]:
        raise HTTPException(403)
    if not await is_cycle_open(body.period):
        raise HTTPException(400, f"{body.period} window is not open")

    progress = compute_progress(goal["uom"], goal["target"], body.actual, goal.get("deadline"))
    ts = now_utc().isoformat()
    doc = {
        "goal_id": body.goal_id, "owner_id": goal["owner_id"], "period": body.period,
        "actual": body.actual, "status": body.status, "note": body.note, "progress": progress,
        "updated_at": ts, "updated_by": user["id"],
    }
    existing = await db.checkins.find_one({"goal_id": body.goal_id, "period": body.period})
    if existing:
        await db.checkins.update_one({"_id": existing["_id"]}, {"$set": doc})
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = ts
        await db.checkins.insert_one(doc)
    await write_audit(user, "checkin.update", "checkin", f"{body.goal_id}:{body.period}",
                      after={"actual": body.actual, "status": body.status})
    if not goal.get("source_goal_id"):
        await _mirror_to_shared(goal, body.period, doc, ts)
    return await db.checkins.find_one({"goal_id": body.goal_id, "period": body.period}, {"_id": 0})


@api.get("/checkins")
async def list_checkins(user: dict = Depends(get_current_user), owner_id: Optional[str] = None, period: Optional[str] = None):
    q = {}
    if user["role"] == "employee":
        q["owner_id"] = user["id"]
    elif user["role"] == "manager":
        reports = await db.users.find({"manager_id": user["id"]}, {"id": 1, "_id": 0}).to_list(500)
        ids = [r["id"] for r in reports] + [user["id"]]
        if owner_id:
            if owner_id not in ids:
                raise HTTPException(403)
            q["owner_id"] = owner_id
        else:
            q["owner_id"] = {"$in": ids}
    else:
        if owner_id:
            q["owner_id"] = owner_id
    if period:
        q["period"] = period
    return await db.checkins.find(q, {"_id": 0}).to_list(2000)


@api.post("/checkins/manager-comment")
async def manager_checkin_comment(body: ManagerCheckinIn, user: dict = Depends(require_roles("manager", "admin"))):
    goal = await db.goals.find_one({"id": body.goal_id})
    if not goal:
        raise HTTPException(404)
    existing = await db.checkins.find_one({"goal_id": body.goal_id, "period": body.period})
    if not existing:
        raise HTTPException(400, "No employee check-in yet")
    await db.checkins.update_one(
        {"_id": existing["_id"]},
        {"$set": {"manager_comment": body.comment, "manager_comment_by": user["id"], "manager_comment_at": now_utc().isoformat()}},
    )
    await write_audit(user, "checkin.manager_comment", "checkin", f"{body.goal_id}:{body.period}", after={"comment": body.comment})
    await push_notification(goal["owner_id"], "Manager feedback on check-in", body.comment[:120], "/employee")
    return {"ok": True}


# ===== Reports =====
@api.get("/reports/achievement.csv")
async def achievement_csv(user: dict = Depends(require_roles("manager", "admin"))):
    goals = await db.goals.find({}, {"_id": 0}).to_list(5000)
    checkins = await db.checkins.find({}, {"_id": 0}).to_list(5000)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    umap = {u["id"]: u for u in users}
    cmap = {(c["goal_id"], c["period"]): c for c in checkins}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Employee", "Email", "Thrust Area", "Goal", "UoM", "Target", "Weightage",
                "Q1 Actual", "Q1 %", "Q2 Actual", "Q2 %", "Q3 Actual", "Q3 %", "Q4 Actual", "Q4 %", "Status"])
    for g in goals:
        u = umap.get(g["owner_id"], {})
        row = [u.get("name", ""), u.get("email", ""), g["thrust_area"], g["title"], g["uom"], g["target"], g["weightage"]]
        for p in ["q1", "q2", "q3", "q4_annual"]:
            c = cmap.get((g["id"], p))
            row.append(c["actual"] if c else "")
            row.append(round(c["progress"], 1) if c else "")
        row.append(g["status"])
        w.writerow(row)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=achievement_report.csv"})


@api.get("/reports/completion")
async def completion_dashboard(user: dict = Depends(get_current_user)):
    users = await db.users.find({"role": "employee"}, {"_id": 0, "password_hash": 0}).to_list(500)
    rows = []
    for u in users:
        goals = await db.goals.find({"owner_id": u["id"], "status": {"$in": ["approved", "locked"]}}).to_list(20)
        for period in ["q1", "q2", "q3", "q4_annual"]:
            total = len(goals)
            done = 0
            for g in goals:
                if await db.checkins.find_one({"goal_id": g["id"], "period": period}):
                    done += 1
            rows.append({"employee_id": u["id"], "employee_name": u["name"], "department": u.get("department"),
                         "period": period, "total_goals": total, "checked_in": done,
                         "pct": round(done / total * 100, 1) if total else 0})
    return rows


# ===== Audit =====
@api.get("/audit")
async def audit_list(user: dict = Depends(require_roles("admin", "manager")), entity_id: Optional[str] = None, limit: int = 200):
    q = {}
    if entity_id:
        q["entity_id"] = entity_id
    return await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)


# ===== Analytics (refactored into helpers) =====
def _qoq_trend(checkins: list) -> dict:
    out = {}
    for p in ["q1", "q2", "q3", "q4_annual"]:
        cs = [c for c in checkins if c["period"] == p]
        out[p] = round(sum(c["progress"] for c in cs) / len(cs), 1) if cs else 0
    return out


def _distributions(goals: list, checkins: list) -> dict:
    thrust, status_d, uom_d = {}, {}, {}
    for g in goals:
        thrust[g["thrust_area"]] = thrust.get(g["thrust_area"], 0) + 1
        uom_d[g["uom"]] = uom_d.get(g["uom"], 0) + 1
    for c in checkins:
        status_d[c["status"]] = status_d.get(c["status"], 0) + 1
    return {"thrust_distribution": thrust, "status_distribution": status_d, "uom_distribution": uom_d}


def _manager_effectiveness(users: list, checkins: list) -> list:
    managers = [u for u in users if u["role"] == "manager"]
    out = []
    for m in managers:
        rep_ids = [u["id"] for u in users if u.get("manager_id") == m["id"]]
        my_total = [c for c in checkins if c["owner_id"] in rep_ids]
        my_commented = [c for c in my_total if c.get("manager_comment")]
        out.append({
            "manager": m["name"], "reports": len(rep_ids), "checkins_total": len(my_total),
            "comments_given": len(my_commented),
            "pct": round(len(my_commented) / len(my_total) * 100, 1) if my_total else 0,
        })
    return out


def _heatmap(users: list, checkins: list) -> list:
    out = []
    for u in [x for x in users if x["role"] == "employee"]:
        row = {"employee": u["name"], "employee_id": u["id"]}
        for p in ["q1", "q2", "q3", "q4_annual"]:
            cs = [c for c in checkins if c["owner_id"] == u["id"] and c["period"] == p]
            row[p] = round(sum(c["progress"] for c in cs) / len(cs), 1) if cs else 0
        out.append(row)
    return out


@api.get("/analytics/summary")
async def analytics_summary(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    goals = await db.goals.find({}, {"_id": 0}).to_list(2000)
    checkins = await db.checkins.find({}, {"_id": 0}).to_list(5000)
    dist = _distributions(goals, checkins)
    return {
        "totals": {
            "users": len(users),
            "goals": len(goals),
            "approved_goals": sum(1 for g in goals if g["status"] in ("approved", "locked")),
            "checkins": len(checkins),
        },
        "qoq": _qoq_trend(checkins),
        **dist,
        "manager_effectiveness": _manager_effectiveness(users, checkins),
        "heatmap": _heatmap(users, checkins),
    }


# ===== Notifications =====
@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    return await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ===== Escalation (refactored) =====
@api.get("/escalation/rules")
async def list_rules(user: dict = Depends(require_roles("admin"))):
    return await db.escalation_rules.find({}, {"_id": 0}).to_list(50)


@api.post("/escalation/rules")
async def upsert_rule(body: EscalationRuleIn, user: dict = Depends(require_roles("admin"))):
    rule = body.model_dump()
    rule["id"] = str(uuid.uuid4())
    rule["created_at"] = now_utc().isoformat()
    await db.escalation_rules.insert_one(rule)
    return {k: v for k, v in rule.items() if k != "_id"}


@api.delete("/escalation/rules/{rid}")
async def delete_rule(rid: str, user: dict = Depends(require_roles("admin"))):
    await db.escalation_rules.delete_one({"id": rid})
    return {"ok": True}


@api.get("/escalation/log")
async def escalation_log(user: dict = Depends(require_roles("admin"))):
    return await db.escalation_log.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)


async def _log_escalation(rule: dict, user_id: str, message: str, ts: str):
    await db.escalation_log.insert_one({
        "id": str(uuid.uuid4()), "rule": rule["name"], "user_id": user_id,
        "message": message, "created_at": ts,
    })


async def _esc_goals_not_submitted(rule: dict, ts: str) -> int:
    fired = 0
    employees = await db.users.find({"role": "employee"}).to_list(500)
    for e in employees:
        subs = await db.goals.count_documents({"owner_id": e["id"], "status": {"$in": ["submitted", "approved", "locked"]}})
        if subs > 0:
            continue
        msg = f"{e['name']} has not submitted any goals."
        await _log_escalation(rule, e["id"], msg, ts)
        if rule.get("notify_employee"):
            await push_notification(e["id"], "Action required: Submit goals", msg, "/employee")
        fired += 1
    return fired


async def _esc_approval_pending(rule: dict, ts: str) -> int:
    fired = 0
    pending = await db.goals.find({"status": "submitted"}).to_list(500)
    seen = set()
    for g in pending:
        if g["owner_id"] in seen:
            continue
        seen.add(g["owner_id"])
        owner = await db.users.find_one({"id": g["owner_id"]})
        if not owner or not owner.get("manager_id"):
            continue
        await _log_escalation(rule, owner["manager_id"], f"Approval pending for {owner['name']}", ts)
        if rule.get("notify_manager"):
            await push_notification(owner["manager_id"], "Approval pending",
                                    f"You have pending approvals for {owner['name']}.", "/manager")
        fired += 1
    return fired


async def _esc_checkin_pending(rule: dict, ts: str) -> int:
    open_cycle = None
    for p in ["q1", "q2", "q3", "q4_annual"]:
        if await is_cycle_open(p):
            open_cycle = p
            break
    if not open_cycle:
        return 0
    fired = 0
    employees = await db.users.find({"role": "employee"}).to_list(500)
    for e in employees:
        goals_e = await db.goals.find({"owner_id": e["id"], "status": {"$in": ["approved", "locked"]}}).to_list(20)
        if not goals_e:
            continue
        done = await db.checkins.count_documents({"owner_id": e["id"], "period": open_cycle})
        if done >= len(goals_e):
            continue
        msg = f"{e['name']} has not completed {open_cycle} check-in."
        await _log_escalation(rule, e["id"], msg, ts)
        if rule.get("notify_employee"):
            await push_notification(e["id"], "Check-in pending", msg, "/employee")
        fired += 1
    return fired


ESCALATION_HANDLERS = {
    "goals_not_submitted": _esc_goals_not_submitted,
    "approval_pending": _esc_approval_pending,
    "checkin_pending": _esc_checkin_pending,
}


@api.post("/escalation/run")
async def run_escalation(user: dict = Depends(require_roles("admin"))):
    ts = now_utc().isoformat()
    rules = await db.escalation_rules.find({"enabled": True}).to_list(50)
    fired = 0
    for rule in rules:
        handler = ESCALATION_HANDLERS.get(rule["condition"])
        if handler:
            fired += await handler(rule, ts)
    return {"ok": True, "fired": fired}


@api.get("/")
async def root():
    return {"app": "AtomQuest Goals", "status": "ok"}


app.include_router(api)
# CORS: wildcard with NO credentials → never fails preflight, works in any iframe/embed.
# Auth is JWT Bearer-token only (in Authorization header), so cookies are unnecessary.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ===== Startup / Seed (refactored) =====
SEED_MANAGERS = [
    {"email": "manager1@atomquest.io", "name": "Arjun Mehta", "department": "Sales",
     "avatar_url": "https://images.unsplash.com/photo-1685760259914-ee8d2c92d2e0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3ODgzMjI4M3ww&ixlib=rb-4.1.0&q=85"},
    {"email": "manager2@atomquest.io", "name": "Sneha Iyer", "department": "Operations",
     "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBjb3Jwb3JhdGUlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3ODgzMjI4M3ww&ixlib=rb-4.1.0&q=85"},
]
SEED_EMPLOYEES = [
    ("emp1@atomquest.io", "Vikram Singh", "Sales", "manager1@atomquest.io"),
    ("emp2@atomquest.io", "Priya Sharma", "Sales", "manager1@atomquest.io"),
    ("emp3@atomquest.io", "Rohan Verma", "Sales", "manager1@atomquest.io"),
    ("emp4@atomquest.io", "Anjali Nair", "Operations", "manager2@atomquest.io"),
    ("emp5@atomquest.io", "Kunal Joshi", "Operations", "manager2@atomquest.io"),
]
SEED_GOALS = {
    "emp1@atomquest.io": [
        ("Revenue Growth", "Achieve Q-end sales revenue", "numeric_min", "5000000", 40, "approved"),
        ("Customer Excellence", "Maintain CSAT score", "percent_min", "90", 25, "approved"),
        ("Operational Efficiency", "Reduce response time (hrs)", "numeric_max", "4", 20, "approved"),
        ("Safety & Compliance", "Zero compliance breaches", "zero", "0", 15, "approved"),
    ],
    "emp2@atomquest.io": [
        ("Revenue Growth", "New client acquisitions", "numeric_min", "12", 35, "approved"),
        ("Customer Excellence", "NPS uplift", "numeric_min", "70", 30, "approved"),
        ("Talent Development", "Training hours completed", "numeric_min", "40", 20, "submitted"),
        ("Innovation", "Submit 2 process ideas", "numeric_min", "2", 15, "submitted"),
    ],
    "emp3@atomquest.io": [
        ("Revenue Growth", "Sales pipeline coverage", "percent_min", "300", 50, "draft"),
        ("Operational Efficiency", "Reduce avg deal cycle (days)", "numeric_max", "30", 30, "draft"),
        ("Customer Excellence", "Onboard 5 new accounts", "numeric_min", "5", 20, "draft"),
    ],
    "emp4@atomquest.io": [
        ("Operational Efficiency", "Reduce process TAT (hrs)", "numeric_max", "8", 40, "approved"),
        ("Safety & Compliance", "Zero safety incidents", "zero", "0", 30, "approved"),
        ("Innovation", "Automate 3 workflows", "numeric_min", "3", 30, "approved"),
    ],
    "emp5@atomquest.io": [
        ("Operational Efficiency", "Cost reduction %", "percent_min", "12", 45, "approved"),
        ("Talent Development", "Mentor 2 juniors", "numeric_min", "2", 25, "approved"),
        ("Customer Excellence", "Resolve escalations (max)", "numeric_max", "3", 30, "approved"),
    ],
}
SEED_Q1 = {
    ("emp1@atomquest.io", "Achieve Q-end sales revenue"): ("3200000", "on_track"),
    ("emp1@atomquest.io", "Maintain CSAT score"): ("92", "completed"),
    ("emp1@atomquest.io", "Reduce response time (hrs)"): ("5", "on_track"),
    ("emp1@atomquest.io", "Zero compliance breaches"): ("0", "completed"),
    ("emp2@atomquest.io", "New client acquisitions"): ("4", "on_track"),
    ("emp2@atomquest.io", "NPS uplift"): ("65", "on_track"),
    ("emp4@atomquest.io", "Reduce process TAT (hrs)"): ("9", "on_track"),
    ("emp4@atomquest.io", "Zero safety incidents"): ("0", "completed"),
    ("emp4@atomquest.io", "Automate 3 workflows"): ("1", "on_track"),
    ("emp5@atomquest.io", "Cost reduction %"): ("8", "on_track"),
    ("emp5@atomquest.io", "Mentor 2 juniors"): ("1", "on_track"),
    ("emp5@atomquest.io", "Resolve escalations (max)"): ("2", "completed"),
}
SEED_RULES = [
    {"name": "Submit goals reminder", "condition": "goals_not_submitted", "days_threshold": 3,
     "notify_employee": True, "notify_manager": True, "notify_admin": False, "enabled": True},
    {"name": "Manager approval reminder", "condition": "approval_pending", "days_threshold": 3,
     "notify_employee": False, "notify_manager": True, "notify_admin": True, "enabled": True},
    {"name": "Check-in reminder", "condition": "checkin_pending", "days_threshold": 2,
     "notify_employee": True, "notify_manager": True, "notify_admin": False, "enabled": True},
]


async def _seed_admin():
    email = os.environ["ADMIN_EMAIL"]
    pwd = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": email, "name": "Riya Kapoor", "role": "admin",
            "password_hash": hash_password(pwd), "department": "Human Resources",
            "manager_id": None, "created_at": now_utc().isoformat(),
            "avatar_url": "https://images.pexels.com/photos/14589344/pexels-photo-14589344.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        })
    elif not verify_password(pwd, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd)}})


async def _seed_managers_and_employees() -> dict:
    mgr_ids, emp_ids = {}, {}
    for m in SEED_MANAGERS:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid, "email": m["email"], "name": m["name"], "role": "manager",
            "password_hash": hash_password("Password@123"), "manager_id": None,
            "department": m["department"], "avatar_url": m["avatar_url"],
            "created_at": now_utc().isoformat(),
        })
        mgr_ids[m["email"]] = uid
    for email, name, dept, mgr_email in SEED_EMPLOYEES:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid, "email": email, "name": name, "role": "employee",
            "password_hash": hash_password("Password@123"),
            "manager_id": mgr_ids[mgr_email], "department": dept,
            "avatar_url": None, "created_at": now_utc().isoformat(),
        })
        emp_ids[email] = uid
    return {"managers": mgr_ids, "employees": emp_ids}


async def _seed_cycles():
    defaults = [("goal_setting", True), ("q1", True), ("q2", False), ("q3", False), ("q4_annual", False)]
    for period, is_open in defaults:
        await db.cycles.update_one(
            {"period": period},
            {"$set": {"period": period, "is_open": is_open, "updated_at": now_utc().isoformat()}},
            upsert=True,
        )


async def _seed_goals(ids: dict) -> dict:
    """Returns lookup {(email, title): goal_id}."""
    lookup = {}
    mgr_id = ids["managers"]["manager1@atomquest.io"]
    for email, gs in SEED_GOALS.items():
        owner = ids["employees"][email]
        for ta, title, uom, target, weight, status in gs:
            gid = str(uuid.uuid4())
            lookup[(email, title)] = gid
            await db.goals.insert_one({
                "id": gid, "owner_id": owner, "thrust_area": ta, "title": title,
                "description": f"Auto-seeded goal: {title}",
                "uom": uom, "target": target, "weightage": weight,
                "deadline": (date.today() + timedelta(days=180)).isoformat() if uom == "timeline" else None,
                "status": status, "is_shared": False, "source_goal_id": None, "shared_with": [],
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
                "submitted_at": now_utc().isoformat() if status in ("submitted", "approved") else None,
                "approved_at": now_utc().isoformat() if status == "approved" else None,
                "approved_by": mgr_id if status == "approved" else None,
                "manager_comment": "",
            })
    return lookup


async def _seed_q1_checkins(goal_lookup: dict):
    for (email, title), (actual, status) in SEED_Q1.items():
        gid = goal_lookup.get((email, title))
        if not gid:
            continue
        g = await db.goals.find_one({"id": gid})
        prog = compute_progress(g["uom"], g["target"], actual, g.get("deadline"))
        await db.checkins.insert_one({
            "id": str(uuid.uuid4()), "goal_id": gid, "owner_id": g["owner_id"], "period": "q1",
            "actual": actual, "status": status, "note": "Auto-seeded Q1 update",
            "progress": prog, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            "updated_by": g["owner_id"],
        })


async def _seed_rules():
    for r in SEED_RULES:
        record = {**r, "id": str(uuid.uuid4()), "created_at": now_utc().isoformat()}
        await db.escalation_rules.insert_one(record)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.goals.create_index("owner_id")
    await db.checkins.create_index([("goal_id", 1), ("period", 1)])
    await db.audit_logs.create_index("entity_id")
    await db.notifications.create_index("user_id")
    await _seed_admin()
    if await db.users.count_documents({"role": "manager"}) >= 2:
        return
    ids = await _seed_managers_and_employees()
    await _seed_cycles()
    goal_lookup = await _seed_goals(ids)
    await _seed_q1_checkins(goal_lookup)
    await _seed_rules()
    logger.info("Demo data seeded.")
