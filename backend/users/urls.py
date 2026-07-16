from django.urls import path
from . import views


urlpatterns = [
    path('register/', views.RegistrationView.as_view(), name='register'),
    path('student-login/', views.StudentLoginView.as_view(), name='student-login'),
    path('parent-login/', views.ParentLoginView.as_view(), name='parent-login'),
    path(
        "admin-login/",
        views.AdminLoginView.as_view(),
        name="admin-login",
    ),
    path('family/me/', views.Me.as_view(), name='family-me'),
    
    # Payment endpoints
    path('initiate-payment/<int:family_id>/', views.init_payment, name='initiate-payment'),
    path('verify-payment/<str:reference>/', views.verify_payment, name='verify-payment'),
    
]