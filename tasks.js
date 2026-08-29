/* ============================================================
   tasks.js
   ------------------------------------------------------------
   Everything about the Unscheduled task list, quick-add, and
   the actual "write to state" functions for creating, editing,
   rescheduling, and deleting tasks. calendar.js and modals.js
   both call into these functions.

   A NOTE ON RECURRING TASKS + EDITING
   When you edit the NAME, CATEGORY, or RECURRENCE RULE of a
   recurring task, that change applies to the whole series (every
   occurrence), because those describe the task itself.
   When you edit the DATE/START/END TIME of one occurrence of a
   recurring task (e.g. drag just this Wednesday's Gym block),
   we don't touch the series — we store a small "override" for
   that single day in state.instances, so the rest of the series
   is unaffected. This is the same behavior Google Calendar uses
   for "this event only" vs "all events".
   ============================================================ */

function initTasksPage() {
  const form = document.getElementById("quick-add-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("qa-name").value.trim();
    const date = document.getElementById("qa-date").value;
    const time = document.getElementById("qa-time").value;
    if (!name) return;

    if (date && time) {
      attemptQuickAddScheduled(name, date, time);
    } else {
      createUnscheduledTask(name);
    }
    form.reset();
  });
}

function renderTasksPage() {
  renderUnscheduledList();
}

function renderUnscheduledList() {
  const container = document.getElementById("unscheduled-list");
  container.innerHTML = "";
  const unscheduled = state.tasks.filter((t) => !t.scheduled);

  if (unscheduled.length === 0) {
    container.innerHTML = `<p class="empty-hint">Nothing unscheduled right now. Add one above, or it'll land here if you unschedule something.</p>`;
    return;
  }

  unscheduled.forEach((t) => {
    const cat = getCategory(t.category);
    const item = document.createElement("div");
    item.className = "unscheduled-item";
    item.draggable = true;
    item.dataset.taskId = t.id;
    item.innerHTML = `
      <span class="dot" style="background:${cat.color}"></span>
      <span class="ut-name">${escapeHtml(t.name)}</span>
      <button class="ut-edit icon-btn" title="Edit">✏️</button>
      <button class="ut-del icon-btn" title="Delete">🗑️</button>
    `;
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "unscheduled", taskId: t.id }));
    });
    item.querySelector(".ut-edit").addEventListener("click", () => openTaskModal("edit", taskToPseudoOccurrence(t)));
    item.querySelector(".ut-del").addEventListener("click", () => {
      if (confirm(`Delete "${t.name}"?`)) deleteTask(t.id);
    });
    container.appendChild(item);
  });
}

// Turn a plain (possibly unscheduled) task into the same shape
// calendar occurrences use, so the same edit modal can handle both.
function taskToPseudoOccurrence(task) {
  return {
    occurrenceKey: task.scheduled ? instanceKey(task.id, task.date) : null,
    taskId: task.id,
    originalDate: task.date,
    date: task.date || todayISO(),
    startTime: task.startTime || "09:00",
    endTime: task.endTime || "09:30",
    duration: task.duration || 30,
    name: task.name,
    description: task.description,
    category: task.category,
    status: "not-started",
    actual: { startedAt: null, accumulatedMs: 0, isRunning: false },
    recurring: !!task.recurrence,
    recurrence: task.recurrence,
    scheduled: task.scheduled,
  };
}

