/* ============================================================
   utils.js
   ------------------------------------------------------------
   Small, reusable helper functions used all over the app:
   dates, times, durations, and IDs.

   Nothing in this file changes anything on screen by itself —
   it's just a "toolbox" other files borrow from. Keeping these
   in one place means we only have to write "add 30 minutes to
   a time" once, correctly, instead of five times with five bugs.
   ============================================================ */

// Pad a number to 2 digits: 5 -> "05"
function pad2(n) {
  return String(n).padStart(2, "0");
}

// Turn a JS Date object into a "YYYY-MM-DD" string (local time,
// not UTC, so it matches what the user sees on their clock).
function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Today, as "YYYY-MM-DD"
function todayISO() {
  return toISODate(new Date());
}

// Turn a "YYYY-MM-DD" string into a Date object at local midnight.
// (Using the 3-argument Date constructor avoids timezone surprises
// that happen when you do `new Date("2026-08-27")`.)
function parseISODate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Add N days to a "YYYY-MM-DD" string, return a new "YYYY-MM-DD" string.
function addDays(dateStr, n) {
  const d = parseISODate(dateStr);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

// Given a date string and which day the week should start on
// (0 = Sunday, 1 = Monday), return the "YYYY-MM-DD" of that week's
// first day.
function startOfWeek(dateStr, weekStartsOn = 0) {
  const d = parseISODate(dateStr);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

// First day ("YYYY-MM-01") of the month a date string is in.
function startOfMonth(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return `${y}-${pad2(m)}-01`;
}

// Number of days in the month a date string is in.
function daysInMonth(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// "HH:MM" (24-hour, e.g. "14:30") -> minutes since midnight (870)
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// minutes since midnight -> "HH:MM" (24-hour, for storage/inputs)
function minutesToTimeStr(mins) {
  mins = ((mins % 1440) + 1440) % 1440; // keep in 0-1439 range
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

// "14:30" -> "2:30 PM"  (for display only)
function formatTime12h(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${pad2(m)} ${period}`;
}

// Add a number of minutes to a "HH:MM" time, return new "HH:MM".
function addMinutesToTime(timeStr, minutesToAdd) {
  return minutesToTimeStr(timeToMinutes(timeStr) + minutesToAdd);
}

// Minutes between two "HH:MM" times on the same day (end - start).
// Assumes end is after start (we don't support overnight blocks).
function minutesBetween(startTime, endTime) {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime));
}

// 95 -> "1h 35m"; 60 -> "1h"; 45 -> "45m"; 0 -> "0m"
function formatDuration(totalMinutes) {
  totalMinutes = Math.round(totalMinutes);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Milliseconds -> "1:04:12" style stopwatch text (for a running timer)
function formatStopwatch(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}

// A short random ID, good enough for a personal task app.
// (Not cryptographically unique, but collisions are astronomically
// unlikely for the number of tasks a single person creates.)
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-08-27" -> "Thursday, August 27"
function formatDateHeading(dateStr) {
  const d = parseISODate(dateStr);
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

// "2026-08-27" -> "Aug 27"
function formatDateShort(dateStr) {
  const d = parseISODate(dateStr);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

// Do two [start,end) minute ranges overlap?
function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}
