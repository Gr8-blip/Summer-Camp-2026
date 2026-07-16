from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from users.models import Student
from ...models import XPLog
from ...serializers import XPLogSerializer


class XPLogView(ListAPIView):
    permission_classes = [IsAuthenticated]
    queryset = XPLog.objects.select_related("student").order_by("-created_at")
    serializer_class = XPLogSerializer


class AwardXPView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        student_id = request.data.get("student")
        amount = request.data.get("amount")
        reason = request.data.get("reason")

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        student.xp += int(amount)
        student.save(update_fields=["xp"])

        XPLog.objects.create(
            student=student,
            amount=amount,
            reason=reason
        )

        return Response(
            {"message": "XP awarded successfully."},
            status=status.HTTP_200_OK
        )