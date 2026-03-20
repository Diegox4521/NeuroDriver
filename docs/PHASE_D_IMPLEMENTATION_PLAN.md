# Phase D — Implementation plan (revised)

This document merges the ordered implementation steps with **six plan fixes** (script order, Step 6 merge, `near_miss` labels, mini-HUD timing, Step 12 verification, 6D→7D demo note). Research hooks, crash-loop mitigation, and verification structure are otherwise **approved as-is**.

---

## Plan fixes (apply to all steps below)

### Fix 1 — Script load order (`index.html`)

Load **`pedestrian.js` immediately after `track.js` and before `car.js`**. Loading it only before `gameManager.js` is **too late** because `car.js` calls `Pedestrian.*`.

**Correct script order:**

1. `track.js`
2. `pedestrian.js`
3. `car.js`
4. `sensors.js`
5. `knn.js`
6. `logger.js`
7. `ui.js`
8. `gameManager.js`
9. `main.js`

*(Logical dependency: `track` → `pedestrian` → `car` → rest.)*

### Fix 2 — Step 6 is a merge, not a replace

`gameManager.js` **already** includes crash-streak logic, wrap-aware same-spot distance, `resetCrashStreak()`, and `crash_loop_nudge` logging. **Do not rewrite** that block.

Step 6 means: **merge in** only:

- `nearMissDuringOutcomeWindow` and `onNearMiss()` / `Logger.logNearMiss`
- Outcome classification branch for `near_miss`
- Reset `nearMissDuringOutcomeWindow` where appropriate

Leave existing streak, respawn, banner, and `crash_loop_nudge` behavior intact.

### Fix 3 — `OUTCOME_LABELS` in `gameManager.js`

Add:

```javascript
near_miss: 'Almost hit the pedestrian',
```

Without this, feedback banners can show `undefined` when the outcome is `near_miss`.

### Fix 4 — Mini-HUD: update once only

Steps 3 and 8 both mentioned the mini-HUD. **Update the mini-HUD only in Step 8** (after all four sensors and HUD rows are stable). **Do not** change mini-HUD in Step 3.

### Fix 5 — Step 12 thermal verification (no auto-demo thermal)

The **auto-demo controller** follows the centerline only; it **does not** read Thermal. Any check that “auto-demo adjusts its line when Thermal is ON” will **fail** by design.

**Revised Step 12 verification:**

- Set **`DEV_AUTO_DEMO` to `false`**, drive **manually** past the pedestrian with **Thermal ON**, and confirm the Thermal value in the mini-HUD rises **above 0.6** when passing within range.
- Any **line adjustment** from Thermal is a property of the **trained MLP after demos**, not the auto-demo loop. Verify MLP/thermal interaction **after** a full demo session is collected and the model is trained—not via the centerline auto-demo.

### Fix 6 — 6D → 7D invalidates old demos

Moving KNN input from **6D to 7D** invalidates any cached or reused demo vectors from older builds.

**Testing protocol note:** Always **hard refresh** before recording demos; **never** reuse demo data across the **6D → 7D** transition.

---

## Implementation watch-outs (before the agent starts)

The plan is **clean and ready to execute**: all **six fixes** above are correctly incorporated and the **step order** is sound. The items below are **three additional watch-outs** for the agent (not duplicates of those fixes).

### Watch-out A — Step 3 masking indices (thermal vs speed)

The 7D vector is:

`[leftFar, leftNear, forward, rightNear, rightFar, thermal, speed]` → indices **0–4** rays, **5** thermal, **6** speed.

**Double-check:** when **Speedometer** is off (`toggleMask[3]`), masking must zero **index 6** (speed), **not** index 5. Thermal off (`toggleMask[2]`) zeros **index 5**. It is easy to swap 5 and 6 and silently break the experiment.

### Watch-out B — Step 7 round transition timing

The round timer must run against **`phaseElapsed`** (already computed in `update()` from `phaseStartTime`), **not** a separate internal timer. Otherwise time **does not pause** when **`paused === true`** during prediction modals.

