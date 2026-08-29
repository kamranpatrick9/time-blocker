/* ============================================================
   calendar.js
   ------------------------------------------------------------
   Everything about drawing the Day / Week / Month calendar,
   and handling drag-and-drop + click-to-create/edit + the
   red "current time" line.

   THE BIG IDEA FOR POSITIONING BLOCKS
   We draw time using plain pixels: 1 minute of time = 1 pixel
   of height. So a task from 2:00 PM to 3:30 PM (90 minutes) is
   simply a box 90px tall. Its "top" position is how many minutes
   after the calendar's start hour it begins. This is a common,
   simple trick for building calendar UIs without a library.
   ============================================================ */

const PX_PER_MINUTE = 1; // 1 minute = 1 pixel. Change this to zoom the day in/out.

function calendarLabelFor(view, dateStr) {
  if (view === "day") return formatDateHeading(dateStr);
  if (view === "week") {
    const start = startOfWeek(dateStr, state.settings.weekStartsOn);
    const end = addDays(start, 6);
    return `${formatDateShort(start)} – ${formatDateShort(end)}`;
  }
  const d = parseISODate(dateStr);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function renderCalendarPage() {
  const { currentView, currentDate } = state.ui;

  document.getElementById("calendar-date-label").textContent = calendarLabelFor(currentView, currentDate);
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === currentView);
  });

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";
  grid.className = `calendar-grid view-${currentView}`;

  if (currentView === "day") {
    grid.appendChild(buildTimeGutter());
    grid.appendChild(buildDayColumn(currentDate));
  } else if (currentView === "week") {
    grid.appendChild(buildTimeGutter());
    const start = startOfWeek(currentDate, state.settings.weekStartsOn);
    for (let i = 0; i < 7; i++) {
      grid.appendChild(buildDayColumn(addDays(start, i)));
    }
  } else {
    renderMonthView(grid, currentDate);
  }

  updateCurrentTimeLine();
}

function buildTimeGutter() {
  const { dayStartHour, dayEndHour } = state.settings;
  const gutter = document.createElement("div");
  gutter.className = "time-gutter";
  gutter.style.height = `${(dayEndHour - dayStartHour) * 60 * PX_PER_MINUTE}px`;
  for (let h = dayStartHour; h <= dayEndHour; h++) {
    const label = document.createElement("div");
    label.className = "time-gutter-label";
    label.style.top = `${(h - dayStartHour) * 60 * PX_PER_MINUTE}px`;
    label.textContent = formatTime12h(`${pad2(h)}:00`);
    gutter.appendChild(label);
  }
  return gutter;
}

function buildDayColumn(dateStr) {
  const { dayStartHour, dayEndHour } = state.settings;
  const totalHeight = (dayEndHour - dayStartHour) * 60 * PX_PER_MINUTE;
  const isToday = dateStr === todayISO();

  const col = document.createElement("div");
  col.className = "calendar-day-col";

  const header = document.createElement("div");
  header.className = "day-col-header" + (isToday ? " today" : "");
  header.innerHTML = `<span class="dow">${DAY_NAMES_SHORT[parseISODate(dateStr).getDay()]}</span><span class="dnum">${parseISODate(dateStr).getDate()}</span>`;
  col.appendChild(header);

  const track = document.createElement("div");
  track.className = "day-track";
  track.dataset.date = dateStr;
  track.style.height = `${totalHeight}px`;

  // Faint hour lines
  for (let h = dayStartHour; h <= dayEndHour; h++) {
    const line = document.createElement("div");
    line.className = "hour-line";
    line.style.top = `${(h - dayStartHour) * 60 * PX_PER_MINUTE}px`;
    track.appendChild(line);
  }

  // Click empty space -> create a task at that time
  track.addEventListener("click", (e) => {
    if (e.target !== track) return; // ignore clicks that bubbled from a block
    const rect = track.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutes = dayStartHour * 60 + Math.round(offsetY / PX_PER_MINUTE / 15) * 15;
    const startTime = minutesToTimeStr(minutes);
    openTaskModal("create", { date: dateStr, startTime, endTime: addMinutesToTime(startTime, 30) });
  });

  // Drag-and-drop target
  track.addEventListener("dragover", (e) => e.preventDefault());
  track.addEventListener("drop", (e) => handleDropOnTrack(e, track, dateStr));

  // Occurrences for this day, laid out side-by-side if they overlap
  const occurrences = getOccurrencesForDate(state, dateStr);
  const laidOut = layoutDayOccurrences(occurrences);
  laidOut.forEach(({ occ, col: colIndex, totalCols }) => {
    track.appendChild(createOccurrenceBlockEl(occ, colIndex, totalCols, dayStartHour));
  });

  if (isToday) {
    const line = document.createElement("div");
    line.className = "current-time-line";
    line.dataset.date = dateStr;
    track.appendChild(line);
  }

  col.appendChild(track);
  return col;
}

