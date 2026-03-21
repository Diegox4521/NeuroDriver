# Glass Box AI Driver — Research Design & Game Overview

**Document type:** Research design report  
**Purpose:** Describe the game, its pedagogy, session structure, data collection, and research hypotheses so that an evaluator can assess the system as a research intervention  
**Target audience:** Faculty advisors, IRB reviewers, CS education researchers

---

## 1. What Is Glass Box AI Driver?

Glass Box AI Driver is a **browser-based driving game** that teaches 8th-grade students how artificial intelligence works by letting them **train an AI, watch it drive, and then break it on purpose.**

The game takes about **10 minutes** to play. It requires no installation, no accounts, and no internet connection after the page loads. A student opens a URL, plays through a guided sequence, and at the end the game exports a single JSON file containing everything that happened during the session — every prediction the student made, every sensor they turned off, every crash, every reflection answer.

The "glass box" in the name means the AI is **fully transparent**: students can see exactly what inputs the AI uses (four sensors), how confident it is (a visible confidence bar), and what happens when they remove an input. There is no hidden magic. The AI is a simple K-Nearest Neighbors model that copies the student's own driving. When it fails, the student can trace the failure back to a specific sensor they disabled.

The game is designed as a **research instrument** — every design decision serves both a learning goal and a data collection goal. It is framed as a **design and feasibility study** with pilot data, suitable for venues like SIGCSE, IDC, EAAI, or ICER.

---

## 2. What Does It Teach?

### 2.1 Core Learning Goals

The game targets three ideas from the AI4K12 framework:

| AI4K12 Big Idea | What the student learns | How the game teaches it |
|---|---|---|
| **Big Idea 1 — Perception** | AI uses sensors to understand the world | Students see four named sensors (LiDAR, Camera, Thermal, Speedometer) with real-world descriptions |
| **Big Idea 3 — Learning** | AI learns from data (human demonstrations) | Students drive the car, watch the AI copy them, and see "Samples: 47/50" counting up |
| **Big Idea 4 — Societal Impact** | AI failures can have real-world consequences | Turning off the Thermal sensor causes the AI to almost hit a pedestrian; a follow-up ethics question asks *why* this matters |

### 2.2 The Key Insight the Game Produces

After playing, students should be able to answer: **"What happens to an AI when it loses one of its inputs, and why does that matter?"**

This is tested through prediction accuracy (did they correctly guess what would happen?), ranking shift (did their beliefs about which sensor matters most change after experimenting?), and written reflection (can they explain *why* a sensor matters?).

### 2.3 Pedagogical Framework: Predict-Observe-Explain (POE)

Every experiment in the game follows the **Predict-Observe-Explain** cycle from science education:

1. **Predict:** Before turning off a sensor, the student picks what they think will happen (Drive fine / Wobble / Crash / Almost hit the pedestrian)
2. **Observe:** They watch the AI drive without that sensor for 4.5 seconds
3. **Explain:** The game shows their prediction next to the actual result ("You predicted: Drove fine. Result: Crashed. Different than expected."), and at the end of the session a reflection form asks them to explain *why*

This loop runs every time a student turns off a sensor. A student who experiments with all four sensors completes 4+ POE cycles in a single 10-minute session.

---

## 3. The Four Sensors

The AI drives using four inputs. Each one maps to a real self-driving car sensor that students can understand:

| Sensor | What it measures | Real-world analogy | What happens when it's turned off |
|---|---|---|---|
| **LiDAR** | Distance to walls and obstacles | The spinning laser on top of a Waymo car | The AI can't see walls. It usually **crashes immediately**. |
| **Camera** | How far ahead the road is clear (forward / dashcam-style cue) | A forward-facing camera sensing obstacles ahead | That straight-ahead distance cue is removed; the AI often **wobbles** or misjudges what's in front (side rays may still help if LiDAR is on). |
| **Thermal** | Distance to a pedestrian on the track | Infrared cameras for nighttime pedestrian detection | The AI doesn't know the pedestrian is there. It may **almost hit them**. |
| **Speedometer** | How fast the car is going | The dashboard speedometer | The AI drives slightly erratically. It **wobbles a little** but usually doesn't crash. |

These four sensors are deliberately ordered by **how dramatic the effect is** when they're disabled:

