# NeuroDriver — Facilitator Script

A classroom-ready guide for running one NeuroDriver rotation. The activity
targets AI4K12 Big Idea 3 (Learning from Data): students generate training
data by driving, watch an AI they trained drive on its own, then probe what it
relies on by disabling sensors one at a time in a Predict–Observe–Explain (POE)
cycle. Designed for a ~10-minute station; total session self-paces in about
7–8 minutes on task.

---

## Before the session (setup)

- **No install, no accounts.** NeuroDriver runs entirely in the browser and
  works on a Chromebook. Open the page and you are ready.
- **Stations.** In our trial we ran three concurrent driving stations. One
  device per student.
- **Privacy.** No data leaves the device unless a student explicitly exports
  it. If you are collecting telemetry for research, follow your own IRB/consent
  process.
- **Audio (optional).** If you record station audio for analysis, announce it
  and follow consent procedures.

---

## Session flow (7 timed phases + 2 student-paced rankings)

The simulator advances automatically on a 7-minute timer; the two ranking
steps are student-paced.

| # | Phase | Time | What the student does |
|---|-------|------|------------------------|
| 1 | Practice | 30 s | Free driving to get used to the controls. |
| 2 | Sensor intro | 30 s | Animated overlay shows each sensor's reading (LiDAR, camera, speedometer). |
| 3 | Human demo | 120 s | Student drives laps; every frame is logged as labeled training data. |
| 4 | AI warmup | 45 s | The model trained from the student's demo drives autonomously. |
| 5 | **Pre-ablation ranking** | student-paced | Drag the three sensors most- to least-important. |
| 6 | Ablation rounds | 180 s | Student toggles sensors on/off, predicting then observing each outcome. |
| 7 | **Post-ablation ranking** | student-paced | Re-rank the three sensors after experimenting. |

**The POE cycle lives in the toggle.** For each sensor the student turns off,
the tool forces a prediction — *Drive fine, Wobble, or Crash* — then shows the
observed result and reconciles the two. A typical student completes five to
seven of these predict→observe cycles.

What each ablation tends to look like (so you know what students are seeing):
- **LiDAR off** → immediate crashes (as if walls are touching the car).
- **Camera off** → gradual drift (loss of forward clearance).
- **Speedometer off** → subtle wobble (loss of velocity context); effect varies
  by how the student drove.

---

## The one prompt that matters

After ablation, ask the free-text question exactly as written, with **no
scaffolding, framing, or example**:

> **"How do you think the way you drove affected the AI?"**

In our trial this single unscaffolded prompt drew out students' own causal
theories. Resist the urge to hint.

---

## Do / Don't for facilitators

**Do**
- Keep prompts unscaffolded and let students predict before each toggle.
- Use the two rankings as **discussion seeds**, not assessments ("What made you
  move LiDAR up?").
- Give **Crash-Heavy drivers** extra attention — when the AI was already
  unstable at warmup, the ablation contrast is harder to notice, and these
  students revised their rankings least often.
- Bridge the **confidence-readout gap**: students fixate on visible failure
  (wobble/crash) and largely ignore the on-screen AI-confidence number. Point
  it out during the debrief and connect "the car broke" to "the input stopped
  looking like your training data."

**Don't**
- Don't supply the explanation for them. In particular, **do not say
  "garbage in, garbage out"** — in our trial that framing emerged from the
  students themselves, and handing it over short-circuits the reasoning.
- Don't teach the network internals or weights. The point is the link between
  the data the student supplied and what the model can do — keep that visible
  and leave the math out.

---

## Quick debrief (1–2 minutes)

1. Ask which sensor turned out to matter most and why (most students converge
   on LiDAR after ablation).
2. Connect their own demo to the AI's behavior: more crashes while training
   tended to mean more crashes when the AI drove.
3. Name the mechanism the student just felt ("the AI only knew what you showed
   it") — this debrief is the step most likely to turn a noticed contrast into
   durable understanding.

---

## Adapting to other settings

- **General / less-selective cohorts:** budget **12–15 minutes**, consider
  adding light scaffolding to the free-text prompt (pilot it first), and end
  with a short whole-class discussion.
- **Larger groups:** the rankings gate gameplay, so they make natural
  checkpoints; use them to pace a full class.
