# NeuroDriver — Research Design & Game Overview

**Document type:** Research design report  
**Purpose:** Describe the game, its pedagogy, session structure, data collection, and research hypotheses so that an evaluator can assess the system as a research intervention  
**Target audience:** Faculty advisors, IRB reviewers, CS education researchers

---

## 1. What Is NeuroDriver?

NeuroDriver is a **browser-based driving game** that teaches 8th-grade students how artificial intelligence works by letting them **train an AI, watch it drive, and then break it on purpose.**

The game takes about **10 minutes** to play. It requires no installation, no accounts, and no internet connection after the page loads. A student opens a URL, plays through a guided sequence, and at the end the game exports a single JSON file containing everything that happened during the session — every prediction the student made, every sensor they turned off, and every crash.

The AI is **fully transparent**: students can see exactly what inputs the AI uses (three sensors), and what happens when they remove an input. There is no hidden magic. The AI is a small neural network (MLP) trained via behavior cloning on the student's own driving. When it fails, the student can trace the failure back to a specific sensor they disabled.

The game is designed as a **research instrument** — every design decision serves both a learning goal and a data collection goal. It is framed as a **design and feasibility study** with pilot data, suitable for venues like SIGCSE, IDC, EAAI, or ICER.

---

## 2. What Does It Teach?

### 2.1 Core Learning Goals

The game targets two ideas from the AI4K12 framework:

| AI4K12 Big Idea | What the student learns | How the game teaches it |
|---|---|---|
| **Big Idea 1 — Perception** | AI uses sensors to understand the world | Students see three named sensors (LiDAR, Camera, Speedometer) with real-world descriptions |
| **Big Idea 3 — Learning** | AI learns from data (human demonstrations) | Students drive the car, watch the AI copy them, and see "Samples: 47/100" counting up |

### 2.2 The Key Insight the Game Produces

After playing, students should be able to answer: **"What happens to an AI when it loses one of its inputs, and why does that matter?"**

This is tested through prediction accuracy (did they correctly guess what would happen?), and ranking shift (did their beliefs about which sensor matters most change after experimenting?).

### 2.3 Pedagogical Framework: Predict-Observe-Explain (POE)

Every experiment in the game follows the **Predict-Observe-Explain** cycle from science education:

1. **Predict:** Before turning off a sensor, the student picks what they think will happen (Drive fine / Wobble / Crash)
2. **Observe:** They watch the AI drive without that sensor for a 7-second observation window
3. **Explain:** The game shows their prediction next to the actual result ("You predicted: Drove fine. Result: Crashed. Different than expected.")

This loop runs every time a student turns off a sensor. A student who experiments with all three sensors completes 3+ POE cycles in a single 10-minute session.

---

## 3. The Three Sensors

The AI drives using three sensor groups, mapped to a 6-dimensional input vector. Each one maps to a real self-driving car sensor:

| Sensor | What it measures | Real-world analogy | What happens when it's turned off |
|---|---|---|---|
| **LiDAR** | Distance to walls (4 side rays at ±30°, ±60°) | The spinning laser on top of a Waymo car | The AI can't see walls. It usually **crashes immediately**. |
| **Camera** | How far ahead the road is clear (forward ray at 0°) | A forward-facing camera sensing road geometry | The forward distance cue is removed; the AI often **wobbles** or misjudges corners. |
| **Speedometer** | How fast the car is going | The dashboard speedometer | The AI drives slightly erratically. It **wobbles a little** but usually doesn't crash. |

These three sensors are deliberately ordered by **how dramatic the effect is** when they're disabled:

- **LiDAR** → High drama (crash)
- **Camera** → Medium drama (drift/wobble)
- **Speedometer** → Low drama (subtle wobble)

This gradient is important for the research design. Students who think every sensor causes a crash learn otherwise when they test Camera or Speedometer. Students who think no sensor matters learn otherwise when they test LiDAR. The variety of outcomes forces them to form **calibrated, sensor-specific predictions** rather than blanket guesses.

### 3.1 Sensor Ablation via Zero-Substitution

When a sensor is turned off, its corresponding input channels are set to **0**:

