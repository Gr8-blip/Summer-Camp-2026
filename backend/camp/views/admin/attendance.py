import random
import string

from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.permissions import IsAuthenticated

from ...models import AttendanceSession, StudentAttendance
from ...serializers import (
    AttendanceSessionSerializer,
    StudentAttendanceSerializer,
)

def generate_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

class AttendanceSessionView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    queryset = AttendanceSession.objects.all().order_by("-expires_at")
    serializer_class = AttendanceSessionSerializer


class AttendanceSessionDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    queryset = AttendanceSession.objects.all()
    serializer_class = AttendanceSessionSerializer



class StudentAttendanceView(ListAPIView):
    permission_classes = [IsAuthenticated]
    queryset = (
        StudentAttendance.objects
        .select_related("student", "lesson", "attendance_session")
        .order_by("-submitted_at")
    )
    serializer_class = StudentAttendanceSerializer