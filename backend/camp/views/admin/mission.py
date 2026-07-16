from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from ...serializers import MissionListSerializer, MissionDetailSerializer
from ...models import Mission

class MissionView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Mission.objects.all()
    serializer_class = MissionListSerializer


class MissionDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Mission.objects.all()
    serializer_class = MissionDetailSerializer