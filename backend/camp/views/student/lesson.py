from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import Lesson
from ...serializers import LessonDetailSerializer


class LessonDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Lesson.objects.all()
    serializer_class = LessonDetailSerializer