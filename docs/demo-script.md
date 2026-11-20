# Demo script

The live product demo for the final pitch on **20 Nov 2026, from 14:00 CET** (moved from 21 Nov). We meet on the 5th floor and present 4th, after the Elsa-Marie, Baraa and Adrian groups. It takes about 4 minutes on one phone mirrored to the projector.

This file holds the click path and what each step must show. The team writes the spoken words itself (hackathon AI rules).

## Before the session

- [ ] #7 and #8 are merged, and production on Vercel serves `main`.
- [ ] `ORS_API_KEY` is set in Vercel. On the live URL, a map leg draws a real route, not a dashed line.
- [ ] Crowd counts (#10) are in the catalogue. **Rehearse profile A below and check the plan.** If stops still say "packed" at midday, or the summary says "0% at quiet times", the counts are not in yet. Do not demo the quiet-hours claim on placeholder data.
- [ ] If you show step-free mode: the step-free plan fills the day (#11).
- [ ] Rehearse the full path at least once against the clock, on the demo phone.

There is no time to add crowd counts (#10) before the demo. Present the quiet-hours planning as the method: the levels marked * are a generic placeholder curve, and our own counts replace it per sight.

## On the demo phone, 15 minutes before

1. Charge it. Turn on Do Not Disturb. Set the brightness to maximum.
2. Connect it to the projector (cable or screen mirroring) and check that the picture appears.
3. Open the production URL, https://tour-wiz.vercel.app, in the normal browser, **not** a private tab, because private tabs cannot save the profile.
4. On the plan screen, tap **Delete my data from this phone**, then **Yes, delete**, so the demo starts at onboarding.
5. Keep a second phone or a laptop open on the same URL as a spare.

## Profiles

Use these exact answers, so the plan matches the rehearsal.

| | Interests | Pace | Access |
|---|---|---|---|
| **A** (main) | History, Viewpoints, Tea houses | Normal | – |
| **B** (step-free) | Same as A | Normal | Step-free on, rest breaks after 10 min, 4 km |

Date: **today (20 Nov, a Friday)**. Time: **09:00 to 18:00** (the defaults).

## Click path

| # | Time | Do | What it must show |
|---|---|---|---|
| 1 | 0:00 | The onboarding screen is already open | "Takes 30 seconds". No account, no sign-up |
| 2 | 0:15 | Tap the profile A interests, keep **Normal** pace | Everyday answers, nothing technical |
| 3 | 0:30 | Point to the line under the button | "Saved only on this phone. No account, nothing sent to us." (privacy) |
| 4 | 0:40 | Tap **Plan my day** | The plan appears at once, with no loading, because planning runs on the phone |
| 5 | 0:50 | Read the summary line | Stops, km walking, **% at quiet times** |
| 6 | 1:00 | Scroll to the first stop or two | Arrival time, crowd badge, and the **reasons**: "Matches: history, viewpoint", "Crowd at 09:15 …". Every stop says *why* it is there |
| 7 | 1:30 | Find a stop that says "Waits … for a quieter slot" or "Waits … to open", if there is one | The planner moves visits to quieter times and respects opening hours |
| 8 | 1:50 | Tap **Show route here** on a stop | The page scrolls to the map with the leg and the minutes and km |
| 9 | 2:05 | Drag the **route style** slider from Fastest to Scenic | The route changes and shows "about N min longer than planned" |
| 10 | 2:30 | Tap **→** for the next leg | Each leg between stops, on an OpenStreetMap map with attribution |
| 11 | 2:45 | Rate a stop with 5 stars | "Re-plan with my new ratings" appears. Ratings sharpen the next plan |
| 12 | 3:00 | Tap **Change my interests**, switch on step-free, a rest after 10 min and 4 km, then tap **Save and re-plan** (profile B) | The step-free note, rests "on the way", the slider disabled, and only places without steps |
| 13 | 3:40 | Scroll to the bottom and point to **Delete my data from this phone** | The data stays on the phone and can be deleted with one tap |
| 14 | 4:00 | End | |

If time is short, skip steps 7, 10 and 13.

## If something fails during the demo

| Problem | What to do |
|---|---|
| The map leg shows a dashed line, "Route not available right now" | Say that the plan does not need the network, only the drawn route does. Continue at step 11 |
| The map tiles do not load | The same. The plan and reasons still work |
| The plan is short or says "Nothing fits this day" | Change **Until** to a later time. If that does not help, change interests back to profile A |
| The page does not load at all | Go to the spare device |
| "This browser won't let us save" appears | It is a private tab. Continue: the plan still works |

## What the plans show today

Checked on `main` for 20 Nov, 09:00 to 18:00, with the placeholder crowd curves:

- **A**: 8 stops, 6.7 km, **25% at quiet times**. Charles Bridge is "Quiet at 09:15", Lennon Wall "Quiet at 17:30", and Týn Church "Waits 60 min for it to open" (use it for step 7).
- **B**: 5 stops, 3.6 km, three "Rest on the way at a bench" breaks, and Prague Castle marked "Step-free access is limited".

If the numbers differ, check the profile answers against the Profiles table.

## Backup laptop

If the live site is down, run the app on a laptop:

1. `npm install`, then `npm run dev`, and open the address Vite prints (usually http://localhost:5173).
2. Open the browser dev tools, switch on device mode (Ctrl+Shift+M in Chrome or Brave) and pick a phone.
3. Without `ORS_API_KEY` in a local `.env`, every leg shows the dashed fallback line. Handle it as in "If something fails during the demo".
4. The map tiles need the internet. The plan itself does not.

## Likely questions, and where the answer is

| Question | Source |
|---|---|
| Where do the crowd levels come from? | `data/crowd/prague.csv`, source column; issue #10 for the method |
| Is the data licensed? | Places from OpenStreetMap (ODbL, attribution on the map), crowd levels from our own counts, routes from OpenRouteService. No Google data (AGENTS.md) |
| What does the server see? | One leg's start and end points, with no logging. See TECH.md, privacy |
| Why no AI chat assistant? | Out of scope since 8 Nov (README) |
| How does it work in another city? | The same catalogue format and tag vocabulary; `npm run catalogue` for a new city |
