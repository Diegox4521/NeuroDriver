/**
 * Logger — collects and exports session data as JSON.
 *
 * Data format version 3.1 — 3-sensor Option B (LiDAR, Camera, Speedometer),
 * outcomes: crash, wobble, fine. No pedestrian, no ethics Q4.
 */

const Logger = (() => {

  let participantId = null;
  let condition     = null;
  let startTime     = 0;
  let config        = {};

  let phases        = [];
  let frames        = [];
  let toggles       = [];
  let laps          = [];
  let crashes       = [];
  let events        = [];

  let lapCountsByPhase = {};

  let demoQuality = { avgAbsCenterDev: 0, crashCount: 0 };

  let preAblationRanking  = null;
  let postAblationRanking = null;

  let reflectionData = null;

  function start() {
    startTime = performance.now();
    phases = [];
    frames = [];
    toggles = [];
    laps = [];
    crashes = [];
    events = [];
    lapCountsByPhase = {};
    demoQuality = { avgAbsCenterDev: 0, crashCount: 0 };
    preAblationRanking = null;
    postAblationRanking = null;
    reflectionData = null;
  }

  function setParticipant(id, cond) {
    participantId = id;
    condition = cond;
  }

  function setConfig(cfg) { config = cfg; }

  function t() { return +(performance.now() - startTime).toFixed(1); }

  function logPhase(name) { phases.push({ phase: name, t: t() }); }

  function logFrame(phase, carState, sensorsRaw, sensorsMasked, toggleMask, aiResult) {
    frames.push({
      t: t(),
      phase,
      x: +carState.x.toFixed(1),
      y: +carState.y.toFixed(1),
      heading: +carState.heading.toFixed(3),
      speed: +carState.speed.toFixed(3),
      sensorsRaw: sensorsRaw.map(v => +v.toFixed(4)),
      sensorsMasked: sensorsMasked.map(v => +v.toFixed(4)),
      toggleMask: [...toggleMask],
      aiSteering: aiResult ? +aiResult.steering.toFixed(4) : null,
      aiConfidence: aiResult ? +aiResult.confidence.toFixed(4) : null,
    });
  }

  function logToggle(sensorIndex, sensorName, newState, prediction, outcome, confBefore, confAfter, lapProgress, windowMs, ablationRound) {
    toggles.push({
      t: t(),
      sensorIndex,
      sensorName,
      newState,
      prediction,
      outcome,
      confidenceBefore: confBefore != null ? +confBefore.toFixed(4) : null,
      confidenceAfter:  confAfter != null  ? +confAfter.toFixed(4)  : null,
      lapProgress:      lapProgress != null ? +lapProgress.toFixed(4) : null,
      outcomeWindowMs:  windowMs,
      ablationRound,
    });
  }

  function logLap(phase, lapNumber) {
    laps.push({ t: t(), phase, lapNumber });
    lapCountsByPhase[phase] = (lapCountsByPhase[phase] || 0) + 1;
  }

  function getLapCountForPhase(phase) { return lapCountsByPhase[phase] || 0; }

  function logCrash(carState, toggleMask, phase) {
    crashes.push({
      t: t(),
      phase,
      x: +carState.x.toFixed(1),
      y: +carState.y.toFixed(1),
      toggleMask: [...toggleMask],
    });
  }

  function logEvent(eventName, payload) {
    events.push({ t: t(), event: eventName, ...payload });
  }

  function setDemoQuality(avgAbsDev, crashes) {
    demoQuality = { avgAbsCenterDev: +avgAbsDev.toFixed(4), crashCount: crashes };
  }

  function setPreAblationRanking(ranking)  { preAblationRanking = ranking; }
  function setPostAblationRanking(ranking) { postAblationRanking = ranking; }

  function logReflection(sensor, reason, skipped, surprisedMostSensor, surpriseLevel) {
    reflectionData = {
      sensor,
      reason,
      skipped,
      surprisedMostSensor: surprisedMostSensor || null,
      surpriseLevel: surpriseLevel || null,
    };
  }

  function exportJSON() {
    return {
      dataFormatVersion: '3.1',
      participantId,
      condition,
      sessionStart: new Date().toISOString(),
      config: {
        ...config,
        sensorCount: 3,
      },
      demoQuality,
      preAblationRanking,
      postAblationRanking,
      reflection: reflectionData,
      phases,
      frames,
      toggles,
      laps,
      crashes,
      events,
    };
  }

  function downloadJSON() {
    const data = exportJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const pid = participantId || 'anon';
    a.download = `glassbox_${pid}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    start,
    setParticipant,
    setConfig,
    logPhase,
    logFrame,
    logToggle,
    logLap,
    logCrash,
    logEvent,
    setDemoQuality,
    setPreAblationRanking,
    setPostAblationRanking,
    logReflection,
    getLapCountForPhase,
    exportJSON,
    downloadJSON,
  };
})();
