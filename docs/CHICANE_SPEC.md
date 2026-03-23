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

## 5. LiDAR side rays and camera forward

- **LiDAR** casts **four** rays from the car: leftFar (-60°), leftNear (-30°), rightNear (+30°), rightFar (+60°). See `js/sensors.js`. In the 6D vector these are **`sensors[0..3]`**.
- **Camera** uses a separate **forward (0°)** raycast (same max range `RAY_MAX_DIST = 200` px). The **normalized** value is `distance_to_wall / 200`, in **[0, 1]**.
  - In the 6D sensor vector this is **`sensors[4]`** (KNN + logging). It is **not** drawn as a cyan LiDAR beam; on canvas it appears only as the **green camera cone** (and dashcam).
- **LiDAR beams** on the canvas: each of the four side rays is **cyan** when `(dist / RAY_MAX_DIST) > 0.5` and **red** otherwise.

**Why the forward (camera) reading drops in the chicane:**  
At each kink the car is pointing toward the **outer wall** of the turn. The forward ray hits that wall at a shorter distance, so **`sensors[4]`** drops (often into the **0.4–0.5** range or below).

---

## 6. What to check: forward ray at each apex

When reproducing or verifying the chicane:

1. **Drive through the chicane** (or let the AI drive) and watch **camera forward** (`sensors[4]`) — e.g. mini-HUD Camera bar, or the **green cone** shortening toward the hit:
   - **At the left kink apex** (centerline near y=525): forward should **drop** — typically **~0.4–0.5** or below.
   - **At the right kink apex** (centerline near y=595): again forward should **drop** — same rough range.
2. **Success criterion for ablation:** If **both** kinks produce a forward drop **below 0.5**, the chicane is doing its job: toggling **Camera** (zeros **`sensors[4]`** only) or **LiDAR** (zeros **side** rays **`sensors[0..3]`** only) mid-chicane produces distinct failure modes.
3. **Where to read the value:**
   - **Visually:** Camera cone reach / mini-HUD; LiDAR side rays separately show side-wall clearance (cyan vs red).
   - **Numerically:** Log **`sensors[4]`** (fifth element of the 6D vector from `Sensors.compute(carState)`) at each apex; expect roughly **0.35–0.5** when the chicane is correct.

---

## 7. Quick verification checklist

- [ ] **Shape:** Chicane looks like a clear **S** (centerline up at left kink, down at right kink), not a gentle wobble.
- [ ] **Camera forward at left kink:** Drops below 0.5 as you approach/pass the left apex.
- [ ] **Camera forward at right kink:** Drops below 0.5 as you approach/pass the right apex.
- [ ] **Driveable:** You can get through at normal speed without crashing; if the AI crashes, try reducing deviation to ~35px (as in this spec) or slightly less; if too gentle, try ~45–55px.

---

## 8. Reference: where in the codebase

| What | File / location |
|------|------------------|
| Control points and transform | `js/track.js` — `CONTROL_POINTS_RAW`, `SCALE`, `CENTER_X`, `CENTER_Y`, `SHIFT_X` |
| Centerline and walls | `js/track.js` — `buildCenterline(30)`, `buildWalls()`, `ROAD_HALF_WIDTH` |
| Camera forward index and max distance | `js/sensors.js` — vector index **4**, `RAY_MAX_DIST = 200` |
| LiDAR side ray color threshold | `js/sensors.js` — `(r.dist / RAY_MAX_DIST) > 0.5` → cyan else red |
| Use of forward channel for corners / recording | `js/gameManager.js` — e.g. `sensors[4]`, `forward < 0.75` in `shouldRecord` |
