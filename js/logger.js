/**
 * Logger — collects and exports session data as JSON.
 *
 * Data format version 4.0 — 3-sensor Option B (LiDAR, Camera, Speedometer).
 * Toggle prediction/outcome strings may include near_miss once the UI exposes it.
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

  let demoQuality = {
    avgAbsCenterDev: 0,
    crashCount: 0,
    demoRecordedSamples: 0,
    demoSkippedSamples: 0,
    demoFilterAcceptRate: null,
  };

  let preAblationRanking  = null;
  let postAblationRanking = null;

  let reflectionData = null;

  /** Incremented by logNearMiss; Part II may add per-event records. */
  let nearMissCount = 0;

  /** Set in endSession — feasibility / pilot metrics for the paper. */
  let feasibilityMetrics = null;

  function start() {
    startTime = performance.now();
    phases = [];
    frames = [];
    toggles = [];
    laps = [];
    crashes = [];
    events = [];
    lapCountsByPhase = {};
    demoQuality = {
      avgAbsCenterDev: 0,
      crashCount: 0,
      demoRecordedSamples: 0,
      demoSkippedSamples: 0,
      demoFilterAcceptRate: null,
    };
    preAblationRanking = null;
    postAblationRanking = null;
    reflectionData = null;
    nearMissCount = 0;
    feasibilityMetrics = null;
  }

  function setParticipant(id, cond) {
    participantId = id;
    condition = cond;
  }

  function setConfig(cfg) { config = cfg; }

  function setFeasibilityMetrics(m) {
    feasibilityMetrics = m;
  }

  function sessionElapsedMs() {
    return performance.now() - startTime;
  }

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

  function logCrash(carState, toggleMask, phase, lapProgress, consecutiveCrashes) {
    crashes.push({
      t: t(),
      phase,
      x: +carState.x.toFixed(1),
      y: +carState.y.toFixed(1),
      lapProgress: lapProgress != null ? +lapProgress.toFixed(4) : null,
      toggleMask: [...toggleMask],
      consecutiveCrashes: consecutiveCrashes != null ? consecutiveCrashes : null,
    });
  }

  function logEvent(eventName, payload) {
    events.push({ t: t(), event: eventName, ...payload });
  }

  function setDemoQuality(avgAbsDev, crashes, recordedSamples, skippedSamples) {
    const rec = recordedSamples != null ? recordedSamples : 0;
    const skp = skippedSamples != null ? skippedSamples : 0;
    const denom = rec + skp;
    const rate = denom > 0 ? +(rec / denom).toFixed(4) : null;
    demoQuality = {
      avgAbsCenterDev: +avgAbsDev.toFixed(4),
      crashCount: crashes,
      demoRecordedSamples: rec,
      demoSkippedSamples: skp,
      demoFilterAcceptRate: rate,
    };
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

  /** Part I stub: count only. Part II: append structured near-miss events. */
  function logNearMiss(_carState, _toggleMask, _phase) {
    nearMissCount++;
  }

  function exportJSON() {
    return {
      dataFormatVersion: '4.0',
      participantId,
      condition,
      sessionStart: new Date().toISOString(),
      nearMissCount,
      config: {
        ...config,
        sensorCount: 3,
      },
      demoQuality,
      feasibility: feasibilityMetrics,
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
    logNearMiss,
    setFeasibilityMetrics,
    sessionElapsedMs,
    getLapCountForPhase,
    exportJSON,
    downloadJSON,
  };
})();
