/* ============================================================
   app.js
   ------------------------------------------------------------
   The entry point. Loads your saved data, wires up all the
   buttons/navigation, and re-renders every page whenever the
   state changes.

   RENDERING STRATEGY (beginner note)
   Every time updateState(...) runs (see state.js), we simply
   re-render ALL five pages from scratch based on the current
   `state` object. That's simpler to reason about than trying to
   carefully patch just the one thing that changed — the tradeoff
   is it's a little wasteful. For a personal app with a few
   hundred tasks, this is unnoticeable. If you outgrow it, the
   `subscribe()` system already isolates "state changed" from
   "redraw the screen", so you can optimize later without
   rewriting everything.
   ============================================================ */

async function init() {
  setSyncStatus(isJsonbinConfigured() ? "saving" : "offline");

  const loaded = await loadInitialState();
  initState(loaded);

  subscribe(renderAll);
  initTasksPage();
  initModals();
  wireNav();
  wireCalendarControls();
  wireSettingsStaticHandlers();

  renderAll();
  setSyncStatus(isJsonbinConfigured() ? "synced" : "offline");

  setInterval(updateCurrentTimeLine, 30 * 1000);
  setInterval(tickRunningTimers, 1000);
}

function renderAll() {
  document.querySelectorAll(".page").forEach((p) => {
    p.classList.toggle("active", p.id === `page-${state.ui.currentPage}`);
  });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === state.ui.currentPage);
  });

  renderDashboardPage();
  renderCalendarPage();
  renderTasksPage();
  renderStatisticsPage();
  renderSettingsPage();
}

function wireNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateState((s) => (s.ui.currentPage = btn.dataset.page));
    });
  });
}

function wireCalendarControls() {
  document.getElementById("cal-prev").addEventListener("click", () => navigateCalendar(-1));
  document.getElementById("cal-next").addEventListener("click", () => navigateCalendar(1));
  document.getElementById("cal-today").addEventListener("click", goToToday);
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchCalendarView(btn.dataset.view));
  });
  document.getElementById("open-create-task").addEventListener("click", () => {
    openTaskModal("create", {
      date: state.ui.currentDate,
      startTime: "09:00",
      endTime: "09:30",
      scheduled: true,
    });
  });
}

/* ---------------- Settings page ----------------
   Kept here (rather than a separate settings.js) since it's
   mostly simple form wiring — categories + calendar hour range.
   ------------------------------------------------ */

function renderSettingsPage() {
  const el = document.getElementById("page-settings");
  el.innerHTML = `
    <h1>⚙️ Settings</h1>

    <h2>Categories</h2>
    <div id="category-list"></div>
    <form id="add-category-form" class="inline-form">
      <input id="cat-emoji" maxlength="4" placeholder="📌" style="width:3.5em">
      <input id="cat-name" placeholder="Category name" required>
      <input id="cat-color" type="color" value="#3b82f6">
      <button type="submit">+ Add Category</button>
    </form>

    <h2>Calendar Hours</h2>
    <div class="settings-row">
      <label>Day starts at <select id="set-day-start"></select></label>
      <label>Day ends at <select id="set-day-end"></select></label>
      <label>Week starts on
        <select id="set-week-start">
          <option value="0">Sunday</option>
          <option value="1">Monday</option>
        </select>
      </label>
    </div>
  `;

  renderCategoryList();

  const startSel = document.getElementById("set-day-start");
  const endSel = document.getElementById("set-day-end");
  for (let h = 0; h < 24; h++) {
    const label = formatTime12h(`${pad2(h)}:00`);
    startSel.innerHTML += `<option value="${h}">${label}</option>`;
    endSel.innerHTML += `<option value="${h}">${label}</option>`;
  }
  startSel.value = state.settings.dayStartHour;
  endSel.value = state.settings.dayEndHour;
  document.getElementById("set-week-start").value = state.settings.weekStartsOn;

  startSel.addEventListener("change", (e) => updateState((s) => (s.settings.dayStartHour = Number(e.target.value))));
  endSel.addEventListener("change", (e) => updateState((s) => (s.settings.dayEndHour = Number(e.target.value))));
  document
    .getElementById("set-week-start")
    .addEventListener("change", (e) => updateState((s) => (s.settings.weekStartsOn = Number(e.target.value))));

  document.getElementById("add-category-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const emoji = document.getElementById("cat-emoji").value.trim() || "📌";
    const name = document.getElementById("cat-name").value.trim();
    const color = document.getElementById("cat-color").value;
    if (!name) return;
    updateState((s) => s.categories.push({ id: uid(), name, emoji, color }));
  });
}

function renderCategoryList() {
  const container = document.getElementById("category-list");
  container.innerHTML = "";
  state.categories.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <span class="cat-swatch" style="background:${cat.color}"></span>
      <span class="cat-emoji">${cat.emoji}</span>
      <span class="cat-name">${escapeHtml(cat.name)}</span>
      <button class="icon-btn cat-del" title="Delete">🗑️</button>
    `;
    row.querySelector(".cat-del").addEventListener("click", () => {
      if (state.categories.length <= 1) {
        showAlert("You need at least one category.");
        return;
      }
      const fallback = state.categories.find((c) => c.id !== cat.id);
      showConfirm(`Delete category "${cat.name}"? Its tasks will move to "${fallback.name}".`, () => {
        updateState((s) => {
          s.tasks.forEach((t) => {
            if (t.category === cat.id) t.category = fallback.id;
          });
          s.categories = s.categories.filter((c) => c.id !== cat.id);
        });
      }, "Delete");
    });
    container.appendChild(row);
  });
}

function wireSettingsStaticHandlers() {
  // placeholder for future static (non-rebuilt) settings wiring
}

document.addEventListener("DOMContentLoaded", init);
