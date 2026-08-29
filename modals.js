/* ============================================================
   modals.js
   ------------------------------------------------------------
   The "Create/Edit Task" popup and the "Schedule Conflict"
   popup. This file reads values OUT of the HTML form fields
   defined in index.html, and writes values INTO them — it
   doesn't create the fields itself (that keeps index.html easy
   to read and tweak).
   ============================================================ */

let _modalContext = null; // { mode: 'create'|'edit', occurrenceKey, taskId }

function initModals() {
  // Duration <-> End Time two-way sync
  document.getElementById("tf-start").addEventListener("change", onStartChanged);
  document.getElementById("tf-end").addEventListener("change", onEndChanged);
  document.getElementById("tf-duration").addEventListener("change", onDurationChanged);

  document.getElementById("tf-scheduled").addEventListener("change", (e) => {
    document.getElementById("schedule-fields").classList.toggle("hidden", !e.target.checked);
  });

  document.getElementById("tf-recurrence-enabled").addEventListener("change", (e) => {
    document.getElementById("recurrence-fields").classList.toggle("hidden", !e.target.checked);
  });
  document.getElementById("tf-recurrence-type").addEventListener("change", (e) => {
    document.getElementById("recurrence-specific-days").classList.toggle("hidden", e.target.value !== "specific");
    document.getElementById("recurrence-interval-wrap").classList.toggle("hidden", e.target.value !== "everyXWeeks");
  });

  document.getElementById("task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    handleTaskFormSave();
  });
  document.getElementById("tf-cancel").addEventListener("click", () => closeModal("task-modal"));
  document.getElementById("tf-delete").addEventListener("click", handleTaskFormDelete);
  document.getElementById("tf-reschedule-tomorrow").addEventListener("click", () => {
    if (_modalContext && _modalContext.occurrenceKey) {
      rescheduleToTomorrow(_modalContext.occurrenceKey);
      closeModal("task-modal");
    }
  });
  document.getElementById("tf-timer-toggle").addEventListener("click", () => {
    const key = _modalContext.occurrenceKey;
    const inst = readInstance(state, key);
    if (inst.actual.isRunning) stopTimer(key);
    else startTimer(key);
    // Re-open with fresh data so the button label flips instantly.
    const occ = findOccurrenceByKey(key) || taskModalSnapshot();
    populateTaskForm("edit", occ);
  });

  document.getElementById("conflict-cancel").addEventListener("click", () => closeModal("conflict-modal"));
  document.getElementById("conflict-adjust").addEventListener("click", () => {
    closeModal("conflict-modal");
    if (_conflictCallbacks && _conflictCallbacks.onAdjust) _conflictCallbacks.onAdjust();
  });
  document.getElementById("conflict-anyway").addEventListener("click", () => {
    closeModal("conflict-modal");
    if (_conflictCallbacks && _conflictCallbacks.onScheduleAnyway) _conflictCallbacks.onScheduleAnyway();
  });
}

function onStartChanged() {
  const start = document.getElementById("tf-start").value;
  const duration = Number(document.getElementById("tf-duration").value) || 30;
  document.getElementById("tf-end").value = addMinutesToTime(start, duration);
}
function onEndChanged() {
  const start = document.getElementById("tf-start").value;
  const end = document.getElementById("tf-end").value;
  document.getElementById("tf-duration").value = minutesBetween(start, end) || 0;
}
function onDurationChanged() {
  const start = document.getElementById("tf-start").value;
  const duration = Number(document.getElementById("tf-duration").value) || 0;
  document.getElementById("tf-end").value = addMinutesToTime(start, duration);
}

function populateCategorySelect() {
  const sel = document.getElementById("tf-category");
  sel.innerHTML = state.categories.map((c) => `<option value="${c.id}">${c.emoji} ${escapeHtml(c.name)}</option>`).join("");
}

function openTaskModal(mode, occOrPrefill, overrides) {
  _modalContext = { mode, occurrenceKey: occOrPrefill.occurrenceKey || null, taskId: occOrPrefill.taskId || null };
  populateTaskForm(mode, { ...occOrPrefill, ...(overrides || {}) });
  document.getElementById("task-modal-title").textContent = mode === "create" ? "Create a Time Block" : "Edit Task";
  document.getElementById("tf-delete").classList.toggle("hidden", mode === "create");
  document.getElementById("task-modal").classList.remove("hidden");
}

function taskModalSnapshot() {
  // Used right after starting/stopping a timer to keep the modal's
  // fields consistent without a full page re-render.
  return {
    occurrenceKey: _modalContext.occurrenceKey,
    taskId: _modalContext.taskId,
    date: document.getElementById("tf-date").value,
    startTime: document.getElementById("tf-start").value,
    endTime: document.getElementById("tf-end").value,
    name: document.getElementById("tf-name").value,
    description: document.getElementById("tf-description").value,
    category: document.getElementById("tf-category").value,
    status: document.getElementById("tf-status").value,
  };
}

