# Email results setup (about 15 minutes)

How it works: a visitor finishes the checklist and enters their name and email. A small Google Apps Script in your Google account then:

1. Emails them their score and personal risk register (sent from your Gmail).
2. Emails you a lead alert at tolu@aceitdigital.com.
3. Logs the lead in a Google Sheet called "Green Report Checklist Leads".
4. If they ticked the consent box, adds them to SwipeOne (Aceit default workspace) tagged `green_report_lead`, which starts the 5-email follow-up series.

## 1. Create the script

1. Signed in as tolu@aceitdigital.com, go to https://script.google.com and click **New project**.
2. Rename it **Green Report Relay**.
3. Delete the sample code, then paste everything from `apps-script/Code.gs` in this repo. Click **Save**.

## 2. Add your SwipeOne API key

1. In SwipeOne (Aceit default workspace), go to **Settings > API Keys** and create a key named "Checklist relay". Copy it.
2. In Apps Script, click **Project Settings** (gear icon) > **Script Properties** > **Add script property**.
3. Property: `SWIPEONE_API_KEY`. Value: the key you copied. Save.

The key stays in your Google account. Never paste it into `index.html` or GitHub.

## 3. Test it

1. Back in the editor, choose **testSetup** in the function menu and click **Run**.
2. Approve the permissions Google asks for (Gmail, Sheets and external requests).
3. Check your inbox: you should get a sample results email and a lead alert. The log shows the link to your new leads sheet.

## 4. Publish it as a web app

1. Click **Deploy > New deployment**. Choose type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

## 5. Connect the checklist page

Send the Web app URL to Claude, or edit `index.html` on GitHub yourself:
find `var RELAY_URL = "";` and paste the URL between the quotes. Commit, and the site updates in about a minute.

## 6. Turn on the follow-up series

1. In SwipeOne, open **Workflows > Green Report Checklist Follow-up** (it's a draft).
2. Send yourself a test of each email, then click **Activate**.
3. Do one real test on checklist.aceitdigital.ca with the consent box ticked. In SwipeOne, check the contact has the `green_report_lead` tag and its Assessment Score, Assessment Segment and Primary Risk fields filled in.

## Sender addresses

- Results emails come from your Gmail. If support@aceitdigital.com is set up in Gmail under **Settings > Accounts > Send mail as**, the script sends from it automatically.
- The SwipeOne series sends from tolu@toluamadi.ca, because toluamadi.ca is the only verified domain there. To send from aceitdigital.ca instead, verify the domain in SwipeOne, then change the sender on each of the 5 emails.

## Changing the script later

After editing the code: **Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy**. The URL stays the same.
