from django.db.models import Avg, Count, Q
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Student
from ...models import AssignmentAttempt, StudentAttendance, ChallengeAttempt
from ...serializers import LeaderboardEntrySerializer


def _rank_by(rows, key, reverse=True):
    """
    Assigns a 1-based rank to every row based on `key`, highest-first by
    default. Ties share the same rank (standard "1224" competition
    ranking) — two students on the same XP don't get arbitrarily split.
    Mutates each row dict in place under f"{key}_rank".
    """
    ordered = sorted(rows, key=lambda r: r[key], reverse=reverse)
    rank = 0
    seen = 0
    last_value = None
    for row in ordered:
        seen += 1
        if row[key] != last_value:
            rank = seen
            last_value = row[key]
        row[f"{key}_rank"] = rank


class LeaderboardView(APIView):
    """
    GET-only. Every student, scored across 5 categories:
      - Overall Score  (composite of the 4 below)
      - Highest XP     (Student.xp)
      - Quest Performance (average AssignmentAttempt.accuracy, completed only)
      - Attendance     (count of StudentAttendance rows)
      - Challenge Participation (count of ChallengeAttempt rows)

    Overall score is a simple average of each student's percentile
    standing (0-100) across the 4 raw metrics — keeps XP (large numbers)
    from drowning out attendance (small numbers) without needing to
    invent arbitrary weights.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = getattr(request.user, "student", None)

        quest_avg = AssignmentAttempt.objects.filter(completed_at__isnull=False).values(
            "student"
        ).annotate(avg_accuracy=Avg("accuracy"))
        quest_by_student = {row["student"]: float(row["avg_accuracy"] or 0) for row in quest_avg}

        attendance_counts = StudentAttendance.objects.values("student").annotate(n=Count("id"))
        attendance_by_student = {row["student"]: row["n"] for row in attendance_counts}

        challenge_counts = ChallengeAttempt.objects.values("student").annotate(n=Count("id"))
        challenge_by_student = {row["student"]: row["n"] for row in challenge_counts}

        students = Student.objects.all()
        rows = []
        for s in students:
            rows.append({
                "student_id": s.id,
                "student_name": s.full_name,
                "avatar": s.equipped_avatar.key if getattr(s, "equipped_avatar_id", None) else None,
                "is_you": bool(me and s.id == me.id),
                "xp": s.xp,
                "quest_score": round(quest_by_student.get(s.id, 0.0), 2),
                "attendance_count": attendance_by_student.get(s.id, 0),
                "challenge_count": challenge_by_student.get(s.id, 0),
            })

        if not rows:
            return Response([])

        _rank_by(rows, "xp")
        _rank_by(rows, "quest_score")
        _rank_by(rows, "attendance_count")
        _rank_by(rows, "challenge_count")

        n = len(rows)

        def percentile(rank):
            # rank 1 (best) -> 100, rank n (worst) -> as low as 0.
            return 100.0 if n == 1 else 100.0 * (n - rank) / (n - 1)

        for row in rows:
            row["overall_score"] = round((
                percentile(row["xp_rank"]) +
                percentile(row["quest_score_rank"]) +
                percentile(row["attendance_count_rank"]) +
                percentile(row["challenge_count_rank"])
            ) / 4, 2)

        _rank_by(rows, "overall_score")

        # Rename the awkward *_score_rank/_count_rank keys to match the
        # serializer's plain field names.
        for row in rows:
            row["quest_rank"] = row.pop("quest_score_rank")
            row["attendance_rank"] = row.pop("attendance_count_rank")
            row["challenge_rank"] = row.pop("challenge_count_rank")

        rows.sort(key=lambda r: r["overall_rank"])

        return Response(LeaderboardEntrySerializer(rows, many=True).data)