- **LiDAR off:** Indices 0–3 (all four side rays) set to 0
- **Camera off:** Index 4 (forward ray) set to 0
- **Speedometer off:** Index 5 (normalized speed) set to 0

The model weights stay fixed. This is technically "input perturbation" rather than true feature ablation, but produces the most visible behavioral changes for 8th graders. See Section 10.1 for a full discussion.

---

## 4. How the AI Works

### 4.1 Non-Technical

The AI uses a small **neural network** trained via **behavior cloning** — it copies the student's driving.

1. **Training phase:** While the student drives, the game records a snapshot every 0.1 seconds: "at this moment, the six sensor readings were [0.8, 0.7, 0.6, 0.5, 0.9, 0.4] and the student was steering [0.3 to the right]." After 2 minutes, the game has hundreds of these snapshots.

2. **Training:** After the demo phase, the neural network trains on all collected snapshots for 120 epochs with shuffling each epoch. This batch training approach prevents the model from forgetting earlier track sections.

3. **Driving phase:** When the AI needs to decide how to steer, it feeds the current sensor readings through the neural network and gets a steering value. A proportional speed controller targets the student's demonstrated speed and adapts to road geometry using the forward sensor.

4. **Confidence:** The system measures input similarity to training data using K-nearest-neighbor distance. If the current situation is very similar to something the student demonstrated, confidence is high. If it's far away (the AI is in unfamiliar territory), confidence is low.

5. **Ablation:** When a sensor is turned off, its value is set to 0. The neural network still runs — but now with distorted inputs, it produces different steering outputs. This is the behavioral change students observe.

### 4.2 Technical

**Architecture:** MLP with 6 inputs → 64 hidden units (ReLU) → 1 output (tanh). He initialization. Learning rate 0.005, 120 epochs.

**Input vector (6D):**

| Index | Channel | Source | Range |
|---|---|---|---|
| 0 | leftFar | Ray at −60° / max distance | [0, 1] |
| 1 | leftNear | Ray at −30° / max distance | [0, 1] |
| 2 | rightNear | Ray at +30° / max distance | [0, 1] |
| 3 | rightFar | Ray at +60° / max distance | [0, 1] |
| 4 | camera_forward | Ray at 0° / max distance | [0, 1] |
| 5 | speed | speed / max_speed | [0, 1] |

**Output:** Steering in [−1, 1] via tanh, scaled by 1.2× at inference to help the AI commit to turns, then clamped.

**Training enhancements:**
- Gaussian noise (±0.04) added to inputs during training, clamped to [0, 1]
- Graduated turn oversampling: moderate turns (|steer| > 0.15) get 1 extra copy, sharp turns (|steer| > 0.4) get 2 extra copies
- Near-wall oversampling: when leftNear or rightNear < 0.3, sample is duplicated
- Crash oversampling: 15× replay of the last demo frame before a crash

**Inference input clamping:** All inputs clamped to [0, 1] at inference to prevent edge-case instability.

**Confidence metric:** KNN-style — average Euclidean distance to 3 nearest training samples, mapped to [0, 1].

**Throttle controller:** AI throttle was governed by a proportional speed-matching controller targeting the 90th-percentile demonstrated speed, dynamically scaled by forward road clearance to produce natural deceleration before corners without modifying the learned steering policy. Uses raw (unmasked) sensors so ablation doesn't affect throttle behavior.

---

## 5. Complete Session Walkthrough

### Phase 1: Practice (up to 30 seconds)

The student sees a 2D top-down race track with a small car. They drive with arrow keys or WASD to get comfortable. An instruction line says: *"Your car has three sensors: LiDAR, Camera, and Speedometer. Press SPACE when ready."*

### Phase 2: Sensor Introduction (up to 30 seconds)

A full-screen modal shows all three sensors. Each panel has a name and a one-sentence description using real-world analogies (e.g., "LiDAR — Fires side lasers to measure distance to walls").

The "Got it!" button is locked for 8 seconds to ensure participants read the descriptions before they can advance.

### Phase 3: Teach the AI (2 minutes)

