from rest_framework.generics import RetrieveAPIView, CreateAPIView
from rest_framework.permissions import IsAuthenticated
from ...models import Lesson
from ...serializers import LessonDetailSerializer, LessonQuestionCreateSerializer
from django.shortcuts import get_object_or_404


class LessonDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    queryset = Lesson.objects.all()
    serializer_class = LessonDetailSerializer



class LessonQuestionCreateView(CreateAPIView):
    serializer_class = LessonQuestionCreateSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["lesson"] = get_object_or_404(Lesson, pk=self.kwargs["pk"])
        return ctx


