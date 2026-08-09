from rest_framework.generics import ListAPIView, get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import (
    Badge, StudentBadge, Lesson, Mission, Assignment, AssignmentAttempt, Challenge, Submission,
    ChallengeAttempt,
)
from ...serializers import StudentBadgeSerializer
from ...utils.achievements import (
    countable_lessons,
    countable_assignments,
    mission_quests_and_challenges_complete,
)


# Badge model only stores name/icon/rarity — the human-readable requirement
# text isn't in the DB, so it's kept here in one place, matching the badge
# requirements table.
BADGE_REQUIREMENTS = {
    "First Steps": "Log in for the first time.",
    "Class Explorer": "Visit every lesson page at least once.",
    "Learning Begins": "Complete your first lesson (attendance for one lesson).",
    "Quest Complete": "Complete your first quest.",
    "Challenge Accepted": "Complete your first challenge.",
    "Puzzle Solver": "Complete your first puzzle game of any type.",
    "Prompt Apprentice": "Complete your first Prompt Builder puzzle.",
    "Present & Ready": "Attend your first live lesson.",
    "XP Hunter": "Reach 100 XP.",
    "Rising Star": "Reach 500 XP.",
    "Consistency": "Attend every live lesson.",
    "Attendance Hero": "Complete every quest and challenge in 2 missions.",
    "Boss Slayer": "Complete 5 challenges.",
    "Challenge Conqueror": "Complete 5 challenges.",
    "Perfect Score": "Score 100% in any challenge.",
    "Speed Runner": "Finish a challenge in under 50% of its time limit.",
    "Coding Cadet": "Complete every quest in a single mission.",
    "Code Cracker": "Complete your first coding quest.",
    "Flawless Victory": "Complete a quest on your first attempt with 100% accuracy.",
    "Flawless Coder": "Score 100% on a coding quest on your first try.",
    "AI Explorer": "Reach 1000 XP.",
    "Puzzle Master": "Complete every puzzle type at least once.",
    "Challenge Champion": "Complete every challenge in the camp.",
    "Mission Completionist": "Achieve 100% completion of an entire mission — every lesson attended and every quest completed.",
    "AI Master": "Complete every lesson and finish every quest in the camp.",
    "Ultimate Challenger": "Earn a perfect score (100%) on at least 3 different challenges.",
    "Legend": "Collect every Common, Rare, and Epic badge.",
    "Hall of Fame": "Finish #1 on the leaderboard for a challenge.",
    "Future Innovator": "Reach 2000 XP.",
}


class StudentBadgeListView(ListAPIView):
    """Kept for backward compatibility — list of only the badges the
    student has already earned."""
    permission_classes = [IsAuthenticated]
    serializer_class = StudentBadgeSerializer

    def get_queryset(self):
        return (
            StudentBadge.objects
            .filter(student=self.request.user.student)
            .order_by("-earned_at")
        )


def _progress_for(badge, student, ctx):
    """
    Returns a dict {current, target, label} describing progress toward
    a badge, or None if there's no meaningful numeric progress to show
    (e.g. one-off unlocks like Hall of Fame, Flawless Victory, or
    Mission Completionist).
    """
    name = badge.name

    if name == "XP Hunter":
        return {"current": min(student.xp, 100), "target": 100, "label": "XP"}
    if name == "Rising Star":
        return {"current": min(student.xp, 500), "target": 500, "label": "XP"}
    if name == "AI Explorer":
        return {"current": min(student.xp, 1000), "target": 1000, "label": "XP"}
    if name == "Future Innovator":
        return {"current": min(student.xp, 2000), "target": 2000, "label": "XP"}

    if name == "Consistency":
        return {
            "current": min(ctx["attended_lessons"], ctx["total_lessons"]),
            "target": ctx["total_lessons"],
            "label": "Lessons",
        }
    if name == "Attendance Hero":
        return {
            "current": min(ctx["missions_completed"], 2),
            "target": 2,
            "label": "Missions",
        }
    if name == "Learning Begins":
        return {
            "current": min(ctx["attended_lessons"], 1),
            "target": 1,
            "label": "Lessons",
        }
    if name == "Present & Ready":
        return {
            "current": min(ctx["attendance_count"], 1),
            "target": 1,
            "label": "Attendance",
        }

    if name == "Coding Cadet":
        return {
            "current": min(ctx["best_mission_submission_ratio"][0], ctx["best_mission_submission_ratio"][1]),
            "target": ctx["best_mission_submission_ratio"][1],
            "label": "Assignments (best mission)",
        }

    if name == "Challenge Accepted":
        return {"current": min(ctx["attempt_count"], 1), "target": 1, "label": "Challenges"}
    if name in ("Challenge Conqueror", "Boss Slayer"):
        return {"current": min(ctx["attempt_count"], 5), "target": 5, "label": "Challenges"}
    if name == "Challenge Champion":
        return {
            "current": min(ctx["completed_attempt_count"], ctx["total_challenges"]),
            "target": ctx["total_challenges"],
            "label": "Challenges",
        }
    if name == "Ultimate Challenger":
        return {
            "current": min(ctx["perfect_score_count"], 3),
            "target": 3,
            "label": "Perfect Scores",
        }

    if name == "AI Master":
        # Multi-part progress — surfaced as a combined string on the frontend.
        return {
            "current": min(ctx["attended_lessons"], ctx["total_lessons"]),
            "target": ctx["total_lessons"],
            "label": "Lessons",
            "secondary": {
                "current": min(ctx["submitted_assignment_count"], ctx["total_assignments"]),
                "target": ctx["total_assignments"],
                "label": "Quests",
            },
        }

    if name == "Legend":
        return {
            "current": min(ctx["owned_non_legendary"], ctx["total_non_legendary"]),
            "target": ctx["total_non_legendary"],
            "label": "Badges",
        }

    return None


