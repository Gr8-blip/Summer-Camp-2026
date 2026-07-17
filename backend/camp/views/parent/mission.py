from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import Mission
from ...serializers import MissionListSerializer

class ParentMissionListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    
    queryset = Mission.objects.order_by('week')
    serializer_class = MissionListSerializer