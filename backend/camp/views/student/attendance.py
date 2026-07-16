from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from ...serializers import StudentAttendanceSerializer
from ...models import AttendanceSession, StudentAttendance
from ...utils.xp import award_xp


class StudentAttendanceListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = StudentAttendanceSerializer

    def get_queryset(self):
        return (
            StudentAttendance.objects
            .filter(student=self.request.user.student)
            .order_by("-submitted_at")
        )

class AttendanceCheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get("code")

        try:
            session = AttendanceSession.objects.get(
                code=code,
                is_active=True,
                expires_at__gt=timezone.now(),
            )
        except AttendanceSession.DoesNotExist:
            return Response(
                {"detail": "Invalid or expired attendance code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attendance, created = StudentAttendance.objects.get_or_create(
            student=request.user.student,
            attendance_session=session,
            defaults={
                "lesson": session.lesson,
            },
        )

        if not created:
            return Response(
                {"detail": "Attendance already recorded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        award_xp(request.user.student, session.xp_reward, "Attendance")

        return Response(
            {
                "detail": "Attendance recorded successfully!",
                "xp_awarded": session.xp_reward,
            },
            status=status.HTTP_201_CREATED,
        )