from django.core.management.base import BaseCommand
from django.db import transaction

from camp.badges import BADGES
from camp.models import Badge, StudentBadge


# Old name → new name, for badges renamed in place. A rename is applied
# and fully cleaned up (old row deleted, StudentBadge rows migrated) each
# time this command runs, so it's safe to leave entries here permanently
# as a record, or prune them once you're confident every environment has
# run this at least once.
RENAMES = {
    "First Submission": "Quest Complete",
}


class Command(BaseCommand):
    help = "Seed default achievement badges."

    def handle(self, *args, **kwargs):
        self._apply_renames()

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
                self.stdout.write(self.style.SUCCESS(f"✔ Created {badge.name}"))
            else:
                updated += 1
                self.stdout.write(self.style.WARNING(f"↻ Updated {badge.name}"))

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(f"Finished! {created} created, {updated} updated.")
        )

    def _apply_renames(self):
        for old_name, new_name in RENAMES.items():
            old_badge = Badge.objects.filter(name=old_name).first()
            if not old_badge:
                continue  # already renamed/cleaned up in a previous run

            new_badge, _ = Badge.objects.get_or_create(
                name=new_name,
                defaults={"icon": old_badge.icon, "rarity": old_badge.rarity},
            )

            with transaction.atomic():
                # Students who have the old badge but not the new one:
                # just repoint their row onto the new badge.
                students_with_new = set(
                    StudentBadge.objects.filter(badge=new_badge)
                    .values_list("student_id", flat=True)
                )

                StudentBadge.objects.filter(badge=old_badge).exclude(
                    student_id__in=students_with_new
                ).update(badge=new_badge)

                # Anyone left on old_badge at this point already has
                # new_badge too — that's a straight duplicate, drop it.
                StudentBadge.objects.filter(badge=old_badge).delete()

                old_badge.delete()

            self.stdout.write(
                self.style.WARNING(f"↻ Renamed {old_name} → {new_name} (merged StudentBadge rows)")
            )