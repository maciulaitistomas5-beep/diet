# Diet Tracker

A personal tracker for weigh-ins, food eaten and calories burnt, kept to work toward a weight goal. A personal side project. The app is in English.

## Language

### Energy

**Burn**:
The total kcal the body used up over a day, resting plus active, as one number per day. It is the figure on the user's Garmin ("Total Calories"), typed in by hand.
_Avoid_: calories burnt, expenditure, TDEE, active calories (leaves out resting burn)

**Intake**:
The total kcal eaten over a day.
_Avoid_: calories in, calories eaten, consumption

**Deficit**:
The amount by which a day's Burn exceeds its Intake (Burn − Intake).
_Avoid_: deficiency (a nutrient shortage), negative balance, calorie gap

**Surplus**:
The amount by which a day's Intake exceeds its Burn: the opposite of a Deficit.
_Avoid_: excess, overage

**Baseline**:
The Burn assumed for a day whose real Burn hasn't been logged: the average of the last 7 logged Burns, or a figure typed in once at setup until 3 days are logged. A Deficit or Surplus worked out from it is called estimated until the real Burn is logged.
_Avoid_: default burn, guess, projected burn

**Logged day**:
A day with at least one Food Entry. Only a logged day has an Intake, and so a Deficit or Surplus; any other day is not logged and is left out of averages. A day on which nothing was eaten is logged with a Quick Entry of 0 kcal.
_Avoid_: tracked day, complete day, closed day

### Progress

**Goal**:
The body weight the user is working toward, together with the Pace to get there.
_Avoid_: target, objective, plan

**Pace**:
How fast the user means to move toward the Goal, in kg per week. Losing or gaining follows from whether the Goal is below or above the Trend.
_Avoid_: rate, speed, weekly goal

**Target Deficit**:
The Deficit a day needs in order to keep to the Pace; for a gain Goal, a Surplus instead.
_Avoid_: daily target, calorie target, budget

**Left to eat**:
The kcal the user can still eat today and keep to the Target Deficit: Burn (or Baseline, while Burn isn't logged) minus the Target Deficit minus Intake so far. Negative means over.
_Avoid_: remaining calories, allowance, kcal left

**Weigh-in**:
The user's body weight in kg on a given day. A day has at most one Weigh-in; logging another that day replaces it.
_Avoid_: weight, measurement, reading

**Trend**:
The user's body weight with the day-to-day noise smoothed out, a moving average through the Weigh-ins. Progress toward the Goal is measured on the Trend, never on a single Weigh-in.
_Avoid_: average weight, current weight, smoothed weight

**Expected change**:
The weight change that a stretch of logged days predicts from their total Deficit or Surplus, compared with the Trend's actual change over the same stretch.
_Avoid_: predicted loss, theoretical loss

### Food

**Meal**:
One of the four named parts of a day that Food Entries are filed under: Breakfast, Lunch, Dinner or Snack.
_Avoid_: slot, course, sitting

**Food Entry**:
One line of food eaten, filed under a Meal on a day. It is either a Quick Entry or a Product Entry, and a day's Intake is the sum of its Food Entries.
_Avoid_: log, item, record, meal entry

**Quick Entry**:
A Food Entry whose kcal the user typed straight in, with no Product behind it.
_Avoid_: manual entry, meal total

**Product Entry**:
A Food Entry made of a Product and an Amount. Its kcal is worked out from the two when logged and stays as logged, even if the Product is later edited.
_Avoid_: itemised entry, detailed entry

**Product**:
A food the user can eat again, known by its name and its kcal per 100 g (or per 100 ml, for a drink), and kept for reuse.
_Avoid_: food, item, ingredient

**Amount**:
How much of a Product was eaten, in grams or millilitres, whichever its kcal is quoted per 100 of.
_Avoid_: weight, portion, quantity

**Serving**:
A named Amount of a Product, such as one egg or one pot, so it can be logged as a count instead of weighed.
_Avoid_: piece, unit, portion
