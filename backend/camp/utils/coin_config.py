# camp/utils/coin_config.py
#
# Central place for every Coin bonus amount in the game. Nothing in
# quest.py / achievements.py should ever hardcode a coin number directly —
# they import the named constant from here instead. That way retuning the
# economy is a one-file change, not a hunt through view logic.

# Awarded any time a Quest is finished with 100% accuracy (regardless of
# how many attempts it took).
PERFECT_ACCURACY_BONUS = 15

# Extra bonus on top of PERFECT_ACCURACY_BONUS, only when the 100% was
# also achieved on the very first attempt (attempt_count == 1).
FLAWLESS_VICTORY_BONUS = 25

# Awarded once per Lesson, the moment every Quest belonging to that
# Lesson has been completed.
LESSON_COMPLETION_BONUS = 30

# Awarded once per Mission, the moment every Lesson (attendance) AND
# every Quest in that Mission has been completed. Larger than the
# per-lesson bonus since it represents finishing the whole mission.
MISSION_COMPLETION_BONUS = 100