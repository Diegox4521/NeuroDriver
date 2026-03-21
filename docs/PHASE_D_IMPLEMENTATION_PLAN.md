# Glass Box AI Driver — Phase D Implementation Plan (Current)

This is the **current working design** after professor pilot feedback, sensor redesign iterations, and MLP reliability testing. It **supersedes** all previous Phase D drafts (including the four-sensor / “Thermal” variant).

---

## Implementation strategy (read this first)

**Do Part I before Part II.** Ablation **rounds, locks, banners, logging, and toggle flow** are easier to validate in isolation. The **pedestrian**, **7D vector**, **near-miss**, and **proximity visuals** share tight coupling—leave that block for **last**, after round timing and `Logger`/`UI` plumbing behave.

| Part | Focus | Depends on |
|------|--------|------------|
| **I** | Rounds & session flow | Current codebase (6D) |
| **II** | Pedestrian + 7D + near-miss + HUD/ring | Part I complete recommended |
| **III** | Full session test & tuning | Parts I + II |

---

## What this plan reflects

- Three **student-facing** sensors; **seven** internal MLP inputs.
- **Camera** = pure pedestrian proximity scalar (`Pedestrian.proximityValue`), **not** forward ray / lane geometry—no interference with chicane steering (MLP leans on LiDAR there; camera ~0 far from pedestrian).
- **Near-miss** behavior and ethics narrative stay tied to **Camera off** + drift toward inner wall (see placement below).

---

## Final sensor design

| Toggle | Name | Internal index | Computation when ON | When OFF | Failure mode |
|--------|------|----------------|----------------------|----------|--------------|
| 0 | LiDAR | indices **0–4** | Five raycasts at −60°, −30°, 0°, +30°, +60° | All five rays zero | Immediate wall crash, geometry blind |
| 1 | Camera | index **5** | `Pedestrian.proximityValue(x, y)` | Proximity zero | Passes through pedestrian zone; person blind |
| 2 | Speedometer | index **6** | `speed / MAX_SPEED` | Speed zero; throttle logic may boost AI throttle | Wobbles, overshoots corners |

**Internal 7D vector:**

`[leftFar, leftNear, forward, rightNear, rightFar, camera, speed]`

---

## Pedestrian placement

The pedestrian sits **~30px from the centerline toward the inner wall** on the **top straight**—not on the centerline (car would hit every lap), not so far that `Camera` never rises above **0.5** on a normal pass.

```
[inner wall]
      ● pedestrian (~30px from centerline)
- - - - - - - centerline - - - - - - -   ← car path
[outer wall]
```

- **Near-miss radius:** 35px. A centered car should **not** enter it; with **Camera off**, drift toward the inner wall can enter it.
- **Proximity range:** `PROXIMITY_MAX_RANGE = 150` (tune in Part III if needed).

---

## Script load order (`index.html`)

```
track.js → pedestrian.js → car.js → sensors.js → knn.js → logger.js → ui.js → gameManager.js → main.js
```

`pedestrian.js` **before** `car.js` because `car.js` calls `Pedestrian.*`.

*Note:* Until Part II adds `pedestrian.js`, keep the current order; **insert** `pedestrian.js` when you start Part II Step II-2.

---

# Part I — Rounds & flow (implement first)

These steps use the **existing 6D** pipeline where noted. Do **not** add `pedestrian.js` or change `INPUT_SIZE` yet.

### I-1 — Steering fix (`car.js`)

Allow turning at low speed so students are not stuck when barely moving:

```javascript
if (speed > 0.05) {
  const speedFactor = Math.max(0.3, speed / MAX_SPEED);
  heading += steering * TURN_RATE * speedFactor;
}
```

**Verify:** Car steers while barely moving; forgiving through corners.

---

### I-2 — Logger groundwork (`logger.js`)

