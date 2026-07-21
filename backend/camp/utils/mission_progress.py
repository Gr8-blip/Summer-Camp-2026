from django.db.models import F
from camp.models import Lesson, StudentAttendance, MissionCompletion, XPLog


def mission_progress(student, mission):
    """
    Returns {"total": int, "completed": int, "is_complete": bool}
    A lesson counts as "completed" for this student if they have ANY
    StudentAttendance row for it. Only published lessons count toward the
    total (a mission can't be blocked from completing by a draft lesson).
    """
    lessons = Lesson.objects.filter(mission=mission, is_published=True)
    total = lessons.count()
    if total == 0:
        return {"total": 0, "completed": 0, "is_complete": False}

    attended_lesson_ids = set(
        StudentAttendance.objects
        .filter(student=student, lesson__in=lessons)
        .values_list("lesson_id", flat=True)
        .distinct()
    )
    completed = len(attended_lesson_ids)
    return {"total": total, "completed": completed, "is_complete": completed >= total}


def check_and_award_mission_completion(student, mission):
    """
    Call this after every attendance submission (for the lesson's mission).
    Idempotent — safe to call as often as you like. Returns the
    MissionCompletion row if this call is what triggered the award,
    otherwise None (already awarded, or not complete yet).
    """
    if MissionCompletion.objects.filter(student=student, mission=mission).exists():
        return None

    progress = mission_progress(student, mission)
    if not progress["is_complete"]:
        return None

    completion = MissionCompletion.objects.create(
        student=student, mission=mission, xp_awarded=mission.xp_reward
    )
    student.xp = F('xp') + mission.xp_reward
    student.save(update_fields=['xp'])
    XPLog.objects.create(
        student=student, amount=mission.xp_reward,
        reason=f"Mission complete: {mission.title}"
    )
    student.refresh_from_db(fields=['xp'])
    return completion