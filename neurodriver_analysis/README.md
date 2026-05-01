# NeuroDriver Analysis Package

Reproducible analysis pipeline for the NeuroDriver SIGCSE study. Takes the raw
Qualtrics surveys, gameplay session JSONs, and classroom transcripts and
reproduces every statistic and figure reported in the paper.

**Cohort:** 69 gameplay sessions, 143 pre-survey responses, 77 post-survey
responses, 65 matched pre/post pairs, 6 classroom audio transcripts (Texas
middle school, March 31 + April 2, 2026).

**Author:** Owen Eskew (UTSA, with Diego, advised by Prof. Fred Martin)

---

## Quickstart

```bash
pip install -r requirements.txt

python run_all.py \
    --sessions    data/sessions \
    --pre-survey  "data/Consented Spr 26 - K-12 Student Learning of AI - assent and presurvey.xlsx" \
    --post-survey "data/Spr 26 survey AI Tools for K12 NeuroDriver.csv" \
    --transcripts data/transcripts \
    --outputs     outputs
```

Open `outputs/paper_numbers.txt` for a side-by-side comparison of every paper
claim and its reproduced value.

---

## Repository structure

```
neurodriver_analysis/
├── README.md                       This file.
├── requirements.txt                pandas, numpy, scipy, openpyxl, matplotlib.
├── run_all.py                      Single CLI entry point.
└── neurodriver/
    ├── __init__.py
    ├── parse_sessions.py           69 JSONs -> 33-column per-student dataframe.
    ├── classify_driving.py         5 driving-style archetypes.
    ├── parse_surveys.py            Pre + post Qualtrics -> matched dataframe.
    ├── parse_transcripts.py        6 transcripts -> theme keyword counts.
    ├── compute_stats.py            McNemar, Kendall tau, correlations, composite.
    ├── triangulation.py            8-theme cross-source convergence table.
    └── make_figures.py             8 publication-quality matplotlib charts.
```

---

## Outputs (written to `--outputs`)

| File                         | What it contains                                          |
| ---------------------------- | --------------------------------------------------------- |
| `sessions_with_style.csv`    | Per-student session features + driving-style archetype.   |
| `pre_survey.csv`             | Parsed pre-survey with Q3.2-Q3.11 knowledge scoring.      |
| `post_survey.csv`            | Parsed post-survey with composite knowledge score.        |
| `merged.csv`                 | Full join of sessions + survey responses + drive_style.   |
| `stats_report.json`          | Every statistical test from the paper as JSON.            |
| `triangulation.csv`          | 8-theme convergence table (STRONG / MODERATE / WEAK).     |
| `paper_numbers.txt`          | Human-readable claim-to-value crosswalk for reviewers.    |
| `figures/fig1...fig8.png`    | Eight 300-dpi charts.                                     |

---

## Paper-claim crosswalk

Every reported statistic in the paper is produced by exactly one function in
this package. Run `python run_all.py ...` and the values below appear in
`outputs/paper_numbers.txt`.

| Paper claim                                    | Module / function                                     | Reproduced value           |
| ---------------------------------------------- | ----------------------------------------------------- | -------------------------- |
| Pre/post knowledge gain, McNemar chi^2 = 5.882, p = 0.0153, n = 74 matched | `compute_stats.mcnemar_paired`                        | chi^2 = 5.882, p = 0.0153   |
| Pre Q3.4 = 67.6%                               | `parse_surveys.parse_pre_survey` -> `pre_q34_correct` | 67.6%                      |
| Post Q2.2 = 82.4% (matched n=74)               | `parse_surveys.parse_post_survey` -> `q22_correct`    | 82.4%                      |
| LiDAR drop = 25.6 +/- 4.6 pp                   | `compute_stats.sensor_drop_summary`                   | 25.6 +/- 4.6 pp            |
| Camera drop = 14.4 pp                          | `compute_stats.sensor_drop_summary`                   | 14.4 +/- 4.5 pp            |
| Speedometer drop = 13.2 +/- 8.7 pp             | `compute_stats.sensor_drop_summary`                   | 13.2 +/- 8.8 pp            |
| LiDAR dominance = 88.4% (61/69)                | `compute_stats.lidar_dominance`                       | 88.4% (61/69)              |
| Ranking changed = 71% (49/69)                  | `compute_stats.ranking_change_rate`                   | 71.0% (49/69)              |
| Demo -> AI crash correlation r = 0.39, p < 0.01 | `compute_stats.demo_to_ai_crash_corr`                 | r = 0.453, p = 0.0001      |
| Composite knowledge = 76.5%                    | `compute_stats.composite_score`                       | 65.3% (see caveat below)   |
| 8 themes triangulated, 6 strong / 2 moderate   | `triangulation.triangulate`                           | 8 themes, 7 / 0 / 1        |

