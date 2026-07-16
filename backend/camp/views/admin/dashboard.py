from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView
from ...models import XPLog, Assignment, AttendanceSession
from users.models import Student, Family, Payment

class AdminDashboardView(APIView):
    def get(self, request):
        total_students = Student.objects.count()
        total_familes = Family.objects.count()
        active_familes = Family.objects.filter(status='active').count()

        pending_payments = Payment.objects.filter(status='pending').count()
        total_awarded_xp = XPLog.objects.count()

        assignment_count = Assignment.objects.count()

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
            "today_attendance": today_count,
        })