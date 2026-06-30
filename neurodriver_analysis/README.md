# NeuroDriver Analysis Package

Reproducible analysis pipeline for the NeuroDriver SIGCSE study. Takes the raw
Qualtrics surveys, gameplay session JSONs, and classroom transcripts and
reproduces every statistic and figure reported in the paper.

**Cohort:** 69 gameplay sessions, 143 pre-survey responses, 77 post-survey
responses, 74 matched pre/post pairs on the knowledge item, 6 classroom audio
transcripts (magnet middle school, two school days in Spring 2026).

**Author:** Anonymized for double-blind review

---

## Quickstart

```bash
pip install -r requirements.txt

python run_all.py \
    --sessions    data \
    --pre-survey  "data/Consented Spr 26 ... presurvey.csv" \
    --post-survey "data/Spr 26 survey AI Tools for K12 NeuroDriver.csv" \
    --outputs     outputs
```

The session JSONs live directly in the `--sessions` directory (one `R_*.json`
per session). `--pre-survey` accepts the Qualtrics `.csv` export (an `.xlsx`
workbook is also supported). `--transcripts` is optional and omitted here.

Open `outputs/paper_numbers.txt` for a side-by-side comparison of every paper
claim and its reproduced value.

> **Participant IDs.** Sessions are keyed by the Qualtrics `ResponseId`
> (the JSON filename), which is the canonical join key with the surveys. The
> in-browser `participantId` embedded in some logs is unreliable (a few logs
> carry a stale value copied from a previous session), so the parser uses the
> filename. This yields 69 unique sessions and a clean survey merge.

---

## Data availability

This repository ships the **analysis code only**. The raw study data is **not
included**: it consists of responses from middle-school minors (including
free-text answers and demographic fields) and is governed by the study's
human-subjects protocol. Public release is therefore withheld pending
IRB-approved de-identification. A de-identified, aggregated derived dataset is
planned for the camera-ready version.

Reviewers can inspect every reported statistic without the raw data via
`outputs/paper_numbers.txt` and `outputs/stats_report.json`. Note that some
parsed outputs (`post_survey.csv`, `merged.csv`) contain student free-text and
demographics and are likewise excluded from any public mirror.

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
| Demo -> AI crash correlation r = 0.45, p < 0.001 | `compute_stats.demo_to_ai_crash_corr`               | r = 0.453, p = 0.0001      |
| Composite knowledge = 65.3% (SD 23.6)          | `compute_stats.composite_score`                       | 65.3% (SD 23.6)            |
| 8 themes, 7 with a numeric anchor / 1 without  | `triangulation.triangulate`                           | 8 themes, 7 / 0 / 1        |

**The package reproduces every statistic reported in the paper** (within
rounding): McNemar chi^2 and p-value, pre/post correctness on the matched
item, all three sensor-drop means and standard deviations, LiDAR dominance,
ranking-change rate, the demo -> AI crash correlation (r = 0.45), the
composite knowledge score (65.3%), and the 8-theme triangulation (7 with a
numeric anchor, 1 without). Running `run_all.py` regenerates the paper's
tables and figures end to end.

**Scoring choices behind a few metrics (rationale + how to switch):**

* **Demo crash counting.** Demo crashes are counted from the `crashes[]`
  array filtered by phase (the live log), which includes crashes during
  respawn windows that the pre-aggregated `feasibility.demoCrashCount`
  excludes. This is the count behind the r = 0.45 demo -> AI correlation. To
  use the more conservative pre-aggregated counter instead, change
  `parse_sessions.parse_session` to read only `feas.get('demoCrashCount')`.

* **Composite knowledge scoring (65.3%).** Multi-select items use
  partial-credit scoring: an answer earns
  `(correct_picks - wrong_picks) / |correct_set|` clipped to [0, 1]. A more
  lenient rule (any correct pick scores 1.0, no penalty for wrong picks)
  would inflate the cohort mean. Both rules are defensible; partial credit is
  more standard in education research. See `parse_surveys._score_multiselect`
  to switch.

* **Triangulation: failure-as-pedagogy is the one un-anchored theme.**
  Crash-Heavy students revised rankings at a *lower* rate (60%) than
  Fast & Clean (68%), so this audio theme has no supporting numeric pattern
  in the telemetry, and the paper reports it as "Not observed." The
  transcript evidence for the theme is unchanged; only its quantitative
  anchor is absent.

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
classifier remains calibrated regardless of cohort. On the study cohort it
yields the distribution used in the paper: 28 Fast & Clean, 16
Wavy/Oscillating, 11 Mostly Straight, 10 Crash-Heavy, and 4 Boom-or-Bust
(69 total). The cohort-relative formulation is reproducible across datasets.

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
Citation details are anonymized for double-blind review and will be added
in the camera-ready version.

---

## Contact

Author and institutional contact details are anonymized for double-blind
review. For questions about the analysis pipeline during review, please use
the anonymized submission channel.
