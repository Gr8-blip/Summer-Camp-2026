from camp.models import CampSettings


def camp_is_started() -> bool:
    return CampSettings.load().camp_started


class CampNotStarted(Exception):
    """Raised (and caught into a 403) when a student tries to interact
    with content before the camp switch is flipped on."""
    pass