Example pattern (illustrative): `currentPhase === 'AI_ABLATION' && ablationRound === 1 && phaseElapsed >= ROUND_1_DURATION_MS` — use the **same** `phaseElapsed` variable used elsewhere for the phase timer.

### Watch-out C — Step 8 `data-modality` and hardcoded indices

In current Option B code, **Speedometer** is `data-modality="2"`. After adding **Thermal** as `data-modality="2"` and shifting **Speedometer** to `data-modality="3"`, **audit every place** in `ui.js`, `gameManager.js`, and elsewhere that assumes a fixed sensor index (e.g. speedometer === 2, or `sensorIndex === 2` meaning speed). Those assumptions will **silently break** unless updated to the 4-sensor layout.

Aside from these three watch-outs, the plan is correct and each step remains **independently testable**. **Start with Step 1** when handing work to an agent.

---

## Ordered steps (each independently testable)

### Step 1 — Find pedestrian coordinates (temporary)

**File:** `main.js` (temporary)

Add a temporary `console.log` of car X and Y every second. Drive one full lap and record coordinates on the **top straight centerline midpoint**. Remove the log when done.

**Verify:** You have `PED_X` and `PED_Y` on the centerline of the top straight, away from both curves.

---

### Step 2 — Create `pedestrian.js`

**File:** `js/pedestrian.js` (new)

- `PED_X`, `PED_Y` from Step 1
- `NEAR_MISS_RADIUS = 35`
- `THERMAL_MAX_RANGE = 150`
- `distanceTo(carX, carY)` → `Math.hypot`
- `isNearMiss(carX, carY)` → distance `< NEAR_MISS_RADIUS`
- `thermalValue(carX, carY)` → `Math.max(0, 1 - distanceTo(...) / THERMAL_MAX_RANGE)`
- `draw(ctx)` — orange circle r=8, white stroke, faint orange ring r=14

**File:** `index.html` — add `<script src="js/pedestrian.js"></script>` per **Fix 1** (after `track.js`, before `car.js`).

**File:** `main.js` — add `Pedestrian.draw(ctx)` after `Car.draw(ctx)`.

**Verify:** Pedestrian visible on top straight, on centerline.

---

### Step 3 — Add Thermal to `sensors.js`

**File:** `js/sensors.js`

- `SENSOR_NAMES`: `['LiDAR', 'Camera', 'Thermal', 'Speedometer']`
- `SENSOR_COLORS`: add orange `#f97316` for Thermal
- `toggleMask`: `[true, true, true, true]` (length 4)
- `buildRaw`: return **7** elements: `[leftFar, leftNear, forward, rightNear, rightFar, thermal, speed]` with `thermal = Pedestrian.thermalValue(x, y)`
- Masking: `[0]` off → 0–4; `[1]` off → index 2; `[2]` off → index **5** (thermal); `[3]` off → index **6** (speed) — see **Watch-out A**
- `resetToggles` → `[true, true, true, true]`

**Do not** update mini-HUD here — **Fix 4** (defer to Step 8).

**Verify:** Four logical sensor channels behave; thermal rises when near pedestrian (e.g. via logging or temporary debug if needed).

---

### Step 4 — Update `knn.js`

- `INPUT_SIZE`: **6 → 7**
- Confidence max distance: `Math.sqrt(6)` → `Math.sqrt(7)`

**Verify:** No console errors; demo recording + train still run.

---

### Step 5 — Near-miss in `car.js`

Add `nearMissActive`, `nearMissTimer`, `NEAR_MISS_SLOW_DURATION`, `NEAR_MISS_SPEED_FACTOR`; after wall collision, near-miss detection + slow; body color orange `#f97316` when active; expose `isNearMissActive`.

**Verify:** Manual drive into pedestrian: orange flash, slow ~1s, no crash.

---

### Step 6 — `gameManager.js` — near-miss + outcome (merge only)

