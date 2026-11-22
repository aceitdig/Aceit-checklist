/**
 * Green Report checklist relay for checklist.aceitdigital.ca
 *
 * What it does for every submission:
 *   1. Emails the visitor their score and personal risk register (from your Gmail).
 *   2. Emails you a lead alert.
 *   3. Logs the lead to a Google Sheet.
 *   4. If they opted in, adds them to SwipeOne with tags, which starts the follow-up series.
 *
 * Setup: see SETUP.md in the repo. Secrets live in Script Properties, never in this file.
 */

const CONFIG = {
  OWNER_EMAIL: 'tolu@aceitdigital.com',
  SENDER_NAME: 'Tolu Amadi, Aceit Digital',
  // Used only if this address is set up as a "Send mail as" alias in your Gmail.
  FROM_ALIAS: 'support@aceitdigital.com',
  REPLY_TO: 'support@aceitdigital.com',
  BOOKING_URL: 'https://calendar.app.google/f6eCZLWqN6R1tPS3A',
  TEMPLATE_URL: 'https://docs.google.com/spreadsheets/d/1zVdqOq7_05aqTVYxbiK0PcMyw1QejOZ4hOLaTQkGPNI/copy',
  CHECKLIST_URL: 'https://checklist.aceitdigital.ca',
  LOGO_URL: 'https://checklist.aceitdigital.ca/aceit-logo-white.png',
  SHEET_NAME: 'Green Report Checklist Leads',
  SWIPEONE_URL: 'https://api.swipeone.com/zapier/contact',
  RESEND_COOLDOWN_SECONDS: 600
};

const BAND_TEXT = {
  'Truly green': 'Your systems support your people. Keep reviewing them every quarter so it stays that way.',
  'Hidden cracks': 'Things work, but they depend on heroics. One sick day or one busy month and deadlines slip.',
  'Your green report is lying': 'You likely have the right people working inside the wrong systems. This is fixable, usually faster than leaders expect.'
};

const BAND_TAG = {
  'Truly green': 'grl_truly_green',
  'Hidden cracks': 'grl_hidden_cracks',
  'Your green report is lying': 'grl_report_lying'
};

const WEAK_TAG = {
  'Meetings': 'grl_weak_meetings',
  'Reporting': 'grl_weak_reporting',
  'Ownership': 'grl_weak_ownership',
  'Delivery': 'grl_weak_delivery'
};

/** Web app entry point. The checklist page posts JSON here. */
function doPost(e) {
  try {
    const data = parsePayload_(e);
    const cache = CacheService.getScriptCache();
    const key = 'grl:' + data.email.toLowerCase();
    if (cache.get(key)) {
      return json_({ ok: true, duplicate: true });
    }
    cache.put(key, '1', CONFIG.RESEND_COOLDOWN_SECONDS);

    sendResults_(data);
    sendOwnerAlert_(data);
    logLead_(data);
    let crm = 'skipped (no consent)';
    if (data.consent) {
      crm = pushToSwipeOne_(data);
    }
    return json_({ ok: true, crm: crm });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'Green Report checklist relay' });
}

/** Validates and cleans the incoming submission. */
function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('No data');
  const raw = JSON.parse(e.postData.contents);
  const email = clean_(raw.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  const firstName = clean_(raw.firstName, 60);
  if (!firstName) throw new Error('Missing name');
  const score = Number(raw.score);
  if (!(score >= 0 && score <= 20)) throw new Error('Invalid score');
  const band = BAND_TEXT[raw.band] ? raw.band : 'Your green report is lying';
  const weakest = WEAK_TAG[raw.weakest] || raw.weakest === 'None' ? raw.weakest : 'None';

  const areas = (Array.isArray(raw.areas) ? raw.areas : []).slice(0, 4).map(function (a) {
    return { area: clean_(a.area, 60), score: Math.max(0, Math.min(5, Number(a.score) || 0)) };
  });
  const risks = (Array.isArray(raw.risks) ? raw.risks : []).slice(0, 20).map(function (r) {
    return {
      area: clean_(r.area, 60),
      risk: clean_(r.risk, 200),
      impact: clean_(r.impact, 300),
      fix: clean_(r.fix, 300)
    };
  });

  return {
    firstName: firstName,
    email: email,
    company: clean_(raw.company, 120),
    consent: raw.consent === true,
    score: score,
    band: band,
    weakest: weakest,
    areas: areas,
    risks: risks
  };
}