- Bump **`dataFormatVersion`** to **`'4.0'`** when you are ready to freeze schema (can be end of Part I or start of Part II—pick one cutover and hard-refresh demos after).
- Keep **`sensorCount: 3`**, **`sensors: ['lidar', 'camera', 'speedometer']`**.
- Add config keys (values can be **`null`** until Part II):  
  `ablationRound1Ms`, `ablationRound2Ms`, `nearMissRadius`, `nearMissSlowDuration`, `nearMissSpeedFactor`, `pedestrianX`, `pedestrianY`, `cameraIsPedestrianProximity: true`.
- Ensure **every toggle log** can carry **`ablationRound`** (wire from `gameManager` once I-3 exists).
- Add **`near_miss`** as a valid **prediction/outcome** on toggle events when the modal supports it (I-4 can stub UI; schema should accept it).
- Add **`nearMissCount`** (start at `0`) and a **`logNearMiss(...)`** function that **no-ops or only increments** until Part II—then implement full logging.

**Verify:** Downloaded JSON shows v4.0, round fields, and stable toggle events with round numbers.

---

### I-3 — Ablation rounds in `gameManager.js` (merge only)

**Do not rewrite** crash streak, `resetCrashStreak()`, `crash_loop_nudge`, or AI respawn / `stepsBack` logic.

Add:

- `ablationRound`, `ROUND_1_DURATION_MS` / `ROUND_2_DURATION_MS` (e.g. 90s each).
- In **`beginAblation`:** `ablationRound = 1` and **lock Speedometer** (`UI.lockSensor(2)`).
- In **`update`** (or equivalent phase tick): when `currentPhase === 'AI_ABLATION' && ablationRound === 1 && phaseElapsed >= ROUND_1_DURATION_MS`, advance to round 2, **`UI.unlockSensor(2)`**, banner, `Logger.logEvent('ablation_round_2', {})`. Use the **same `phaseElapsed`** used elsewhere so time **does not advance while paused** (prediction modals, etc.).
- Pass **`ablationRound`** into **both** `Logger.logToggle` call sites.
- `Logger.setConfig`: at minimum **round duration ms** in Part I; add pedestrian/near-miss config in Part II when values exist.

**Defer to Part II:** `onNearMiss`, `nearMissDuringOutcomeWindow`, outcome branch `near_miss`, Speedometer-off **throttle** formula that assumes **7D** indices (0–4 LiDAR, 6 speed)—that throttle must use **`Sensors.getToggleMask()[2]`** and the **post–Part II** raw vector layout.

**Verify:** Round 1 locks Speedometer; at 90s unlock + banner; toggles log with correct round; pause does not “eat” round time incorrectly.

---

### I-4 — UI hooks (`ui.js` / `index.html` if needed)

- Confirm **ranking** remains **3 items** (pre/post).
- Ensure **`lockSensor` / `unlockSensor`** (or equivalent) work for modality **2** (Speedometer).
- Optional during Part I: add **fourth prediction option** only when wiring Camera toggle—if you prefer zero UI churn until Part II, skip and do in II-6.

**Verify:** Round locks visibly match `gameManager` behavior.

---

### I-5 — Part I smoke test

Hard refresh. Run through ablation with **DEV_AUTO_DEMO** as you usually do. Confirm round transition and logging only.

---

# Part II — Pedestrian, 7D, near-miss, visuals (implement last)

Complete steps **in order**—each step assumes the previous.

### II-1 — Find pedestrian coordinates (`main.js`, temporary)

Temp **`console.log`** of car **x, y** ~1 Hz. Drive one lap; record midpoint of **top straight**, then offset **~30px toward inner wall**. Remove log when done.

**Verify:** You have stable `PED_X`, `PED_Y` before coding constants.

---

### II-2 — `pedestrian.js` + script order + draw

New **`js/pedestrian.js`** (IIFE) with:

- `PED_X`, `PED_Y` from II-1  
- `NEAR_MISS_RADIUS = 35`, `PROXIMITY_MAX_RANGE = 150`  
- `distanceTo`, `isNearMiss`, `proximityValue`, `draw` (orange fill r=8, white stroke, faint ring r=14)  
- Export constants for logger config

