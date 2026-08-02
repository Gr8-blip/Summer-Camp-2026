from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from ...serializers import LessonSerializer, LessonDetailSerializer
from ...models import Lesson

class LessonView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]  # MultiPart handles the material_file upload
    queryset = Lesson.objects.all()
    serializer_class = LessonSerializer


class LessonDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]  # so PATCH can swap/replace the zip too
    queryset = Lesson.objects.all()
    serializer_class = LessonDetailSerializer

    def perform_update(self, serializer):
        instance = serializer.save()
        # remove_material is a plain flag, not a model field — sent as
        # {"remove_material": true} (JSON) so a delete doesn't require
        # re-uploading anything. .delete(save=True) clears both the
        # storage file and the DB field in one shot.
        remove = self.request.data.get('remove_material')
        if str(remove).lower() in ('1', 'true'):
            instance.material_file.delete(save=True)