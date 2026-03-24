/**
 * Logger — collects and exports session data as JSON.
 *
 * Data format version 4.0 — 3-sensor Option B (LiDAR, Camera, Speedometer).
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



  function exportJSON() {
    return {
      dataFormatVersion: '4.0',
      participantId,
      condition,
      sessionStart: new Date().toISOString(),
      config: {
        ...config,
        sensorCount: 3,
      },
      demoQuality,
      feasibility: feasibilityMetrics,
      preAblationRanking,
      postAblationRanking,
      phases,
      frames,
      toggles,
      laps,
      crashes,
      events,
    };
  }

  async function downloadJSON() {
    const data = exportJSON();
    const jsonString = JSON.stringify(data, null, 2);

    try {
      // 1. Try to silently save to the local Node.js server
      const response = await fetch('http://localhost:3000/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString
      });
      
      if (!response.ok) throw new Error('Local server rejected the save request');
      console.log('✅ Data silently saved to local server!');
      
    } catch (err) {
      // 2. Fallback: If the server isn't running, download the file so data isn't lost!
      console.warn('⚠️ Local server not found. Falling back to browser file download.', err);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const pid = participantId || 'anon';
      a.download = `neurodriver_${pid}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
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

    setFeasibilityMetrics,
    sessionElapsedMs,
    getLapCountForPhase,
    exportJSON,
    downloadJSON,
  };
})();