**Merge** into existing code per **Fix 2** and **Fix 3**:

- `nearMissDuringOutcomeWindow` (if not present)
- `onNearMiss()` → set flag during outcome window + `Logger.logNearMiss(...)`
- Outcome resolver: `near_miss` branch after crash checks, before `slow` / `fine`; clear `nearMissDuringOutcomeWindow` after resolve
- Keep existing crash streak, `resetCrashStreak()`, `crash_loop_nudge`, AI respawn `stepsBack` logic **unchanged**

**Verify:** Near-miss logs; toggles reset streak as today; farther-back respawn after 3 same-spot crashes unchanged.

---

### Step 7 — Round structure in `gameManager.js`

`ablationRound`, `ROUND_1_DURATION_MS`, `ROUND_2_DURATION_MS`; `beginAblation` sets round 1 and locks sensors 2 and 3; transition at 90s to round 2 + unlock + banner + `Logger.logEvent('ablation_round_2')`; pass `ablationRound` into `Logger.logToggle`; `Logger.setConfig` includes round durations.

Use **`phaseElapsed`** for the round-1 duration check so time **stops advancing while paused** (prediction modals, etc.) — see **Watch-out B**.

**Verify:** Round 1 locks Thermal + Speedometer; at 90s both unlock; toggles log round.

---

### Step 8 — `ui.js` + `index.html` + mini-HUD

- Thermal prediction: 4 options when `sensorIndex === 2` (includes `near_miss`)
- Sensor intro: **4** panels (Thermal copy per original spec)
- Ranking: **4** items
- **`main.js` mini-HUD:** **4** rows (LiDAR, Camera, Thermal, Speedometer) — **only place** mini-HUD is updated (**Fix 4**)
- `index.html`: fourth toggle for Thermal (`data-modality="2"`), Speedometer (`data-modality="3"`), lock affordances as specified

After changing modality indices, **grep/audit** `ui.js` and `gameManager.js` (and any other files) for **hardcoded `2` / `3` sensor indices** that assumed old Option B mapping — see **Watch-out C**.

**Verify:** Thermal toggle shows 4 predictions; others 3; intro + ranking have 4; mini-HUD matches.

---

### Step 9 — (covered in Step 8)

Index/HTML updates consolidated with Step 8 above.

---

### Step 10 — `logger.js` v4.0

- `dataFormatVersion: '4.0'`
- `sensorCount: 4`, sensors array includes thermal
- Config: thermal range, near-miss params, pedestrian coords, round durations
- `nearMissCount`, `logNearMiss`, valid `near_miss` on toggles

**Verify:** Downloaded JSON contains new fields and events.

---

### Step 11 — Full session test

Run full session with protocol from **Fix 6** (hard refresh). Exercise rounds, thermal prediction, near-miss, crash streak, JSON export, 4-item rankings.

---

### Step 12 — Tune thermal (revised per Fix 5)

- Manual drive, Thermal ON, confirm HUD thermal **> 0.6** near pedestrian; adjust `PED_X`/`PED_Y` if needed
- Do **not** expect auto-demo to react to thermal
- MLP “steers away” only **after** training on 7D demos — verify separately post-training

---

## Order summary

| Step | Focus |
|------|--------|
| 1 | Pedestrian coordinates (temp log) |
| 2 | `pedestrian.js` + script order **Fix 1** + draw |
| 3 | `sensors.js` 7D + 4 toggles (**no** mini-HUD — **Fix 4**) |
| 4 | `knn.js` 7D (**Fix 6** note for testers) |
| 5 | `car.js` near-miss |
| 6 | `gameManager.js` merge near-miss/outcomes (**Fix 2**, **Fix 3**) |
| 7 | Rounds + locks |
| 8 | UI + HTML + **mini-HUD once** (**Fix 4**) |
| 10 | Logger v4.0 |
| 11 | Full session |
| 12 | Thermal tune + revised verification (**Fix 5**) |

---

*End of revised plan.*
