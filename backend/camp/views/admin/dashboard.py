from django.utils import timezone
from django.db.models import Sum
from rest_framework.response import Response
from rest_framework.views import APIView
from ...models import XPLog, Assignment, AttendanceSession, Challenge, ChallengeAttempt, Mission, Lesson, Badge
from users.models import Student, Family, Payment

class AdminDashboardView(APIView):
    def get(self, request):
        total_students = Student.objects.count()
        total_familes = Family.objects.count()
        active_familes = Family.objects.filter(status='active').count()

        pending_payments = Payment.objects.filter(status='pending').count()
        total_awarded_xp = XPLog.objects.aggregate(total=Sum('amount'))['total'] or 0

        assignment_count = Assignment.objects.count()
        challenge_attempts = ChallengeAttempt.objects.filter(completed_at__isnull=False)

        attendance_session = AttendanceSession.objects.filter(
            is_active=True,
        ).first()

        today_count = 0

        if attendance_session:
            today_count = attendance_session.attendances.count()


        return Response({
            "total_students": total_students,
            "total_families": total_familes,
            "active_families": active_familes,
            "pending_payments": pending_payments,
            "total_awarded_xp": total_awarded_xp,
            "assignment_count": assignment_count,
            "total_assignments": assignment_count,
            "total_missions": Mission.objects.count(),
            "total_lessons": Lesson.objects.count(),
            "total_badges": Badge.objects.count(),
            "total_challenges": Challenge.objects.count(),
            "active_challenges": Challenge.objects.filter(is_active=True).count(),
            "completed_challenge_attempts": challenge_attempts.count(),
            "challenge_xp_awarded": challenge_attempts.aggregate(total=Sum('xp_earned'))['total'] or 0,
            "today_attendance": today_count,
        })