The student drives again, but now the game is recording. A "Samples" counter shows progress toward the minimum of 100 demonstration points. The label says *"Phase 1: Teach the AI"* and an instruction reads *"Drive carefully — the AI is learning from you!"*

The AI records sensor readings and steering at 10 Hz, but only when the car is on the track and moving. A smart recording filter prioritizes corner data and rejects near-wall noise and stationary frames. If the student crashes, the last demo frame is replayed 15× for crash-recovery learning.

The phase doesn't end until both 2 minutes have passed **and** at least 100 samples have been recorded.

### Phase 4: Pre-Ablation Ranking (untimed)

Before seeing the AI drive, the student ranks the three sensors by importance. A modal asks: *"Before the AI drives, which sensor do you think it needs most to drive safely?"*

The student clicks sensors in order (1st, 2nd, 3rd). Arrow buttons allow reordering. This is the **pre-test** of the conceptual change measure.

### Phase 5: AI Warmup (45 seconds)

An overlay says: *"The AI learned from [N] moments of your driving. Now watch it try to drive on its own."*

The AI drives with all three sensors active. If the AI can't complete a single lap, the student is sent back for 45 more seconds of driving, then warmup repeats (capped at 3 retries).

### Phase 6: Sensor Experiments (3 minutes, two rounds)

This is the core of the game. An overlay introduces the experiment: *"The AI uses 3 sensors: LiDAR, Camera, and Speedometer. Try turning sensors off to see what happens!"*

**Round 1 (first 90 seconds):** Only LiDAR and Camera can be toggled. The Speedometer button is locked ("Unlocks in Round 2"). This forces every student to experiment with the two most impactful sensors first, producing **dense, comparable data** across all participants.

**Round 2 (last 90 seconds):** A banner announces *"Round 2 — Speedometer is now unlocked."* All three sensors can now be toggled.

**Each experiment follows the POE loop:**
1. Student clicks a sensor to turn it off
2. A prediction modal asks what they think will happen (3 options: Drive fine / Wobble / Crash)
3. They watch for 7 seconds while the AI drives with that sensor disabled
4. The game classifies the outcome (crashed / wobbled / drove fine) and shows it alongside the student's prediction
5. The student turns the sensor back on and tries another

### Phase 7: Post-Ablation Ranking (untimed)

The same ranking widget with a different prompt: *"Now that you've experimented, which sensor does your AI need most to drive safely?"*

This is the **post-test**. The shift between pre and post rankings is the primary measure of conceptual change.

### Phase 8: Done

A final overlay thanks the student. The session's JSON data is automatically exported to a local server in the background, and clicking "Finish & Reset" reloads the game for the next student.

---

## 6. What the Game Measures

### 6.1 Primary Measures

| Measure | What it captures | Where it comes from |
|---|---|---|
| **Prediction accuracy** | Did the student correctly predict what would happen when a sensor was turned off? | Each toggle event records the prediction and the actual outcome |
| **Conceptual change (ranking shift)** | Did the student's beliefs about sensor importance change after experimenting? | Pre-ablation ranking vs. post-ablation ranking (ordered arrays of 3 sensor names) |

### 6.2 Secondary and Exploratory Measures

| Measure | What it captures |
|---|---|
| **Per-sensor prediction accuracy** | Accuracy broken down by LiDAR, Camera, Speedometer — reveals which sensors students understand best |
| **Round 1 vs. Round 2 accuracy** | Whether accuracy improves over the session (learning curve) |
| **Surprise patterns** | Which sensor surprised students most (Q1) and how surprised they were (Q2) |
| **Driving quality** | Average center deviation during the demo phase and crash count — used as covariates |
| **AI confidence** | Confidence values at each toggle event — captures how far the ablated input pushes the AI from known territory |

### 6.3 Data Format

Each session produces a single JSON file (data format v4.0) containing:

- **Session metadata:** participant ID, condition, timestamp, all configuration parameters
- **Frame data (~10 Hz):** car position, sensor values (raw and masked), AI steering and confidence
- **Toggle events:** which sensor, on/off, prediction, outcome, confidence before/after, ablation round, lap position
- **Rankings:** pre and post ablation (ordered arrays of sensor names)
- **Performance:** lap counts, crash counts, demo quality metrics, feasibility metrics