function createUnscheduledTask(name) {
  updateState((s) => {
    s.tasks.push({
      id: uid(),
      name,
      description: "",
      category: s.categories[0].id,
      scheduled: false,
      date: null,
      startTime: null,
      endTime: null,
      duration: 30,
      recurrence: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

function attemptQuickAddScheduled(name, date, startTime) {
  const endTime = addMinutesToTime(startTime, 30);
  const conflicts = findConflicts(state, date, startTime, endTime, null);
  const commit = () =>
    updateState((s) => {
      s.tasks.push({
        id: uid(),
        name,
        description: "",
        category: s.categories[0].id,
        scheduled: true,
        date,
        startTime,
        endTime,
        duration: 30,
        recurrence: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  if (conflicts.length > 0) {
    openConflictModal(conflicts, {
      onAdjust: () => openTaskModal("create", { date, startTime, endTime, name }),
      onScheduleAnyway: commit,
    });
  } else {
    commit();
  }
}

// Called by modals.js when the task form is submitted.
function saveTaskFromModal(mode, payload) {
  if (mode === "create") {
    updateState((s) => {
      const task = {
        id: uid(),
        name: payload.name,
        description: payload.description,
        category: payload.category,
        scheduled: payload.scheduled,
        date: payload.scheduled ? payload.date : null,
        startTime: payload.scheduled ? payload.startTime : null,
        endTime: payload.scheduled ? payload.endTime : null,
        duration: payload.duration,
        recurrence: payload.recurrence,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      s.tasks.push(task);
      if (payload.scheduled && payload.status && payload.status !== "not-started") {
        ensureInstance(s, instanceKey(task.id, task.date)).status = payload.status;
      }
    });
    return;
  }

  // mode === "edit"
  updateState((s) => {
    const task = s.tasks.find((t) => t.id === payload.taskId);
    if (!task) return;

    task.name = payload.name;
    task.description = payload.description;
    task.category = payload.category;
    task.recurrence = payload.recurrence;
    task.duration = payload.duration;
    task.updatedAt = Date.now();

    if (!payload.scheduled) {
      task.scheduled = false;
      task.date = null;
      task.startTime = null;
      task.endTime = null;
      return;
    }

    let statusKey;
    if (!task.scheduled) {
      // First time this task gets a date/time
      task.scheduled = true;
      task.date = payload.date;
      task.startTime = payload.startTime;
      task.endTime = payload.endTime;
      statusKey = instanceKey(task.id, task.date);
    } else if (!task.recurrence) {
      // Simple one-time task: just move it directly
      task.date = payload.date;
      task.startTime = payload.startTime;
      task.endTime = payload.endTime;
      statusKey = instanceKey(task.id, task.date);
    } else {
      // Recurring task: only this occurrence moves, via an override
      const occKey = payload.occurrenceKey || instanceKey(task.id, payload.date);
      const orig = splitInstanceKey(occKey).date;
      const inst = ensureInstance(s, occKey);
      if (payload.date !== orig || payload.startTime !== task.startTime || payload.endTime !== task.endTime) {
        inst.override = { date: payload.date, startTime: payload.startTime, endTime: payload.endTime };
      }
      statusKey = occKey;
    }

    if (payload.status) {
      ensureInstance(s, statusKey).status = payload.status;
    }
  });
}

function deleteTask(taskId) {
  updateState((s) => {
    s.tasks = s.tasks.filter((t) => t.id !== taskId);
    Object.keys(s.instances).forEach((k) => {
      if (splitInstanceKey(k).taskId === taskId) delete s.instances[k];
    });
  });
}

// Deletes just ONE occurrence of a recurring task (or the whole
// task, if it isn't recurring — there's only one occurrence anyway).
function deleteOccurrence(occurrenceKey) {
  const { taskId } = splitInstanceKey(occurrenceKey);
  const task = getTaskById(taskId);
  if (!task) return;
  if (!task.recurrence) {
    deleteTask(taskId);
    return;
  }
  updateState((s) => {
    ensureInstance(s, occurrenceKey).deleted = true;
  });
}

function rescheduleOccurrence(occurrenceKey, newDate, newStart, newEnd) {
  const { taskId } = splitInstanceKey(occurrenceKey);
  updateState((s) => {
    const task = s.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!task.recurrence) {
      task.date = newDate;
      task.startTime = newStart;
      task.endTime = newEnd;
      task.updatedAt = Date.now();
    } else {
      const inst = ensureInstance(s, occurrenceKey);
      inst.override = { date: newDate, startTime: newStart, endTime: newEnd };
    }
  });
}

function rescheduleToTomorrow(occurrenceKey) {
  const occ = findOccurrenceByKey(occurrenceKey);
  if (!occ) return;
  attemptReschedule(occurrenceKey, addDays(occ.date, 1), occ.startTime, occ.endTime);
}

function scheduleUnscheduledTask(taskId, date, startTime, endTime) {
  updateState((s) => {
    const t = s.tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.scheduled = true;
    t.date = date;
    t.startTime = startTime;
    t.endTime = endTime;
    t.duration = minutesBetween(startTime, endTime);
    t.updatedAt = Date.now();
  });
}
