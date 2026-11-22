/**
 * Discovery call tracking. Add this as a second file (Bookings.gs) in the same Apps Script project.
 *
 * Every 15 minutes it:
 *   - finds new discovery call bookings in your Google Calendar,
 *   - logs them on a "Bookings" tab in the leads sheet,
 *   - tags the person grl_call_booked in SwipeOne (and grl_rebooked if they were a no-show before),
 *   - after each call, emails you once to mark Attended or No-show.
 *
 * When you set Status to "No-show" or "Attended" on the Bookings tab, the person is tagged
 * grl_no_show or grl_call_attended in SwipeOne. grl_no_show starts the rebook emails.
 *
 * Run setupBookingTracking() once after pasting this file.
 */

const BOOKING = {
  // Matches event titles from your booking page, e.g. "Free 20-Minute Secure Growth Discovery Call".
  TITLE_MATCH: /discovery call/i,
  LOOKBACK_DAYS: 2,
  LOOKAHEAD_DAYS: 60,
  TAB: 'Bookings',
  HEADERS: ['Logged', 'Call time', 'Name', 'Email', 'Event ID', 'Status', 'Attendance reminder sent', 'CRM'],
  STATUSES: ['Booked', 'Attended', 'No-show', 'Cancelled', 'Rescheduled']
};

// Column numbers (1-based) on the Bookings tab.
const BCOL = { LOGGED: 1, TIME: 2, NAME: 3, EMAIL: 4, EVENT: 5, STATUS: 6, REMINDER: 7, CRM: 8 };

/** Run once: creates the Bookings tab and both triggers, then does a first sync. */
function setupBookingTracking() {
  const sheet = getBookingsSheet_();
  const ss = sheet.getParent();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'syncBookings' || fn === 'onBookingEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncBookings').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('onBookingEdit').forSpreadsheet(ss).onEdit().create();
  syncBookings();
  console.log('Booking tracking is on. Bookings tab: ' + ss.getUrl());
}

function getBookingsSheet_() {
  const ss = getSheet_().getParent();
  let sheet = ss.getSheetByName(BOOKING.TAB);
  if (!sheet) {
    sheet = ss.insertSheet(BOOKING.TAB);
    sheet.appendRow(BOOKING.HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, BOOKING.HEADERS.length)
      .setFontWeight('bold').setBackground('#22384F').setFontColor('#FFFFFF');
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(BOOKING.STATUSES, true).build();
    sheet.getRange(2, BCOL.STATUS, 999, 1).setDataValidation(rule);
    sheet.getRange(2, BCOL.TIME, 999, 1).setNumberFormat('yyyy-mm-dd h:mm am/pm');
  }
  return sheet;
}

/** Time-driven: logs new bookings and sends attendance reminders. */
function syncBookings() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const sheet = getBookingsSheet_();
    const rows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING.HEADERS.length).getValues()
      : [];
    const known = {};
    const noShowEmails = {};
    rows.forEach(function (r) {
      known[r[BCOL.EVENT - 1]] = true;
      if (r[BCOL.STATUS - 1] === 'No-show') noShowEmails[String(r[BCOL.EMAIL - 1]).toLowerCase()] = true;
    });

    const now = new Date();
    const start = new Date(now.getTime() - BOOKING.LOOKBACK_DAYS * 864e5);
    const end = new Date(now.getTime() + BOOKING.LOOKAHEAD_DAYS * 864e5);
    const owner = Session.getEffectiveUser().getEmail().toLowerCase();

    CalendarApp.getDefaultCalendar().getEvents(start, end).forEach(function (ev) {
      if (!BOOKING.TITLE_MATCH.test(ev.getTitle())) return;
      const id = ev.getId() + '|' + ev.getStartTime().getTime();
      if (known[id]) return;
      const guest = ev.getGuestList().filter(function (g) {
        return g.getEmail() && g.getEmail().toLowerCase() !== owner;
      })[0];
      if (!guest) return;

      const email = guest.getEmail();
      const name = guest.getName() || email.split('@')[0];
      const firstName = String(name).split(' ')[0];
      const tags = ['grl_call_booked'];
      if (noShowEmails[email.toLowerCase()]) tags.push('grl_rebooked');
      const crm = swipeOneUpsert_({ email: email, firstName: firstName, tags: tags.join(',') });

      sheet.appendRow([now, ev.getStartTime(), name, email, id, 'Booked', '', 'booked: ' + crm]);
      known[id] = true;
    });

    sendAttendanceReminders_(sheet, now);
  } finally {
    lock.releaseLock();
  }
}

/** Emails you once per call, 30 minutes after it starts, to mark attendance. */
function sendAttendanceReminders_(sheet, now) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const values = sheet.getRange(2, 1, last - 1, BOOKING.HEADERS.length).getValues();
  const due = [];
  values.forEach(function (r, i) {
    const time = r[BCOL.TIME - 1];
    if (r[BCOL.STATUS - 1] !== 'Booked' || r[BCOL.REMINDER - 1]) return;
    if (!(time instanceof Date) || now.getTime() < time.getTime() + 30 * 60000) return;
    due.push({ row: i + 2, name: r[BCOL.NAME - 1], email: r[BCOL.EMAIL - 1], time: time });
  });
  if (!due.length) return;

  const url = sheet.getParent().getUrl() + '#gid=' + sheet.getSheetId();
  const list = due.map(function (d) {
    return d.name + ' (' + d.email + '), ' + Utilities.formatDate(d.time, Session.getScriptTimeZone(), 'MMM d, h:mm a');
  });
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">' +
    '<p>Did these discovery calls happen? Set Status to <b>Attended</b> or <b>No-show</b> on the Bookings tab.</p>' +
    '<p>' + list.map(esc_).join('<br>') + '</p>' +
    '<p><a href="' + url + '">Open the Bookings tab</a></p>' +
    '<p style="color:#55657A;">No-shows get the rebook emails automatically.</p></div>';
  GmailApp.sendEmail(CONFIG.OWNER_EMAIL, 'Mark attendance: ' + due.length + ' discovery call' + (due.length > 1 ? 's' : ''),
    'Did these calls happen? Mark Attended or No-show:\n' + list.join('\n') + '\n\n' + url,
    { htmlBody: html, name: 'Checklist relay' });
  due.forEach(function (d) { sheet.getRange(d.row, BCOL.REMINDER).setValue(now); });
}

/** Installable onEdit trigger: Status changes on the Bookings tab update SwipeOne. */
function onBookingEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== BOOKING.TAB || e.range.getColumn() !== BCOL.STATUS || e.range.getRow() < 2) return;
  const status = String(e.value || '');
  const tag = status === 'No-show' ? 'grl_no_show' : status === 'Attended' ? 'grl_call_attended' : '';
  if (!tag) return;
  const row = e.range.getRow();
  const email = sheet.getRange(row, BCOL.EMAIL).getValue();
  const name = String(sheet.getRange(row, BCOL.NAME).getValue() || '');
  if (!email) return;
  const crm = swipeOneUpsert_({ email: email, firstName: name.split(' ')[0], tags: tag });
  sheet.getRange(row, BCOL.CRM).setValue(status.toLowerCase() + ': ' + crm);
}
