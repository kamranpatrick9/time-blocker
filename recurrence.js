/* ============================================================
   recurrence.js
   ------------------------------------------------------------
   This file answers one core question, over and over:
   "On this specific date, which tasks actually show up, and
   with what time/status/actual-time-tracked?"

   WHY THIS IS ITS OWN FILE
   A recurring task like "Gym, every Mon/Wed/Fri, 4-5 PM" is
   stored ONCE in state.tasks — we do NOT create 52 copies of it
   for the whole year. Instead, every time we need to draw a day
   or week on the calendar, we ask this file to "expand" the
   rules into the actual occurrences for those dates.

   Each occurrence can also have its own per-day data (status,
   actual time worked, or a one-off reschedule) stored in
   state.instances, keyed by "<taskId>_<originalDate>". That's
   how "Gym" can be marked completed on Monday but still be
   "not started" on Wednesday, even though it's the same task.
   ============================================================ */

function instanceKey(taskId, dateStr) {
  return `${taskId}_${dateStr}`;
}

// Reverse of instanceKey — dates are always exactly 10 characters
// ("YYYY-MM-DD"), so we can split reliably from the right side.
function splitInstanceKey(key) {
  const date = key.slice(-10);
  const taskId = key.slice(0, key.length - 11);
  return { taskId, date };
}

function getInstance(stateObj, occKey) {
  return stateObj.instances[occKey] || null;
}

// Get (or create-in-memory, but not yet saved) the instance record
// for an occurrence, with sensible defaults filled in.
function readInstance(stateObj, occKey) {
  return (
    stateObj.instances[occKey] || {
      status: "not-started",
      actual: { startedAt: null, accumulatedMs: 0, isRunning: false },
      override: null,
      deleted: false,
    }
  );
}

// Actually create the instance in state if it doesn't exist yet.
// Call this from inside an updateState(...) mutator before editing it.
function ensureInstance(stateObj, occKey) {
  if (!stateObj.instances[occKey]) {
    stateObj.instances[occKey] = {
      status: "not-started",
      actual: { startedAt: null, accumulatedMs: 0, isRunning: false },
      override: null,
      deleted: false,
    };
  }
  return stateObj.instances[occKey];
}

// Does this task's recurrence rule land on `dateStr`?
// (Ignores instance overrides/deletions — see getOccurrencesForDate
// for how those get layered on top.)
function ruleMatchesDate(task, dateStr) {
  if (dateStr < task.date) return false;
  const rec = task.recurrence;
  if (!rec) return task.date === dateStr;
  if (rec.endDate && dateStr > rec.endDate) return false;

  const anchor = parseISODate(task.date);
  const d = parseISODate(dateStr);
  const dow = d.getDay();

  switch (rec.type) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
      return dow === anchor.getDay();
    case "specific":
      return (rec.days || []).includes(dow);
    case "everyXWeeks": {
      if (dow !== anchor.getDay()) return false;
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const weeksDiff = Math.round((d - anchor) / msPerWeek);
      const interval = Math.max(1, rec.interval || 1);
      return weeksDiff >= 0 && weeksDiff % interval === 0;
    }
    default:
      return false;
  }
}

function buildOccurrence(task, originalDate, inst) {
  const override = inst && inst.override;
  const date = (override && override.date) || originalDate;
  const startTime = (override && override.startTime) || task.startTime;
  const endTime = (override && override.endTime) || task.endTime;
  return {
    occurrenceKey: instanceKey(task.id, originalDate),
    taskId: task.id,
    originalDate,
    date,
    startTime,
    endTime,
    duration: minutesBetween(startTime, endTime),
    name: task.name,
    description: task.description,
    category: task.category,
    status: (inst && inst.status) || "not-started",
    actual: (inst && inst.actual) || { startedAt: null, accumulatedMs: 0, isRunning: false },
    recurring: !!task.recurrence,
  };
}

// All occurrences (from every task) that land on one specific date.
function getOccurrencesForDate(stateObj, dateStr) {
  const results = [];

  for (const task of stateObj.tasks) {
    if (!task.scheduled) continue;
    const naturallyOccurs = ruleMatchesDate(task, dateStr);
    const occKey = instanceKey(task.id, dateStr);
    const inst = getInstance(stateObj, occKey);

    if (naturallyOccurs) {
      if (inst && inst.deleted) continue;
      // If this occurrence was rescheduled to ANOTHER date, don't show
      // it on its original date — it'll show up in the "moved in" pass below.
      if (inst && inst.override && inst.override.date && inst.override.date !== dateStr) continue;
      results.push(buildOccurrence(task, dateStr, inst));
    }
  }

  // Occurrences that were rescheduled INTO this date from a different
  // original date (e.g. "Math, originally Tuesday" moved to Thursday).
  for (const [key, inst] of Object.entries(stateObj.instances)) {
    if (inst.deleted) continue;
    if (!inst.override || !inst.override.date) continue;
    if (inst.override.date !== dateStr) continue;
    const { taskId, date: originalDate } = splitInstanceKey(key);
    if (originalDate === dateStr) continue; // already handled above
    const task = getTaskFromList(stateObj, taskId);
    if (!task) continue;
    results.push(buildOccurrence(task, originalDate, inst));
  }

  return results.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

function getTaskFromList(stateObj, taskId) {
  return stateObj.tasks.find((t) => t.id === taskId);
}

// All occurrences between two dates (inclusive), grouped isn't
// necessary — callers can filter by .date themselves.
function getOccurrencesInRange(stateObj, startDate, endDate) {
  const out = [];
  let d = startDate;
  let guard = 0;
  while (d <= endDate && guard < 400) {
    out.push(...getOccurrencesForDate(stateObj, d));
    d = addDays(d, 1);
    guard++;
  }
  return out;
}

// Find any existing occurrences on `dateStr` that overlap the given
// time range, excluding the occurrence currently being edited.
function findConflicts(stateObj, dateStr, startTime, endTime, excludeOccKey) {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  return getOccurrencesForDate(stateObj, dateStr).filter((occ) => {
    if (occ.occurrenceKey === excludeOccKey) return false;
    return rangesOverlap(startMin, endMin, timeToMinutes(occ.startTime), timeToMinutes(occ.endTime));
  });
}
