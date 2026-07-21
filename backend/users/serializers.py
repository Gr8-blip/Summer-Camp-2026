import random
import string
import uuid
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Parent, Family, Student

def generate_login_code():
    return "AI-" + ''.join(
        random.choices(string.ascii_uppercase + string.digits, k=6)
    )
    

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'password']
    
    extra_kwargs = {
        'password': {'write_only': True},
    }
    
    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

class ParentSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    
    class Meta:
        model = Parent
        fields = ['user', 'phone']
        

class FamilySerializer(serializers.ModelSerializer):
    class Meta:
        model = Family
        fields = ['status', 'student_count']
        read_only_fields = ['status']
        

class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ['full_name', 'email', 'age']
        
        

class RegistrationSerializer(serializers.Serializer):
    parent = UserSerializer()
    phone = serializers.CharField()
    student_count = serializers.IntegerField()
    students = StudentSerializer(many=True)
    
    
    def validate(self, data):
        if data['student_count'] != len(data['students']):
            raise serializers.ValidationError("Student count does not match the number of students provided.")
        return data
    
    def create(self, validated_data):
        user_data = validated_data['parent']
        phone = validated_data['phone']
        student_count = validated_data['student_count']
        students_data = validated_data['students']
        
        # Create User
        user = User.objects.create_user(username=user_data['email'], 
                                        email=user_data['email'], 
                                        password=user_data['password'], 
                                        first_name=user_data.get('first_name', ''), 
                                        last_name=user_data.get('last_name', ''))
        
        # Create Parent and Family
        parent = Parent.objects.create(user=user, phone=phone)
        family = Family.objects.create(parent=parent, student_count=student_count)
        
        # Create Students
        for student_data in students_data:
            student_user = User.objects.create(
                username=f"student-{uuid.uuid4().hex}",
                email=student_data.get("email") or ""
            )

            student_user.set_unusable_password()
            student_user.save()
            Student.objects.create(family=family, login_code=generate_login_code(), user=student_user, **student_data)
        
        
        return family
        