- **LiDAR** → High drama (crash)
- **Camera** → Medium drama (drift)
- **Thermal** → Situational drama (near-miss, only near the pedestrian)
- **Speedometer** → Low drama (subtle wobble)

This gradient is important for the research design. Students who think every sensor causes a crash learn otherwise when they test Camera or Speedometer. Students who think no sensor matters learn otherwise when they test LiDAR. The variety of outcomes forces them to form **calibrated, sensor-specific predictions** rather than blanket guesses.

---

## 4. The Pedestrian and the Ethics Dimension

A stationary pedestrian stands on the track — a small orange figure with a pulsing heat ring, positioned on a straight section where the car passes every lap.

The pedestrian serves three purposes:

1. **Grounds the Thermal sensor.** Without the pedestrian, "thermal" is abstract. With it, students can see the orange line from the car to the pedestrian, watch the Thermal value change as the car approaches, and understand intuitively that this sensor is "detecting the person."

2. **Creates a unique outcome category.** When Thermal is turned off, the AI may steer closer to the pedestrian and trigger a "near-miss" event — a visible slowdown, a **"Close call!"** flash near the pedestrian (so the student sees that something happened without reading it as a crash), and a logged incident. This is different from crashing into a wall (LiDAR) or drifting off-center (Camera). The prediction modal for Thermal includes a fourth option: "Almost hit the pedestrian."

3. **Opens an ethics conversation.** If a student toggled the Thermal sensor during the experiment phase, the reflection form shows a conditional fourth question: *"A self-driving car's thermal camera can detect people nearby. Do you think this matters for safety? Explain your thinking."* This is deliberately open-ended — it does not presuppose the answer, allowing students to reason from their own experience. This connects the game to real-world AI safety and aligns with AI4K12 Big Idea 4 (Societal Impact).

The near-miss mechanic is carefully designed: the car always slows down near the pedestrian regardless of whether Thermal is on or off (to avoid an actual "hit"). But when Thermal is off, the AI's *steering* changes because it no longer receives proximity information — it may steer closer to the pedestrian than it would with Thermal on. This is the observable behavioral difference that students notice.

---

## 5. How the AI Works (Non-Technical)

The AI uses the simplest possible machine learning model: **K-Nearest Neighbors (KNN).**

Here is how it works in plain language:

1. **Training phase:** While the student drives, the game records a snapshot every 0.1 seconds: "at this moment, the four sensor readings were [0.8, 0.5, 0.1, 0.6] and the student was steering [0.3 to the right]." After 2 minutes, the game has ~600 of these snapshots.

2. **Driving phase:** When the AI needs to decide how to steer, it looks at the current sensor readings and finds the 4 snapshots from training that are most similar. It averages their steering values. That's the AI's steering decision.

3. **Confidence:** If the 4 closest snapshots are very close (the current situation is very similar to something the student demonstrated), confidence is high. If they're far away (the AI is in unfamiliar territory), confidence is low. This is shown as a visible "AI Certainty" bar.

4. **Ablation:** When a sensor is turned off, its value is set to 0. The AI still looks for its 4 nearest neighbors — but now the distances are distorted because one dimension is forced to an extreme value. The AI finds different neighbors and steers differently. This is the behavioral change students observe.

**Why KNN?** Because it is interpretable. A neural network would be a black box — students couldn't trace a failure back to a specific input. With KNN, the logic is simple enough to explain: "the AI looked for driving moments similar to right now, but with the sensor turned off, 'similar' means something different, so it steered wrong."

---

## 6. Complete Session Walkthrough

This is what a student experiences from start to finish:

### Phase 1: Practice (up to 20 seconds)

The student sees a 2D top-down race track with a small car and a pedestrian on it. They drive with arrow keys to get comfortable. An instruction line at the bottom says: *"Your car has four sensors: LiDAR, Camera, Thermal, and Speedometer. Press SPACE when ready."*

The student can press Space at any time to advance, or the phase auto-advances after 20 seconds.

### Phase 2: Sensor Introduction (up to 30 seconds)

A full-screen modal appears with a **2x2 grid** showing all four sensors. Each panel has an icon, a name, and a one-sentence description using real-world analogies (e.g., "LiDAR — Fires laser pulses to measure distance to walls and obstacles — like the spinning sensor on top of self-driving cars").