All configuration parameters (outcome window duration, deviation thresholds, sensor ranges, etc.) are embedded in the export for full reproducibility.

---

## 7. Research Hypotheses

Three hypotheses are planned for pre-registration on OSF:

### H1 — LiDAR vs. Camera Prediction Accuracy (Primary)

> Students will predict outcomes less accurately for Camera than for LiDAR, because Camera's effect (gradual drift) is subtler than LiDAR's (immediate crash).

**Rationale:** LiDAR ablation produces a dramatic, unambiguous crash. Camera ablation produces a gradual drift that is harder to classify. Students are expected to over-predict "crash" for Camera when the actual outcome is usually "wobble."

**Data source:** Toggle events from Round 1, where only LiDAR and Camera are available. Every student produces data on both sensors, enabling within-subjects comparison.

### H2 — Ranking Shift (Primary)

> The Kendall tau distance between pre-ablation and post-ablation rankings will be significantly greater than zero.

**Rationale:** Before experimenting, students rank sensors based on intuition. After hands-on experimentation with observable consequences, their rankings should shift — particularly moving LiDAR up and Speedometer down if they initially undervalued spatial awareness.

**Data source:** Pre and post ranking arrays. Kendall tau measures the number of pairwise disagreements between the two orderings.

**Pre-registered ground truth ordering:** LiDAR > Camera > Speedometer (matching the drama gradient from Section 3). Post-ranking alignment with this ordering is measured via Spearman correlation.

### H3 — Speedometer Sensitivity (Secondary)

> Disabling the Speedometer will produce measurably different AI steering behavior (speed sensitivity diff > 0.10), and students will predict Speedometer outcomes less accurately than Camera outcomes in Round 2.

**Rationale:** Speedometer ablation produces subtle wobble that is hard to classify. The MLP demonstrably uses speed as a steering input (validated: sensitivity diff = 0.52), but the effect is visually ambiguous compared to Camera.

**Data source:** Toggle events from Round 2 for Speedometer. Speed sensitivity validated via probe test (0.52, well above 0.10 threshold).

---

## 8. Study Design

### 8.1 Design Type

This is a **design and feasibility study** with pilot data. There is no control condition. The study asks:

1. Can 8th graders complete the full session in ~10 minutes?
2. Do they produce enough toggle events (3+ per student) for meaningful prediction accuracy analysis?
3. Does the pre/post ranking shift capture measurable conceptual change?

Causal learning claims are reserved for a future study with a comparison condition and larger N.

**Feasibility criteria (pre-registered):** The pilot will be considered feasible if: (1) ≥ 80% of students complete the full session within 10 minutes, (2) the median number of toggle events per student is ≥ 3, and (3) the AI completes at least one warmup lap without retry in ≥ 75% of sessions.

### 8.2 Participants

- **Target:** 8th grade students (~13–14 years old)
- **Setting:** Classroom deployment on school computers or Chromebooks
- **Session length:** ~10 minutes per student
- **Data:** Exported JSON file per student, plus optional external pre/post survey keyed by participant ID

### 8.3 Publication Positioning

| Venue | Framing |
|---|---|
| **SIGCSE** (Tools, Experience Reports) | Tool paper describing the system and pilot results |
| **IDC** (Interaction Design and Children) | Design paper focused on the sensor introduction and POE loop |
| **EAAI** (Educational Advances in AI) | AI literacy intervention with transparent ML model |
| **ICER** | Pilot study establishing measures and hypotheses for a larger experiment |

### 8.4 Recommended Analysis

| Analysis | Method |
|---|---|
| Prediction accuracy by sensor | Chi-square or Fisher exact test on correct/incorrect per sensor |
| Ordinal accuracy | Score 2/1/0 (exact match / adjacent / opposite), analyzed with ordinal regression |
| Ranking shift | Kendall tau distance, tested against 0 with exact permutation test (3! = 6 possible orderings) |
| Ranking alignment with ground truth | Spearman correlation of post-ranking with expert ordering |
| Round 1 vs. Round 2 accuracy | Within-subjects paired comparison using McNemar test on correct/incorrect per round |

