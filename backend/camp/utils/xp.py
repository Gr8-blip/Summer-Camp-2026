from camp.models import XPLog


def award_xp(student, amount, reason):
    student.xp += amount
    student.save(update_fields=["xp"])

    XPLog.objects.create(
        student=student,
        amount=amount,
        reason=reason
    )