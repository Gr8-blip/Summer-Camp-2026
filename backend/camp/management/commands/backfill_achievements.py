"""
One-time backfill: evaluate every achievement check against every existing
student, so XP/attendance/submissions/challenge history that predates the
badge system unlocks the badges it should've, immediately, instead of
waiting for the student's next action.

Usage:
    python manage.py backfill_achievements
    python manage.py backfill_achievements --dry-run

Safe to re-run — award_badge() is idempotent (skips badges already owned),
so running this twice or after every student has since caught up naturally
is a no-op.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from users.models import Student
from camp.utils import achievements


class Command(BaseCommand):
    help = "Retroactively evaluate all badge checks for every existing student."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be awarded without saving anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        total_awarded = 0

        for student in Student.objects.all():
            with transaction.atomic():
                sid = transaction.savepoint()
                new_badges = []

                new_badges += achievements.check_login(student)
                new_badges += achievements.check_xp(student)
                new_badges += achievements.check_attendance(student)
                new_badges += achievements.check_learning(student)
                new_badges += achievements.check_submission(student)
                new_badges += achievements.check_coding_cadet(student)
                new_badges += achievements.check_ai_master(student)
                new_badges += achievements.check_challenge(student)  # attempt=None: skips per-attempt-only badges
                new_badges += achievements.check_puzzle_master(student)
                new_badges += achievements.check_legend(student)

                if new_badges:
                    total_awarded += len(new_badges)
                    names = ", ".join(b.name for b in new_badges)
                    self.stdout.write(f"{student.full_name}: {names}")

                if dry_run:
                    transaction.savepoint_rollback(sid)
                else:
                    transaction.savepoint_commit(sid)

        self.stdout.write(self.style.SUCCESS(
            f"{'Would award' if dry_run else 'Awarded'} {total_awarded} badge(s) total."
        ))