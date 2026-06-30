# NeuroDriver Pre-Survey (Instrument)

Administered before the activity (with assent/consent). Items below are the
ones used by the analysis pipeline: three attitude rating items (Q2.2–Q2.4),
one free-text item (Q2.5), and ten knowledge items (Q3.2–Q3.11). The matched
knowledge item is **Q3.4** (matched to post-survey Q2.2). Correct answers are
marked **(correct)**; this file contains no student responses.

---

## Attitude items *(5-point Likert; not scored right/wrong)*

Scale for each: Strongly disagree · Somewhat disagree · Neither agree nor
disagree · Somewhat agree · Strongly agree

- **Q2.2** — I believe AI has the potential to positively impact our daily lives.
- **Q2.3** — I am worried about bias in how AI systems make decisions.
- **Q2.4** — I am excited about the possibilities that AI could bring to different careers.

## Free text

- **Q2.5** — Complete the sentence: "If I were to explain Artificial
  Intelligence to someone who has never heard of it, I would describe it as…"
  *(open response)*

---

## Knowledge items

### Q3.2 — Imbalanced training data *(multi-select scenario)*
You are teaching a robot to recognize animals using 100 turtle photos and only
5 panda photos, so it over-predicts "turtle." Which trick would help it spot
the 5 pandas the most?

- Delete the turtle photos.
- Ignore the pandas: just let the robot keep looking at turtles and hope it eventually figures it out.
- **Make the pandas more important by giving it "extra points". (correct)**
- Stop the robot. Turn it off so it doesn't have to learn anything else.

### Q3.3 — What helps an AI improve most?
- **Clear examples with correct answers (correct)**
- Ignoring mistakes
- Random guessing

### Q3.4 — How an AI learns *(matched to post Q2.2)*
How does an AI learn to perform a task like driving?

- A programmer writes rules for every possible situation the AI might encounter
- The AI downloads information from the internet and uses it to make decisions
- The AI tries completely random actions with no examples or feedback until something works
- **The AI watches examples of the task being performed and learns patterns from them (correct)**

### Q3.5 — Decision tree: NEED or WANT? *(refers to a decision-tree figure)*
- NEED
- **WANT (correct)**

### Q3.6 — Which is NOT a principle of Responsible AI?
- Accountability
- Fairness
- **Friendly (correct)**
- Privacy
- Transparency

### Q3.7 — What must happen before an AI can classify correctly?
- The AI already knows everything and just applies its built-in knowledge
- **The AI must be trained using examples or data first (correct)**
- The AI only guesses and never learns from examples
- The AI understands food the same way humans do, so it doesn't need training

### Q3.8 — Who is better at playing games, AI or human?
- A Human.
- An AI bot.
- **It depends on how much the AI is trained (correct)**
- Not sure.

### Q3.9 — Robot cleaning algorithm *(refers to an algorithm figure)*
- Nothing; robots do not understand the concept of Randomness
- **Until the room is clean, the robot will continually move forward or backward randomly, and turn randomly (correct)**
- Until the room is clean, the robot will find the dirty spots and navigate towards them
- Until the room is clean, the robot will move in a pre-determined pattern to systematically clean the room

### Q3.10 — Rock-Paper-Scissors first moves
How would an AI decide its first few moves against you?

- It already knows the best strategy to win
- It copies whatever move the player played
- **It randomly picks moves until it collects enough data from the player (correct)**

### Q3.11 — What are rules made of?
- **Conditions and actions (correct)**
- Inputs and rewards
- Rewards and conditions
- Sensors and goals

---

## Scoring note

The ten Q3.x knowledge items feed an ancillary `pre_knowledge_pct` field and
are **not** reported individually in the paper; only **Q3.4** (the matched item,
paired with post Q2.2) is used in a reported statistic. Answer keys live in
`parse_surveys.PRE_KNOWLEDGE_KEY`.