class StudentBadgeGridView(APIView):
    """
    Returns every badge in the game (locked and unlocked) plus progress
    toward each one, for the badge collection page.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        student = request.user.student

        earned = {
            sb.badge_id: sb.earned_at
            for sb in StudentBadge.objects.filter(student=student)
        }

        total_lessons = countable_lessons().count()
        attended_lessons = student.attendances.filter(lesson__in=countable_lessons()).values("lesson").distinct().count()
        attendance_count = student.attendances.count()

        total_assignments = countable_assignments().count()

        mission_ids = (
            countable_assignments()
            .values_list("lesson__mission_id", flat=True).distinct()
        )
        submitted_ids = set(
            AssignmentAttempt.objects.filter(
                student=student, completed_at__isnull=False, assignment__in=countable_assignments()
            ).values_list("assignment_id", flat=True)
        )
        submitted_assignment_count = len(submitted_ids)  # or requery filtered to published, same idea

        best_ratio = (0, 1)
        for mission_id in mission_ids:
            mission_assignment_ids = set(
                countable_assignments().filter(lesson__mission_id=mission_id).values_list("id", flat=True)
            )
            if not mission_assignment_ids:
                continue
            done = len(mission_assignment_ids & submitted_ids)
            if done / len(mission_assignment_ids) > best_ratio[0] / best_ratio[1]:
                best_ratio = (done, len(mission_assignment_ids))

        attempt_count = student.challenge_attempts.count()
        completed_attempt_count = student.challenge_attempts.filter(completed_at__isnull=False).count()
        total_challenges = Challenge.objects.filter(is_published=True).count()
        perfect_score_count = student.challenge_attempts.filter(accuracy=100).count()

        missions_completed = sum(
            1 for mission in Mission.objects.all()
            if mission_quests_and_challenges_complete(student, mission)
        )

        owned_non_legendary = StudentBadge.objects.filter(
            student=student
        ).exclude(badge__rarity="legendary").count()
        total_non_legendary = Badge.objects.exclude(rarity="legendary").count()

        ctx = {
            "total_lessons": total_lessons,
            "attended_lessons": attended_lessons,
            "attendance_count": attendance_count,
            "total_assignments": total_assignments,
            "submitted_assignment_count": submitted_assignment_count,
            "best_mission_submission_ratio": best_ratio,
            "attempt_count": attempt_count,
            "completed_attempt_count": completed_attempt_count,
            "total_challenges": total_challenges,
            "perfect_score_count": perfect_score_count,
            "missions_completed": missions_completed,
            "owned_non_legendary": owned_non_legendary,
            "total_non_legendary": total_non_legendary,
        }

        badges = []
        for badge in Badge.objects.all().order_by("rarity", "name"):
            unlocked = badge.id in earned
            badges.append({
                "id": badge.id,
                "name": badge.name,
                "icon": badge.icon,
                "rarity": badge.rarity,
                "requirement": BADGE_REQUIREMENTS.get(badge.name),
                "unlocked": unlocked,
                "earned_at": earned.get(badge.id),
                "progress": _progress_for(badge, student, ctx),
            })

        return Response({
            "badges": badges,
            "unlocked_count": len(earned),
            "total_count": Badge.objects.count(),
        })