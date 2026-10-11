/**
 * Navkar Navratri Utsav — Google Apps Script (Option 1, no backend)
 *
 * Setup:
 * 1. Create a Google Sheet with a tab named "Bookings".
 * 2. Extensions → Apps Script → paste this file → Save.
 * 3. Run testConfirmationEmail() once → Allow Gmail permissions.
 * 4. Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web app URL into js/config.js → sheetsEndpoint
 *
 * After ANY script change (including email fixes):
 * Deploy → Manage deployments → ✎ → Version: New version → Deploy.
 * Saving Code.gs alone does NOT update the live booking endpoint.
 *
 * Frontend email field: `email` (js/main.js → bookingRow)
 * Flow: Razorpay success → Sheet row → Confirmation email
 * Email is best-effort: sheet write is never blocked by mail failure.
 */

var SHEET_NAME = 'Bookings';
var PROOF_FOLDER = 'Navkar Payment Proofs';
var COL_PAYMENT_ID = 10;
var COL_PROOF = 13;

var EVENT_NAME = 'Navkar Navratri Utsav 2026 · Season 9';
var EVENT_DATES = '11–19 October 2026';
var EVENT_VENUE = 'Jalavihar, Necklace Road, Hyderabad';
var EVENT_GATES = 'Gates open 7:00 PM';
var SUPPORT_PHONE = '+91 81421 11145 / +91 80191 61198';

/**
 * Confirmation emails are sent FROM the Google account that owns this script
 * (Deploy → Execute as: Me). That account MUST be navkarentertainments90@gmail.com.
 * You cannot keep the script on a personal Gmail and forge this From address.
 */
var SENDER_EMAIL = 'navkarentertainments90@gmail.com';
var SENDER_NAME = 'Navkar Entertainment';
var TEST_EMAIL = 'navkarentertainments90@gmail.com';

/* Bump this whenever you deploy so you can verify the live web app is updated.
   Open your /exec URL in a browser — doGet must show this same version. */
var SCRIPT_VERSION = 'cutoff-oct11-17ist-2026-10-11';

/* 11 Oct 2026 17:00 IST (Asia/Kolkata) = 11:30 UTC — only this night closes. */
var OCT11_CUTOFF_UTC_MS = Date.parse('2026-10-11T11:30:00.000Z');
var OCT11_CLOSED_MSG = 'Bookings for today\'s event are now closed.';

function isOct11BookingClosed_() {
  return Date.now() >= OCT11_CUTOFF_UTC_MS;
}

/**
 * Reject new bookings for event day 11 after the IST cutoff.
 * Uses Google server time (not the visitor's device timezone).
 * attachProof is allowed so paid guests can still upload screenshots.
 */
function closedEventDayError_(data) {
  if (!data || data.action === 'attachProof') return '';

  var day = NaN;
  if (data.eventDay != null && data.eventDay !== '') {
    day = Number(data.eventDay);
  }
  if (isNaN(day)) {
    var pt = String(data.passType || data.night || '');
    if (/\b11\s*Oct\b/i.test(pt)) day = 11;
  }

  if (day === 11 && isOct11BookingClosed_()) {
    return OCT11_CLOSED_MSG;
  }
  return '';
}

var HEADERS = [
  'Timestamp',
  'Name',
  'Phone',
  'Email',
  'City',
  'Booking Type',
  'Pass Type',
  'Quantity',
  'Payment Amount',
  'Razorpay Payment ID',
  'Payment Status',
  'Verification Status',
  'Payment Proof'
];