A countdown shows "Auto-continues in 28s..." and a "Got it!" button lets the student advance early. This phase ensures every student has been exposed to all four sensor names and descriptions before the AI training begins.

### Phase 3: Teach the AI (2 minutes)

The student drives again, but now the game is recording. A "Samples" counter in the corner shows progress toward the minimum of 50 demonstration points. The label says *"Phase 1: Teach the AI"* and an instruction reads *"Drive carefully — the AI is learning from you!"*

The AI records the student's sensor readings and steering 10 times per second, but only when the car is on the track and moving. If the student crashes frequently, the game also records those crash-adjacent moments (this intentionally preserves the link between how well the student drives and how well the AI performs).

The phase doesn't end until both 2 minutes have passed **and** at least 50 samples have been recorded.

### Phase 4: Pre-Ablation Ranking (untimed)

Before seeing the AI drive, the student ranks the four sensors by importance. A modal asks: *"Before the AI drives, which sensor do you think it needs most to drive safely? Make your best guess before experimenting — there's no right answer yet."*

The student clicks sensors in order. Each click locks that sensor into a numbered position (1st, 2nd, 3rd, 4th). When all four are ranked, the widget auto-submits.

This is the **pre-test** of the conceptual change measure. It captures what the student *believes* before experimentation.

### Phase 5: AI Warmup (15 seconds)

An overlay says: *"The AI learned from [N] moments of your driving. Now watch it try to drive on its own."*

The AI drives with all four sensors active. The student watches. A confidence bar shows how certain the AI is at each moment.

If the AI can't complete a single lap (indicating insufficient training data), the student is sent back for 30 more seconds of driving, then the warmup repeats. This retry loop is capped at 2 attempts to keep the session under 10 minutes.

### Phase 6: Sensor Experiments (3 minutes, two rounds)

This is the core of the game. An overlay introduces the experiment: *"The AI uses 4 sensors: LiDAR, Camera, Thermal (detects the pedestrian), and Speedometer. Try turning sensors off to see what happens!"*

**Round 1 (first 90 seconds):** Only LiDAR and Camera can be toggled. The Thermal and Speedometer buttons are grayed out and say "Unlocks in Round 2." This design forces every student to experiment with the two most impactful sensors first, producing **dense, comparable data** across all participants.

**Round 2 (last 90 seconds):** A banner announces *"Round 2 — Thermal and Speedometer are now available."* All four sensors can now be toggled. Students who already saw LiDAR and Camera naturally move to Thermal and Speedometer.

**Each experiment follows the POE loop:**
1. Student clicks a sensor to turn it off
2. A prediction modal asks what they think will happen (3 options; 4 for Thermal)
3. They watch for 4.5 seconds while the AI drives with that sensor disabled
4. The game classifies the outcome (crashed / almost hit pedestrian / wobbled / drove fine) and shows it alongside the student's prediction
5. The student turns the sensor back on and tries another

During the experiment, toggle buttons are disabled and the confidence bar is hidden to prevent the student from being cued by secondary information.

### Phase 7: Post-Ablation Ranking (untimed)

The same ranking widget appears with a different prompt: *"Now that you've experimented, which sensor does your AI need most to drive safely?"*

This is the **post-test**. The shift between pre and post rankings is the primary measure of conceptual change.

### Phase 8: Reflection (untimed)

A reflection form asks three required questions:

- **Q1:** Which sensor surprised you most? (dropdown: LiDAR / Camera / Thermal / Speedometer / None)
- **Q2:** How surprised were you? (3-point scale: Not / A little / Very)
- **Q3:** Pick one sensor. What information does it give the AI, and what does the AI have to guess without it? (dropdown + free-text)

**Conditional Q4 (ethics probe):** If the student toggled Thermal at any point during the experiment phase, a fourth question appears: *"A self-driving car's thermal camera can detect people nearby. Do you think this matters for safety? Explain your thinking."* This is optional and logged separately.

The student can also click "Skip" to bypass reflection entirely (logged as `skipped: true`).

### Phase 9: Done

A final overlay thanks the student. Clicking "Download Data" saves the complete session as a JSON file.

---

## 7. What the Game Measures

Every interaction is logged. The exported JSON file (one per student) contains:

### 7.1 Primary Measures

