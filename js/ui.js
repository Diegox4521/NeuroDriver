/**
 * UI — manages HTML overlays, sensor toggle buttons, prediction prompts,
 * confidence bar, experiment banners, sensor intro, ranking widget,
 * and the reflection modal (including conditional Q4 ethics probe).
 */

const UI = (() => {

  const $ = (sel) => document.querySelector(sel);
  const phaseLabel        = () => $('#phaseLabel');
  const timerEl           = () => $('#timer');
  const confidenceContainer = () => $('#confidenceContainer');
  const confBarInner      = () => $('#confidenceBarInner');
  const confValue         = () => $('#confidenceValue');
  const sensorTogglesDiv  = () => $('#sensorToggles');
  const experimentBanner  = () => $('#experimentBanner');
  const demoCountContainer = () => $('#demoCountContainer');
  const demoCountEl       = () => $('#demoCount');
  const overlay           = () => $('#overlay');
  const overlayTitle      = () => $('#overlayTitle');
  const overlayText       = () => $('#overlayText');
  const overlayBtn        = () => $('#overlayBtn');
  const predModal         = () => $('#predictionModal');
  const predQuestion      = () => $('#predictionQuestion');
  const predChoices       = () => $('#predictionChoices');
  const reflModal         = () => $('#reflectionModal');
  const instructionsEl    = () => $('#instructions');
  const instructionText   = () => $('#instructionText');
  const miniHud           = () => $('#miniHud');
  const miniHudContent    = () => $('#miniHudContent');
  const controlsHud       = () => $('#controlsHud');
  const dashcamHud        = () => $('#dashcamHud');
  const dashcamCanvas     = () => $('#dashcamCanvas');
  const dashcamStatus     = () => $('#dashcamStatus');

  let onToggleCallback = null;

  // Panels are fixed-position for consistent layout across participants

  // ── Sensor toggle buttons ──

  function initToggleButtons(callback) {
    onToggleCallback = callback;
    document.querySelectorAll('.sensor-btn[data-modality]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('locked')) return;
        const idx = parseInt(btn.dataset.modality, 10);
        const isActive = btn.classList.contains('active');
        const newState = !isActive;
        if (onToggleCallback) onToggleCallback(idx, newState);
      });
    });
  }

  function applySensorBtnState(idx, active) {
    const btn = document.querySelector(`.sensor-btn[data-modality="${idx}"]`);
    if (!btn) return;
    btn.classList.toggle('active', active);
  }

  function setTogglesDisabled(disabled) {
    const div = sensorTogglesDiv();
    if (!div) return;
    div.classList.toggle('disabled', disabled);
  }

  function lockSensor(index) {
    const btn = document.querySelector(`.sensor-btn[data-modality="${index}"]`);
    if (!btn) return;
    btn.classList.add('locked');
    const desc = btn.querySelector('.sensor-desc');
    if (desc) {
      desc.setAttribute('data-original', desc.textContent);
      desc.textContent = '\uD83D\uDD12 Unlocks in Round 2';
    }
  }

  function unlockSensor(index) {
    const btn = document.querySelector(`.sensor-btn[data-modality="${index}"]`);
    if (!btn) return;
    btn.classList.remove('locked');
    const desc = btn.querySelector('.sensor-desc');
    const original = desc ? desc.getAttribute('data-original') : null;
    if (desc && original) desc.textContent = original;
  }

  // ── Confidence bar ──

  function updateConfidence(value) {
    const pct = Math.round(value * 100);
    confBarInner().style.width = pct + '%';
    confValue().textContent = pct + '%';
    if (value > 0.7) confBarInner().style.background = '#22c55e';
    else if (value > 0.4) confBarInner().style.background = '#f59e0b';
    else confBarInner().style.background = '#ef4444';
  }

  // ── Experiment banner ──

  function showBanner(text) {
    experimentBanner().textContent = text;
    experimentBanner().classList.remove('hidden');
  }

  function hideBanner() {
    experimentBanner().classList.add('hidden');
  }

  // ── Phase overlay ──

  function showOverlay(title, text, btnLabel) {
    return new Promise(resolve => {
      const elOverlay = overlay();
      const elBtn = overlayBtn();

      overlayTitle().textContent = title;
      overlayText().textContent = text;
      elBtn.textContent = btnLabel;
      elOverlay.classList.remove('hidden');
      elBtn.onclick = () => {

        elOverlay.classList.add('hidden');
        resolve();
      };
    });
  }

  function hideOverlay() { overlay().classList.add('hidden'); }

  // ── Login ──

  function showLogin() {
    return new Promise(resolve => {
      const modal = $('#loginModal');
      const firstInput = $('#loginFirstName');
      const initialInput = $('#loginLastInitial');
      const errorMsg = $('#loginError');
      const btn = $('#loginBtn');
      
      modal.classList.remove('hidden');
      errorMsg.style.display = 'none';
      firstInput.focus();

      function submit() {
        const firstName = firstInput.value.trim();
        let lastInitial = initialInput.value.trim().toUpperCase();
        
        if (!firstName) {
          errorMsg.style.display = 'block';
          firstInput.focus();
          return;
        }
        if (!lastInitial) {
          errorMsg.style.display = 'block';
          initialInput.focus();
          return;
        }

        // Clean up last initial (remove extra characters, add period)
        if (lastInitial.length > 1) lastInitial = lastInitial[0];
        const formattedName = `${firstName} ${lastInitial}.`;

        modal.classList.add('hidden');
        resolve(formattedName);
      }

      btn.onclick = submit;
      firstInput.onkeydown = (e) => { if (e.key === 'Enter') initialInput.focus(); };
      initialInput.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  // ── Sensor introduction ──

  function showSensorIntro() {
    return new Promise(resolve => {
      const modal = $('#sensorIntroModal');
      const btn = $('#sensorIntroBtn');
      const countdownEl = $('#sensorIntroCountdown');
      modal.classList.remove('hidden');

      // Lock the button for 8 seconds so participants read the descriptions
      const LOCK_SECONDS = 8;
      let secondsLeft = LOCK_SECONDS;
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
      countdownEl.textContent = '';

      const interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearInterval(interval);
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
        }
      }, 1000);

      btn.onclick = () => {
        if (btn.disabled) return;
        clearInterval(interval);
        modal.classList.add('hidden');
        resolve();
      };
    });
  }

  // ── Ranking widget (click-to-rank) ──

  function showRanking(titleText, subtitleText) {
    return new Promise(resolve => {
      const modal = $('#rankingModal');
      const titleEl = $('#rankingTitle');
      const subtitleEl = $('#rankingSubtitle');
      const buttonsDiv = $('#rankingButtons');
      const listDiv = $('#rankingList');
      const submitBtn = $('#rankingSubmit');

      titleEl.textContent = titleText;
      subtitleEl.textContent = subtitleText;
      buttonsDiv.innerHTML = '';
      listDiv.innerHTML = '';
      submitBtn.classList.add('hidden');

      const sensorNames = Sensors.SENSOR_NAMES;  // 3 sensors: LiDAR, Camera, Speedometer
      const ordinals = ['1st', '2nd', '3rd'];
      const ranking = [];

      function moveRank(index, delta) {
        const j = index + delta;
        if (j < 0 || j >= ranking.length) return;
        const tmp = ranking[index];
        ranking[index] = ranking[j];
        ranking[j] = tmp;
        render();
      }

      function finish() {
        modal.classList.add('hidden');
        submitBtn.onclick = null;
        resolve([...ranking]);
      }

      function render() {
        buttonsDiv.innerHTML = '';
        listDiv.innerHTML = '';

        sensorNames.forEach(name => {
          if (ranking.includes(name)) return;
          const btn = document.createElement('button');
          btn.className = 'rank-btn';
          btn.textContent = name;
          btn.onclick = () => {
            ranking.push(name);
            render();
          };
          buttonsDiv.appendChild(btn);
        });

        ranking.forEach((name, i) => {
          const row = document.createElement('div');
          row.className = 'rank-item-row';

          const ordinalBadge = document.createElement('div');
          ordinalBadge.className = 'rank-item-ordinal';
          ordinalBadge.textContent = i + 1;

          const label = document.createElement('span');
          label.className = 'rank-item-label';
          label.textContent = name;

          const moves = document.createElement('div');
          moves.className = 'rank-item-moves';

          const isFirst = i === 0;
          const isLast = i === ranking.length - 1;

          if (!isFirst) {
            const up = document.createElement('button');
            up.type = 'button';
            up.className = 'rank-move-btn';
            up.setAttribute('aria-label', 'Move up');
            up.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>';
            up.onclick = () => moveRank(i, -1);
            moves.appendChild(up);
          }

          if (!isLast) {
            const down = document.createElement('button');
            down.type = 'button';
            down.className = 'rank-move-btn';
            down.setAttribute('aria-label', 'Move down');
            down.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';
            down.onclick = () => moveRank(i, 1);
            moves.appendChild(down);
          }

          row.appendChild(ordinalBadge);
          row.appendChild(label);
          row.appendChild(moves);
          listDiv.appendChild(row);
        });

        if (ranking.length === 3) {
          submitBtn.classList.remove('hidden');
        } else {
          submitBtn.classList.add('hidden');
        }
      }

      submitBtn.onclick = () => {
        if (ranking.length === 3) finish();
      };

      modal.classList.remove('hidden');
      render();
    });
  }

  // ── Prediction prompt ──

  const PREDICTION_OPTIONS = [
    { id: 'fine',  label: 'Drive fine' },
    { id: 'slow',  label: 'Wobble' },
    { id: 'crash', label: 'Crash' },
  ];

  function showPrediction(sensorName, sensorIndex) {
    return new Promise(resolve => {
      predQuestion().textContent =
        `If your AI can't use its ${sensorName}, it will:`;
      predChoices().innerHTML = '';

      PREDICTION_OPTIONS.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'pred-choice';
        btn.textContent = opt.label;
        btn.onclick = () => {
          predModal().classList.add('hidden');
          resolve(opt.id);
        };
        predChoices().appendChild(btn);
      });
      predModal().classList.remove('hidden');
    });
  }

  // ── Reflection modal ──

  // ── Instructions toast ──

  function showInstruction(text) {
    instructionText().textContent = text;
    instructionsEl().classList.remove('hidden');
  }

  /** Main teaching line + optional persistent tip (fixed strings only). */
  function showInstructionWithTip(mainText, tipText) {
    const wrap = instructionsEl();
    const el = instructionText();
    el.textContent = '';
    el.appendChild(document.createTextNode(mainText));
    if (tipText) {
      el.appendChild(document.createElement('br'));
      const sp = document.createElement('span');
      sp.className = 'instruction-tip';
      sp.textContent = tipText;
      el.appendChild(sp);
    }
    wrap.classList.remove('hidden');
  }

  function pulseInstructionPanel() {
    const wrap = instructionsEl();
    if (!wrap) return;
    wrap.classList.add('instruction-pulse');
    setTimeout(() => wrap.classList.remove('instruction-pulse'), 900);
  }

  function hideInstruction() {
    instructionsEl().classList.add('hidden');
  }

  // ── Misc helpers ──

  function setPhaseLabel(text)   { phaseLabel().textContent = text; }
  function setTimer(text)        { timerEl().textContent = text; }
  function showToggles()         { sensorTogglesDiv().classList.remove('hidden'); }
  function hideToggles()         { sensorTogglesDiv().classList.add('hidden'); }


  function setDemoCount(n, minRequired) {
    const el = demoCountEl();
    if (!el) return;
    el.textContent = minRequired != null ? `${n} / ${minRequired}` : String(n);
  }
  function showDemoCount() {
    const c = demoCountContainer();
    if (c) c.classList.remove('hidden');
  }
  function hideDemoCount() {
    const c = demoCountContainer();
    if (c) c.classList.add('hidden');
  }

  return {
    initToggleButtons,
    applySensorBtnState,
    updateConfidence,
    showBanner,
    hideBanner,
    showLogin,
    showOverlay,
    hideOverlay,
    showSensorIntro,
    showRanking,
    showPrediction,
    showInstruction,
    showInstructionWithTip,
    pulseInstructionPanel,
    hideInstruction,
    setPhaseLabel,
    setTimer,
    showToggles,
    hideToggles,
    setDemoCount,
    showDemoCount,
    hideDemoCount,
    showControls: () => controlsHud() && controlsHud().classList.remove('hidden'),
    hideControls: () => controlsHud() && controlsHud().classList.add('hidden'),
    showDashcam: () => dashcamHud() && dashcamHud().classList.remove('hidden'),
    hideDashcam: () => dashcamHud() && dashcamHud().classList.add('hidden'),
    renderDashcam: (slices, isCameraOn) => {
      const cvs = dashcamCanvas();
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const w = cvs.width;
      const h = cvs.height;
      
      const status = dashcamStatus();
      if (status) {
        status.textContent = isCameraOn ? 'ON' : 'OFFLINE';
        status.style.color = isCameraOn ? '#34d399' : '#ef4444';
      }

      if (!isCameraOn) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        
        ctx.fillStyle = '#ef4444';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO SIGNAL', w/2, h/2 + 5);
        
        // Static noise effect
        for (let i=0; i<400; i++) {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
          ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
        }
        return;
      }

      // Draw Global Sky
      ctx.fillStyle = '#38bdf8'; // Sky Blue
      ctx.fillRect(0, 0, w, h/2);

      if (!slices || slices.length === 0) return;

      const sliceWidth = w / slices.length;
      for (let i = 0; i < slices.length; i++) {
        const distNorm = slices[i]; 
        const depth = Math.max(0, 1 - distNorm); 

        // If it's too far, just draw the road and grass meeting at the horizon
        if (depth < 0.05) {
          ctx.fillStyle = '#1e293b'; // Road
          ctx.fillRect(i * sliceWidth, h/2, sliceWidth + 0.5, h/2);
          continue; 
        }
        
        // True pseudo-3D raycaster heights
        const fullWallH = Math.min(h * 3.0, (h * 0.6) / (distNorm + 0.05));
        const baseY = h/2 + fullWallH / 2;
        
        // Make it a small racing curb (15% of a full wall height)
        const curbH = fullWallH * 0.15; 
        const wallY = baseY - curbH;

        // 1. Draw Grass (Horizon down to the top of the curb)
        if (wallY > h/2) {
          ctx.fillStyle = '#22c55e'; // Bright Track grass color
          ctx.fillRect(i * sliceWidth, h/2, sliceWidth + 0.5, wallY - h/2);
        }

        // 2. Draw Curb (Red/White or just shades of red)
        const intensity = Math.floor(depth * 255);
        ctx.fillStyle = `rgb(${intensity}, ${Math.floor(intensity * 0.15)}, ${Math.floor(intensity * 0.15)})`;
        ctx.fillRect(i * sliceWidth, Math.max(h/2, wallY), sliceWidth + 0.5, curbH);
        
        // 3D edge
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(i * sliceWidth, Math.max(h/2, wallY), 1, curbH);

        // 3. Draw Road (Base of curb down to bottom of screen)
        if (baseY < h) {
          ctx.fillStyle = '#1e293b'; // Road color
          ctx.fillRect(i * sliceWidth, baseY, sliceWidth + 0.5, h - baseY);
        }
      }
    },
    setTogglesDisabled,
    lockSensor,
    unlockSensor,
    updateMiniHUD: (vals, mask) => {
      if (!miniHudContent()) return;
      miniHud().classList.remove('hidden');
      const names  = ['LiDAR', 'Camera', 'Speed'];
      const colors = ['#22d3ee', '#34d399', '#facc15'];
      let html = '';
      for (let i = 0; i < 3; i++) {
        const val = mask[i] ? vals[i].toFixed(2) : 'OFF';
        const color = mask[i] ? colors[i] : '#555';
        html += `<div class="mini-hud-row">
                   <span class="mini-hud-label">${names[i]}</span>
                   <span class="mini-hud-val" style="color: ${color}">${val}</span>
                 </div>`;
      }
      miniHudContent().innerHTML = html;
    }
  };
})();
