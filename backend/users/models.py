from django.contrib.auth.models import User
from django.db import models

class Parent(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone = models.CharField(max_length=15)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.user.username

class Family(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('active', 'Active'),
        ('expired', 'Expired')
    ]
    
    parent = models.OneToOneField(Parent, on_delete=models.CASCADE)
    student_count = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Family {self.id} - {self.status}"

class Student(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student', null=True)
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='students')
    full_name = models.CharField(max_length=100)
    age = models.PositiveSmallIntegerField()
    email = models.EmailField(blank=True, null=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    login_code = models.CharField(max_length=25, unique=True, blank=True, null=True)
    xp = models.PositiveIntegerField(default=0)
    
    def __str__(self):
        return f"Student {self.id} - {self.full_name}"

class Payment(models.Model):
    family = models.ForeignKey(Family, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paystack_ref = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=20, choices=[('pending', 'Pending'), ('completed', 'Completed'), ('failed', 'Failed')], default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    
    
    def __str__(self):
        return f"Payment {self.id} - {self.status}"