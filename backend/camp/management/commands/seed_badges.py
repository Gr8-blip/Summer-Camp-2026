from django.core.management.base import BaseCommand

from camp.badges import BADGES
from camp.models import Badge


class Command(BaseCommand):
    help = "Seed default achievement badges."

    def handle(self, *args, **kwargs):
        created = 0
        updated = 0

        for badge_data in BADGES:
            badge, was_created = Badge.objects.update_or_create(
                name=badge_data["name"],
                defaults={
                    "icon": badge_data["icon"],
                    "rarity": badge_data["rarity"],
                },
            )

            if was_created:
                created += 1
                self.stdout.write(
                    self.style.SUCCESS(f"✔ Created {badge.name}")
                )
            else:
                updated += 1
                self.stdout.write(
                    self.style.WARNING(f"↻ Updated {badge.name}")
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Finished! {created} created, {updated} updated."
            )
        )