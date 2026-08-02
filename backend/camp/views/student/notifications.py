from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from ...models import Notification


def student_for(request):
    return request.user.student


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        student = student_for(request)
        qs = Notification.objects.filter(student=student)

        unread_only = request.query_params.get("unread") == "true"
        if unread_only:
            qs = qs.filter(read_at__isnull=True)

        qs = qs[:50]  # cap payload size — plenty for a notification drawer

        data = [
            {
                "id": n.id,
                "kind": n.kind,
                "payload": n.payload,
                "created_at": n.created_at,
                "read": n.read_at is not None,
            }
            for n in qs
        ]

        return Response({
            "notifications": data,
            "unread_count": Notification.objects.filter(student=student, read_at__isnull=True).count(),
        })


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        student = student_for(request)
        ids = request.data.get("ids")  # optional list; omit to mark ALL as read

        qs = Notification.objects.filter(student=student, read_at__isnull=True)
        if ids:
            qs = qs.filter(id__in=ids)

        updated = qs.update(read_at=timezone.now())
        return Response({"marked_read": updated})