from django.utils import timezone
 
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from ...serializers import StudentAttendanceSerializer
from ...models import AttendanceSession, StudentAttendance
from ...utils.xp import award_xp
from ...utils import achievements
from ...utils.mission_progress import check_and_award_mission_completion  # <-- NEW
 
 
def _serialize_badges(badges):
    return [{"name": b.name, "icon": b.icon, "rarity": b.rarity} for b in badges]
 
 
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
 
        student = request.user.student
 
        attendance, created = StudentAttendance.objects.get_or_create(
            student=student,
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
 
        award_xp(student, session.xp_reward, "Attendance")
 
        new_badges = []
        new_badges += achievements.check_attendance(student)
        new_badges += achievements.check_learning(student)
        new_badges += achievements.check_xp(student)
        new_badges += achievements.check_ai_master(student)
        new_badges += achievements.check_legend(student)
 
        mission_complete = None
        if session.lesson.mission_id:
            completion = check_and_award_mission_completion(student, session.lesson.mission)
            if completion:
                mission_complete = {
                    "mission_title": session.lesson.mission.title,
                    "xp_awarded": completion.xp_awarded,
                }
                # Mission XP can itself push the student over an XP/legend
                # threshold, or unlock hall-of-fame-style badges — re-check
                # after the mission payout, not just after the attendance XP.
                new_badges += achievements.check_xp(student)
                new_badges += achievements.check_legend(student)
        # -----------------------------------------------------------------
 
        return Response(
            {
                "detail": "Attendance recorded successfully!",
                "xp_awarded": session.xp_reward,
                "xp_gained": session.xp_reward,
                "new_badges": _serialize_badges(new_badges),
                "mission_complete": mission_complete,   # <-- NEW
            },
            status=status.HTTP_201_CREATED,
        )