| Measure | What it captures | Where it comes from |
|---|---|---|
| **Prediction accuracy** | Did the student correctly predict what would happen when a sensor was turned off? | Each toggle event records the prediction and the actual outcome |
| **Conceptual change (ranking shift)** | Did the student's beliefs about sensor importance change after experimenting? | Pre-ablation ranking vs. post-ablation ranking (ordered arrays of 4 sensor names) |
| **Functional explanation quality** | Can the student explain *why* a sensor matters in mechanistic terms? | Q3 free-text response, coded for mechanistic vs. surface-level understanding |

### 7.2 Secondary and Exploratory Measures

| Measure | What it captures |
|---|---|
| **Per-sensor prediction accuracy** | Accuracy broken down by LiDAR, Camera, Thermal, Speedometer — reveals which sensors students understand best |
| **Round 1 vs. Round 2 accuracy** | Whether accuracy improves over the session (learning curve) |
| **Near-miss frequency** | How often the car almost hits the pedestrian, broken down by whether Thermal was on or off |
| **Ethics response depth** | Length and content of Q4 answers — whether the pedestrian experience generates ethical reasoning |
| **Surprise patterns** | Which sensor surprised students most (Q1) and how surprised they were (Q2) |
| **Driving quality** | Average center deviation during the demo phase and crash count — used as covariates |
| **AI confidence** | Confidence values at each toggle event — captures how far the ablated input pushes the AI from known territory |

### 7.3 Data Format

Each session produces a single JSON file (data format v3.0) containing:

- **Session metadata:** participant ID, condition, timestamp, all configuration parameters
- **Frame data (~10 Hz):** car position, sensor values (raw and masked), AI steering and confidence
- **Toggle events:** which sensor, on/off, prediction, outcome, confidence before/after, ablation round, lap position
- **Near-miss events:** when, where, which sensors were active
- **Rankings:** pre and post ablation (ordered arrays of sensor names)
- **Reflection:** all Q1–Q4 responses
- **Performance:** lap counts, crash counts, demo quality metrics

All configuration parameters (outcome window duration, deviation thresholds, sensor ranges, pedestrian position, etc.) are embedded in the export for full reproducibility.

---

## 8. Research Hypotheses

Four hypotheses are planned for pre-registration on OSF:

### H1 — LiDAR vs. Camera Prediction Accuracy (Primary)

> Students will predict outcomes less accurately for Camera than for LiDAR, because Camera's effect (gradual drift) is subtler than LiDAR's (immediate crash).

**Rationale:** LiDAR ablation produces a dramatic, unambiguous crash. Camera ablation produces a gradual drift that is harder to classify. Students are expected to over-predict "crash" for Camera when the actual outcome is usually "wobble."

**Data source:** Toggle events from Round 1, where only LiDAR and Camera are available. Every student produces data on both sensors, enabling within-subjects comparison.

### H2 — Ranking Shift (Primary)

> The Kendall tau distance between pre-ablation and post-ablation rankings will be significantly greater than zero.

**Rationale:** Before experimenting, students rank sensors based on intuition. After hands-on experimentation with observable consequences, their rankings should shift — particularly moving LiDAR up and Speedometer down if they initially undervalued spatial awareness.

**Data source:** Pre and post ranking arrays. Kendall tau measures the number of pairwise disagreements between the two orderings.

**Pre-registered ground truth ordering:** LiDAR > Camera > Thermal > Speedometer (matching the drama gradient from Section 3). Post-ranking alignment with this ordering is measured via Spearman correlation. This ordering must be pre-registered alongside the hypotheses on OSF; it should not be determined post hoc.

### H3 — Thermal vs. Speedometer Accuracy (Secondary)

> In Round 2, predictions for Thermal will be more accurate than predictions for Speedometer, because Thermal's effect (near-miss) is more salient than Speedometer's (subtle wobble).

**Rationale:** The near-miss event is visually dramatic and has a matching prediction option ("Almost hit the pedestrian"). Speedometer ablation produces ambiguous outcomes that are hard to classify.

**Data source:** Toggle events from Round 2 for Thermal and Speedometer.

### H4 — Ethics Engagement (Exploratory)

> Students who toggled Thermal will provide longer Q4 ethics responses than Q3 functional explanations, indicating that the pedestrian scenario engages ethical reasoning beyond functional understanding.

