from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ...serializers import CampSettingsSerializer
from ...models import CampSettings 

class AdminCampSettingsView(APIView):
       permission_classes = [IsAuthenticated]  # swap for your admin permission class
       def get(self, request):
           return Response(CampSettingsSerializer(CampSettings.load()).data)
       def patch(self, request):
           settings = CampSettings.load()
           serializer = CampSettingsSerializer(settings, data=request.data, partial=True)
           serializer.is_valid(raise_exception=True)
           serializer.save()
           return Response(serializer.data)