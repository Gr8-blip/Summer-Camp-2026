from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from ...models import StudentBadge
from ...serializers import StudentBadgeSerializer


class StudentBadgeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = StudentBadgeSerializer

    def get_queryset(self):
        return (
            StudentBadge.objects
            .filter(student=self.request.user.student)
            .order_by("-earned_at")
        )