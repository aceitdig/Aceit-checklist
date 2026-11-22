# Is Your Green Report Lying? (Aceit Digital checklist)

Live at **https://checklist.aceitdigital.ca**

A free, interactive 20-point systems checklist. Visitors tick what is true for their organization, get an instant score, see their weakest area, and can book a free 20-minute discovery call.

Part of the "Right People, Wrong Systems" AI mini-series campaign. Viewers who comment GREEN get this link.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The checklist page (questions, scoring and booking button are all in this file) |
| `404.html` | Branded "page not found" page |
| `og-image.png` | 1200x630 preview image shown when the link is shared |
| `favicon-32.png`, `apple-touch-icon.png` | Browser tab and home-screen icons |
| `aceit-logo-white.png`, `aceit-icon.png` | Aceit Digital logos |
| `CNAME` | Connects the site to checklist.aceitdigital.ca (do not delete) |
| `apps-script/Code.gs` | Google Apps Script that emails results, alerts you, logs leads and adds opted-in leads to SwipeOne |
| `apps-script/Bookings.gs` | Tracks discovery call bookings and attendance, and tags SwipeOne contacts |
| `SETUP.md` | Step-by-step setup for the email results flow |

## Common edits

- **Booking link:** in `index.html`, search for `calendar.app.google` (3 places).
- **Questions:** in `index.html`, edit the `GROUPS` list in the script near the bottom.
- **Score bands:** in `index.html`, search for `Truly green`.
- **Risk register wording:** in `index.html`, edit the `RISKS` list (one row per question, same order).
- **Email relay URL:** in `index.html`, `RELAY_URL` (see SETUP.md).

Changes pushed to `main` go live in about a minute.

Aceit Digital Inc. · support@aceitdigital.com · (403) 912-5726
