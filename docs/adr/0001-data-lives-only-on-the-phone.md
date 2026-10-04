# Data lives only on the iPhone; there is no server

The Diet Tracker is a static page the user adds to the iPhone Home Screen, and everything logged stays in that app's own storage on the phone. Once Garmin sync and the label-photo vision model were dropped, nothing else needed a server, which would have bought only automatic backup, a second device and reminders. It would have cost hosting (Render Starter is about €7 a month, and the free tier sleeps so the first tap each day waits), a login, an offline queue so logging in a shop still works, and health history on a third-party host.

## Consequences

- The only copy of the history is on the phone. Apple exempts Home Screen web apps from Safari's 7-day storage wipe, so history is lost only if the icon is deleted or its data cleared. The app therefore has a "Back up" button (a file saved through the share sheet to Files or iCloud Drive) and nags weekly. Restoring a backup is also how a new iPhone is set up.
- A Home Screen app's storage belongs to its web address. Moving the app to another host changes that address and starts the app empty, so a move goes through backup and restore.
- No second device, no push reminders, no sign-in. A second person installs the app on their own phone and keeps separate data.
- All the logic (Trend, Baseline, Deficit) runs in the page as JavaScript, not in Flask and Python.
- Anything that needs a server stays out until this decision is revisited: Garmin sync through an Apple Health Shortcut, a vision model reading label photos, and push reminders. The backup file is the route for moving the history onto a server later.