function populateTaskForm(mode, occ) {
  populateCategorySelect();

  document.getElementById("tf-name").value = occ.name || "";
  document.getElementById("tf-description").value = occ.description || "";
  document.getElementById("tf-category").value = occ.category || state.categories[0].id;
  document.getElementById("tf-status").value = occ.status || "not-started";

  const isScheduled = occ.scheduled !== false && !!(occ.date && occ.startTime);
  document.getElementById("tf-scheduled").checked = isScheduled;
  document.getElementById("schedule-fields").classList.toggle("hidden", !isScheduled);
  document.getElementById("tf-date").value = occ.date || todayISO();
  document.getElementById("tf-start").value = occ.startTime || "09:00";
  document.getElementById("tf-end").value = occ.endTime || "09:30";
  document.getElementById("tf-duration").value = occ.duration || minutesBetween(occ.startTime || "09:00", occ.endTime || "09:30") || 30;

  const rec = occ.recurrence || null;
  document.getElementById("tf-recurrence-enabled").checked = !!rec;
  document.getElementById("recurrence-fields").classList.toggle("hidden", !rec);
  document.getElementById("tf-recurrence-type").value = rec ? rec.type : "weekly";
  document.getElementById("recurrence-specific-days").classList.toggle("hidden", !(rec && rec.type === "specific"));
  document.getElementById("recurrence-interval-wrap").classList.toggle("hidden", !(rec && rec.type === "everyXWeeks"));
  document.getElementById("tf-recurrence-interval").value = rec && rec.interval ? rec.interval : 2;
  document.getElementById("tf-recurrence-end").value = rec && rec.endDate ? rec.endDate : "";
  document.querySelectorAll(".rec-day-checkbox").forEach((cb) => {
    cb.checked = !!(rec && rec.type === "specific" && (rec.days || []).includes(Number(cb.value)));
  });

  // Timer + reschedule sections only make sense for an existing,
  // scheduled occurrence.
  const showTimerBlock = mode === "edit" && isScheduled && occ.occurrenceKey;
  document.getElementById("timer-section").classList.toggle("hidden", !showTimerBlock);
  document.getElementById("reschedule-section").classList.toggle("hidden", !showTimerBlock);

  if (showTimerBlock) {
    const inst = readInstance(state, occ.occurrenceKey);
    document.getElementById("timer-planned").textContent = `Planned: ${formatDuration(minutesBetween(occ.startTime, occ.endTime))}`;
    const btn = document.getElementById("tf-timer-toggle");
    btn.textContent = inst.actual.isRunning ? "⏹ Stop" : "▶ Start";
    btn.classList.toggle("running", inst.actual.isRunning);
    const liveEl = document.getElementById("timer-live");
    liveEl.dataset.liveTimer = occ.occurrenceKey;
    liveEl.textContent = formatStopwatch(getElapsedMs(inst.actual));
    const actualWrap = document.getElementById("timer-actual");
    if (inst.actual.accumulatedMs > 0 || inst.actual.isRunning) {
      actualWrap.classList.remove("hidden");
      actualWrap.textContent = `Actual: ${formatDuration(getElapsedMs(inst.actual) / 60000)}`;
    } else {
      actualWrap.classList.add("hidden");
    }
  }
}

function readRecurrenceFromForm() {
  if (!document.getElementById("tf-recurrence-enabled").checked) return null;
  const type = document.getElementById("tf-recurrence-type").value;
  const rec = { type, endDate: document.getElementById("tf-recurrence-end").value || null };
  if (type === "specific") {
    rec.days = Array.from(document.querySelectorAll(".rec-day-checkbox:checked")).map((cb) => Number(cb.value));
  }
  if (type === "everyXWeeks") {
    rec.interval = Math.max(1, Number(document.getElementById("tf-recurrence-interval").value) || 1);
  }
  return rec;
}

function handleTaskFormSave() {
  const scheduled = document.getElementById("tf-scheduled").checked;
  const payload = {
    taskId: _modalContext.taskId,
    occurrenceKey: _modalContext.occurrenceKey,
    name: document.getElementById("tf-name").value.trim(),
    description: document.getElementById("tf-description").value.trim(),
    category: document.getElementById("tf-category").value,
    status: document.getElementById("tf-status").value,
    scheduled,
    date: document.getElementById("tf-date").value,
    startTime: document.getElementById("tf-start").value,
    endTime: document.getElementById("tf-end").value,
    duration: Number(document.getElementById("tf-duration").value) || 30,
    recurrence: readRecurrenceFromForm(),
  };

  if (!payload.name) {
    alert("Please give this task a name.");
    return;
  }
  if (scheduled && timeToMinutes(payload.endTime) <= timeToMinutes(payload.startTime)) {
    alert("End time must be after start time.");
    return;
  }

  const mode = _modalContext.mode;
  const finish = () => {
    saveTaskFromModal(mode, payload);
    closeModal("task-modal");
  };

  if (scheduled) {
    const excludeKey = mode === "edit" ? _modalContext.occurrenceKey : null;
    const conflicts = findConflicts(state, payload.date, payload.startTime, payload.endTime, excludeKey);
    if (conflicts.length > 0) {
      openConflictModal(conflicts, { onAdjust: () => {}, onScheduleAnyway: finish });
      return;
    }
  }
  finish();
}

function handleTaskFormDelete() {
  const taskId = _modalContext.taskId;
  const task = getTaskById(taskId);
  if (!task) return;
  if (task.recurrence) {
    const wholeSeries = confirm(
      'Click OK to delete the WHOLE recurring series ("' + task.name + '").\nClick Cancel to delete just this one occurrence.'
    );
    if (wholeSeries) deleteTask(taskId);
    else if (_modalContext.occurrenceKey) deleteOccurrence(_modalContext.occurrenceKey);
  } else {
    if (confirm(`Delete "${task.name}"?`)) deleteTask(taskId);
  }
  closeModal("task-modal");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

let _conflictCallbacks = null;

function openConflictModal(conflicts, callbacks) {
  _conflictCallbacks = callbacks;
  const list = document.getElementById("conflict-list");
  list.innerHTML = conflicts
    .map((c) => `<li><strong>${escapeHtml(c.name)}</strong> — ${formatTime12h(c.startTime)}–${formatTime12h(c.endTime)}</li>`)
    .join("");
  document.getElementById("conflict-modal").classList.remove("hidden");
}