/* ============================================================
   WEB APP — booking save + confirmation email
   ============================================================ */

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    Logger.log('[BOOKING] incoming data: ' + JSON.stringify(redactPayload_(data)));

    var customerEmail = resolveCustomerEmail_(data);
    Logger.log('[BOOKING] customer email resolved: ' + customerEmail);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    }

    var paymentId = data.paymentId ? String(data.paymentId) : '';
    var existingRow = findPaymentRow_(sheet, paymentId);

    if (data.action === 'attachProof') {
      if (!paymentId) {
        return json_({ ok: false, error: 'Missing payment ID' });
      }
      if (existingRow < 0) {
        return json_({ ok: false, error: 'Registration not found for this payment ID' });
      }
      var attachedUrl = saveProof_(data);
      if (attachedUrl) {
        sheet.getRange(existingRow, COL_PROOF).setValue(attachedUrl);
      }
      return json_({ ok: true, updated: true, proofUrl: attachedUrl || '' });
    }

    /* Duplicate — do not create another row or re-send email */
    if (paymentId && existingRow > 0) {
      var extraProof = '';
      if (data.proofBase64) {
        extraProof = saveProof_(data);
        if (extraProof) sheet.getRange(existingRow, COL_PROOF).setValue(extraProof);
      }
      Logger.log('[BOOKING] duplicate paymentId — email not re-sent: ' + paymentId);
      return json_({ ok: true, duplicate: true, proofUrl: extraProof || '' });
    }

    /* Block NEW 11 Oct bookings after 17:00 IST (Google server time). */
    var closedErr = closedEventDayError_(data);
    if (closedErr) {
      Logger.log('[BOOKING] rejected closed event day: ' + closedErr);
      return json_({ ok: false, error: closedErr, version: SCRIPT_VERSION });
    }

    /* 1) Save sheet row first */
    var proofUrl = saveProof_(data) || '';
    sheet.appendRow([
      new Date(),
      data.name || '',
      data.phone || '',
      customerEmail || '',
      data.city || '',
      data.bookingType || '',
      data.passType || '',
      data.quantity != null ? data.quantity : '',
      data.amount != null ? data.amount : '',
      paymentId,
      data.paymentStatus || 'Payment Received',
      data.verificationStatus || 'Pending Review',
      proofUrl
    ]);
    Logger.log('[BOOKING] sheet row written for paymentId=' + paymentId);

    /* 2) Then send confirmation to the resolved customer email */
    var mailResult = { sent: false, error: '', to: customerEmail };
    try {
      mailResult = sendConfirmationEmail_(customerEmail, data);
    } catch (mailErr) {
      mailResult = {
        sent: false,
        error: String(mailErr && mailErr.stack ? mailErr.stack : mailErr),
        to: customerEmail
      };
      Logger.log('[MAIL] BOOKING CONFIRMATION FAILED: ' + mailResult.error);
      console.error('[MAIL] BOOKING CONFIRMATION FAILED: ' + mailResult.error);
    }

    return json_({
      ok: true,
      version: SCRIPT_VERSION,
      proofUrl: proofUrl,
      emailSent: !!mailResult.sent,
      emailError: mailResult.error || '',
      emailTo: mailResult.to || ''
    });
  } catch (err) {
    Logger.log('[BOOKING] doPost error: ' + err);
    console.error('[BOOKING] doPost error: ' + err);
    return json_({ ok: false, error: String(err), version: SCRIPT_VERSION });
  }
}

function doGet() {
  return json_({
    ok: true,
    service: 'navkar-bookings',
    version: SCRIPT_VERSION,
    hint: 'If version is missing or old, redeploy: Manage deployments → Edit → New version → Deploy'
  });
}

/**
 * Website sends `email` (js/main.js bookingRow).
 * Also accept common aliases.
 * Never uses Session.getEffectiveUser().
 */
function resolveCustomerEmail_(data) {
  if (!data || typeof data !== 'object') return '';

  var candidates = [
    data.email,
    data.customerEmail,
    data.customer_email,
    data.Email,
    data.userEmail,
    data.user_email
  ];

  if (data.booking && typeof data.booking === 'object') {
    candidates.push(data.booking.email);
    candidates.push(data.booking.customerEmail);
  }

  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] == null) continue;
    var s = String(candidates[i]).trim();
    if (s) return s;
  }
  return '';
}