// Simple overlap-avoidance: gives overlapping blocks their own column
// so they sit side-by-side instead of on top of each other.
function layoutDayOccurrences(occurrences) {
  const sorted = [...occurrences].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const active = [];
  const placed = [];
  for (const occ of sorted) {
    const startMin = timeToMinutes(occ.startTime);
    const endMin = timeToMinutes(occ.endTime);
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endMin <= startMin) active.splice(i, 1);
    }
    const usedCols = active.map((a) => a.col);
    let col = 0;
    while (usedCols.includes(col)) col++;
    active.push({ col, endMin });
    placed.push({ occ, col });
  }
  const totalCols = Math.max(1, ...placed.map((p) => p.col + 1));
  return placed.map((p) => ({ ...p, totalCols }));
}

const STATUS_ICON = { "not-started": "⚪", "in-progress": "🔵", completed: "🟢", missed: "🔴" };

function createOccurrenceBlockEl(occ, colIndex, totalCols, dayStartHour) {
  const category = getCategory(occ.category);
  const top = (timeToMinutes(occ.startTime) - dayStartHour * 60) * PX_PER_MINUTE;
  const height = Math.max(18, occ.duration * PX_PER_MINUTE);
  const widthPct = 100 / totalCols;

  const block = document.createElement("div");
  block.className = "task-block";
  if (occ.status === "completed") block.classList.add("completed");
  block.draggable = true;
  block.dataset.occurrenceKey = occ.occurrenceKey;
  block.style.top = `${top}px`;
  block.style.height = `${height}px`;
  block.style.left = `${colIndex * widthPct}%`;
  block.style.width = `calc(${widthPct}% - 4px)`;
  block.style.background = category.color;

  block.innerHTML = `
    <div class="tb-title">${STATUS_ICON[occ.status] || "⚪"} ${escapeHtml(occ.name)}</div>
    <div class="tb-time">${formatTime12h(occ.startTime)} – ${formatTime12h(occ.endTime)}</div>
  `;

  block.addEventListener("click", (e) => {
    e.stopPropagation();
    openTaskModal("edit", occ);
  });
  block.addEventListener("dragstart", (e) => {
    block.classList.add("dragging");
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ kind: "occurrence", occurrenceKey: occ.occurrenceKey, taskId: occ.taskId, durationMin: occ.duration })
    );
  });
  block.addEventListener("dragend", () => block.classList.remove("dragging"));

  return block;
}

