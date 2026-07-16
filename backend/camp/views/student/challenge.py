from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from ...models import Challenge
from ...serializers import ChallengeSerializer


class ChallengeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChallengeSerializer
    queryset = Challenge.objects.order_by("-start_date")