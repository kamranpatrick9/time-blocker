/* ============================================================
   timer.js
   ------------------------------------------------------------
   The [▶ Start] / [■ Stop] time-tracking feature. Lets you
   compare "Planned: 1h 30m" against "Actual: 1h 42m".

   HOW IT WORKS
   Each occurrence's `actual` object looks like:
     { startedAt: <timestamp or null>, accumulatedMs: <number>, isRunning: <bool> }
   - When you click Start, we record `startedAt = now`.
   - While running, elapsed time = accumulatedMs + (now - startedAt).
   - When you click Stop, we add that elapsed chunk into
     accumulatedMs and clear startedAt. This lets you Start/Stop
     multiple times (e.g. paused for a break) and still get an
     accurate total.
   ============================================================ */

function startTimer(occurrenceKey) {
  updateState((s) => {
    const inst = ensureInstance(s, occurrenceKey);
    if (inst.actual.isRunning) return;
    inst.actual.isRunning = true;
    inst.actual.startedAt = Date.now();
    if (inst.status === "not-started") inst.status = "in-progress";
  });
}

function stopTimer(occurrenceKey) {
  updateState((s) => {
    const inst = ensureInstance(s, occurrenceKey);
    if (!inst.actual.isRunning) return;
    inst.actual.accumulatedMs += Date.now() - inst.actual.startedAt;
    inst.actual.isRunning = false;
    inst.actual.startedAt = null;
  });
}

function getElapsedMs(actual) {
  if (!actual) return 0;
  const running = actual.isRunning ? Date.now() - actual.startedAt : 0;
  return actual.accumulatedMs + running;
}

// Called once a second from app.js. Rather than re-rendering the
// whole page (which would feel jumpy while you're typing in a
// modal, etc.), we just update the small live-timer text nodes.
function tickRunningTimers() {
  document.querySelectorAll("[data-live-timer]").forEach((el) => {
    const occKey = el.dataset.liveTimer;
    const inst = getInstance(state, occKey);
    if (!inst || !inst.actual.isRunning) return;
    el.textContent = formatStopwatch(getElapsedMs(inst.actual));
  });
}