function redactPayload_(data) {
  if (!data || typeof data !== 'object') return data;
  var out = {};
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'proofBase64') {
      out[k] = '[omitted len=' + String(data[k] || '').length + ']';
    } else {
      out[k] = data[k];
    }
  }
  return out;
}

function emailFieldSnapshot_(data) {
  if (!data || typeof data !== 'object') return { keys: [] };
  return {
    email: data.email,
    customerEmail: data.customerEmail,
    customer_email: data.customer_email,
    Email: data.Email,
    userEmail: data.userEmail,
    keys: Object.keys(data)
  };
}

/* ============================================================
   STANDALONE MAIL TEST
   ============================================================ */

function testConfirmationEmail() {
  var TEST_TO = SENDER_EMAIL;

  if (!TEST_TO || TEST_TO.indexOf('@') < 1) {
    throw new Error('TEST_TO is blank.');
  }

  var effective = '';
  try { effective = Session.getEffectiveUser().getEmail() || ''; } catch (e) { effective = ''; }
  Logger.log('[TEST MAIL] Script running as: ' + (effective || '(unknown)'));
  Logger.log('[TEST MAIL] Expected owner: ' + SENDER_EMAIL);
  if (effective && effective.toLowerCase() !== SENDER_EMAIL.toLowerCase()) {
    Logger.log('[TEST MAIL] WARNING: Script is NOT owned by ' + SENDER_EMAIL +
      '. Customer From: will be ' + effective + '. Move Sheet + deploy under the Navkar Gmail.');
  }

  Logger.log('[TEST MAIL] Sending to: ' + TEST_TO);

  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('[TEST MAIL] Quota remaining: ' + quota);
  if (quota <= 0) {
    throw new Error('Mail quota is 0 — cannot send today.');
  }

  var subject = 'Navkar Apps Script mail test';
  var body =
    'Standalone test from Navkar Apps Script.\n\n' +
    'If you got this, Google can send email from this project.\n' +
    'Sent by script account: ' + (effective || '(unknown)') + '\n' +
    'Time: ' + new Date().toString();

  try {
    GmailApp.sendEmail(TEST_TO, subject, body, {
      name: SENDER_NAME,
      replyTo: SENDER_EMAIL
    });
    Logger.log('[TEST MAIL] GmailApp.sendEmail OK → ' + TEST_TO);
  } catch (gmailErr) {
    Logger.log('[TEST MAIL] GmailApp failed: ' + gmailErr + ' — trying MailApp…');
    try {
      MailApp.sendEmail({
        to: TEST_TO,
        subject: subject,
        body: body,
        name: SENDER_NAME,
        replyTo: SENDER_EMAIL
      });
      Logger.log('[TEST MAIL] MailApp.sendEmail OK → ' + TEST_TO);
    } catch (mailErr) {
      throw new Error('[TEST MAIL] BOTH FAILED. GmailApp: ' + gmailErr + ' | MailApp: ' + mailErr);
    }
  }

  Logger.log('[TEST MAIL] DONE — check Inbox + Spam for ' + TEST_TO);
}

/**
 * Simulates the booking email path (same as doPost after sheet save).
 * Run this from the editor AFTER testConfirmationEmail works.
 * Does NOT write to the sheet. Does NOT need the website.
 */
function testBookingFlowEmail() {
  var mockBooking = {
    name: 'Test User',
    phone: '9611775629',
    email: 'methreeambika@gmail.com',
    city: 'Hyderabad',
    bookingType: 'Pass',
    passType: 'Single Night · test',
    quantity: 1,
    amount: 499,
    paymentId: 'pay_test_flow_' + Date.now()
  };

  var customerEmail = resolveCustomerEmail_(mockBooking);
  Logger.log('[BOOKING-TEST] customer email resolved: ' + customerEmail);

  var result = sendConfirmationEmail_(customerEmail, mockBooking);
  Logger.log('[BOOKING-TEST] result: ' + JSON.stringify(result));

  if (!result.sent) {
    throw new Error('Booking-flow email did not send: ' + (result.error || 'unknown'));
  }
}

