/**
 * MLP (BehaviorCloningNN) — small MLP for imitation learning.
 *
 * Interface:
 *   addDemonstration(sensors, steering)  — store demo (6D sensors)
 *   train()                              — call once after all demos collected
 *   predict(sensors) -> { steering, confidence }
 *   reset()
 *   demoCount()
 *
 * Input: 6D — [leftFar, leftNear, rightNear, rightFar, camera_forward, speed] in [0,1]
 * Output: steering in [-1, 1], confidence in [0, 1]
 */

const MLP = (() => {

  const INPUT_SIZE = 6;
  const HIDDEN_SIZE = 64;
  const LEARNING_RATE = 0.005;
  const EPOCHS = 120;

  let demonstrations = [];
  let W1, b1, W2, b2;

  function initWeights() {
    const rand = (scale) => (Math.random() * 2 - 1) * scale;
    const s1 = Math.sqrt(2 / INPUT_SIZE);
    const s2 = Math.sqrt(2 / HIDDEN_SIZE);
    W1 = [];
    b1 = new Array(HIDDEN_SIZE).fill(0);
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      W1[j] = Array.from({ length: INPUT_SIZE }, () => rand(s1));
    }
    W2 = Array.from({ length: HIDDEN_SIZE }, () => rand(s2));
    b2 = 0;
  }

  function reset() {
    demonstrations = [];
    initWeights();
  }

  function forward(x) {
    const h = new Array(HIDDEN_SIZE);
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      let sum = b1[j];
      for (let i = 0; i < INPUT_SIZE; i++) sum += W1[j][i] * x[i];
      h[j] = sum > 0 ? sum : 0;
    }
    let out = b2;
    for (let j = 0; j < HIDDEN_SIZE; j++) out += W2[j] * h[j];
    return { h, out, steering: Math.tanh(out) };
  }

  function trainOne(x, target) {
    const { h, out, steering } = forward(x);
    const dL = steering - target;
    const dOut = dL * (1 - steering * steering);
    const oldW2 = [...W2];
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      W2[j] -= LEARNING_RATE * dOut * h[j];
    }
    b2 -= LEARNING_RATE * dOut;
    for (let j = 0; j < HIDDEN_SIZE; j++) {
      if (h[j] <= 0) continue;
      const dH = dOut * oldW2[j];
      for (let i = 0; i < INPUT_SIZE; i++) {
        W1[j][i] -= LEARNING_RATE * dH * x[i];
      }
      b1[j] -= LEARNING_RATE * dH;
    }
  }

  function train() {
    if (demonstrations.length === 0) return;
    const straight = demonstrations.filter(d => Math.abs(d.steering) <= 0.15).length;
    const moderate = demonstrations.filter(d => Math.abs(d.steering) > 0.15 && Math.abs(d.steering) <= 0.4).length;
    const sharp    = demonstrations.filter(d => Math.abs(d.steering) > 0.4).length;
    console.log(`[MLP] Training on ${demonstrations.length} samples: ${straight} straight, ${moderate} moderate turns, ${sharp} sharp turns`);
    for (let epoch = 0; epoch < EPOCHS; epoch++) {
      const data = [...demonstrations];
      for (let i = data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [data[i], data[j]] = [data[j], data[i]];
      }
      for (const d of data) {
        const noisy = d.sensors.map(v => {
          const n = v + (Math.random() - 0.5) * 0.02;
          return Math.max(0, Math.min(1, n));
        });
        trainOne(noisy, d.steering);
      }
    }
  }

  function addDemonstration(sensors, steering) {
    const target = Math.max(-1, Math.min(1, steering));
    const x = [...sensors];
    demonstrations.push({ sensors: x, steering: target });
    // Graduated oversampling: moderate turns get 1 extra, sharp turns get 2 extra.
    // Prevents straight-driving bias that causes the AI to fail on curves.
    const absSteering = Math.abs(target);
    if (absSteering > 0.4) {
      demonstrations.push({ sensors: [...x], steering: target });
      demonstrations.push({ sensors: [...x], steering: target });
    } else if (absSteering > 0.15) {
      demonstrations.push({ sensors: [...x], steering: target });
    }
    // Near-wall oversampling: teaches "when close to wall, turn NOW"
    const nearWall = x[1] < 0.3 || x[2] < 0.3 || (x[4] < 0.25 && x[1] < 0.6 && x[2] < 0.6);
    if (nearWall) {
      demonstrations.push({ sensors: [...x], steering: target });
    }
  }

  function demoCount() {
    return demonstrations.length;
  }

  function predict(sensorVector) {
    if (demonstrations.length === 0) return { steering: 0, confidence: 0 };
    const x = sensorVector.map(v => Math.max(0, Math.min(1, v)));
    const { steering: rawSteering } = forward(x);
    // Scale up to help the AI commit to turns instead of under-correcting
    const steering = Math.tanh(rawSteering * 1.2);
    const K = Math.min(3, demonstrations.length);
    const dists = demonstrations.map(d => {
      let s = 0;
      for (let i = 0; i < x.length; i++) {
        const diff = x[i] - d.sensors[i];
        s += diff * diff;
      }
      return Math.sqrt(s);
    });
    dists.sort((a, b) => a - b);
    const avgDist = dists.slice(0, K).reduce((s, d) => s + d, 0) / K;
    const confidence = Math.max(0, Math.min(1, 1 - avgDist / Math.sqrt(INPUT_SIZE)));
    return { steering, confidence };
  }

  initWeights();
  return { reset, addDemonstration, train, demoCount, predict };
})();
