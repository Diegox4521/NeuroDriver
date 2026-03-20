/**
 * Car — simple 2D rigid-body kinematics on a flat plane.
 * Manages position, heading, velocity, and collision response.
 */

const Car = (() => {

  const MAX_SPEED   = 2.3;   // higher top speed for faster laps
  const ACCEL       = 0.06;
  const BRAKE_DECEL = 0.08;
  const FRICTION    = 0.015;
  const TURN_RATE   = 0.060; // slightly more steering authority at same speed
  const CAR_LENGTH  = 22;
  const CAR_WIDTH   = 12;

  let x       = 0;
  let y       = 0;
  let heading = 0;   // radians, 0 = right
  let speed   = 0;
  let steering = 0;  // -1 (left) .. +1 (right), set externally each frame
  let throttle = 0;  // 0 or 1
  let crashed  = false;

  function reset(pose) {
    x = pose.x;
    y = pose.y;
    heading = pose.angle;
    speed = 0;
    steering = 0;
    throttle = 0;
    crashed = false;

    const originalOnTrack = Track.isOnTrack(x, y);

    // Safety: ensure spawn pose is actually on the track. If not, fall back
    // to the nearest safe pose along the centerline so the AI has a chance
    // to react instead of spawning inside a wall.
    if (!originalOnTrack) {
      const safe = Track.nearestSafePose(x, y);
      x = safe.x;
      y = safe.y;
      heading = safe.angle;
    }

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
        hypothesisId:'H2_spawn_offtrack_or_safepose_bad',
        location:'car.js:reset',
        message:'Car.reset applied',
        data:{
          pose,
          originalOnTrack,
          final:{x,y,heading},
          finalOnTrack: Track.isOnTrack(x, y)
        },
        timestamp:Date.now()
      })
    }).catch(()=>{});
    // #endregion
  }

  function update(dt) {
    if (crashed) return;

    // Pause car movement when the GameManager is paused (e.g., during prediction prompts).
    if (typeof GameManager !== 'undefined' && GameManager.isPaused && GameManager.isPaused()) {
      return;
    }

    // Throttle / friction
    const t = Math.max(0, Math.min(1, throttle));
    if (t > 0) speed = Math.min(MAX_SPEED, speed + ACCEL * t);
    else speed = Math.max(0, speed - FRICTION);

    // Steering only has effect when moving
    if (speed > 0.1) {
      heading += steering * TURN_RATE * (speed / MAX_SPEED);
    }

    x += Math.cos(heading) * speed;
    y += Math.sin(heading) * speed;

    // Wall collision
    if (!Track.isOnTrack(x, y)) {
      speed = 0;
      crashed = true;
    }
  }

  function respawn(poseOverride) {
    const pose = poseOverride || Track.startPose();
    reset(pose);
  }

  function draw(ctx) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);

    // Body
    ctx.fillStyle = crashed ? '#ef4444' : '#3b82f6';
    ctx.fillRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH);

    // Front indicator
    ctx.fillStyle = '#facc15';
    ctx.fillRect(CAR_LENGTH / 2 - 5, -CAR_WIDTH / 2, 5, CAR_WIDTH);

    ctx.restore();

    if (crashed) {
      const label = 'Crashed! Respawning...';
      ctx.save();
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textX = x;
      const textY = y - CAR_LENGTH;
      const paddingX = 8;
      const paddingY = 4;
      const metrics = ctx.measureText(label);
      const w = metrics.width + paddingX * 2;
      const h = 18 + paddingY * 2;
      ctx.fillStyle = 'rgba(15,15,35,0.9)';
      ctx.fillRect(textX - w / 2, textY - h / 2, w, h);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(label, textX, textY);
      ctx.restore();
    }
  }

  function getState() {
    return {
      x, y, heading, speed,
      normalizedSpeed: speed / MAX_SPEED,
      crashed,
    };
  }

  function setSteering(val) { steering = Math.max(-1, Math.min(1, val)); }
  function setThrottle(val) { throttle = val; }

  return {
    reset,
    update,
    respawn,
    draw,
    getState,
    setSteering,
    setThrottle,
    MAX_SPEED,
  };
})();
