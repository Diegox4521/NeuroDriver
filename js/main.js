/**
 * main.js — bootstraps the game, runs the render/update loop.
 */

(function () {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  Track.init();
  Car.reset(Track.startPose());

  UI.initToggleButtons((sensorIdx, newState) => {
    GameManager.handleToggle(sensorIdx, newState);
  });

  let lastTime = performance.now();

  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;

    GameManager.update(dt, now);
    Car.update(dt);
    
    const carState = Car.getState();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Keep track statically centered on the screen (track was originally built for 900x700)
    ctx.translate(canvas.width / 2 - 450, canvas.height / 2 - 350);

    Track.draw(ctx);
    Sensors.draw(ctx);
    GameManager.draw(ctx);
    Car.draw(ctx);
    
    ctx.restore();

    // Update DOM Mini HUD
    if (typeof UI.updateMiniHUD === 'function') {
      UI.updateMiniHUD(Sensors.getLastValues(), Sensors.getToggleMask());
    }

    // Render 3D Dashcam feed
    if (GameManager.getPhase() !== 'LOGIN' && GameManager.getPhase() !== 'INTRO') {
      const slices = Sensors.generateCameraDashcam(carState);
      UI.renderDashcam(slices, Sensors.getToggleMask()[1]); // toggleMask[1] is Camera
    }

    requestAnimationFrame(loop);
  }

  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('participant') || params.get('p') || null;
  const condition = params.get('condition') || params.get('c') || null;
  Logger.setParticipant(participantId, condition);

  GameManager.start();
  requestAnimationFrame(loop);
})();
