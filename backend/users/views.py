import requests
import math
import uuid
from django.contrib.auth import authenticate
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from .serializers import RegistrationSerializer
from .models import Family, Payment, Student
from .emails import send_payment_confirmation_email
from rest_framework.exceptions import ValidationError
from camp.utils import achievements

def _serialize_badges(badges):
    return [{"name": b.name, "icon": b.icon, "rarity": b.rarity} for b in badges]

class Me(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        
        try:
            family = Family.objects.get(parent__user=user)  # ✅ traverse the relation properly
        except Family.DoesNotExist:
            return Response({"error": "No family found for this account"}, status=404)
        
        return Response({"message": "Logged in", "family_id": family.id})

class RegistrationView(APIView):
    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as e:
            print("--- VALIDATION ERROR ---")
            print(e.detail)
            print("------------------------")
            raise e
        family = serializer.save()
        
        return Response({"message": "Registration successful", "family_id": family.id})


class StudentLoginView(APIView):
    def post(self, request):
        login_code = request.data.get("login_code", "").strip().upper()

        if not login_code:
            return Response(
                {"error": "Login code is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.select_related(
                "user",
                "family"
            ).get(login_code=login_code)
        except Student.DoesNotExist:
            return Response(
                {"error": "Invalid login code."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if student.family.status != "active":
            return Response(
                {"error": "Family account is not active."},
                status=status.HTTP_403_FORBIDDEN
            )

        refresh = RefreshToken.for_user(student.user)

        new_badges = []
        new_badges += achievements.check_login(student)
        new_badges += achievements.check_xp(student)
        new_badges += achievements.check_legend(student)

        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "student": {
                    "id": student.id,
                    "name": student.full_name,
                    "family_id": student.family.id,
                },
                "new_badges": _serialize_badges(new_badges),
            },
            status=status.HTTP_200_OK,
        )
    


class ParentLoginView(APIView):
    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password")

        user = authenticate(username=email, password=password)

        if not user:
            return Response(
                {"error": "Invalid credentials"},
                status=400
            )

        refresh = RefreshToken.for_user(user)

        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        })

class AdminLoginView(APIView):
    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password")

        user = authenticate(
            username=email,
            password=password
        )

        if not user:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.is_superuser:
            return Response(
                {"error": "You are not authorized to access the admin dashboard."},
                status=status.HTTP_403_FORBIDDEN
            )

        refresh = RefreshToken.for_user(user)

        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "admin": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            }
        })

@api_view(['POST'])
def init_payment(request, family_id):
    family = Family.objects.get(id=family_id)
    
    if family.status == 'active':
        return Response({"message": "Payment already completed for this family."})
    
    groups = math.ceil(family.student_count / 3)
    amount = settings.BOOTCAMP_PAYMENT_AMOUNT * groups  # Calculate total amount based on groups of 3 students
    email = family.parent.user.email
    
    reference = f"BOOTCAMP-{uuid.uuid4().hex[:12]}" # Generate a unique reference for the payment
    payment = Payment.objects.create(family=family, amount=amount, paystack_ref=reference)
    
    url = "https://api.paystack.co/transaction/initialize"
    headers = {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "email": email,
        "amount": amount * 100,  # Convert to kobo
        "reference": reference,
    }
    
    response = requests.post(url, json=payload, headers=headers, timeout=(3, 10))
    data = response.json()
    
    if not data.get("status"):
        return Response({"message": "Payment initialization failed", "error": data.get("message")}, status=400)
    
    return Response({
        "authorization_url": data["data"]["authorization_url"],
        "access_code": data["data"]["access_code"],
        "reference": reference,
        "amount": amount,
        "email": email
    })
    
    

@api_view(['GET'])
def verify_payment(request, reference):
    url = f"https://api.paystack.co/transaction/verify/{reference}"
    
    headers = {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
    }
    
    response = requests.get(url, headers=headers)
    data = response.json()
    
    if not data.get("status"):
        return Response({"message": "Payment verification failed", "error": data.get("message")}, status=400)
    
    transaction = data["data"]
    
    if transaction["status"] != "success":
        return Response({"message": "Payment not successful", "status": transaction["status"]}, status=400)
    
    try:
        payment = Payment.objects.get(paystack_ref=reference)
    except Payment.DoesNotExist:
        return Response({"message": "Payment record not found"}, status=404)
    
    if payment.status == 'completed':
        return Response({"message": "Payment already verified"})
    
    paystack_amount = transaction["amount"] / 100
    if paystack_amount != float(payment.amount):
        return Response(
            {"message": "Amount mismatch"},
            status=400
        )

    payment.status = 'completed'
    payment.save()
    
    family = payment.family
    family.status = 'active'
    family.save()
    
    send_payment_confirmation_email(family, payment)
    
    return Response({
        "message": "Payment verified successfully",
        "family_id": family.id,
        "status": "active"
    })