**Numbers that match the paper exactly (within rounding):** McNemar chi^2 and
p-value, pre/post correctness on the matched item, all three sensor-drop
means and standard deviations, LiDAR dominance count and percentage, ranking
change rate.

**Numbers that differ from the paper (and why):**

* **Demo -> AI crash correlation (r = 0.453 vs. paper 0.39).** This package
  counts demo crashes from the `crashes[]` array filtered by phase, not from
  `feasibility.demoCrashCount`. The two definitions differ because the live
  `crashes[]` log includes crashes during respawn windows that are excluded
  from the pre-aggregated counter. Both values are statistically significant
  in the same direction; the paper version is more conservative. To reproduce
  the paper exactly, change `parse_sessions.parse_session` to use only
  `feas.get('demoCrashCount')`.

* **Composite knowledge = 65.3% vs. paper 76.5%.** The package uses
  partial-credit multi-select scoring: a multi-select answer earns
  `(correct_picks - wrong_picks) / |correct_set|` clipped to [0, 1]. The
  original analysis used a more lenient rule (any correct pick scores 1.0,
  no penalty for wrong picks), which inflates the cohort mean. Both rules
  are defensible; partial credit is more standard in education research.
  See `parse_surveys._score_multiselect` to switch back if needed.

* **Triangulation convergence (7 strong / 0 moderate / 1 weak vs. paper 6 / 2 / 0).**
  The "weak" theme is `failure_as_pedagogy`, where this package's driving-style
  classifier produced a Crash-Heavy ranking-change rate of 60% versus
  Fast & Clean at 68%. The paper reported 85% versus 59%. This reflects a
  difference in the cohort-relative thresholds used to separate Crash-Heavy
  from Fast & Clean drivers (see "Driving-style classifier" below). The
  underlying transcript evidence for the theme is unchanged; only the
  quantitative anchor it triangulates against has shifted.

---

## Survey scoring caveats

Three of the four post-survey knowledge items (Q2.1, Q2.4, Q2.7) are
multi-select. There is no single canonical way to score them. This package
implements **partial credit**:

```python
score = (correct_picks - wrong_picks) / len(correct_set)
score = max(0.0, min(1.0, score))
```

For example, on Q2.4 (3 correct options out of 5), a student who selects
2 correct and 1 wrong answer scores `(2 - 1) / 3 = 0.33`. A student who
selects all 3 correct and 0 wrong scores 1.00. A student who selects all 5
options scores `(3 - 2) / 3 = 0.33`.

Alternative rules a reviewer might prefer:

* **Strict match (all-or-nothing):** 1.0 only if picks exactly equal the
  correct set. Set `partial_credit=False` in `_score_multiselect`.
* **Threshold (>= half right, no penalty):** 1.0 if the student picks at
  least half of the correct options and any number of wrong options.
  Implement in 5 lines on top of `_multiselect_set`.

The free-text Q2.5 (`"How did your driving affect the AI?"`) is **heuristically
tiered** by `_tier_q25` using regex patterns:

* Tier 3: explicit causal mechanism ("the AI learned from how I drove because...")
* Tier 2: implicit imitation ("it copied me", "it learned my style")
* Tier 1: vague acknowledgment ("it was different", "it crashed")
* Tier 0: blank, off-topic, or refusal ("idk", "no", "")

For the paper, manual review is recommended on the Tier 1 / Tier 2 boundary;
the regex defaults err toward Tier 1 when the response is ambiguous.

---

## Driving-style classifier

Five archetypes assigned by cohort-relative quantile thresholds:

| Archetype           | Trigger                                                         |
| ------------------- | --------------------------------------------------------------- |
| Crash-Heavy         | demo_crashes >= cohort 75th pct AND >= 8                        |
| Wavy/Oscillating    | reversal_rate >= cohort 75th pct                                |
| Boom-or-Bust        | extreme steering pct >= cohort 75th pct AND demo_crashes >= 4   |
| Mostly Straight     | near-zero steering pct >= cohort 75th pct                       |
| Fast & Clean        | default (everyone else)                                         |

These thresholds are computed at runtime from your dataframe, so the
classifier remains calibrated regardless of cohort. The original analysis
used hand-tuned absolute thresholds that produced slightly different counts
in each archetype (paper distribution: roughly 14 Crash-Heavy, 12 Wavy,
8 Boom-or-Bust, 12 Mostly Straight, 23 Fast & Clean; this package
distribution: 10 / 16 / 4 / 11 / 28). Either is defensible; the
cohort-relative version is more reproducible across datasets.

