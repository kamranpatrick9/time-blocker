/* ============================================================
   state.js
   ------------------------------------------------------------
   This file is the "single source of truth" for the whole app.
   Every task, category, and setting lives in one JavaScript
   object called `state`. Every other file reads from it and
   changes it only through `updateState(...)`.

   WHY DO IT THIS WAY? (a beginner-friendly explanation)
   Instead of having calendar.js, tasks.js, stats.js etc. each
   keep their own separate copies of "the tasks", they all share
   ONE object. Whenever something changes (you add a task, drag
   a block, finish a timer), we:
     1. mutate `state`
     2. save it (localStorage + JSONBin)
     3. tell every part of the UI to re-render itself
   This "one object + re-render everything" pattern is the same
   basic idea behind big frameworks like React — we're just doing
   it by hand so you can see exactly how it works.

   DATA SHAPE
   state = {
     tasks: [ Task, Task, ... ],
     instances: { "<taskId>_<date>": Instance, ... },
     categories: [ Category, ... ],
     settings: { dayStartHour, dayEndHour, weekStartsOn, reminders },
     ui: { currentPage, currentView, currentDate },
     updatedAt: <timestamp>
   }

   Task = {
     id, name, description,
     category,              // category id
     scheduled,              // true = has a date/time, false = sits in Unscheduled list
     date, startTime, endTime, duration,   // duration in minutes
     recurrence: null | { type, days:[0-6], interval, endDate },
     createdAt, updatedAt
   }
   "type" is one of: "daily" | "weekdays" | "weekly" | "specific" | "everyXWeeks"

   Instance = per-calendar-day data for one occurrence of a task
   (this is what lets a recurring task have a different status,
   or a different actual time logged, on each day it happens):
   {
     status: "not-started" | "in-progress" | "completed" | "missed",
     actual: { startedAt: <timestamp|null>, accumulatedMs, isRunning },
     override: null | { date, startTime, endTime }  // for one-off reschedules
     deleted: false // true if this single occurrence was removed
   }
   ============================================================ */

let state = null;
const _listeners = [];

function defaultCategories() {
  return [
    { id: "school", name: "School", emoji: "📚", color: "#3b82f6" },
    { id: "work", name: "Work", emoji: "💼", color: "#8b5cf6" },
    { id: "personal", name: "Personal", emoji: "🏠", color: "#10b981" },
    { id: "chores", name: "Chores", emoji: "🧹", color: "#f59e0b" },
    { id: "exercise", name: "Exercise", emoji: "🏋️", color: "#ef4444" },
    { id: "creative", name: "Creative", emoji: "🎨", color: "#ec4899" },
    { id: "learning", name: "Learning", emoji: "🧠", color: "#06b6d4" },
  ];
}

function defaultState() {
  return {
    tasks: [],
    instances: {},
    categories: defaultCategories(),
    settings: {
      dayStartHour: 6,   // calendar shows 6 AM ...
      dayEndHour: 23,    // ...through 11 PM by default
      weekStartsOn: 0,   // 0 = Sunday
    },
    ui: {
      currentPage: "dashboard",
      currentView: "week",
      currentDate: todayISO(),
    },
    updatedAt: Date.now(),
  };
}

// Fill in any fields missing from an older/partial saved state so the
// app never crashes just because you added a feature after saving once.
function normalizeState(loaded) {
  const base = defaultState();
  if (!loaded) return base;
  return {
    tasks: loaded.tasks || [],
    instances: loaded.instances || {},
    categories: loaded.categories && loaded.categories.length ? loaded.categories : base.categories,
    settings: { ...base.settings, ...(loaded.settings || {}) },
    ui: { ...base.ui, ...(loaded.ui || {}) },
    updatedAt: loaded.updatedAt || Date.now(),
  };
}

function initState(loaded) {
  state = normalizeState(loaded);
}

function getState() {
  return state;
}

// The ONLY way the rest of the app should change data.
// `mutatorFn` receives the live state object and modifies it directly.
function updateState(mutatorFn) {
  mutatorFn(state);
  state.updatedAt = Date.now();
  saveToLocalStorage(state);
  debouncedSaveToCloud(state);
  notifyListeners();
}

// Any file can register a function to be called after every change.
function subscribe(fn) {
  _listeners.push(fn);
}

function notifyListeners() {
  _listeners.forEach((fn) => fn(state));
}

function getCategory(id) {
  return state.categories.find((c) => c.id === id) || state.categories[0];
}

function getTaskById(id) {
  return state.tasks.find((t) => t.id === id);
}
