from django.contrib import admin
from django.apps import apps

# Grab the app config for 'camp'
camp_app = apps.get_app_config('camp')

# Loop through every model in the camp app and register it
for model in camp_app.get_models():
    try:
        admin.site.register(model)
    except admin.sites.AlreadyRegistered:
        pass