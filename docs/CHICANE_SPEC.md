# Chicane geometry specification

This document specifies the bottom-straight chicane so an agent can reproduce it exactly and verify LiDAR behavior for ablation experiments.

---

## 1. Canvas and coordinate system

- **Canvas size:** 900×700 pixels.
- **Raw control points** are defined in a coordinate system centered at (450, 350).
- **Transform** applied to every raw point to get canvas coordinates:
  1. Scale: multiply offset from center by **1.08** (i.e. `canvas_x = 450 + (raw_x - 450) * 1.08`, same for y).
  2. Shift: add **50px** to the x-component only (track shifted right so it is fully visible).

So for a raw point `{ x: 430, y: 525 }`:
- `canvas_x = 450 + (430 - 450) * 1.08 + 50 ≈ 428.4 + 50 = 478.4`
- `canvas_y = 350 + (525 - 350) * 1.08 ≈ 539`

Constants in code: `js/track.js` — `SCALE = 1.08`, `CENTER_X = 450`, `CENTER_Y = 350`, `SHIFT_X = 50`.

---

## 2. Chicane control points (exact five)

The chicane is defined by **five consecutive** entries in `CONTROL_POINTS_RAW` in `js/track.js`. Replace only these five; leave all other control points untouched.

Order in the array (as stored, right-to-left along the bottom straight):

```javascript
{ x: 660, y: 560 },  // chicane approach — car arrives here from bottom-right
{ x: 550, y: 560 },  // chicane entry — short straight before the S begins
{ x: 430, y: 525 },  // LEFT kink apex — 35px ABOVE the baseline (y=560)
{ x: 310, y: 595 },  // RIGHT kink apex — 35px BELOW the baseline (y=560)
{ x: 190, y: 560 },  // chicane exit — rejoins baseline heading left
```

- **Baseline:** y = 560 from entry to exit.
- **Left kink apex:** y = 525 → **35px above** baseline (centerline swings toward top of screen).
- **Right kink apex:** y = 595 → **35px below** baseline (centerline swings toward bottom of screen).
- **Horizontal spread:** left apex at x=430, right apex at x=310 → **120px** apart.

---

## 3. S-curve shape

- The **centerline** is interpolated with a **Catmull-Rom spline**, **30 subdivisions per segment** (`buildCenterline(30)` in `js/track.js`). So the chicane is smooth — no sharp corners.
- The two kinks create a **genuine S**: first the centerline curves **up** (left kink), then **down** (right kink). The two deviations are in **opposite directions**, which makes it a real chicane rather than a single bend.
- **Road width:** half-width **44px**, total **88px**. Inner and outer walls are offset ±44px from the centerline (`ROAD_HALF_WIDTH = 44` in `js/track.js`).

---

## 4. Travel direction through the chicane

- The car drives **right-to-left** along the bottom straight.
- **Sequence:** enters from the right at raw x≈660 → **chicane entry** (550, 560) → **left kink** (centerline goes up to 525) → **right kink** (centerline goes down to 595) → **chicane exit** (190, 560) → continues left toward the left-hand curve.

So the car encounters the **left kink first**, then the **right kink**, then straightens out.

---

## 5. LiDAR and the forward ray

- **LiDAR** casts five rays from the car: leftFar (-60°), leftNear (-30°), **forward (0°)**, rightNear (+30°), rightFar (+60°). See `js/sensors.js`.
- **Forward ray** = ray index **2** (0° in car heading). Its **maximum length** is `RAY_MAX_DIST = 200` px.
- The **normalized forward ray value** is `distance_to_wall / 200`, in **[0, 1]**.
  - In the 6D sensor vector this is **`sensors[2]`** (used by the KNN and for recording).
  - On the canvas, the **middle LiDAR ray** is drawn **cyan** when this value **> 0.5** and **red** when **≤ 0.5** (`js/sensors.js` line 134).

**Why the forward ray drops in the chicane:**  
At each kink the car is pointing toward the **outer wall** of the turn. The forward ray hits that wall at a shorter distance, so the normalized value drops (often into the **0.4–0.5** range or below).

---

## 6. What to check: forward ray at each apex

When reproducing or verifying the chicane:

1. **Drive through the chicane** (or let the AI drive) and watch the **forward ray**:
   - **At the left kink apex** (centerline near y=525): the forward ray should **drop** — normalized value typically **~0.4–0.5** or below (middle LiDAR ray turns **red** on canvas).
   - **At the right kink apex** (centerline near y=595): again the forward ray should **drop** — same rough range, ray **red**.
2. **Success criterion for ablation:** If **both** kinks produce a forward ray drop **below 0.5**, the chicane is doing its job: toggling LiDAR (or Camera, which zeroes the forward ray) mid-chicane will produce visible behavioral change.
3. **Where to read the value:**
   - **Visually:** Middle of the five LiDAR rays on the canvas — **red** = ≤0.5, **cyan** = >0.5.
   - **Numerically:** You can log or inspect `sensors[2]` (or the third element of the 6D vector from `Sensors.compute(carState)`) at the moment the car is at each apex; expect roughly **0.35–0.5** at both apexes when the chicane is correct.

---

## 7. Quick verification checklist

- [ ] **Shape:** Chicane looks like a clear **S** (centerline up at left kink, down at right kink), not a gentle wobble.
- [ ] **Forward ray at left kink:** Drops below 0.5 (ray red) as you approach/pass the left apex.
- [ ] **Forward ray at right kink:** Drops below 0.5 (ray red) as you approach/pass the right apex.
- [ ] **Driveable:** You can get through at normal speed without crashing; if the AI crashes, try reducing deviation to ~35px (as in this spec) or slightly less; if too gentle, try ~45–55px.

---

## 8. Reference: where in the codebase

| What | File / location |
|------|------------------|
| Control points and transform | `js/track.js` — `CONTROL_POINTS_RAW`, `SCALE`, `CENTER_X`, `CENTER_Y`, `SHIFT_X` |
| Centerline and walls | `js/track.js` — `buildCenterline(30)`, `buildWalls()`, `ROAD_HALF_WIDTH` |
| Forward ray index and max distance | `js/sensors.js` — ray index 2, `RAY_MAX_DIST = 200` |
| Forward ray color threshold | `js/sensors.js` — line 134: `(r.dist / RAY_MAX_DIST) > 0.5` → cyan else red |
| Use of forward ray for corners | `js/gameManager.js` — e.g. `sensors[2]`, `forwardRay < 0.7` for corner detection |
