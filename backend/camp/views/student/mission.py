from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import Mission
from ...serializers import MissionListSerializer, MissionDetailSerializer

class StudentMissionListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    
    queryset = Mission.objects.order_by('week')
    serializer_class = MissionListSerializer


class StudentMissionDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]

    queryset = Mission.objects.order_by('week')
    serializer_class = MissionDetailSerializer