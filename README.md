# Diet Tracker

A personal iPhone Home Screen web app for weigh-ins, food eaten and calories burnt, kept to work toward a weight goal. A personal side project. The design was settled in a grilling session on 2026-10-04. The v1 screens are built and run on demo data; the camera barcode scanner, the Scan Text check on a real iPhone, and the deploy are still to do.

The vocabulary is in [CONTEXT.md](CONTEXT.md). Decisions that are hard to reverse are in [docs/adr/](docs/adr/).

## v1

A tab bar with Today · Food · Progress · Burn, plus a gear for Settings.

- **Today:** a Today tile (Intake so far, Burn estimate, Deficit so far, Left to eat, all marked estimate until Burn is logged); a Yesterday tile (its Deficit against the Target Deficit, estimated if its Burn is missing, "not logged" if it has no food); the weight graph (Weigh-in dots, Trend line, Goal line) with Pace status, meaning the Trend's 7-day change against the Pace and a projected finish date; slim nudges ("yesterday's Burn is missing", "weigh in", "back up").
- **Food:** the four Meals for a chosen day. Add a Quick Entry, or a Product Entry by picking a Product, scanning a barcode (Open Food Facts) or typing a new one; iPhone Scan Text works on the kcal field. Amounts are in g or ml, and a Product can have Servings.
- **Progress:** log a Weigh-in and set the Goal (target weight plus Pace). An on-track check for 7, 30 or 90 days or all: average Deficit per logged day against the Target Deficit, total Deficit, Expected change against the Trend's actual change, and "N of M days logged". Below it the weight graph, then daily Deficit bars with the Target Deficit as a line (not-logged days are gaps, estimated days paler).
- **Burn:** log the day's Burn (Garmin "Total Calories", typed in).
- **Settings:** Goal, Products, Back up and Restore.

## Rules settled

- Burn is the day's total, resting plus active, and Deficit = Burn − Intake. A day with no logged Burn uses the Baseline (the average of the last 7 logged Burns, or a figure typed in at setup until 3 days are logged) and is marked estimated.
- A Goal is a target weight plus a Pace in kg per week. The Target Deficit follows from the Pace (about 7,700 kcal per kg). Left to eat = Burn (or Baseline) − Target Deficit − Intake so far.
- One Weigh-in per day; logging again replaces it. The graph shows dots plus a Trend line, and progress is measured on the Trend.
- A day has an Intake only once it has a Food Entry; otherwise it is not logged: no Deficit, and left out of averages. A day with no food is a Quick Entry of 0 kcal.
- A Product Entry keeps the kcal it was logged with, so editing a Product never rewrites history.
- The UI is English, with every on-screen text kept in one list. Numbers accept a comma or a dot.

## Small defaults

1. A day is the calendar date on the phone. Entries default to today, and any past day can be logged or edited.
2. The Trend is smoothed with about a week of memory.
3. Pace safety is a warning, never a block: a Pace above 1 kg a week, or Baseline minus Target Deficit under 1,200 kcal.
4. When the Goal is reached the app says so and asks for a new one. "Maintain" is a Goal with Pace 0.
5. First run asks for the Goal, a starting Baseline and a first Weigh-in.
6. Weigh-ins are kg to 0.1. kcal and g/ml are whole numbers. No lb or kJ.
7. No company branding. It follows the iPhone's light or dark setting. The Home Screen name "Diet" is a placeholder.
8. Everything works offline except barcode lookups. The only thing that leaves the phone is a scanned barcode number, sent to Open Food Facts.
9. Progress starts at a 30-day range. Expected versus actual appears once the range has 7 logged days and two Weigh-ins.

## Not in v1

Garmin sync, a label-photo reader, reminders, a second device, macros, recipes, per-workout exercise logging, water, CSV export. Most of these need a server; see ADR 0001.

## Running it

- `python3 tools/dev_server.py` serves the app on http://localhost:8090 with no caching. Open `/?demo` for made-up data kept under its own storage key, so real data is never touched.
- `node --test` runs the tests: the engine, storage, the Open Food Facts mapping, and two guards (every on-screen string exists; the offline file list is complete).
- On localhost the service worker is off unless you add `?sw`, so edits show up on reload. Bump `VERSION` in `sw.js` whenever a shipped file changes, so phones fetch the new copies.
- `python3 tools/make_icons.py` redraws the icons (needs Pillow).

## To prove before leaning on them

- A JavaScript barcode decoder reading EANs through the camera inside a Home Screen app on the iPhone (Safari has no native barcode API).
- That Scan Text appears on a text field inside a Home Screen app.
- Hosting is GitHub Pages from a personal GitHub account, not yet named. The app's storage is tied to its address, so a later move goes through backup and restore.
