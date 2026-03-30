/**
 * GameManager — orchestrates the full session flow (Option B, 3 sensors):
 *
 *   INTRO -> PRACTICE -> SENSOR_INTRO -> HUMAN_DEMO -> PRE_ABLATION_RANKING
 *     -> AI_WARMUP [-> HUMAN_DEMO_EXTRA -> AI_WARMUP]*
 *     -> AI_ABLATION (180s: Round 1 locks Speedometer ~90s, Round 2 all toggles)
 *     -> POST_ABLATION_RANKING -> REFLECTION -> DONE
 */

const GameManager = (() => {

  const DEV_SHORT = typeof window !== 'undefined' && window.DEV_SHORT_DEMOS;
  const DEV_SKIP_PRACTICE = false;

  const PHASE_DURATIONS = {
    PRACTICE: DEV_SHORT ? 5 : 30,
    SENSOR_INTRO: DEV_SHORT ? 5 : 30,
    HUMAN_DEMO: DEV_SHORT ? 20 : 120,
    HUMAN_DEMO_EXTRA: DEV_SHORT ? 15 : 45,
    AI_WARMUP: 45,
    AI_ABLATION: DEV_SHORT ? 30 : 180,
  };

  /** Wall-clock segment length inside AI_ABLATION (must sum to PHASE_DURATIONS.AI_ABLATION). */
  const ROUND_1_DURATION_MS = DEV_SHORT ? 15000 : 90000;
  const ROUND_2_DURATION_MS = DEV_SHORT ? 15000 : 90000;

  let currentPhase = 'INTRO';
  let phaseStartTime = 0;
  let phaseElapsed = 0;
  let paused = false;

  const keys = {};
  const WASD_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

  function isEditableFocusTarget(el) {
    if (!el || el.disabled) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    const type = (el.type || 'text').toLowerCase();
    const nonText = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'image']);
    return !nonText.has(type);
  }

  window.addEventListener('keydown', e => {
    if (isEditableFocusTarget(document.activeElement)) return;
    if (e.code.startsWith('Arrow') || WASD_CODES.has(e.code)) e.preventDefault();
    keys[e.code] = true;
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  function steerTargetFromKeys() {
    let target = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) target = -1;
    if (keys['ArrowRight'] || keys['KeyD']) target = 1;
    return target;
  }
  function throttleFromKeys() {
    return (keys['ArrowUp'] || keys['KeyW']) ? 1 : 0;
  }

  let lastRecordTime = 0;
  const RECORD_INTERVAL = 100;

  let smoothedSteering = 0;
  let aiSmoothedSteering = 0;
  const STEER_SMOOTH = 0.18;
  /** Lower than STEER_SMOOTH: MLP steering jumps frame-to-frame; extra low-pass keeps the car stable. */
  const AI_STEER_SMOOTH = 0.085;
  const AI_STEER_SMOOTH_NO_SPD = 0.12; // ablation: a bit snappier than normal, not as harsh as 0.3

  const STEER_WINDOW_SIZE = 3;
  const steerWindow = new Array(STEER_WINDOW_SIZE).fill(0);
  let steerWindowSum = 0, steerWindowIdx = 0, steerWindowCount = 0;

  let lastLogTime = 0;
  const LOG_INTERVAL = 100;

  let crashTimer = 0, crashLogged = false;
  const CRASH_RESPAWN_DELAY = 1500;

  let lastLapProgress = 0, lapCount = 0, lastAIResult = null;

  const OUTCOME_LABELS = { fine: 'Drove fine', slow: 'Wobbled', crash: 'Crashed' };
  const OUTCOME_FEEDBACK_MS = 3000;

  let spaceWasDown = false;

  const OUTCOME_WINDOW_MS = 7000;
  const DEGRADED_THRESHOLD_CENTER_DEV = 0.45;
  const MIN_DEMO_COUNT = 100;
  /** Lower bar for warmup-retry segment (fresh buffer after KNN.reset). */
  const MIN_DEMO_COUNT_EXTRA = 60;
  let outcomeWindowStart = 0;
  let outcomeWindowMaxAbsDeviation = 0;
  let crashedDuringOutcomeWindow = false;
  let outcomeResolver = null;

  let demoCenterDevSum = 0, demoCenterDevCount = 0, demoCrashCount = 0;

  const CRASH_REPLAY_COUNT = 15;  // oversample crashes so one demo crash has noticeable but not catastrophic effect (research justification: high-consequence events represented proportionally)
  let lastDemoSensors = null, lastDemoSteering = null;
  let demoRecordedDots = [];
  let prevDemoSteering = 0;
  /** Frames that passed / failed shouldRecord() while moving on-track (for paper: filter acceptance rate). */
  let demoRecordedSamples = 0;
  let demoSkippedSamples = 0;

  let demoSpeedSamples = [];
  /** 90th-percentile normalized speed during human demo; caps AI throttle. */
  let avgDemoSpeed = 0.7;

  const MAX_WARMUP_RETRIES = 3;
  let warmupRetryCount = 0;

  /** Feasibility scaffolding (pilot / paper metrics) — does not alter MLP or sensor physics. */
  const DRIVING_TIP_TEXT = 'Tip: tap \u2191 to control speed — holding it makes turns harder';
  const DEMO_CRASH_TIP_AFTER = 3;
  const DEMO_CRASH_EXTEND_AFTER = 8;
  const DEMO_PHASE_EXTEND_MS = 30000;
  const ABLATION_AI_CRASH_NUDGE_AFTER = 10;

  let humanTeachingBonusMs = 0;
  let humanTeachingExtensionUsed = false;
  let drivingTipActive = false;
  let demoPhaseAccumSec = 0;
  let ablationAICrashCount = 0;
  let ablationStruggleNudgeShown = false;

  /** Same crash region on the loop (handles wrap near 0/1). */
  const SAME_SPOT_LAP_PROGRESS = 0.05;
  let consecutiveCrashCount = 0;
  let lastCrashLapProgress = -1;

  let ablationRound = 1;
  let ablationRound2Announced = false;

  function lapProgressDistance(a, b) {
    const d = Math.abs(a - b);
    return Math.min(d, 1 - d);
  }

  function offSensorNamesLabel(toggleMask) {
    const names = [];
    for (let i = 0; i < toggleMask.length; i++) {
      if (!toggleMask[i]) names.push(Sensors.SENSOR_NAMES[i]);
    }
    return names.length ? names.join(' + ') : 'sensors';
  }

  function aiRespawnPoseFromCrash(crashX, crashY) {
    const centerline = Track.centerline();
    const n = centerline.length;
    const stepsBack = Math.floor(n * (consecutiveCrashCount >= 3 ? 0.05 : 0.02));
    const infoIndex = Track.nearestCenterlineIndex(crashX, crashY);
    const idx = (infoIndex - stepsBack + n) % n;
    const p = centerline[idx];
    const next = centerline[(idx + 1) % n];
    return { x: p.x, y: p.y, angle: Math.atan2(next.y - p.y, next.x - p.x) };
  }

  function resetCrashStreak() {
    consecutiveCrashCount = 0;
    lastCrashLapProgress = -1;
  }

  /**
   * Demo recording gate — curated IL, not every frame.
   * Speed index: last element (6D → [5], 7D → [6]) matches sensors.js layout.
   */
  function shouldRecord(sensors, labelSteering, prevSteering) {
    const forward = sensors[4];
    const leftNear = sensors[1];
    const rightNear = sensors[2];
    const speed = sensors[sensors.length - 1];

    if (speed < 0.05) return false;

    const inCorner = forward < 0.75;
    if (inCorner) return true;

    const steeringChange = Math.abs(labelSteering - prevSteering);
    return steeringChange < 0.5;
  }

  function refreshDemoInstruction() {
    if (!drivingTipActive || typeof UI.showInstructionWithTip !== 'function') return;
    if (currentPhase === 'HUMAN_DEMO') {
      UI.showInstructionWithTip('Keep driving laps until the timer runs out! The AI is learning from you.', DRIVING_TIP_TEXT);
    } else if (currentPhase === 'HUMAN_DEMO_EXTRA') {
      UI.showInstructionWithTip('Your AI needs more practice data — keep driving laps until time runs out.', DRIVING_TIP_TEXT);
    }
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  let currentPlayer = 'Guest';

  async function start() {
    currentPhase = 'LOGIN';
    if (typeof window !== 'undefined') { window.__phase = currentPhase; window.__aiCrashed = false; }

    warmupRetryCount = 0;
    humanTeachingBonusMs = 0;
    humanTeachingExtensionUsed = false;
    drivingTipActive = false;
    demoPhaseAccumSec = 0;
    ablationAICrashCount = 0;
    ablationStruggleNudgeShown = false;

    currentPlayer = await UI.showLogin();

    const progressKey = 'neuroDriver_progress_' + currentPlayer;
    if (!localStorage.getItem(progressKey)) {
      localStorage.setItem(progressKey, JSON.stringify({
        laps: 0,
        highestDemoScore: 0,
        phasesCompleted: []
      }));
    }

    Logger.start();
    Logger.setConfig({
      sensorCount: 3,
      sensors: ['lidar', 'camera', 'speedometer'],
      outcomeWindowMs: OUTCOME_WINDOW_MS,
      degradedThresholdCenterDeviation: DEGRADED_THRESHOLD_CENTER_DEV,
      minDemoCount: MIN_DEMO_COUNT,
      minDemoCountExtra: MIN_DEMO_COUNT_EXTRA,
      recordIntervalMs: RECORD_INTERVAL,
      crashRespawnDelayMs: CRASH_RESPAWN_DELAY,
      maxWarmupRetries: MAX_WARMUP_RETRIES,
      ablationRound1Ms: ROUND_1_DURATION_MS,
      ablationRound2Ms: ROUND_2_DURATION_MS,
    });

    if (typeof UI.showControls === 'function') UI.showControls();
    if (typeof UI.showDashcam === 'function') UI.showDashcam();
    await showIntro();
  }

  async function showIntro() {
    currentPhase = 'INTRO';
    Logger.logPhase('INTRO');
    await UI.showOverlay(
      'Ready to Practice?',
      'Get comfortable with the controls before the AI starts watching. Use ↑ to accelerate and ← → to steer.',
      'Start Practice'
    );
    beginPractice();
  }

  function beginPractice() {
    currentPhase = 'PRACTICE';
    Logger.logPhase('PRACTICE');
    phaseStartTime = performance.now();
    spaceWasDown = false;
    UI.setPhaseLabel('Practice: Learn the Controls');
    UI.showInstruction('Practice driving! Use ↑ to accelerate and ← → to steer.');
    UI.hideToggles();
    Car.respawn();
  }

  async function beginSensorIntro() {
    currentPhase = 'SENSOR_INTRO';
    Logger.logPhase('SENSOR_INTRO');
    paused = true;
    await UI.showSensorIntro();
    Logger.logEvent('sensor_intro_shown', {});
    paused = false;
    await beginHumanDemo();
  }

  async function beginHumanDemo() {
    currentPhase = 'HUMAN_DEMO';
    paused = true;
    await UI.showOverlay(
      'Phase 1: Teach the AI',
      'Objective: Keep driving laps until the timer runs out! The AI will watch your steering and speed to learn how to drive.',
      'Start Driving'
    );
    paused = false;

    Logger.logPhase('HUMAN_DEMO');
    phaseStartTime = performance.now();
    demoCenterDevSum = demoCenterDevCount = demoCrashCount = 0;
    prevDemoSteering = 0;
    demoRecordedSamples = 0;
    demoSkippedSamples = 0;
    demoSpeedSamples = [];
    drivingTipActive = false;
    UI.setPhaseLabel('Phase 1: Teach the AI');
    UI.showInstruction('Keep driving laps until the timer runs out! The AI is learning from you.');
    UI.showDemoCount();
    UI.setDemoCount(0, MIN_DEMO_COUNT);
    UI.hideToggles();
    KNN.reset();
    demoRecordedDots = [];
    Car.respawn();
    lastLapProgress = Track.lapProgress(Car.getState().x, Car.getState().y);
  }

  async function beginPreRanking() {
    currentPhase = 'PRE_ABLATION_RANKING';
    Logger.logPhase('PRE_ABLATION_RANKING');
    paused = true;
    UI.hideInstruction(); UI.hideBanner(); UI.hideDemoCount();
    const ranking = await UI.showRanking(
      'Before the AI drives, what is your ranking of the sensors it needs most to drive safely? Make your best guess — there\'s no right answer yet.',
      'Tap each sensor in order (most important first). Use the arrows to reorder, then Submit.'
    );
    Logger.setPreAblationRanking(ranking);
    Logger.logEvent('pre_ablation_ranking', { ranking });
    paused = false;
    beginAIWarmup();
  }

  async function beginAIWarmup() {
    paused = true;
    resetCrashStreak();
    Sensors.resetToggles();
    for (let i = 0; i < 3; i++) UI.applySensorBtnState(i, true);
    if (demoSpeedSamples.length > 0) {
      const sorted = [...demoSpeedSamples].sort((a, b) => a - b);
      avgDemoSpeed = sorted[Math.floor(sorted.length * 0.9)];
    }
    // Batch-train after all demos collected. Prevents catastrophic forgetting
    // that happens when samples arrive in sequential track order.
    KNN.train();
    await UI.showOverlay(
      'Nice driving!',
      `The AI learned from ${KNN.demoCount()} moments of your driving. Now watch it try to drive on its own.`,
      'Watch the AI'
    );
    currentPhase = 'AI_WARMUP';
    Logger.logPhase('AI_WARMUP');
    phaseStartTime = performance.now();
    UI.setPhaseLabel('Phase 2: AI Driving');
    UI.hideDemoCount();
    UI.hideInstruction();
    aiSmoothedSteering = 0;
    Car.respawn();
    lastLapProgress = Track.lapProgress(Car.getState().x, Car.getState().y);
    paused = false;
  }

  async function beginHumanDemoExtra() {
    paused = true;
    await UI.showOverlay(
      'More Data Needed',
      'The AI crashed too much and couldn\'t finish a lap. Let\'s clear its memory and try teaching it again with better driving data!',
      'Activating Manual Control'
    );
    paused = false;

    const previousDemoCount = KNN.demoCount();
    KNN.reset();
    demoRecordedDots = [];
    demoRecordedSamples = 0;
    demoSkippedSamples = 0;
    demoSpeedSamples = [];
    prevDemoSteering = 0;
    Logger.logEvent('demo_buffer_cleared_warmup_retry', {
      retryCount: warmupRetryCount,
      previousDemoCount,
    });

    resetCrashStreak();
    currentPhase = 'HUMAN_DEMO_EXTRA';
    Logger.logPhase('HUMAN_DEMO_EXTRA');
    phaseStartTime = performance.now();
    UI.setPhaseLabel('Phase 1: Teach the AI (more)');
    if (drivingTipActive && typeof UI.showInstructionWithTip === 'function') {
      UI.showInstructionWithTip('Your AI needs more practice data — keep driving laps until time runs out.', DRIVING_TIP_TEXT);
    } else {
      UI.showInstruction('Your AI needs more practice data — keep driving laps until time runs out.');
    }
    UI.showDemoCount();
    UI.setDemoCount(0, MIN_DEMO_COUNT_EXTRA);
    UI.hideToggles();
    Car.respawn();
    lastLapProgress = Track.lapProgress(Car.getState().x, Car.getState().y);
  }

  async function beginAblation() {
    paused = true;
    resetCrashStreak();
    Sensors.resetToggles();
    for (let i = 0; i < 3; i++) UI.applySensorBtnState(i, true);
    await UI.showOverlay(
      'Experiment Time',
      'The AI uses 3 sensors: LiDAR, Camera, and Speedometer. Try turning sensors off to see what happens!',
      'Start Experimenting'
    );
    currentPhase = 'AI_ABLATION';
    Logger.logPhase('AI_ABLATION');
    ablationAICrashCount = 0;
    ablationStruggleNudgeShown = false;
    phaseStartTime = performance.now();
    UI.setPhaseLabel('Phase 3: Sensor Experiments');
    UI.showToggles();
    UI.hideInstruction();
    ablationRound = 1;
    ablationRound2Announced = false;
    UI.unlockSensor(2);
    UI.lockSensor(2);
    aiSmoothedSteering = 0;
    Car.respawn();
    lastLapProgress = Track.lapProgress(Car.getState().x, Car.getState().y);
    paused = false;
  }

  async function beginPostRanking() {
    currentPhase = 'POST_ABLATION_RANKING';
    Logger.logPhase('POST_ABLATION_RANKING');
    paused = true;
    UI.hideToggles(); UI.hideBanner();
    UI.unlockSensor(2);
    Sensors.resetToggles();
    const ranking = await UI.showRanking(
      'Now that you\'ve experimented, what is your ranking of the sensors your AI needs most to drive safely?',
      'Tap each sensor in order (most important first). Use the arrows to reorder, then Submit.'
    );
    Logger.setPostAblationRanking(ranking);
    Logger.logEvent('post_ablation_ranking', { ranking });
    endSession();
  }

  function endSession() {
    currentPhase = 'DONE';
    Logger.logPhase('DONE');
    const lapsWarmup = Logger.getLapCountForPhase('AI_WARMUP');
    Logger.setFeasibilityMetrics({
      demoCrashCount,
      warmupRetryCount,
      maxWarmupRetries: MAX_WARMUP_RETRIES,
      warmupLapCount: lapsWarmup,
      warmupHadAtLeastOneLap: lapsWarmup > 0,
      /** Pilot criterion helper: first AI warmup attempt produced a lap (no extra demo round). */
      warmupSucceededWithoutRetry: lapsWarmup > 0 && warmupRetryCount === 0,
      ablationAICrashCount,
      demoPhaseWallMs: Math.round(demoPhaseAccumSec),
      sessionWallMs: Math.round(Logger.sessionElapsedMs()),
      demoPhaseExtendedOnce: humanTeachingExtensionUsed,
      demoPhaseBonusMs: humanTeachingBonusMs,
      drivingTipShown: drivingTipActive,
      ablationStruggleNudgeShown,
    });
    UI.setPhaseLabel('Session Complete');
    UI.hideToggles(); UI.hideInstruction(); UI.hideBanner();

    // Auto-save data in the background instantly
    Logger.downloadJSON();

    UI.showOverlay(
      'All done!',
      'Thank you! Your data has been securely saved to the lab server. Please follow the instructions to complete your post-survey.',
      'Finish & Reset'
    ).then(() => {
      // Reload the page to prep the computer for the next middle schooler
      window.location.reload();
    });
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  function update(dt, now) {
    if (paused || currentPhase === 'LOGIN' || currentPhase === 'INTRO' || currentPhase === 'DONE') return;
    if (typeof window !== 'undefined') window.__phase = currentPhase;

    phaseElapsed = now - phaseStartTime;

    if (currentPhase === 'HUMAN_DEMO' || currentPhase === 'HUMAN_DEMO_EXTRA') {
      demoPhaseAccumSec += dt;
    }

    if (PHASE_DURATIONS[currentPhase]) {
      const secsLeft = Math.max(0, Math.ceil((phaseDuration() - phaseElapsed) / 1000));
      UI.setTimer(`Time: ${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}`);
    }

    if (currentPhase === 'AI_ABLATION' && !ablationRound2Announced && phaseElapsed >= ROUND_1_DURATION_MS) {
      ablationRound = 2;
      ablationRound2Announced = true;
      UI.unlockSensor(2);
      UI.showBanner('🌟 Speedometer is now unlocked! Give it a try.');
      Logger.logEvent('ablation_round_2', {});
      setTimeout(() => UI.hideBanner(), 5000);
    }

    const stateForCrash = Car.getState();
    if (stateForCrash.crashed) {
      crashTimer += dt;
      if (!crashLogged) {
        if (currentPhase === 'HUMAN_DEMO' || currentPhase === 'HUMAN_DEMO_EXTRA') {
          demoCrashCount++;
          if (demoCrashCount > DEMO_CRASH_TIP_AFTER && !drivingTipActive) {
            drivingTipActive = true;
            Logger.logEvent('feasibility_driving_tip_shown', { demoCrashCount });
            refreshDemoInstruction();
            if (typeof UI.pulseInstructionPanel === 'function') UI.pulseInstructionPanel();
          }
          if (demoCrashCount > DEMO_CRASH_EXTEND_AFTER && !humanTeachingExtensionUsed) {
            humanTeachingExtensionUsed = true;
            humanTeachingBonusMs += DEMO_PHASE_EXTEND_MS;
            Logger.logEvent('feasibility_demo_phase_extended', {
              demoCrashCount,
              extendMs: DEMO_PHASE_EXTEND_MS,
            });
            UI.showBanner('Let\'s get a bit more practice data — keep driving!');
            setTimeout(() => UI.hideBanner(), 6000);
          }
          if (lastDemoSensors) {
            for (let i = 0; i < CRASH_REPLAY_COUNT; i++) KNN.addDemonstration(lastDemoSensors, lastDemoSteering);
          }
        }
        if (currentPhase === 'AI_ABLATION') {
          ablationAICrashCount++;
          if (ablationAICrashCount > ABLATION_AI_CRASH_NUDGE_AFTER && !ablationStruggleNudgeShown) {
            ablationStruggleNudgeShown = true;
            Logger.logEvent('feasibility_ablation_struggle_banner', { ablationAICrashCount });
            UI.showBanner('The AI is struggling — you can turn sensors back on to help it');
            setTimeout(() => UI.hideBanner(), 10000);
          }
        }
        if (outcomeWindowStart > 0) {
          crashedDuringOutcomeWindow = true;
          if (outcomeResolver) outcomeResolver();
        }
        const currentProgress = Track.lapProgress(stateForCrash.x, stateForCrash.y);
        const sameSpot = lastCrashLapProgress >= 0 &&
          lapProgressDistance(currentProgress, lastCrashLapProgress) < SAME_SPOT_LAP_PROGRESS;
        if (sameSpot) {
          consecutiveCrashCount++;
        } else {
          consecutiveCrashCount = 1;
        }
        lastCrashLapProgress = currentProgress;
        const mask = Sensors.getToggleMask();
        Logger.logCrash(stateForCrash, mask, currentPhase, currentProgress, consecutiveCrashCount);
        if (consecutiveCrashCount === 3 && (currentPhase === 'AI_WARMUP' || currentPhase === 'AI_ABLATION')) {
          const anyOff = mask.includes(false);
          if (anyOff) {
            const offLabel = offSensorNamesLabel(mask);
            const restoreWord = offLabel.includes('+') ? 'them' : 'it';
            UI.showBanner(
              `The AI keeps crashing with ${offLabel} OFF — try restoring ${restoreWord} or experiment with a different sensor.`
            );
          } else {
            UI.showBanner(`The AI is struggling to drive! It might need more practice data.`);
          }
          setTimeout(() => UI.hideBanner(), 4000);
          Logger.logEvent('crash_loop_nudge', {
            consecutiveCrashes: consecutiveCrashCount,
            lapProgress: +currentProgress.toFixed(4),
            toggleMask: [...mask],
            phase: currentPhase,
          });
        }
        if (typeof window !== 'undefined' && (currentPhase === 'AI_WARMUP' || currentPhase === 'AI_ABLATION')) {
          window.__aiCrashed = true;
        }
        crashLogged = true;
      }
      if (crashTimer > CRASH_RESPAWN_DELAY) {
        if (currentPhase === 'HUMAN_DEMO' || currentPhase === 'PRACTICE' || currentPhase === 'HUMAN_DEMO_EXTRA') {
          Car.respawn();
        } else {
          if (currentPhase === 'AI_WARMUP' || currentPhase === 'AI_ABLATION') aiSmoothedSteering = 0;
          Car.respawn(aiRespawnPoseFromCrash(stateForCrash.x, stateForCrash.y));
        }
        lastLapProgress = Track.lapProgress(Car.getState().x, Car.getState().y);
        crashTimer = 0; crashLogged = false;
      }
      return;
    }
    crashTimer = 0; crashLogged = false;

    const currentLapProgress = Track.lapProgress(stateForCrash.x, stateForCrash.y);
    if (lastLapProgress > 0.95 && currentLapProgress < 0.05) {
      lapCount++;
      Logger.logLap(currentPhase, lapCount);
    }
    lastLapProgress = currentLapProgress;

    if (currentPhase === 'PRACTICE') {
      updatePractice(dt, now);
    } else if (currentPhase === 'HUMAN_DEMO' || currentPhase === 'HUMAN_DEMO_EXTRA') {
      updateHumanDriving(dt, now);
    } else if (currentPhase === 'AI_WARMUP' || currentPhase === 'AI_ABLATION') {
      updateAIDriving(dt, now);
    }

    const durationReached = phaseElapsed >= phaseDuration();
    const minDemoRequired = currentPhase === 'HUMAN_DEMO_EXTRA' ? MIN_DEMO_COUNT_EXTRA : MIN_DEMO_COUNT;
    const minSamplesMet = (currentPhase !== 'HUMAN_DEMO' && currentPhase !== 'HUMAN_DEMO_EXTRA')
      || KNN.demoCount() >= minDemoRequired;
    const outcomeWindowActive = outcomeWindowStart > 0;

    if (currentPhase === 'HUMAN_DEMO' && durationReached && KNN.demoCount() < MIN_DEMO_COUNT) {
      UI.showBanner('Need a few more samples — keep driving (100 required)');
    }
    if (currentPhase === 'HUMAN_DEMO_EXTRA' && durationReached && KNN.demoCount() < MIN_DEMO_COUNT_EXTRA) {
      UI.showBanner(`Need a few more samples — keep driving (${MIN_DEMO_COUNT_EXTRA} required for this round)`);
    }
    if (currentPhase === 'HUMAN_DEMO_EXTRA' && durationReached && KNN.demoCount() >= MIN_DEMO_COUNT_EXTRA) {
      UI.hideBanner();
    }
    if (!paused && durationReached && minSamplesMet && !outcomeWindowActive) advancePhase();
  }

  // ── Auto demo controller (DEV mode) ──────────────────────────────────────

  const DEV_AUTO_DEMO = false;

  function autoDemoController() {
    const car = Car.getState();
    const centerline = Track.centerline();
    let bestIdx = 0, bestD2 = Infinity;
    for (let i = 0; i < centerline.length; i++) {
      const dx = car.x - centerline[i].x, dy = car.y - centerline[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }
    // Short lookahead + high gain → sharper steering signal for training
    const target = centerline[(bestIdx + 8) % centerline.length];
    let angleDiff = Math.atan2(target.y - car.y, target.x - car.x) - car.heading;
    angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    const targetSteer = Math.max(-1, Math.min(1, angleDiff * 1.5));
    // Skip smoothing so the model gets raw, decisive steering labels
    smoothedSteering = targetSteer;
    Car.setSteering(smoothedSteering);
    Car.setThrottle(0.85);
  }

  // ── Human driving + demo recording ───────────────────────────────────────

  function updateHumanDriving(dt, now) {
    if (!DEV_AUTO_DEMO) {
      const dtScale = Math.min(dt / 16.6666, 3.0);
      const smoothFactor = Math.min(1.0, STEER_SMOOTH * dtScale);
      const target = steerTargetFromKeys();
      smoothedSteering += (target - smoothedSteering) * smoothFactor;
      Car.setSteering(smoothedSteering);
      Car.setThrottle(throttleFromKeys());
    } else {
      autoDemoController();
    }

    const carState = Car.getState();
    const sensors = Sensors.compute(carState);

    // Rolling label smoothing (reduces single-frame spikes)
    steerWindowSum -= steerWindow[steerWindowIdx];
    steerWindow[steerWindowIdx] = smoothedSteering;
    steerWindowSum += smoothedSteering;
    steerWindowIdx = (steerWindowIdx + 1) % STEER_WINDOW_SIZE;
    steerWindowCount = Math.min(steerWindowCount + 1, STEER_WINDOW_SIZE);
    const labelSteering = steerWindowSum / steerWindowCount;

    if (now - lastRecordTime > RECORD_INTERVAL) {
      if (carState.speed > 0.1 && Track.isOnTrack(carState.x, carState.y)) {
        demoSpeedSamples.push(carState.normalizedSpeed);
        const dev = Track.centerDeviation(carState.x, carState.y);

        if (shouldRecord(sensors, labelSteering, prevDemoSteering)) {
          demoRecordedSamples++;
          KNN.addDemonstration(sensors, labelSteering);
          lastDemoSensors = [...sensors];
          lastDemoSteering = labelSteering;
          demoRecordedDots.push({ x: carState.x, y: carState.y });
        } else {
          demoSkippedSamples++;
        }

        demoCenterDevSum += Math.abs(dev);
        demoCenterDevCount += 1;
      }
      prevDemoSteering = labelSteering;
      Logger.logFrame(currentPhase, carState, sensors, sensors, Sensors.getToggleMask(), null);
      const minReq = currentPhase === 'HUMAN_DEMO_EXTRA' ? MIN_DEMO_COUNT_EXTRA : MIN_DEMO_COUNT;
      UI.setDemoCount(KNN.demoCount(), minReq);
      lastRecordTime = now;
    }
  }

  // ── Practice ─────────────────────────────────────────────────────────────

  function updatePractice(dt, now) {
    const dtScale = Math.min(dt / 16.6666, 3.0);
    const smoothFactor = Math.min(1.0, STEER_SMOOTH * dtScale);
    const target = steerTargetFromKeys();
    smoothedSteering += (target - smoothedSteering) * smoothFactor;
    Car.setSteering(smoothedSteering);
    Car.setThrottle(throttleFromKeys());
    Sensors.compute(Car.getState());
    if (DEV_SKIP_PRACTICE && keys['Space'] && !spaceWasDown) { spaceWasDown = true; beginSensorIntro(); return; }
    if (DEV_SKIP_PRACTICE) spaceWasDown = keys['Space'];
  }

  // ── AI driving ───────────────────────────────────────────────────────────

  function updateAIDriving(dt, now) {
    const carState = Car.getState();
    const sensorsRaw = Sensors.rawValues(carState);   // unmasked, for throttle
    const sensorsMasked = Sensors.compute(carState);     // masked by toggles, for steering

    console.assert(
      Array.isArray(sensorsMasked) &&
      sensorsMasked.length === 6 &&
      sensorsMasked.every(v => typeof v === 'number' && !isNaN(v)),
      'invalid sensor vector'
    );

    const result = KNN.predict(sensorsMasked);
    const resultRaw = KNN.predict(sensorsRaw);
    lastAIResult = result;

    const steer = Math.max(-1, Math.min(1, result.steering));
    const spdOff = !Sensors.getToggleMask()[2];
    const baseSmooth = spdOff ? AI_STEER_SMOOTH_NO_SPD : AI_STEER_SMOOTH;
    const dtScale = Math.min(dt / 16.6666, 3.0);
    const smoothFactor = Math.min(1.0, baseSmooth * dtScale);
    aiSmoothedSteering += (steer - aiSmoothedSteering) * smoothFactor;
    aiSmoothedSteering = Math.max(-1.0, Math.min(1.0, aiSmoothedSteering));
    Car.setSteering(aiSmoothedSteering);

    // Proportional speed controller: targets demo speed, scales by forward road clearance.
    // Steering is learned; speed is regulated. Uses raw sensors so ablation doesn't affect throttle.
    const forward = sensorsRaw[4];
    const turnFactor = 1 - forward;
    const curveSlowdown = 1 - 0.6 * Math.pow(turnFactor, 1.5);
    const targetSpeed = avgDemoSpeed * curveSlowdown;

    const speedError = targetSpeed - carState.normalizedSpeed;
    let throttle = Math.max(0, Math.min(1, speedError * 5));

    const tooFast = carState.normalizedSpeed > avgDemoSpeed + 0.15;
    if (tooFast) throttle = 0;

    Car.setThrottle(throttle);



    if (outcomeWindowStart > 0 && (now - outcomeWindowStart) < OUTCOME_WINDOW_MS) {
      const dev = Track.centerDeviation(carState.x, carState.y);
      const absDev = Math.abs(dev);
      outcomeWindowMaxAbsDeviation = Math.max(outcomeWindowMaxAbsDeviation, absDev);
    }

    if (now - lastLogTime > LOG_INTERVAL) {
      Logger.logFrame(currentPhase, carState, sensorsRaw, sensorsMasked, Sensors.getToggleMask(), result);
      lastLogTime = now;
    }
  }

  // ── Debug draw (pink demo dots) ───────────────────────────────────────────

  function draw(ctx) {
    if (currentPhase !== 'HUMAN_DEMO' && currentPhase !== 'HUMAN_DEMO_EXTRA') return;
    if (!demoRecordedDots.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.7)'; // Brighter cyber-blue
    const n = demoRecordedDots.length;
    for (let i = Math.max(0, n - 6000); i < n; i++) {
      const p = demoRecordedDots[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Phase helpers ─────────────────────────────────────────────────────────

  function phaseDuration() {
    let ms = (PHASE_DURATIONS[currentPhase] || 999) * 1000;
    if (currentPhase === 'HUMAN_DEMO' || currentPhase === 'HUMAN_DEMO_EXTRA') {
      ms += humanTeachingBonusMs;
    }
    return ms;
  }

  function flushDemoQuality() {
    const avg = demoCenterDevCount > 0 ? demoCenterDevSum / demoCenterDevCount : 0;
    Logger.setDemoQuality(avg, demoCrashCount, demoRecordedSamples, demoSkippedSamples);
  }

  function advancePhase() {
    switch (currentPhase) {
      case 'PRACTICE': beginSensorIntro(); break;
      case 'HUMAN_DEMO': flushDemoQuality(); beginPreRanking(); break;
      case 'HUMAN_DEMO_EXTRA': flushDemoQuality(); beginAIWarmup(); break;
      case 'AI_ABLATION': beginPostRanking(); break;
      case 'AI_WARMUP': {
        const laps = Logger.getLapCountForPhase('AI_WARMUP');
        if (laps === 0 && warmupRetryCount < MAX_WARMUP_RETRIES) {
          warmupRetryCount++;
          Logger.logEvent('warmup_fail', { retries: warmupRetryCount, demoCount: KNN.demoCount() });
          beginHumanDemoExtra();
        } else {
          if (laps === 0) Logger.logEvent('warmup_skip', { retries: warmupRetryCount });
          beginAblation();
        }
        break;
      }
    }
  }

  // ── Sensor toggle handler ─────────────────────────────────────────────────

  async function handleToggle(sensorIndex, newState) {
    if (paused || currentPhase !== 'AI_ABLATION') return;
    resetCrashStreak();
    paused = true;

    const sensorName = Sensors.SENSOR_NAMES[sensorIndex];
    const confBefore = lastAIResult ? lastAIResult.confidence : null;
    const lapProg = Track.lapProgress(Car.getState().x, Car.getState().y);

    let predictionChoice = null;

    if (!newState) {
      predictionChoice = await UI.showPrediction(sensorName, sensorIndex);
      UI.showBanner(`Experiment running: ${sensorName} is OFF. Watch what happens.`);
      UI.setTogglesDisabled(true);

    } else {
      UI.showBanner(`${sensorName} restored.`);
      setTimeout(() => UI.hideBanner(), 2000);
    }

    Sensors.setToggle(sensorIndex, newState);
    UI.applySensorBtnState(sensorIndex, newState);

    const newSensors = Sensors.compute(Car.getState());
    const confAfter = KNN.predict(newSensors).confidence;


    paused = false;

    if (predictionChoice) {
      outcomeWindowStart = performance.now();
      outcomeWindowMaxAbsDeviation = 0;
      crashedDuringOutcomeWindow = false;

      outcomeResolver = () => {
        const stateNow = Car.getState();
        let outcome;
        if (stateNow.crashed || crashedDuringOutcomeWindow) {
          outcome = 'crash';
        } else if (outcomeWindowMaxAbsDeviation > DEGRADED_THRESHOLD_CENTER_DEV) {
          outcome = 'slow';
        } else {
          outcome = 'fine';
        }
        const confAtOutcome = KNN.predict(Sensors.compute(stateNow)).confidence;
        outcomeWindowStart = 0;
        crashedDuringOutcomeWindow = false;
        outcomeResolver = null;
        Logger.logToggle(sensorIndex, sensorName, newState, predictionChoice, outcome, confBefore, confAtOutcome, lapProg, OUTCOME_WINDOW_MS, ablationRound);

        const match = predictionChoice === outcome;
        UI.showBanner(`You predicted: ${OUTCOME_LABELS[predictionChoice]}. Result: ${OUTCOME_LABELS[outcome]}. ${match ? '✓ Correct!' : '✗ Different than expected.'}`);
        setTimeout(() => { UI.hideBanner(); UI.setTogglesDisabled(false); }, OUTCOME_FEEDBACK_MS);
      };

      setTimeout(() => {
        if (outcomeResolver) {
          outcomeResolver();
        }
      }, OUTCOME_WINDOW_MS);
    } else {
      UI.setTogglesDisabled(false);
      Logger.logToggle(sensorIndex, sensorName, newState, null, null, confBefore, confAfter, lapProg, null, ablationRound);
    }
  }

  return {
    start,
    update,
    draw,
    handleToggle,
    getPhase: () => currentPhase,
    isPaused: () => paused,
  };
})();