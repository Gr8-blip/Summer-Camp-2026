from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import Lesson
from ...serializers import LessonSerializer

class ParentLessonListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    
    queryset = Lesson.objects.all()
    serializer_class = LessonSerializer