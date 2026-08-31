// src/utils/week6.js
//
// Single source of truth for "is Week 6 the special finale experience right
// now". Both StudentLayout (hides the normal nav) and Dashboard (redirects
// to the hub) import this so the behavior can never drift between them.
//
// To turn the finale experience off early (e.g. camp runs long and Week 6
// content slips), flip FORCE_DISABLE to true — everything falls back to the
// normal Dashboard → Lessons → Quests → Challenges flow immediately, no
// route/component changes needed.
export const FORCE_DISABLE = false;

export const WEEK_SIX_NUMBER = 6;

/** Pulls the Week 6 Mission object out of a dashboard/missions list, or null. */
export function getWeekSixMission(missions) {
  if (!Array.isArray(missions)) return null;
  return missions.find((m) => m.week === WEEK_SIX_NUMBER) || null;
}

/**
 * Week 6 is "active" (hub takes over) once the mission exists, is published,
 * and is actually reachable (previous weeks cleared). We deliberately do NOT
 * turn it back off once the student finishes all three lessons — the hub
 * itself flips into its "completed" celebration state instead, so the
 * finale doesn't just vanish back into the normal nav mid-camp.
 */
export function isWeekSixActive(missions) {
  if (FORCE_DISABLE) return false;
  const mission = getWeekSixMission(missions);
  if (!mission) return false;
  if (!mission.is_published) return false;
  if (mission.locked) return false;
  return true;
}