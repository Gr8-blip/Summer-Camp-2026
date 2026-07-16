from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from ...models import XPLog
from ...serializers import XPLogSerializer


class StudentXPLogListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = XPLogSerializer

    def get_queryset(self):
        return (
            XPLog.objects
            .filter(student=self.request.user.student)
            .order_by("-created_at")
        )