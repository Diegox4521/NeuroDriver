/**
 * main.js — bootstraps the game, runs the render/update loop.
 */

(function () {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

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
    Sensors.compute(Car.getState());

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Track.draw(ctx);
    Sensors.draw(ctx);
    GameManager.draw(ctx);
    Car.draw(ctx);
    drawMiniHUD(ctx);

    requestAnimationFrame(loop);
  }

  function drawMiniHUD(ctx) {
    const vals   = Sensors.getLastValues();
    const names  = Sensors.SENSOR_NAMES;
    const colors = Sensors.SENSOR_COLORS;
    const mask   = Sensors.getToggleMask();

    ctx.save();
    ctx.fillStyle = '#16213ecc';
    ctx.fillRect(10, 10, 170, 80);
    ctx.font = '11px monospace';

    for (let i = 0; i < 3; i++) {
      const label = names[i].padEnd(14);
      const val   = mask[i] ? vals[i].toFixed(2) : ' OFF';
      ctx.fillStyle = mask[i] ? colors[i] : '#555';
      ctx.fillText(`${label} ${val}`, 18, 30 + i * 20);
    }

    ctx.restore();
  }

  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('participant') || params.get('p') || null;
  const condition = params.get('condition') || params.get('c') || null;
  Logger.setParticipant(participantId, condition);

  // #region agent log
  fetch('http://127.0.0.1:7556/ingest/bea9ea57-660f-44ed-a937-8aae4cd55afd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'966069'},body:JSON.stringify({sessionId:'966069',location:'main.js:69',message:'before GameManager.start',data:{gameManagerType:typeof GameManager,hasStart:typeof GameManager!=='undefined'&&typeof GameManager.start,__gmReturned:typeof window!=='undefined'&&!!window.__gmReturned},timestamp:Date.now(),hypothesisId:'main-GM-check'})}).catch(()=>{});
  // #endregion
  GameManager.start();
  requestAnimationFrame(loop);
})();