**Rationale:** The embodied experience of watching the AI nearly hit a pedestrian should motivate deeper engagement with the ethics question than a general "explain this sensor" prompt.

**Data source:** Word count and qualitative coding of Q3 vs. Q4 responses for students who saw Q4 (those who toggled Thermal).

---

## 9. Study Design

### 9.1 Design Type

This is a **design and feasibility study** with pilot data. There is no control condition. The study asks:

1. Can 8th graders complete the full session in ~10 minutes?
2. Do they produce enough toggle events (3+ per student) for meaningful prediction accuracy analysis?
3. Does the pre/post ranking shift capture measurable conceptual change?
4. Does the Thermal sensor and pedestrian successfully engage ethical reasoning?
5. Are the reflection instruments usable (completion rate, response quality)?

Causal learning claims are reserved for a future study with a comparison condition and larger N.

**Feasibility criteria (pre-registered):** The pilot will be considered feasible if: (1) ≥ 80% of students complete the full session within 10 minutes, (2) the median number of toggle events per student is ≥ 3, (3) the reflection completion rate (non-skip) is ≥ 60%, and (4) the AI completes at least one warmup lap without retry in ≥ 75% of sessions. These thresholds will be reported against in the results section, turning the feasibility claim into a falsifiable one.

### 9.2 Participants

- **Target:** 8th grade students (~13–14 years old)
- **Setting:** Classroom deployment on school computers or Chromebooks
- **Session length:** ~10 minutes per student
- **Data:** Exported JSON file per student, plus optional external pre/post survey keyed by participant ID

### 9.3 Publication Positioning

| Venue | Framing |
|---|---|
| **SIGCSE** (Tools, Experience Reports) | Tool paper describing the system and pilot results |
| **IDC** (Interaction Design and Children) | Design paper focused on the sensor introduction, POE loop, and reflection instrument |
| **EAAI** (Educational Advances in AI) | AI literacy intervention with transparent ML model |
| **ICER** | Pilot study establishing measures and hypotheses for a larger experiment |

### 9.4 Recommended Analysis

| Analysis | Method |
|---|---|
| Prediction accuracy by sensor | Chi-square or Fisher exact test on correct/incorrect per sensor |
| Ordinal accuracy | Score 2/1/0 (exact match / adjacent / opposite), analyzed with ordinal regression |
| Ranking shift | Kendall tau distance, tested against 0 with exact permutation test (4! = 24 possible orderings) |
| Ranking alignment with ground truth | Spearman correlation of post-ranking with expert ordering |
| Reflection quality | Qualitative coding of Q3 and Q4 for mechanistic / functional / surface-level |
| Ethics engagement (H4) | Paired comparison of Q3 vs. Q4 word count (Wilcoxon signed-rank) |
| Round 1 vs. Round 2 accuracy | Within-subjects paired comparison using McNemar test on correct/incorrect per round |
| Near-miss by Thermal state | Count of near-miss events when Thermal on vs. off (McNemar or paired proportion) |

---

## 10. Design Decisions and Honest Limitations

### 10.1 Why Zero-Substitution Instead of True Feature Removal?

When a student turns off a sensor, the game sets its value to **0** rather than truly removing it from the model. This is technically "input perturbation," not "feature ablation" in the ML sense.

**Why this matters:** Setting LiDAR to 0 tells the AI "walls are touching the car right now," not "I have no information about walls." The AI responds to a false signal rather than the absence of a signal.

**Note on Thermal's inverted direction:** Thermal is the only sensor where higher values mean greater danger (1 = pedestrian right here, 0 = far away). This is opposite to LiDAR, where higher values mean safety (1 = walls far away). When Thermal is zeroed, the AI receives "pedestrian is far away" and *relaxes* — it stops steering away from the pedestrian, which may cause a near-miss. This is qualitatively different from LiDAR zeroing, where the AI receives "walls everywhere" and *panics*. The result is pedagogically richer: students see that not all sensor failures look the same. One makes the AI reckless, another makes it confused.

**Why we do it anyway:** Zero-substitution produces the most visible behavioral changes, which is essential for engagement and for generating prediction/outcome data with 8th graders. The alternative (mean substitution or marginal integration) produces weaker effects that are harder for students to observe and classify.

