from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import Lesson
from ...serializers import LessonDetailSerializer


class LessonDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Lesson.objects.filter(mission__is_active=True)
    serializer_class = LessonDetailSerializer