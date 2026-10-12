/**
 * Navkar Navratri Utsav 2026 — booking cutoffs.
 * Timezone: Asia/Kolkata (IST, UTC+05:30, no daylight saving).
 *
 * Cutoffs are absolute instants, so the visitor's browser timezone
 * does not decide whether a night is open.
 *
 *   11 Oct 2026 — 17:00 IST (unchanged)
 *   12–19 Oct 2026 — 18:00 IST on that same date, each night independently
 *
 * Apps Script keeps the same rules in sheets/Code.gs (CUTOFF_RULES).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NavkarBookingCutoff = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this), function () {
  var TODAY_CLOSED_MSG = 'Bookings for today\'s event are now closed.';
  var PAST_CLOSED_MSG = 'Bookings for this event are now closed.';

  /**
   * UTC instant when bookings for this October 2026 event day close.
   * 11 Oct: 17:00 IST = 11:30 UTC. 12–19 Oct: 18:00 IST = 12:30 UTC.
   */
  function cutoffUtcMs(day) {
    day = Number(day);
    if (day === 11) return Date.UTC(2026, 9, 11, 11, 30, 0);
    if (day >= 12 && day <= 19) return Date.UTC(2026, 9, day, 12, 30, 0);
    return NaN;
  }

  /** Calendar date in Asia/Kolkata, not the host/browser local zone. */
  function istDateParts(nowMs) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(nowMs));
    var map = {};
    var i;
    for (i = 0; i < parts.length; i++) map[parts[i].type] = parts[i].value;
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day)
    };
  }

  function isDayClosed(day, nowMs) {
    var cutoff = cutoffUtcMs(day);
    if (isNaN(cutoff)) return false;
    var now = nowMs == null ? Date.now() : nowMs;
    return now >= cutoff;
  }

  function closedMessage(day, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    var ist = istDateParts(now);
    if (ist.year === 2026 && ist.month === 10 && ist.day === Number(day)) {
      return TODAY_CLOSED_MSG;
    }
    return PAST_CLOSED_MSG;
  }

  return {
    TODAY_CLOSED_MSG: TODAY_CLOSED_MSG,
    PAST_CLOSED_MSG: PAST_CLOSED_MSG,
    cutoffUtcMs: cutoffUtcMs,
    istDateParts: istDateParts,
    isDayClosed: isDayClosed,
    closedMessage: closedMessage
  };
});