function handleDropOnTrack(e, track, dateStr) {
  e.preventDefault();
  let data;
  try {
    data = JSON.parse(e.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  const rect = track.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const minutes = state.settings.dayStartHour * 60 + Math.round(offsetY / PX_PER_MINUTE / 15) * 15;
  const newStart = minutesToTimeStr(minutes);

  if (data.kind === "occurrence") {
    const newEnd = addMinutesToTime(newStart, data.durationMin);
    attemptReschedule(data.occurrenceKey, dateStr, newStart, newEnd);
  } else if (data.kind === "unscheduled") {
    const duration = 30;
    const newEnd = addMinutesToTime(newStart, duration);
    attemptScheduleUnscheduled(data.taskId, dateStr, newStart, newEnd);
  }
}

// Shared by drag-drop AND the "Reschedule" menu in the edit modal.
function attemptReschedule(occurrenceKey, newDate, newStart, newEnd) {
  const conflicts = findConflicts(state, newDate, newStart, newEnd, occurrenceKey);
  if (conflicts.length > 0) {
    openConflictModal(conflicts, {
      onAdjust: () => {
        const occ = findOccurrenceByKey(occurrenceKey);
        openTaskModal("edit", occ, { date: newDate, startTime: newStart, endTime: newEnd });
      },
      onScheduleAnyway: () => rescheduleOccurrence(occurrenceKey, newDate, newStart, newEnd),
    });
  } else {
    rescheduleOccurrence(occurrenceKey, newDate, newStart, newEnd);
  }
}

function attemptScheduleUnscheduled(taskId, date, startTime, endTime) {
  const conflicts = findConflicts(state, date, startTime, endTime, null);
  if (conflicts.length > 0) {
    openConflictModal(conflicts, {
      onAdjust: () => {
        const task = getTaskById(taskId);
        openTaskModal("edit", taskToPseudoOccurrence(task), { date, startTime, endTime, scheduling: true });
      },
      onScheduleAnyway: () => scheduleUnscheduledTask(taskId, date, startTime, endTime),
    });
  } else {
    scheduleUnscheduledTask(taskId, date, startTime, endTime);
  }
}

function findOccurrenceByKey(occurrenceKey) {
  const { date } = splitInstanceKey(occurrenceKey);
  return getOccurrencesForDate(state, date).find((o) => o.occurrenceKey === occurrenceKey);
}

function renderMonthView(grid, dateStr) {
  grid.classList.add("month-grid");

  const dowHeader = document.createElement("div");
  dowHeader.className = "month-dow-header";
  for (let i = 0; i < 7; i++) {
    const idx = (state.settings.weekStartsOn + i) % 7;
    const cell = document.createElement("div");
    cell.textContent = DAY_NAMES_SHORT[idx];
    dowHeader.appendChild(cell);
  }
  grid.appendChild(dowHeader);

  const monthGridBody = document.createElement("div");
  monthGridBody.className = "month-grid-body";

  const firstOfMonth = startOfMonth(dateStr);
  const gridStart = startOfWeek(firstOfMonth, state.settings.weekStartsOn);
  const currentMonth = parseISODate(dateStr).getMonth();

  for (let i = 0; i < 42; i++) {
    const cellDate = addDays(gridStart, i);
    const d = parseISODate(cellDate);
    const cell = document.createElement("div");
    cell.className = "month-cell";
    if (d.getMonth() !== currentMonth) cell.classList.add("dim");
    if (cellDate === todayISO()) cell.classList.add("today");

    const occurrences = getOccurrencesForDate(state, cellDate);
    const chips = occurrences
      .slice(0, 3)
      .map((occ) => {
        const cat = getCategory(occ.category);
        return `<div class="month-chip" style="background:${cat.color}">${escapeHtml(occ.name)}</div>`;
      })
      .join("");
    const more = occurrences.length > 3 ? `<div class="month-more">+${occurrences.length - 3} more</div>` : "";

    cell.innerHTML = `<div class="month-cell-num">${d.getDate()}</div><div class="month-cell-chips">${chips}${more}</div>`;
    cell.addEventListener("click", () => {
      updateState((s) => {
        s.ui.currentDate = cellDate;
        s.ui.currentView = "day";
      });
    });
    monthGridBody.appendChild(cell);
  }

  grid.appendChild(monthGridBody);
}

function updateCurrentTimeLine() {
  const line = document.querySelector(`.current-time-line[data-date="${todayISO()}"]`);
  if (!line) return;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const { dayStartHour, dayEndHour } = state.settings;
  if (mins < dayStartHour * 60 || mins > dayEndHour * 60) {
    line.style.display = "none";
    return;
  }
  line.style.display = "block";
  line.style.top = `${(mins - dayStartHour * 60) * PX_PER_MINUTE}px`;
}

function navigateCalendar(delta) {
  const { currentView, currentDate } = state.ui;
  let newDate;
  if (currentView === "day") newDate = addDays(currentDate, delta);
  else if (currentView === "week") newDate = addDays(currentDate, delta * 7);
  else {
    const d = parseISODate(currentDate);
    d.setMonth(d.getMonth() + delta);
    newDate = toISODate(d);
  }
  updateState((s) => (s.ui.currentDate = newDate));
}

function goToToday() {
  updateState((s) => (s.ui.currentDate = todayISO()));
}

function switchCalendarView(view) {
  updateState((s) => (s.ui.currentView = view));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