---

## 9. Design Decisions and Honest Limitations

### 9.1 Why Zero-Substitution Instead of True Feature Removal?

When a student turns off a sensor, the game sets its value to **0** rather than truly removing it from the model. This is technically "input perturbation," not "feature ablation" in the ML sense.

**Why this matters:** Setting LiDAR to 0 tells the AI "walls are touching the car right now," not "I have no information about walls." The AI responds to a false signal rather than the absence of a signal.

**Why we do it anyway:** Zero-substitution produces the most visible behavioral changes, which is essential for engagement and for generating prediction/outcome data with 8th graders. The alternative (mean substitution or marginal integration) produces weaker effects that are harder for students to observe and classify.

**How we frame it:** The prediction prompt says "If the AI **can't use** its [sensor]..." rather than "If you remove [sensor]..." to avoid implying clean feature removal. The concept actually taught — *the AI depends on its inputs, and when an input is disrupted, the AI's behavior changes* — is directionally correct even though the mechanism is technically adversarial perturbation.

### 9.2 Why Two Rounds?

Without round structure, students in pilot testing tended to rush-click through all sensors without carefully observing each one. The two-round design forces focused experimentation:

- **Round 1** locks Speedometer, ensuring every student tests LiDAR and Camera — producing dense, comparable data for H1.
- **Round 2** unlocks Speedometer for exploratory testing.

**Trade-off:** Speedometer data comes only from Round 2, creating an inherent imbalance. Analysis must report rounds separately.

### 9.3 Why an MLP Instead of KNN?

The model is a small MLP (6→64→1) trained via behavior cloning. This was chosen over KNN for several reasons:

- **Better generalization:** MLP learns smooth decision boundaries from limited data. KNN with small K is noisy.
- **Turn learning:** Graduated oversampling of turns and near-wall events teaches the MLP to correct early, which KNN struggles with.
- **Stable inference:** MLP output is deterministic and smooth. KNN can produce jittery steering from input noise.

The model is still transparent enough for the pedagogical goal: students see inputs go in, steering comes out, and when you remove an input the steering changes. The exact mechanism (neural net vs. nearest neighbor) is not the learning target — the concept of **sensor dependency** is.

### 9.4 Track Layout

The track is a stadium oval (rounded rectangle) on a 900×700 canvas, with one chicane (a short S-curve) inserted into the bottom straight. The chicane creates a moment where forward ray distance drops sharply (dramatic Camera ablation effect) and where LiDAR is needed to navigate the S-curve. Each sensor has a distinct impact zone: LiDAR on curves and the chicane, Camera on approach to turns, and Speedometer most consequential on curves where speed affects turning radius. Lap time is roughly 18–22 seconds.

### 9.5 Throttle Separation

AI throttle is governed by a proportional speed-matching controller, **not the learned model**. This design separates steering (learned via MLP) from speed (regulated by controller). The throttle controller uses raw, unmasked sensor values so that disabling sensors does not affect speed — preventing students from predicting outcomes based on speed changes rather than steering changes.

### 9.6 Known Limitations

| Limitation | Mitigation |
|---|---|
| No control condition | Framed as design/feasibility study; causal claims reserved for future work |
| Zero-substitution is not true ablation | Documented in methods; student-facing language is carefully framed |
| Round 2 data is thinner than Round 1 | Report rounds separately; Round 1 tests primary hypothesis |
| No embedded pre/post knowledge test | Can be added via external survey; ranking shift is within-tool measure |
| Outcome threshold (wobble vs. fine) is heuristic | Report sensitivity analysis across multiple thresholds |
| Driving quality varies between students | Demo quality metrics are logged and used as covariates |
| No teacher scaffolding built in | Facilitation guide recommended for deployment |
| MLP is stateless (no memory) | Creates interpretable, consistent failure modes suitable for the study |

---

## 10. Session Timing

