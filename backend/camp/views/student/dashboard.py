from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ...models import Mission, StudentBadge, XPLog, StudentAttendance, AIConversation
from ...serializers import DashboardSerializer

class StudentDashboardView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        student = request.user.student
        missions =  Mission.objects.filter(is_active=True).order_by('week')


        recent_badges = StudentBadge.objects.filter(student=student).order_by('-earned_at')[:5]
        recent_xp = XPLog.objects.filter(student=student).order_by('-created_at')[:5]
        recent_attendance = StudentAttendance.objects.filter(student=student).order_by('-submitted_at')[:5]
        recent_conversations = AIConversation.objects.filter(student=student).order_by('-updated_at')[:15]
        
        data = {
            "student": {
                "name": student.full_name,
                "xp": student.xp
            },
            "missions": missions,
            "recent_badges": recent_badges,
            "recent_xp": recent_xp,
            "recent_attendance": recent_attendance,
            "recent_conversations": recent_conversations
        }


        serializer = DashboardSerializer(data)

        return Response(serializer.data)