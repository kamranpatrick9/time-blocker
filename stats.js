/* ============================================================
   stats.js
   ------------------------------------------------------------
   Turns raw task/instance data into the numbers shown on the
   Dashboard and Statistics pages: planned vs. completed vs.
   actual time, completion rate, rescheduled/missed counts.
   ============================================================ */

function computeDailyStats(dateStr) {
  const occurrences = getOccurrencesForDate(state, dateStr);
  const plannedMinutes = occurrences.reduce((sum, o) => sum + o.duration, 0);
  const completedMinutes = occurrences
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.duration, 0);
  const actualMinutes = occurrences.reduce((sum, o) => sum + getElapsedMs(o.actual) / 60000, 0);
  const completionPct = plannedMinutes ? Math.round((completedMinutes / plannedMinutes) * 100) : 0;
  return { occurrences, plannedMinutes, completedMinutes, actualMinutes, completionPct };
}

function computeWeeklyStats(weekStartStr) {
  let plannedMinutes = 0;
  let completedMinutes = 0;
  let actualMinutes = 0;
  let completedCount = 0;
  let missedCount = 0;
  let rescheduledCount = 0;
  const days = [];

  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(weekStartStr, i);
    const day = computeDailyStats(dateStr);
    plannedMinutes += day.plannedMinutes;
    completedMinutes += day.completedMinutes;
    actualMinutes += day.actualMinutes;
    completedCount += day.occurrences.filter((o) => o.status === "completed").length;
    missedCount += day.occurrences.filter((o) => o.status === "missed").length;
    days.push({ dateStr, ...day });
  }

  Object.entries(state.instances).forEach(([key, inst]) => {
    if (!inst.override || !inst.override.date) return;
    const { date: originalDate } = splitInstanceKey(key);
    if (originalDate >= weekStartStr && originalDate <= addDays(weekStartStr, 6)) {
      rescheduledCount++;
    }
  });

  const completionPct = plannedMinutes ? Math.round((completedMinutes / plannedMinutes) * 100) : 0;
  return { days, plannedMinutes, completedMinutes, actualMinutes, completionPct, completedCount, missedCount, rescheduledCount };
}

function renderDashboardPage() {
  const today = todayISO();
  const stats = computeDailyStats(today);
  const el = document.getElementById("page-dashboard");

  const scheduleHtml = stats.occurrences.length
    ? stats.occurrences
        .map(
          (o) => `
        <div class="dash-row">
          <span class="dash-dot" style="background:${getCategory(o.category).color}"></span>
          <span class="dash-time">${formatTime12h(o.startTime)}</span>
          <span class="dash-name">${STATUS_ICON[o.status] || "⚪"} ${escapeHtml(o.name)}</span>
        </div>`
        )
        .join("")
    : `<p class="empty-hint">Nothing scheduled today — enjoy the open calendar, or add something from the Tasks page.</p>`;

  el.innerHTML = `
    <h1>🏠 Dashboard</h1>
    <p class="page-sub">${formatDateHeading(today)}</p>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">${formatDuration(stats.plannedMinutes)}</div>
        <div class="stat-label">Planned Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatDuration(stats.completedMinutes)}</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.completionPct}%</div>
        <div class="stat-label">Completion</div>
      </div>
    </div>

    <h2>Today's Schedule</h2>
    <div class="dash-schedule">${scheduleHtml}</div>
  `;
}

function renderStatisticsPage() {
  const today = todayISO();
  const weekStart = startOfWeek(today, state.settings.weekStartsOn);
  const daily = computeDailyStats(today);
  const weekly = computeWeeklyStats(weekStart);
  const el = document.getElementById("page-statistics");

  const barsHtml = weekly.days
    .map((d) => {
      const pct = d.plannedMinutes ? Math.min(100, Math.round((d.completedMinutes / d.plannedMinutes) * 100)) : 0;
      const dow = DAY_NAMES_SHORT[parseISODate(d.dateStr).getDay()];
      return `
        <div class="week-bar-col">
          <div class="week-bar-track"><div class="week-bar-fill" style="height:${pct}%"></div></div>
          <div class="week-bar-label">${dow}</div>
        </div>`;
    })
    .join("");

  el.innerHTML = `
    <h1>📊 Statistics</h1>

    <h2>Today</h2>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${formatDuration(daily.plannedMinutes)}</div><div class="stat-label">Planned</div></div>
      <div class="stat-card"><div class="stat-value">${formatDuration(daily.completedMinutes)}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${daily.completionPct}%</div><div class="stat-label">Completion</div></div>
      <div class="stat-card"><div class="stat-value">${formatDuration(daily.actualMinutes)}</div><div class="stat-label">Actual (tracked)</div></div>
    </div>

    <h2>This Week</h2>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">${formatDuration(weekly.plannedMinutes)}</div><div class="stat-label">Scheduled</div></div>
      <div class="stat-card"><div class="stat-value">${formatDuration(weekly.completedMinutes)}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${weekly.completionPct}%</div><div class="stat-label">Completion Rate</div></div>
      <div class="stat-card"><div class="stat-value">${weekly.completedCount}</div><div class="stat-label">Tasks Completed</div></div>
      <div class="stat-card"><div class="stat-value">${weekly.rescheduledCount}</div><div class="stat-label">Rescheduled</div></div>
      <div class="stat-card"><div class="stat-value">${weekly.missedCount}</div><div class="stat-label">Missed</div></div>
    </div>

    <h2>Planned vs. Completed (% by day)</h2>
    <div class="week-bars">${barsHtml}</div>
  `;
}