/* ============================================================
   BOOKING CONFIRMATION EMAIL
   ============================================================ */

/**
 * @param {string} customerEmail  Explicit recipient from doPost
 * @param {Object} bookingData    Full booking payload (name, passType, etc.)
 */
function sendConfirmationEmail_(customerEmail, bookingData) {
  var data = bookingData || {};
  var to = customerEmail ? String(customerEmail).trim() : '';

  Logger.log('[MAIL] sendConfirmationEmail_ to="' + to + '" name="' + (data.name || '') + '"');

  if (!isValidEmail_(to)) {
    Logger.log('[MAIL] SKIPPED - customer email missing');
    Logger.log('[MAIL] email-related fields present: ' + JSON.stringify(emailFieldSnapshot_(data)));
    return {
      sent: false,
      error: 'skipped: missing or invalid customer email',
      to: to
    };
  }

  var quota = safeQuota_();
  if (quota !== null && quota <= 0) {
    throw new Error('MailApp daily quota is 0');
  }

  var name = data.name ? String(data.name).trim() : 'Guest';
  var bookingType = data.bookingType ? String(data.bookingType).trim() : 'Booking';
  var passType = data.passType ? String(data.passType).trim() : '—';
  var qty = data.quantity != null && data.quantity !== '' ? String(data.quantity) : '—';
  var paymentId = data.paymentId ? String(data.paymentId) : '—';
  var amountText = formatInr_(data.amount);
  var subject = 'Booking confirmed — ' + EVENT_NAME;

  var plain =
    'Hi ' + name + ',\n\n' +
    'Thank you for booking with Navkar Navratri Utsav. Your payment was received and your registration is confirmed.\n\n' +
    'Booking type: ' + bookingType + '\n' +
    'Details: ' + passType + '\n' +
    'Quantity: ' + qty + '\n' +
    'Amount paid: ' + amountText + '\n' +
    'Razorpay Payment ID: ' + paymentId + '\n\n' +
    'Event: ' + EVENT_NAME + '\n' +
    'Dates: ' + EVENT_DATES + '\n' +
    'Venue: ' + EVENT_VENUE + '\n' +
    EVENT_GATES + '\n\n' +
    'Our team verifies each payment manually. Please keep this email and your Razorpay Payment ID for entry support.\n\n' +
    'Questions? WhatsApp / call Bookings: ' + SUPPORT_PHONE + '\n\n' +
    'See you in the circle,\n' +
    'Navkar Entertainment';

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1b0310;max-width:560px;margin:0 auto;">' +
      '<p style="margin:0 0 16px;">Hi <strong>' + esc_(name) + '</strong>,</p>' +
      '<p style="margin:0 0 20px;">Thank you for booking with <strong>Navkar Navratri Utsav</strong>. Your payment was received and your registration is confirmed.</p>' +
      '<table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">' +
        rowHtml_('Booking type', bookingType) +
        rowHtml_('Details', passType) +
        rowHtml_('Quantity', qty) +
        rowHtml_('Amount paid', amountText) +
        rowHtml_('Razorpay Payment ID', paymentId) +
      '</table>' +
      '<div style="background:#fff9dc;border:1px solid #e8d9a0;border-radius:10px;padding:14px 16px;margin:0 0 20px;">' +
        '<p style="margin:0 0 6px;font-weight:700;">' + esc_(EVENT_NAME) + '</p>' +
        '<p style="margin:0;color:#444;">' + esc_(EVENT_DATES) + '<br>' +
          esc_(EVENT_VENUE) + '<br>' + esc_(EVENT_GATES) + '</p>' +
      '</div>' +
      '<p style="margin:0 0 12px;">Our team verifies each payment manually. Please keep this email and your Razorpay Payment ID for entry support.</p>' +
      '<p style="margin:0 0 20px;color:#555;font-size:13px;">Questions? WhatsApp / call Bookings: ' + esc_(SUPPORT_PHONE) + '</p>' +
      '<p style="margin:0;">See you in the circle,<br><strong>Navkar Entertainment</strong></p>' +
    '</div>';

  Logger.log('[MAIL] About to send booking confirmation → ' + to);
  sendRawEmail_(to, subject, plain, html);
  Logger.log('[MAIL] BOOKING CONFIRMATION SENT → ' + to);

  return { sent: true, error: '', to: to };
}