function clean_(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function esc_(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Sends from the alias when Gmail has it set up, otherwise from your own address. */
function send_(to, subject, html, plain, replyTo) {
  const options = { htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: replyTo || CONFIG.REPLY_TO };
  try {
    if (GmailApp.getAliases().indexOf(CONFIG.FROM_ALIAS) !== -1) options.from = CONFIG.FROM_ALIAS;
  } catch (err) {
    // Alias lookup is optional.
  }
  GmailApp.sendEmail(to, subject, plain, options);
}

/** Email 1: the visitor's results and personal risk register. */
function sendResults_(d) {
  const areaRows = d.areas.map(function (a) {
    const pct = a.score * 20;
    return '<tr><td style="padding:6px 0;font-size:14px;color:#1F2933;">' + esc_(a.area) + '</td>' +
      '<td style="padding:6px 0;font-size:14px;color:#22384F;font-weight:bold;text-align:right;white-space:nowrap;">' + a.score + ' / 5</td></tr>' +
      '<tr><td colspan="2" style="padding:0 0 8px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td width="' + pct + '%" bgcolor="#F2D66B" style="height:8px;font-size:0;line-height:0;">&nbsp;</td>' +
      '<td bgcolor="#E6ECF2" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>';
  }).join('');

  let register;
  if (d.risks.length) {
    register = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:13px;">' +
      '<tr><th align="left" style="background:#22384F;color:#FFFFFF;padding:8px;">Risk</th>' +
      '<th align="left" style="background:#22384F;color:#FFFFFF;padding:8px;">Business impact</th>' +
      '<th align="left" style="background:#22384F;color:#FFFFFF;padding:8px;">Quick fix</th></tr>' +
      d.risks.map(function (r, i) {
        const bg = i % 2 ? '#F5F7FA' : '#FFFFFF';
        return '<tr><td valign="top" style="background:' + bg + ';padding:8px;border-bottom:1px solid #DDE3EA;"><b style="color:#22384F;">' + esc_(r.risk) + '</b><br><span style="color:#55657A;font-size:12px;">' + esc_(r.area) + '</span></td>' +
          '<td valign="top" style="background:' + bg + ';padding:8px;border-bottom:1px solid #DDE3EA;color:#1F2933;">' + esc_(r.impact) + '</td>' +
          '<td valign="top" style="background:' + bg + ';padding:8px;border-bottom:1px solid #DDE3EA;color:#1F2933;">' + esc_(r.fix) + '</td></tr>';
      }).join('') + '</table>';
  } else {
    register = '<p style="margin:0;">You ticked every box, so there are no open risks on your register. Keep checking each quarter.</p>';
  }

  const weakLine = d.weakest && d.weakest !== 'None'
    ? '<p style="margin:0 0 16px 0;">Your weakest area is <b>' + esc_(d.weakest) + '</b>. That is where to start.</p>'
    : '';

  const html =
    '<div style="background:#F4F5F7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;background:#FFFFFF;border-radius:8px;">' +
    '<tr><td bgcolor="#22384F" style="background:#22384F;padding:24px 28px;border-radius:8px 8px 0 0;"><img src="' + CONFIG.LOGO_URL + '" width="150" alt="Aceit Digital Inc." style="display:block;border:0;width:150px;height:auto;"></td></tr>' +
    '<tr><td style="padding:24px 28px;font-size:16px;line-height:1.5;color:#1F2933;">' +
    '<p style="margin:0 0 16px 0;">Hi ' + esc_(d.firstName) + ',</p>' +
    '<p style="margin:0 0 20px 0;">Here are your results from the Green Report checklist.</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#22384F" style="background:#22384F;border-radius:12px;padding:22px;color:#FFFFFF;">' +
    '<p style="margin:0;font-size:12px;letter-spacing:2px;color:#F2D66B;font-weight:bold;">YOUR SCORE</p>' +
    '<p style="margin:4px 0 0 0;font-size:44px;font-weight:bold;line-height:1;">' + d.score + '<span style="font-size:20px;color:#C9D4E0;"> / 20</span></p>' +
    '<p style="margin:12px 0 4px 0;font-size:20px;font-weight:bold;color:#F2D66B;">' + esc_(d.band) + '</p>' +
    '<p style="margin:0;color:#E6ECF2;font-size:15px;">' + esc_(BAND_TEXT[d.band]) + '</p>' +
    '</td></tr></table>' +
    '<h2 style="margin:28px 0 8px 0;font-size:18px;color:#22384F;">Score by area</h2>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + areaRows + '</table>' +
    weakLine +
    '<h2 style="margin:28px 0 8px 0;font-size:18px;color:#22384F;">Your personal risk register</h2>' +
    '<p style="margin:0 0 12px 0;font-size:14px;color:#55657A;">Every statement you didn\'t tick, with its business impact and a fix you can start this week.</p>' +
    register +
    '<p style="margin:24px 0 8px 0;">Want to track these with owners and dates? <a href="' + CONFIG.TEMPLATE_URL + '" style="color:#3D6184;font-weight:bold;">Copy our free risk register template</a>.</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;"><tr><td bgcolor="#F2D66B" style="border-radius:6px;">' +
    '<a href="' + CONFIG.BOOKING_URL + '" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:bold;color:#22384F;text-decoration:none;">Book a free 20-minute discovery call</a></td></tr></table>' +
    '<p style="margin:0 0 16px 0;">Bring this email. We\'ll go through your top risks and you\'ll leave with your first fix.</p>' +
    '<p style="margin:0;">Tolu Amadi<br>Founder, Aceit Digital Inc.</p>' +
    '</td></tr>' +
    '<tr><td style="padding:16px 28px 24px 28px;font-size:12px;line-height:1.5;color:#55657A;border-top:1px solid #DDE3EA;">You received this because you asked for your results at ' + CONFIG.CHECKLIST_URL.replace('https://', '') + '.<br>Aceit Digital Inc. · Calgary, Alberta · support@aceitdigital.com</td></tr>' +
    '</table></div>';

  const plain = 'Hi ' + d.firstName + ',\n\nYour Green Report checklist score: ' + d.score + ' / 20 (' + d.band + ').\n' +
    BAND_TEXT[d.band] + '\n\nYour personal risk register:\n' +
    (d.risks.length ? d.risks.map(function (r) { return '- ' + r.risk + ': ' + r.fix; }).join('\n') : 'No open risks.') +
    '\n\nRisk register template: ' + CONFIG.TEMPLATE_URL +
    '\nBook a free 20-minute discovery call: ' + CONFIG.BOOKING_URL +
    '\n\nTolu Amadi\nFounder, Aceit Digital Inc.';

  send_(d.email, 'Your Green Report results: ' + d.score + ' / 20', html, plain);
}

/** Email 2: a lead alert to you. */
function sendOwnerAlert_(d) {
  const lines = [
    'Name: ' + d.firstName,
    'Email: ' + d.email,
    'Organization: ' + (d.company || 'not given'),
    'Score: ' + d.score + ' / 20 (' + d.band + ')',
    'Weakest area: ' + d.weakest,
    'Area scores: ' + d.areas.map(function (a) { return a.area + ' ' + a.score + '/5'; }).join(', '),
    'Follow-up emails: ' + (d.consent ? 'opted in (added to SwipeOne)' : 'did not opt in'),
    'Open risks: ' + d.risks.length
  ];
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">' +
    lines.map(function (l) { return esc_(l); }).join('<br>') + '</div>';
  send_(CONFIG.OWNER_EMAIL, 'New checklist lead: ' + d.firstName + ' (' + d.score + '/20)', html, lines.join('\n'), d.email);
}

/** Appends the lead to a Google Sheet, creating it on first use. */
function logLead_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    sheet.appendRow([
      new Date(), d.firstName, d.email, d.company, d.score, d.band, d.weakest,
      d.areas.map(function (a) { return a.area + ' ' + a.score + '/5'; }).join(', '),
      d.risks.length, d.consent ? 'Yes' : 'No'
    ]);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create(CONFIG.SHEET_NAME);
    props.setProperty('SHEET_ID', ss.getId());
    const s = ss.getSheets()[0];
    s.setName('Leads');
    s.appendRow(['Submitted', 'First name', 'Email', 'Organization', 'Score', 'Band', 'Weakest area', 'Area scores', 'Open risks', 'Opted in']);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#22384F').setFontColor('#FFFFFF');
  }
  return ss.getSheets()[0];
}

