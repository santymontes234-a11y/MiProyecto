"""Puntos, niveles, logros y ranking (contrato §9). Todo se calcula en el backend.

- Puntos de un usuario = Σ trips.points (COMPLETED) + Σ user_achievements.bonus_points (congelados).
- Logros: se evalúan al crear, editar o generar viajes, en la misma transacción; cada logro nuevo crea
  una notificación ACHIEVEMENT_UNLOCKED. No se retiran al borrar viajes (lo ganado se conserva).
- Ranking: top 50, solo usuarios con `ranking_opt_in`; `display_name` = primer nombre + inicial.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    AchievementCriterion,
    NotificationType,
    RankingPeriod,
    Trip,
    TripStatus,
    User,
    UserAchievement,
)
from app.services import notifications

# Configuración versionada de niveles (puntos con los que empieza cada nivel; nivel = índice + 1).
LEVELS_VERSION = "2026-11-16"
LEVEL_THRESHOLDS = [0, 250, 500, 1000, 1500, 2500, 4000, 6000, 9000, 13000]
RANKING_SIZE = 50
TZ = ZoneInfo("America/Mexico_City")


def totals(db: Session, user_id: uuid.UUID) -> dict[AchievementCriterion, float]:
    count, dist, saved, modes = db.execute(
        select(func.count(), func.coalesce(func.sum(Trip.distance_m), 0.0),
               func.coalesce(func.sum(Trip.co2_saved_g), 0.0), func.count(func.distinct(Trip.mode)))
        .where(Trip.user_id == user_id, Trip.status == TripStatus.COMPLETED)
    ).one()
    return {
        AchievementCriterion.TRIPS_COUNT: float(count),
        AchievementCriterion.DISTANCE_M: float(dist),
        AchievementCriterion.CO2_SAVED_G: float(saved),
        AchievementCriterion.DISTINCT_MODES: float(modes),
    }


def evaluate(db: Session, user_id: uuid.UUID) -> list[Achievement]:
    """Otorga los logros alcanzados. No hace commit (lo hace quien llama)."""
    db.flush()
    current = totals(db, user_id)
    owned = select(UserAchievement.achievement_id).where(UserAchievement.user_id == user_id)
    pending = db.execute(
        select(Achievement).where(Achievement.is_active.is_(True), Achievement.id.not_in(owned))
    ).scalars().all()
    awarded: list[Achievement] = []
    for ach in pending:
        if current[AchievementCriterion(ach.criterion)] < ach.threshold:
            continue
        # ON CONFLICT DO NOTHING: dos peticiones concurrentes no otorgan el logro dos veces.
        inserted = db.execute(
            insert(UserAchievement)
            .values(id=uuid.uuid4(), user_id=user_id, achievement_id=ach.id, bonus_points=ach.bonus_points)
            .on_conflict_do_nothing(constraint="uq_user_achievements_user_achievement")
            .returning(UserAchievement.id)
        ).first()
        if inserted is None:
            continue
        notifications.create(db, user_id, NotificationType.ACHIEVEMENT_UNLOCKED, "¡Nuevo logro!",
                             f"Desbloqueaste «{ach.name}»", {"achievement_code": ach.code})
        awarded.append(ach)
    return awarded


def user_achievements(db: Session, user_id: uuid.UUID) -> list[dict[str, Any]]:
    current = totals(db, user_id)
    awarded = dict(db.execute(
        select(UserAchievement.achievement_id, UserAchievement.awarded_at).where(UserAchievement.user_id == user_id)
    ).all())
    rows = db.execute(
        select(Achievement).where(Achievement.is_active.is_(True)).order_by(Achievement.threshold, Achievement.code)
    ).scalars()
    out = []
    for ach in rows:
        value = current[AchievementCriterion(ach.criterion)]
        out.append({"achievement": ach, "awarded_at": awarded.get(ach.id),
                    "progress": min(value, float(ach.threshold))})
    return out


def points_total(db: Session, user_id: uuid.UUID) -> int:
    trips = db.execute(
        select(func.coalesce(func.sum(Trip.points), 0))
        .where(Trip.user_id == user_id, Trip.status == TripStatus.COMPLETED)
    ).scalar_one()
    bonus = db.execute(
        select(func.coalesce(func.sum(UserAchievement.bonus_points), 0)).where(UserAchievement.user_id == user_id)
    ).scalar_one()
    return int(trips) + int(bonus)


def level_for(points: int) -> tuple[int, int, int | None]:
    level = 1
    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if points >= threshold:
            level = i + 1
    nxt = LEVEL_THRESHOLDS[level] if level < len(LEVEL_THRESHOLDS) else None
    return level, LEVEL_THRESHOLDS[level - 1], nxt


def profile(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    pts = points_total(db, user_id)
    level, start, nxt = level_for(pts)
    return {"points_total": pts, "level": level, "level_points": start, "next_level_points": nxt}


def display_name(full_name: str) -> str:
    parts = full_name.split()
    if not parts:
        return "Usuario"
    first = parts[0]
    return f"{first} {parts[1][0].upper()}." if len(parts) > 1 else first


def period_start(period: RankingPeriod, now: datetime | None = None) -> datetime | None:
    if period == RankingPeriod.ALL:
        return None
    local = (now or datetime.now(UTC)).astimezone(TZ)
    day = local.replace(hour=0, minute=0, second=0, microsecond=0)
    start = day - timedelta(days=day.weekday()) if period == RankingPeriod.WEEK else day.replace(day=1)
    return start.astimezone(UTC)


def ranking(db: Session, me: User, period: RankingPeriod) -> dict[str, Any]:
    start = period_start(period)
    trip_conds = [Trip.status == TripStatus.COMPLETED]
    bonus_conds = []
    if start is not None:
        trip_conds.append(Trip.started_at >= start)
        bonus_conds.append(UserAchievement.awarded_at >= start)
    trip_pts = (select(Trip.user_id.label("uid"), func.sum(Trip.points).label("pts"))
                .where(*trip_conds).group_by(Trip.user_id))
    bonus_pts = (select(UserAchievement.user_id.label("uid"), func.sum(UserAchievement.bonus_points).label("pts"))
                 .where(*bonus_conds).group_by(UserAchievement.user_id))
    union = trip_pts.union_all(bonus_pts).subquery()
    per_user = (select(union.c.uid, func.sum(union.c.pts).label("points")).group_by(union.c.uid)).subquery()
    ranked = (
        select(User.id, User.full_name, per_user.c.points,
               func.rank().over(order_by=per_user.c.points.desc()).label("position"))
        .join(per_user, per_user.c.uid == User.id)
        .where(User.ranking_opt_in.is_(True), User.is_active.is_(True), per_user.c.points > 0)
    ).subquery()
    rows = db.execute(select(ranked).order_by(ranked.c.position, ranked.c.id).limit(RANKING_SIZE)).all()
    entries = [{"position": int(r.position), "display_name": display_name(r.full_name), "points": int(r.points),
                "is_me": r.id == me.id} for r in rows]
    mine = None
    if me.ranking_opt_in:
        row = db.execute(select(ranked.c.position, ranked.c.points).where(ranked.c.id == me.id)).first()
        mine = {"position": int(row.position), "points": int(row.points)} if row else None
    return {"period": period, "period_start": start, "entries": entries, "me": mine}
