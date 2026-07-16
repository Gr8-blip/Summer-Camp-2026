from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from ...serializers import BadgeSerializer
from ...models import Badge

class BadgeView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Badge.objects.all()
    serializer_class = BadgeSerializer


class BadgeDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Badge.objects.all()
    serializer_class = BadgeSerializer