function sendRawEmail_(to, subject, plainBody, htmlBody) {
  if (!isValidEmail_(to)) {
    throw new Error('sendRawEmail_: invalid recipient "' + to + '"');
  }

  var gmailErr = null;

  try {
    Logger.log('[MAIL] GmailApp.sendEmail → ' + to);
    if (htmlBody) {
      GmailApp.sendEmail(to, subject, plainBody, {
        htmlBody: htmlBody,
        name: SENDER_NAME,
        replyTo: SENDER_EMAIL
      });
    } else {
      GmailApp.sendEmail(to, subject, plainBody, {
        name: SENDER_NAME,
        replyTo: SENDER_EMAIL
      });
    }
    Logger.log('[MAIL] GmailApp OK');
    return;
  } catch (e1) {
    gmailErr = e1;
    Logger.log('[MAIL] GmailApp failed: ' + String(e1));
    console.error('[MAIL] GmailApp failed: ' + String(e1));
  }

  try {
    Logger.log('[MAIL] MailApp.sendEmail fallback → ' + to);
    if (htmlBody) {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody,
        name: SENDER_NAME,
        replyTo: SENDER_EMAIL
      });
    } else {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: plainBody,
        name: SENDER_NAME,
        replyTo: SENDER_EMAIL
      });
    }
    Logger.log('[MAIL] MailApp OK');
    return;
  } catch (e2) {
    Logger.log('[MAIL] MailApp failed: ' + String(e2));
    console.error('[MAIL] MailApp failed: ' + String(e2));
    throw new Error(
      'Both GmailApp and MailApp failed. GmailApp: ' + String(gmailErr) + ' | MailApp: ' + String(e2)
    );
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function findPaymentRow_(sheet, paymentId) {
  if (!paymentId) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var values = sheet.getRange(2, COL_PAYMENT_ID, last, COL_PAYMENT_ID).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(paymentId)) return i + 2;
  }
  return -1;
}

function saveProof_(data) {
  if (!data || !data.proofBase64) return '';

  var folders = DriveApp.getFoldersByName(PROOF_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PROOF_FOLDER);

  var b64 = String(data.proofBase64).replace(/^data:[^;]+;base64,/, '');
  var bytes = Utilities.base64Decode(b64);
  var mime = data.proofMime || 'image/jpeg';
  var name = data.proofName || ('proof-' + (data.paymentId || Date.now()) + '.jpg');
  var blob = Utilities.newBlob(bytes, mime, name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function isValidEmail_(email) {
  if (!email) return false;
  var s = String(email).trim();
  if (s.length < 5) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function safeQuota_() {
  try {
    return MailApp.getRemainingDailyQuota();
  } catch (e) {
    return null;
  }
}

function formatInr_(amount) {
  if (amount == null || amount === '') return '—';
  var n = Number(amount);
  if (isNaN(n)) return String(amount);
  try {
    return '₹' + n.toLocaleString('en-IN');
  } catch (e) {
    return '₹' + String(n);
  }
}

function rowHtml_(label, value) {
  return '<tr>' +
    '<td style="padding:8px 12px 8px 0;color:#666;vertical-align:top;width:38%;">' + esc_(label) + '</td>' +
    '<td style="padding:8px 0;font-weight:600;vertical-align:top;">' + esc_(value) + '</td>' +
    '</tr>';
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