**How we frame it:** The prediction prompt says "If the AI **can't use** its [sensor]..." rather than "If you remove [sensor]..." to avoid implying clean feature removal. The concept actually taught — *the AI depends on its inputs, and when an input is disrupted, the AI's behavior changes* — is directionally correct even though the mechanism is technically adversarial perturbation.

**For the methods section:** This should be stated explicitly. The pedagogical distinction is minimal for the target age group but must be documented for reviewers.

### 10.2 Why Two Rounds?

Without round structure, students in pilot testing tended to rush-click through all four sensors without carefully observing each one. The two-round design forces focused experimentation:

- **Round 1** locks Thermal and Speedometer, ensuring every student tests LiDAR and Camera — producing dense, comparable data for H1.
- **Round 2** unlocks the remaining sensors for exploratory testing and the ethics-relevant Thermal experience.

**Trade-off:** Thermal and Speedometer data comes only from Round 2, creating an inherent imbalance. Analysis must report rounds separately.

### 10.3 Why a Static Pedestrian?

A moving pedestrian would be more realistic but creates unpredictable interactions with the KNN — the AI's training data wouldn't reliably include pedestrian avoidance behavior if the pedestrian moves between laps. A static pedestrian at a fixed position on the track means:

- Every student drives past it during training
- The KNN learns a consistent avoidance pattern at that location
- Thermal ablation produces predictable, analyzable effects
- The position is included in the exported data for reproducibility

**Trade-off:** Thermal is only meaningful near the pedestrian's position. Toggle events far from the pedestrian will always produce "fine" outcomes regardless of Thermal state. To cue students to toggle Thermal when the car is near the pedestrian, the Thermal row in the mini-HUD is visually highlighted (orange tint) when its value exceeds 0.4. Analysis should control for the car's lap position at toggle time.

### 10.4 Track Layout

The track is a stadium oval (rounded rectangle) on a 900×700 canvas, with one chicane (a short S-curve) inserted into the bottom straight. The car starts at the bottom-right curve, facing into the lap so that the first straight run leads toward the top straight. The pedestrian is placed at the center of the top straight — the longest uninterrupted section — so students have time to see the Thermal value rise and make a deliberate toggle. The chicane creates a moment where forward LiDAR distance drops sharply (dramatic ablation effect) and where Camera is needed to keep the car centered through the S. Each sensor thus has a distinct zone: LiDAR at the chicane, Camera on the long straights, Thermal on the top straight near the pedestrian, and Speedometer most consequential on the curves. Lap time is roughly 18–22 seconds at current car speed.

### 10.5 Why KNN Instead of a Neural Network?

KNN is chosen for **transparency**, not performance. With KNN, every AI decision can be traced to specific moments from the student's own driving. With a neural network, the AI would be a black box — defeating the "glass box" design principle.

KNN also makes the ablation effect more interpretable: changing one sensor value changes which training moments are "nearest," which changes the steering decision. This chain of causation is simple enough to explain to an 8th grader.

### 10.6 Known Limitations

| Limitation | Mitigation |
|---|---|
| No control condition | Framed as design/feasibility study; causal claims reserved for future work |
| Zero-substitution is not true ablation | Documented in methods; student-facing language is carefully framed |
| Thermal is position-dependent | Analysis controls for lap progress at toggle time |
| Round 2 data is thinner than Round 1 | Report rounds separately; Round 1 tests primary hypothesis |
| Q4 ethics probe has self-selection bias | Only shown to students who toggled Thermal; report proportion who saw Q4 |
| No embedded pre/post knowledge test | Can be added via external survey; ranking shift is within-tool measure |
| Outcome threshold (wobble vs. fine) is heuristic | Report sensitivity analysis across multiple thresholds |
| Driving quality varies between students | Demo quality metrics are logged and used as covariates |
| No teacher scaffolding built in | Facilitation guide recommended for deployment |
| Confidence bar could cue predictions | Hidden during outcome window to reduce this confound |

---

## 11. Session Timing