| Phase | Duration | Cumulative |
|---|---|---|
| Welcome + Practice | ~30 s | 0:30 |
| Sensor Introduction | ~20 s (most click "Got it!") | 0:50 |
| Teach the AI | 2:00 | 2:50 |
| Pre-Ablation Ranking | ~15 s | 3:05 |
| AI Warmup | 0:45 | 3:50 |
| Sensor Experiments | 3:00 | 6:50 |
| Post-Ablation Ranking | ~15 s | 7:05 |
| Done screen | ~10 s | 7:15 |

**Total: ~7 minutes** for a focused student. With warmup retries (worst case +135 s) and slow readers, budget **10 minutes**.

---

## 11. Summary

NeuroDriver is a 10-minute, browser-based research game that teaches 8th graders how AI uses sensor inputs, what happens when those inputs fail, and why that matters for safety. Students train an AI by driving, and experiment by turning sensors off and predicting consequences. The game logs every interaction in a structured JSON file, supporting three pre-registered hypotheses about prediction accuracy, conceptual change, and sensor-specific understanding. It is designed as a feasibility study and pilot for a larger experiment.

---

## Appendix A: Technical Implementation Summary

### A.1 Technology

Browser-only (HTML5 + Canvas + vanilla JavaScript). No frameworks, no backend. 8 JS files + HTML + CSS. Runs on Chromebooks.

### A.2 AI Model

MLP (6→64→1), ReLU hidden activation, tanh output. He initialization, LR=0.005, 120 epochs, batch training with shuffle. Behavior cloning with graduated turn oversampling and near-wall oversampling. Training noise ±0.04 (clamped). Inference output scaled 1.2× and clamped to [−1, 1].

### A.3 Sensors

| Index | Sensor | Computation |
|---|---|---|
| 0 | LiDAR (leftFar) | Ray at −60° / max ray distance (200px) |
| 1 | LiDAR (leftNear) | Ray at −30° / max ray distance |
| 2 | LiDAR (rightNear) | Ray at +30° / max ray distance |
| 3 | LiDAR (rightFar) | Ray at +60° / max ray distance |
| 4 | Camera (forward) | Ray at 0° / max ray distance |
| 5 | Speedometer | speed / MAX_SPEED (2.3) |

### A.4 Outcome Classification

After a sensor is turned off, a 7-second observation window classifies the result:

1. **Crash** — car left the track at any point during the window
2. **Wobble** — max center deviation exceeded 0.75
3. **Fine** — none of the above

Priority: crash > wobble > fine.

### A.5 Throttle Controller

Proportional speed-matching controller using forward road clearance:

```
forward = sensorsRaw[4]
turnFactor = 1 - forward
curveSlowdown = 1 - 0.6 * pow(turnFactor, 1.5)
targetSpeed = avgDemoSpeed * curveSlowdown
throttle = clamp(speedError * 5, 0, 1)
```

Uses **unmasked** (raw) sensors so that disabling sensors doesn't affect throttle.

### A.6 AI Steering Smoothing

AI steering output is low-pass filtered (α = 0.085) to prevent jitter. When Speedometer is ablated, a slightly higher α (0.12) is used to compensate for the missing speed context.

### A.7 Data Export (v4.0)

Single JSON file per session. Contains: all config parameters, frame-by-frame car/sensor data at ~10 Hz, every toggle event (sensor, prediction, outcome, confidence, round, lap position), rankings (pre and post), crashes, laps, demo quality metrics, feasibility metrics.

### A.8 File Manifest

| File | Role |
|---|---|
| `index.html` | Page structure, canvas, modals, toggle buttons |
| `styles.css` | Visual design |
| `js/track.js` | Track geometry, centerline, collision |
| `js/car.js` | Car physics |
| `js/sensors.js` | 6D sensor computation and visualization |
| `js/knn.js` | MLP model (6→64→1, behavior cloning) |
| `js/gameManager.js` | Phase state machine, ablation logic, throttle controller |
| `js/logger.js` | Data collection and JSON export |
| `js/ui.js` | Overlays, modals, ranking widget, prediction prompts |
| `js/main.js` | Game loop, rendering, initialization |