/** Adds or updates the contact in SwipeOne. Tagging green_report_lead starts the follow-up series. */
function pushToSwipeOne_(d) {
  const tags = ['green_report_lead', BAND_TAG[d.band]];
  if (WEAK_TAG[d.weakest]) tags.push(WEAK_TAG[d.weakest]);
  return swipeOneUpsert_({
    email: d.email,
    firstName: d.firstName,
    business_name: d.company,
    assessment_total_score: d.score,
    assessment_segment: d.band,
    assessment_primary_risk: d.weakest,
    tags: tags.join(',')
  });
}

/** Creates or updates a SwipeOne contact. Tags in a comma-separated string are added. */
function swipeOneUpsert_(body) {
  const key = PropertiesService.getScriptProperties().getProperty('SWIPEONE_API_KEY');
  if (!key) return 'skipped (no SWIPEONE_API_KEY)';
  const res = UrlFetchApp.fetch(CONFIG.SWIPEONE_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code >= 300) {
    console.error('SwipeOne ' + code + ': ' + res.getContentText());
    return 'error ' + code;
  }
  return 'ok';
}

/**
 * Run this once from the editor to authorize Gmail, Sheets and external requests,
 * create the leads sheet, and send yourself a sample results email.
 */
function testSetup() {
  const sample = {
    postData: {
      contents: JSON.stringify({
        firstName: 'Tolu',
        email: CONFIG.OWNER_EMAIL,
        company: 'Test Co',
        consent: false,
        score: 9,
        band: 'Your green report is lying',
        weakest: 'Ownership',
        areas: [
          { area: 'Meetings', score: 3 }, { area: 'Reporting', score: 2 },
          { area: 'Ownership', score: 1 }, { area: 'Delivery', score: 3 }
        ],
        risks: [
          { area: 'Ownership', risk: 'Key roles have no backup', impact: 'One absence can stop delivery.', fix: 'Name a backup for every critical role and pair them monthly.' },
          { area: 'Reporting', risk: 'Every team reports differently', impact: 'Leaders cannot compare progress or spot problems early.', fix: 'Adopt one one-page status template for every team.' }
        ]
      })
    }
  };
  CacheService.getScriptCache().remove('grl:' + CONFIG.OWNER_EMAIL.toLowerCase());
  const out = doPost(sample);
  console.log(out.getContent());
  console.log('Leads sheet: https://docs.google.com/spreadsheets/d/' + PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
}