**`index.html`:** insert `<script src="js/pedestrian.js"></script>` **after `track.js`, before `car.js`**.

**`main.js`:** `Pedestrian.draw(ctx)` **after** `Car.draw(ctx)`.

**Verify:** Pedestrian visible, offset from centerline.

---

### II-3 — `sensors.js` (7D, Camera = proximity only)

- Still **three** toggles: `SENSOR_NAMES` unchanged.
- **`buildRaw`:** five rays unchanged; **`camera = Pedestrian.proximityValue(x, y)`**; **`speed`** normalized as today.
- **Masking:** `[0]` off → 0–4; `[1]` off → **5**; `[2]` off → **6** (do **not** swap 5 and 6).
- **`resetToggles`:** `[true, true, true]`.
- **Do not** update mini-HUD here (**II-7 only**).

**Verify:** Camera ~0 away from top straight; **> 0.5** within 150px of pedestrian; flat through chicane.

---

### II-4 — `knn.js`

- `INPUT_SIZE`: **6 → 7** (confidence uses `Math.sqrt(INPUT_SIZE)`).

**Protocol:** 6D→7D **invalidates** old demos—hard refresh; never reuse old demo files.

**Verify:** Record + train with no console errors.

---

### II-5 — Near-miss in `car.js`

State: `nearMissActive`, `nearMissTimer`, `nearMissTargetSpeed`, `NEAR_MISS_SLOW_DURATION`, `NEAR_MISS_SPEED_FACTOR`.

After wall collision handling, if `Pedestrian.isNearMiss(x, y)` and not already active: set active, timer, target speed, call **`GameManager.onNearMiss()`** if defined.

While active: decay timer, ease speed toward target; orange body **`#f97316`**; expose **`isNearMissActive`**.

**Verify:** Manual drive into near-miss zone: orange flash, ~1s slow, **no crash** (per design).

---

### II-6 — `gameManager.js` — near-miss outcomes + AI throttle + Camera predictions

**Merge** into existing code (still preserve crash-streak block):

- `OUTCOME_LABELS.near_miss`: `'Almost hit the pedestrian'`
- `nearMissDuringOutcomeWindow`; **`onNearMiss()`** → set flag during outcome window + **`Logger.logNearMiss`**
- Outcome order: **crash** → **near_miss** → **slow** → **fine**; clear `nearMissDuringOutcomeWindow` after resolve
- **Speedometer-off throttle** (7D raw): e.g. `speedometerOff = !Sensors.getToggleMask()[2]`; `lidarMin = min(raw[0..4])`; throttle map as in your spec (1.0 when speed off, else stepped values vs confidence + `lidarMin`)
- **`handleToggle`:** when **`sensorIndex === 1`** (Camera), prediction modal shows **4** options including **`near_miss`**
- Export **`onNearMiss`** on the public `GameManager` API

**Verify:** Near-miss logs; toggles + streak behavior unchanged; Camera modal has four outcomes; AI throttle visibly higher with Speedometer off.

---

### II-7 — Proximity ring + mini-HUD (`main.js` + `ui.js`)

**After `Pedestrian.draw`:** if Camera toggle on and `proximityValue > 0.05`, draw pulsing/shrinking orange ring around pedestrian (radius from proximity, e.g. `150 * (1 - pedVal) + 14`, stroke alpha ~`pedVal * 0.6`). **Hidden when Camera off.**

Keep dashcam orange overlay consistent with proximity (already aligned if it reads same signal).

**Mini-HUD — update here and only here:** **three** rows: LiDAR (e.g. min of rays), **Camera** (proximity scalar), Speedometer.

**Verify:** Ring shrinks approaching pedestrian; off when Camera toggled off; mini-HUD matches.

---

### II-8 — `ui.js` copy + predictions

- Sensor intro **Camera** panel: e.g. *“Detects nearby people — like the pedestrian detection camera on a real self-driving car. When it's off the AI can't see the person on the road ahead.”*
- Prediction options: **4** when `sensorIndex === 1`, **3** otherwise (see II-6).
- Ranking: still **3** items.