| Phase | Duration | Cumulative |
|---|---|---|
| Welcome + Practice | ~30 s | 0:30 |
| Sensor Introduction | ~20 s (most click "Got it!") | 0:50 |
| Teach the AI | 2:00 | 2:50 |
| Pre-Ablation Ranking | ~15 s | 3:05 |
| AI Warmup | 0:15 | 3:20 |
| Sensor Experiments | 3:00 | 6:20 |
| Post-Ablation Ranking | ~15 s | 6:35 |
| Reflection | ~60 s | 7:35 |
| Done screen | ~10 s | 7:45 |

**Total: ~8 minutes** for a focused student. With warmup retries (worst case +90 s) and slow readers, budget **10 minutes**.

---

## 12. Summary

Glass Box AI Driver is a 10-minute, browser-based research game that teaches 8th graders how AI uses sensor inputs, what happens when those inputs fail, and why that matters for safety. Students train an AI by driving, experiment by turning sensors off and predicting consequences, and reflect on what they observed — including an ethics question about pedestrian detection. The game logs every interaction in a structured JSON file, supporting four pre-registered hypotheses about prediction accuracy, conceptual change, sensor-specific understanding, and ethical reasoning. It is designed as a feasibility study and pilot for a larger experiment.

---

## Appendix A: Technical Implementation Summary

For developers and reviewers who want implementation-level detail.

### A.1 Technology

Browser-only (HTML5 + Canvas + vanilla JavaScript). No frameworks, no backend. 11 files total. Runs on Chromebooks.

### A.2 AI Model

K-Nearest Neighbors, K=4, 4-dimensional input space [LiDAR, Camera, Thermal, Speedometer], each normalized to [0,1]. Inverse-distance-weighted steering prediction. Confidence = 1 − (avg neighbor distance / max possible distance). K=4 was selected to match the dimensionality of the input space, ensuring the prediction always integrates multiple local examples rather than potentially over-fitting to a single nearest neighbor.

### A.3 Sensors

| Index | Sensor | Computation |
|---|---|---|
| 0 | LiDAR | Average of 3 raycasts (left -90°, right +90°, forward) / max ray distance |
| 1 | Camera | Track center deviation mapped from [-1,1] to [0,1] |
| 2 | Thermal | max(0, 1 − distance_to_pedestrian / 150px) |
| 3 | Speedometer | speed / max_speed |

### A.4 Outcome Classification

After a sensor is turned off, a 4.5-second observation window classifies the result:

1. **Crash** — car left the track at any point during the window
2. **Near-miss** — car came within 35px of the pedestrian
3. **Wobble** — max center deviation exceeded 0.75
4. **Fine** — none of the above

Priority: crash > near_miss > wobble > fine.

When a near-miss is logged, a **"Close call!"** flash is shown at the pedestrian position for 2 seconds (orange badge above the pedestrian), so the student sees the outcome without it reading as a crash. The Thermal row in the mini-HUD is highlighted (orange tint) when its value ≥ 0.4 to cue students to toggle Thermal when the car is near the pedestrian. The three LiDAR rays are labeled on the canvas with a single "LiDAR" text at the ray origin to reinforce one sensor, three rays.

### A.5 Throttle Rule

Throttle uses **unmasked** (raw) sensors so that disabling LiDAR doesn't force a slowdown — preventing students from predicting "slow" based on speed change rather than understanding the sensor. Near the pedestrian, throttle is universally reduced to 30% regardless of Thermal state (safety mechanic, not ablation-dependent).

### A.6 Data Export (v3.0)

Single JSON file per session. Contains: all config parameters, frame-by-frame car/sensor data at ~10 Hz, every toggle event (sensor, prediction, outcome, confidence, round, lap position), rankings (pre and post), reflection (Q1–Q4), crashes, laps, near-miss events, demo quality metrics.

### A.7 File Manifest

| File | Role |
|---|---|
| `index.html` | Page structure, canvas, modals, toggle buttons |
| `styles.css` | Visual design |
| `js/track.js` | Track geometry, centerline, collision |
| `js/car.js` | Car physics |
| `js/pedestrian.js` | Pedestrian entity, distance queries |
| `js/sensors.js` | 4D sensor computation and visualization |
| `js/knn.js` | KNN model (K=4, 4D) |
| `js/gameManager.js` | Phase state machine, ablation logic, near-miss detection |
| `js/logger.js` | Data collection and JSON export |
| `js/ui.js` | Overlays, modals, ranking widget, prediction prompts, reflection form |
| `js/main.js` | Game loop, rendering, initialization |
