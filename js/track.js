/**
 * Track — defines the closed-loop racing track as a centerline polyline,
 * generates inner/outer wall segments, and draws everything to a 2D canvas.
 *
 * The track is built from a set of control points that get interpolated into
 * a smooth Catmull-Rom spline, then offset inward/outward by half the road
 * width to form walls.
 */

const Track = (() => {

  const ROAD_HALF_WIDTH = 44;  // 88px total road width per spec
  const WALL_THICKNESS  = 4;

  // Control points: horizontal stadium oval with chicane on bottom straight (900×700 canvas).
  // Scaled 1.08× from center (450,350); shifted right so the track is centered and fully visible.
  const SCALE = 1.08;
  const CENTER_X = 450, CENTER_Y = 350;
  const SHIFT_X = 50;  // shift track right (left side was cut off)
  const CONTROL_POINTS_RAW = [
    { x: 730, y: 450 },  // 5  right curve lower (start)
    { x: 730, y: 250 },  // 4  right curve
    { x: 660, y: 120 },  // 3  top-right curve apex
    { x: 360, y: 80 },   // 2  top straight center
    { x: 130, y: 130 },  // 1  top-left curve apex (widened)
    { x: 140, y: 310 },  // 12 left curve apex (widened)
    { x: 150, y: 460 },  // 11 left curve lower (widened)
    { x: 190, y: 560 },  // 10 chicane exit
    { x: 340, y: 570 },  // 9  chicane right kink apex (smoothed)
    { x: 430, y: 555 },  // 8  chicane left kink apex (smoothed)
    { x: 530, y: 570 },  // 7  chicane entry (shallower)
    { x: 660, y: 560 },  // 6  bottom-right, chicane approach
  ];
  const CONTROL_POINTS = CONTROL_POINTS_RAW.map(p => ({
    x: CENTER_X + (p.x - CENTER_X) * SCALE + SHIFT_X,
    y: CENTER_Y + (p.y - CENTER_Y) * SCALE,
  }));

  let centerline  = [];   // array of {x, y}
  let innerWall   = [];   // wall segments [{x1,y1,x2,y2}, ...]
  let outerWall   = [];
  let wallSegments = [];   // combined inner + outer for raycast queries

  // Catmull-Rom interpolation between 4 points at parameter t ∈ [0,1]
  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  function buildCenterline(subdivisions = 30) {
    centerline = [];
    const n = CONTROL_POINTS.length;
    for (let i = 0; i < n; i++) {
      const p0 = CONTROL_POINTS[(i - 1 + n) % n];
      const p1 = CONTROL_POINTS[i];
      const p2 = CONTROL_POINTS[(i + 1) % n];
      const p3 = CONTROL_POINTS[(i + 2) % n];
      for (let s = 0; s < subdivisions; s++) {
        centerline.push(catmullRom(p0, p1, p2, p3, s / subdivisions));
      }
    }
  }

  function normalAt(i) {
    const n = centerline.length;
    const curr = centerline[i];
    const next = centerline[(i + 1) % n];
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: -dy / len, y: dx / len };
  }

  function buildWalls() {
    const innerPts = [];
    const outerPts = [];
    for (let i = 0; i < centerline.length; i++) {
      const norm = normalAt(i);
      innerPts.push({
        x: centerline[i].x + norm.x * ROAD_HALF_WIDTH,
        y: centerline[i].y + norm.y * ROAD_HALF_WIDTH,
      });
      outerPts.push({
        x: centerline[i].x - norm.x * ROAD_HALF_WIDTH,
        y: centerline[i].y - norm.y * ROAD_HALF_WIDTH,
      });
    }

    innerWall = [];
    outerWall = [];
    for (let i = 0; i < innerPts.length; i++) {
      const j = (i + 1) % innerPts.length;
      innerWall.push({ x1: innerPts[i].x, y1: innerPts[i].y, x2: innerPts[j].x, y2: innerPts[j].y });
      outerWall.push({ x1: outerPts[i].x, y1: outerPts[i].y, x2: outerPts[j].x, y2: outerPts[j].y });
    }
    wallSegments = innerWall.concat(outerWall);
  }

  function init() {
    buildCenterline();
    buildWalls();
  }

  // ── Queries ──

  /** Nearest centerline index + signed perpendicular distance for a point. */
  function nearestCenterInfo(px, py) {
    let bestDist2 = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < centerline.length; i++) {
      const dx = px - centerline[i].x;
      const dy = py - centerline[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) { bestDist2 = d2; bestIdx = i; }
    }
    const norm = normalAt(bestIdx);
    const dx = px - centerline[bestIdx].x;
    const dy = py - centerline[bestIdx].y;
    const signedDist = dx * norm.x + dy * norm.y;
    return { index: bestIdx, signedDist, dist: Math.abs(signedDist) };
  }

  /** Nearest centerline point index for (px, py). */
  function nearestCenterlineIndex(px, py) {
    return nearestCenterInfo(px, py).index;
  }

  /** Normalized center deviation in [-1, 1]. Positive = toward inner wall. */
  function centerDeviation(px, py) {
    const info = nearestCenterInfo(px, py);
    return Math.max(-1, Math.min(1, info.signedDist / ROAD_HALF_WIDTH));
  }

  /** True if point is within road boundaries (approximately). */
  function isOnTrack(px, py) {
    return nearestCenterInfo(px, py).dist < ROAD_HALF_WIDTH - 2;
  }

  /** Starting position and heading (tangent angle) at centerline index 0. */
  function startPose() {
    const p = centerline[0];
    // Look a couple of steps ahead along the centerline to get a stable
    // tangent that points down the first straight without overshooting
    // into the nearby curve.
    const next = centerline[2];
    const angle = Math.atan2(next.y - p.y, next.x - p.x);

    // #region agent log
    fetch('http://127.0.0.1:7556/ingest/bea9ea57-660f-44ed-a937-8aae4cd55afd',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Debug-Session-Id':'79a1f5'
      },
      body:JSON.stringify({
        sessionId:'79a1f5',
        runId:'pre-fix',
        hypothesisId:'H1_startPose_offtrack',
        location:'track.js:startPose',
        message:'startPose computed',
        data:{
          p,
          next,
          angle,
          isOnTrack: isOnTrack(p.x, p.y)
        },
        timestamp:Date.now()
      })
    }).catch(()=>{});
    // #endregion

    return { x: p.x, y: p.y, angle };
  }

  /** Progress around the track as a fraction [0, 1). */
  function lapProgress(px, py) {
    const info = nearestCenterInfo(px, py);
    return info.index / centerline.length;
  }

  /** Nearest safe pose a little before the crash point along the centerline. */
  function nearestSafePose(px, py) {
    const info = nearestCenterInfo(px, py);
    const n = centerline.length;
    const offset = 25; // steps back from crash point
    const idx = (info.index - offset + n) % n;
    const p = centerline[idx];
    const next = centerline[(idx + 1) % n];
    const angle = Math.atan2(next.y - p.y, next.x - p.x);
    return { x: p.x, y: p.y, angle };
  }

  // ── Drawing ──

  function draw(ctx) {
    // Road surface
    ctx.beginPath();
    for (let i = 0; i < innerWall.length; i++) {
      const seg = innerWall[i];
      if (i === 0) ctx.moveTo(seg.x1, seg.y1);
      else ctx.lineTo(seg.x1, seg.y1);
    }
    for (let i = outerWall.length - 1; i >= 0; i--) {
      ctx.lineTo(outerWall[i].x1, outerWall[i].y1);
    }
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Centerline dashes
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    centerline.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner wall
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = WALL_THICKNESS;
    ctx.beginPath();
    innerWall.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x1, s.y1) : ctx.lineTo(s.x1, s.y1)));
    ctx.closePath();
    ctx.stroke();

    // Outer wall
    ctx.beginPath();
    outerWall.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x1, s.y1) : ctx.lineTo(s.x1, s.y1)));
    ctx.closePath();
    ctx.stroke();
  }

  return {
    init,
    draw,
    wallSegments: () => wallSegments,
    centerDeviation,
    isOnTrack,
    startPose,
    lapProgress,
    nearestSafePose,
    nearestCenterlineIndex,
    centerline: () => centerline,
    getCenterlinePoint: (i) => centerline[i % centerline.length],
    ROAD_HALF_WIDTH,
  };
})();