**Verify:** Copy matches behavior; LiDAR/Speedometer three options; Camera four.

---

### II-9 — `logger.js` completion

- Fill **`logNearMiss`** implementation; increment **`nearMissCount`** as appropriate.
- Set **`pedestrianX` / `pedestrianY`** and numeric near-miss params in **`setConfig`**.

**Verify:** JSON exports show near-miss events and full v4.0 config.

---

# Part III — Full session test & tuning

### III-1 — Full session (after I + II)

Hard refresh. With **DEV_AUTO_DEMO** on (where you use it):

- AI chicane with all sensors on
- Round 1 locks Speedometer; Round 2 unlock ~90s + banner
- Camera toggle exposes near-miss prediction
- Near-miss can fire when appropriate (e.g. Camera off + drift)
- Proximity ring + mini-HUD
- Crash streak / respawn unchanged
- JSON clean; rankings **3** items each way

### III-2 — Manual tune (`DEV_AUTO_DEMO` off)

- Camera ~0 except top straight; **> 0.5** within 150px; flat in chicane
- Trained MLP + Camera on: pass **near** pedestrian, not through
- Camera off: can produce near-miss / line through zone
- If near-miss never fires with Camera off: tighten **`PROXIMITY_MAX_RANGE`** or move pedestrian slightly toward path
- If AI **hits** pedestrian with Camera on: move pedestrian slightly **farther** from centerline

---

## Order summary (execution order)

| Step | Part | Files / focus |
|------|------|----------------|
| I-1 | I | `car.js` — low-speed steering |
| I-2 | I | `logger.js` — v4 schema, rounds on toggles, stubs for pedestrian/near-miss |
| I-3 | I | `gameManager.js` — ablation rounds, lock/unlock Speedometer, `phaseElapsed` |
| I-4 | I | `ui.js` / HTML — locks, ranking (3) |
| I-5 | I | Smoke test — rounds only |
| II-1 | II | Temp coords |
| II-2 | II | `pedestrian.js`, `index.html`, `main.js` draw |
| II-3 | II | `sensors.js` — 7D, masking |
| II-4 | II | `knn.js` — `INPUT_SIZE` 7 |
| II-5 | II | `car.js` — near-miss |
| II-6 | II | `gameManager.js` — outcomes, throttle, Camera 4 predictions |
| II-7 | II | `main.js` + `ui.js` — ring, mini-HUD |
| II-8 | II | `ui.js` — intro copy, predictions |
| II-9 | II | `logger.js` — full near-miss + config |
| III-1 | III | Full session |
| III-2 | III | Manual tune |

---

## Research hypotheses

- **H1 (Primary, Round 1):** Students predict **Camera** ablation outcomes less accurately than **LiDAR**, because LiDAR failure yields rapid wall contact while Camera failure yields a **near-miss** that is harder to anticipate.
- **H2 (Primary, ranking):** Post-ablation sensor importance rankings differ from pre-ablation; Kendall tau pre→post **> 0**. Expected ordering: LiDAR → Camera → Speedometer.
- **H3 (Secondary, Round 2):** **Speedometer** prediction accuracy lower than LiDAR and Camera (speed increase not visible; steering effect abstract).
- **H4 (Exploratory, ethics):** Students who see a **Camera** near-miss write **longer** post-survey ethics responses about why cars must detect people than those whose Camera toggle only produced wobble/fine.

---

## Methods blurb (paper)

The system used **three** student-facing sensors. **LiDAR** comprised five directional raycasts encoding wall proximity. **Camera** encoded **pedestrian proximity** as a single scalar **independent of wall geometry**, rising toward 1.0 as the vehicle approached a stationary pedestrian on the top straight. **Speedometer** encoded normalized speed. All three fed a **seven-dimensional** MLP input trained on student demonstrations via batch gradient descent. Ablation **zeroed** the corresponding channels while **weights stayed fixed**.

---

*End of Phase D plan (current).*
