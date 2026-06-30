# NeuroDriver Post-Activity Survey (Instrument)

Administered immediately after the NeuroDriver rotation. Seven items: four
scored knowledge items (Q2.1, Q2.4, Q2.6, Q2.7) that form the composite
knowledge score, one matched knowledge item (Q2.2, matched to pre-survey
Q3.4), one sensor-importance ranking (Q2.3), and one open free-text item
(Q2.5). Correct answers are marked **(correct)**; this file contains no
student responses.

---

### Q2.1 — Distance-sensor failure *(multi-select: "Select all that apply")*
A self-driving car is driving down the road when its distance sensor suddenly
stops working. What would most likely happen?

- It would drive faster than usual
- **It would have trouble avoiding walls and obstacles (correct)**
- It would stop immediately and refuse to move
- Nothing would change. The car would drive the same as before

### Q2.2 — How an AI learns *(single-select; matched to pre Q3.4)*
How does an AI learn to perform a task like driving?

- A programmer writes rules for every possible situation the AI might encounter
- The AI downloads information from the internet and uses it to make decisions
- The AI tries completely random actions with no examples or feedback until something works
- **The AI watches examples of the task being performed and learns patterns from them (correct)**

### Q2.3 — Most important sensor *(single-select; not scored as right/wrong)*
After experimenting with the sensors, which sensor did you find was most
important for the AI to drive safely?

- Camera
- LiDAR  *(expert answer; used for ranking-convergence analysis, not knowledge scoring)*
- Speedometer
- They were all equally important

### Q2.4 — Thermal-sensor real-world reasons *(multi-select: "Select all that apply")*
Which of the following are real-world reasons why a self-driving car might
need a thermal sensor?

- To check whether the car needs an oil change
- **To detect pedestrians who might step into the road (correct)**
- **To identify living things that cameras might miss (correct)**
- To measure how hot the engine is running
- **To sense people in low-visibility conditions like fog or darkness (correct)**

### Q2.5 — Free text *(open response; manually tiered, not multiple choice)*
You trained the AI by driving the car yourself. How do you think the way you
drove affected how the AI behaved?

*Open-ended. Coded with the Tier 0–3 rubric described in the paper
(`parse_surveys._tier_q25`).*

### Q2.6 — Thermal sensor disabled *(single-select)*
A self-driving car's thermal sensor is disabled. A pedestrian is standing near
the edge of the road but not blocking it. What is the most likely consequence?

- Nothing will change because the pedestrian is not in the road
- The car will drive faster to get past the pedestrian quickly
- **The car will not slow down or adjust its path near the pedestrian (correct)**
- The car will stop completely until the sensor is repaired

### Q2.7 — Why test individual sensor failure *(multi-select: "Select all that apply")*
Why is it important for engineers to test what happens when individual sensors
on a self-driving car fail?

- **To design backup systems for when sensors stop working (correct)**
- To make the car drive faster in normal conditions
- **To predict how the car will behave in real-world failure situations (correct)**
- To reduce the cost of manufacturing the car
- **To understand which sensors are most critical for safety (correct)**

---

**Scoring.** Multi-select items (Q2.1, Q2.4, Q2.7) use partial credit:
`(correct_picks − wrong_picks) / |correct_set|`, clipped to [0, 1]. The
composite knowledge score is the mean of Q2.1, Q2.4, Q2.6, and Q2.7. Q2.2 is
scored exact-match and matched against pre-survey Q3.4 for the McNemar test.
See `neurodriver/parse_surveys.py` for the canonical answer keys.
