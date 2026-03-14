/**
 * Sensors — five LiDAR raycasts + speedometer for the MLP.
 *
 * Internal 6-element feature vector:
 *   [0] leftFar    — ray at -60° / RAY_MAX_DIST
 *   [1] leftNear   — ray at -30° / RAY_MAX_DIST
 *   [2] forward    — ray at   0° / RAY_MAX_DIST
 *   [3] rightNear  — ray at +30° / RAY_MAX_DIST
 *   [4] rightFar   — ray at +60° / RAY_MAX_DIST
 *   [5] speed      — normalizedSpeed
 *
 * Student-facing toggles (3):
 *   LiDAR       [0] — zeroes ALL five ray channels (0-4)
 *   Camera      [1] — zeroes forward ray only (index 2)
 *   Speedometer [2] — zeroes speed channel (index 5)
 */

const Sensors = (() => {

  const RAY_MAX_DIST = 200;

  const SENSOR_NAMES        = ['LiDAR', 'Camera', 'Speedometer'];
  const SENSOR_COLORS       = ['#22d3ee', '#34d399', '#facc15'];
  const SENSOR_DESCRIPTIONS = [
    'Fires lasers to measure distance to walls',
    'Reads how far ahead the road is clear',
    'Measures how fast the car is moving',
  ];

  let toggleMask = [true, true, true];
  let lastRays   = [];
  let lastValues = [0, 0, 0];

  // ── Ray casting ──────────────────────────────────────────────────────────

  function raySegmentIntersect(ox, oy, dx, dy, x1, y1, x2, y2) {
    const sx = x2 - x1, sy = y2 - y1;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-8) return Infinity;
    const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
    const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
    return (t >= 0 && u >= 0 && u <= 1) ? t : Infinity;
  }

  function castRay(ox, oy, angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const walls = Track.wallSegments();
    let minDist = RAY_MAX_DIST;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const d = raySegmentIntersect(ox, oy, dx, dy, w.x1, w.y1, w.x2, w.y2);
      if (d < minDist) minDist = d;
    }
    return {
      normalized: minDist / RAY_MAX_DIST,
      hitX: ox + dx * minDist,
      hitY: oy + dy * minDist,
      dist: minDist,
    };
  }

  // ── Compute 6D feature vector ────────────────────────────────────────────

  function buildRaw(x, y, heading, normalizedSpeed) {
    const lf = castRay(x, y, heading - Math.PI / 3);   // -60°
    const ln = castRay(x, y, heading - Math.PI / 6);   // -30°
    const fw = castRay(x, y, heading);                 //   0°
    const rn = castRay(x, y, heading + Math.PI / 6);   // +30°
    const rf = castRay(x, y, heading + Math.PI / 3);   // +60°

    lastRays = [
      { ox: x, oy: y, hx: lf.hitX, hy: lf.hitY, dist: lf.dist },
      { ox: x, oy: y, hx: ln.hitX, hy: ln.hitY, dist: ln.dist },
      { ox: x, oy: y, hx: fw.hitX, hy: fw.hitY, dist: fw.dist },
      { ox: x, oy: y, hx: rn.hitX, hy: rn.hitY, dist: rn.dist },
      { ox: x, oy: y, hx: rf.hitX, hy: rf.hitY, dist: rf.dist },
    ];

    return [
      lf.normalized,
      ln.normalized,
      fw.normalized,
      rn.normalized,
      rf.normalized,
      normalizedSpeed,
    ];
  }

  function applyMask(raw) {
    const v = [...raw];
    if (!toggleMask[0]) {
      // LiDAR off → zero ALL five ray channels
      v[0] = v[1] = v[2] = v[3] = v[4] = 0;
    }
    if (!toggleMask[1]) {
      // Camera off → zero forward ray only
      v[2] = 0;
    }
    if (!toggleMask[2]) {
      // Speedometer off → zero speed channel
      v[5] = 0;
    }
    return v;
  }

  function compute(carState) {
    const { x, y, heading, normalizedSpeed } = carState;
    const raw = buildRaw(x, y, heading, normalizedSpeed);
    const masked = applyMask(raw);

    // Mini-HUD: show 3 conceptual sensor values
    const lidarMin = Math.min(raw[0], raw[1], raw[2], raw[3], raw[4]);
    const display  = [lidarMin, raw[2], raw[5]];
    lastValues = display.map((v, i) => toggleMask[i] ? v : 0);

    return masked;
  }

  function rawValues(carState) {
    const { x, y, heading, normalizedSpeed } = carState;
    return applyMask(buildRaw(x, y, heading, normalizedSpeed));
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  function draw(ctx) {
    const lidarActive = toggleMask[0];
    for (let i = 0; i < lastRays.length; i++) {
      const r = lastRays[i];
      ctx.beginPath();
      ctx.moveTo(r.ox, r.oy);
      ctx.lineTo(r.hx, r.hy);
      if (lidarActive) {
        ctx.strokeStyle = (r.dist / RAY_MAX_DIST) > 0.5 ? '#22d3ee' : '#ef4444';
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = '#444';
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (lastRays.length > 0) {
      const r0 = lastRays[0];
      ctx.save();
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('LiDAR', r0.ox + 4, r0.oy - 4);
      ctx.restore();
    }
  }

  function setToggle(index, on) { toggleMask[index] = on; }
  function getToggleMask()      { return [...toggleMask]; }
  function resetToggles()       { toggleMask = [true, true, true]; }

  return {
    SENSOR_NAMES,
    SENSOR_COLORS,
    SENSOR_DESCRIPTIONS,
    compute,
    rawValues,
    draw,
    setToggle,
    getToggleMask,
    resetToggles,
    getLastValues: () => [...lastValues],
    RAY_MAX_DIST,
  };
})();