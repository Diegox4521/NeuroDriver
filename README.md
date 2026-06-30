# NeuroDriver

Browser-based driving simulator for middle-school AI literacy. Students drive
to generate training data for a small neural network, watch the AI drive, then
probe sensor dependency by disabling LiDAR, camera, and speedometer one at a
time in a Predict–Observe–Explain cycle. No install, no accounts — runs on a
Chromebook.

**Double-blind review copy.** Author and institutional details are omitted here;
see the submission manuscript for the study report.

---

## Run the simulator

**Option A — open locally**

```bash
# From this directory, serve the folder (any static server works):
npx --yes serve .
# Then open http://localhost:3000 (or the URL printed)
```

**Option B — Node dev server**

```bash
npm install
node server.js
```

Open the URL shown in the terminal. The activity self-paces in about 7–10
minutes per student.

---

## Repository layout

| Path | Contents |
|------|----------|
| `index.html`, `js/`, `styles.css`, `assets/` | Simulator (game + in-browser MLP training) |
| `figures/fig_app_screenshot.png` | App screenshot used in the paper |
| `neurodriver_analysis/` | Analysis pipeline, facilitator script, survey instruments |

---

## Analysis package

Reproduces every statistic and figure reported in the paper. See
[`neurodriver_analysis/README.md`](neurodriver_analysis/README.md) for setup.

**Included for reviewers (no raw data):**

- `neurodriver_analysis/outputs/paper_numbers.txt` — claim-to-value crosswalk
- `neurodriver_analysis/outputs/stats_report.json` — all tests as JSON
- `neurodriver_analysis/outputs/figures/` — publication charts

Raw session logs and student survey responses are **not** in this repository
(minors / IRB). The pipeline runs end-to-end when you supply data locally; see
the analysis README.

**Also included:**

- [`neurodriver_analysis/facilitator_script.md`](neurodriver_analysis/facilitator_script.md) — classroom runbook
- [`neurodriver_analysis/survey_instruments/`](neurodriver_analysis/survey_instruments/) — blank pre/post questionnaires