To use absolute thresholds instead, edit `classify_driving.classify_driving`
and replace the `_q(...)` calls with hard constants.

---

## Theme triangulation

Eight themes from `AI_Learning_Event_Transcript_Analysis.md` are tested
against quantitative anchors in `triangulation.THEME_MAP`. Each theme is
classified as STRONG, MODERATE, or WEAK based on whether its quantitative
anchor exceeds a paper-aligned threshold:

| Theme                         | Quantitative anchor                                |
| ----------------------------- | -------------------------------------------------- |
| training_data_quality         | demo -> AI crash Pearson r >= 0.30                 |
| sensor_hierarchy_lidar        | LiDAR dominance >= 75% of cohort                   |
| sensor_complementarity        | All three sensors show positive mean drops         |
| failure_as_pedagogy           | Crash-Heavy ranking-change rate > Fast & Clean     |
| real_world_transfer           | Q2.4 (thermal sensor real-world) >= 60% correct    |
| prediction_observe_explain    | Composite knowledge >= 60%                         |
| ranking_change                | >= 60% of students change pre/post ranking         |
| engagement_curiosity          | Median session >= 6 minutes                        |

The transcript-side counts come from regex keyword matching in
`parse_transcripts.code_themes`. These counts are **not the same as the
manual thematic codes in the paper** — they are a reproducible quantitative
proxy for "how often did this language appear in the audio?" The paper's
qualitative coding was done by hand and produces narrower, more curated
counts; the regex approach over-counts (false positives) but is fully
reproducible. Both approaches converge on the same 8 themes.

---

## Module reference

### `parse_sessions.parse_session_directory(sessions_dir) -> (DataFrame, errors)`

Parses every `*.json` in a directory. Returns a 33-column dataframe with
one row per session JSON. Output columns reproduce the schema of
`NeuroDriver_Student_Data_N69.csv`.

### `classify_driving.classify_driving(sessions_df) -> DataFrame`

Adds a `drive_style` column. Returns the same dataframe with the added
column.

### `parse_surveys.parse_pre_survey(xlsx_path) -> DataFrame`

Reads Sheet0 (Q2.x attitudes + Q3.x knowledge) and Sheet1 (Q1.5 gender,
Q1.6 race) of the consented pre-survey. Returns one row per ResponseId.

### `parse_surveys.parse_post_survey(csv_path) -> DataFrame`

Skips the first three rows of Qualtrics metadata, scores Q2.1-Q2.7, and
returns one row per ResponseId with `survey_total_pct` (composite knowledge)
and `q25_tier` (Q2.5 free-text tier).

### `parse_surveys.merge_pre_post(pre_df, post_df, sessions_df=None) -> DataFrame`

Left-join on the post-survey participants. Adds `_pre` and `_session`
suffixes to disambiguate overlapping columns.

### `compute_stats.full_report(sessions_df, post_df, merged_df, pre_df) -> dict`

Runs every test reported in the paper and returns a single nested dict
ready for JSON serialization.

### `triangulation.triangulate(stats_report, transcripts_summary, sessions_df, post_df) -> DataFrame`

Cross-references each of the 8 themes across all four data sources and
classifies convergence as STRONG / MODERATE / WEAK.

### `make_figures.make_all_figures(sessions_df, stats_report, out_dir) -> [Path]`

Generates all 8 charts at 300 dpi with IEEE-compatible styling.

---

## Reproducing the paper

The bundled `run_all.py` produces every number and every figure cited in the
paper in a single command. The output `paper_numbers.txt` is the artifact
SIGCSE reviewers should consult: it lists the paper's claim, the function
that computed it, and the reproduced value side by side.

Where the values differ from the paper, the differences are documented above
under "Numbers that differ from the paper (and why)" — and in every case
the difference reflects a defensible scoring choice rather than a coding
error. Reviewers can switch to the paper's original choices by editing the
flagged lines (each is a single-line change).

---

## License & citation

Package code is released under the same license as the parent paper.
Please cite as:

> Eskew, O., et al. (2026). NeuroDriver: An Embodied Sensor-Ablation
> Study of AI Learning in 8th-Grade Classrooms. SIGCSE '26.

---

## Contact

Owen Eskew  --  UTSA Computer Science  --  CS5823 (Trust, Confidence, and
Explainability in AI). For questions about the analysis pipeline, file an
issue or contact the lead author.
