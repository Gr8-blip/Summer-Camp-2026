from django.contrib import admin
from .models import User, Parent, Payment, Student, Family

# Register your models here.
admin.site.register(User)
admin.site.register(Parent)
admin.site.register(Payment)
admin.site.register(Student)
admin.site.register(Family)