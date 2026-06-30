"""
run_all.py
==========
End-to-end NeuroDriver analysis pipeline. Single entry point that reproduces
every statistic and figure in the SIGCSE paper.

Usage
-----
    python run_all.py \
        --sessions   data/sessions \
        --pre-survey data/pre_survey.xlsx \
        --post-survey data/post_survey.csv \
        --transcripts data/transcripts \
        --outputs     outputs

Outputs written to --outputs (default ./outputs):
    sessions.csv             — per-student session features
    sessions_with_style.csv  — per-student session features + driving-style archetype
    pre_survey.csv           — parsed pre-survey
    post_survey.csv          — parsed post-survey with composite knowledge score
    merged.csv               — full join: sessions + survey + drive_style
    stats_report.json        — every statistical test reported in the paper
    triangulation.csv        — 8-theme cross-source convergence table
    paper_numbers.txt        — human-readable map of paper claims to computed values
    figures/*.png            — eight publication-quality charts
"""

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd

# Allow running this script either from the repo root or as a module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from neurodriver import (
    parse_sessions,
    parse_surveys,
    parse_transcripts,
    classify_driving,
    compute_stats,
    triangulation,
    make_figures,
)


def _write_paper_numbers(report, triangulation_df, out_path):
    """Human-readable summary mapping every paper claim to its computed value."""
    mc = report.get('mcnemar_q34_q22', {})
    sd = report.get('sensor_drops', {})
    ld = report.get('lidar_dominance', {})
    rk = report.get('ranking_change', {})
    dc = report.get('demo_to_ai_crash_corr', {})
    cs = report.get('composite_score', {})
    convergence = triangulation.convergence_summary(triangulation_df)

    lines = [
        '=== NeuroDriver paper numbers (reproduced) ===',
        '',
        '== COHORT ==',
        f'  Sessions analyzed:        n = {report["cohort"]["n_sessions"]}',
        f'  Post-survey responses:    n = {report["cohort"].get("n_post_survey", "n/a")}',
        f'  Matched pre/post pairs:   n = {report["cohort"].get("n_matched_pre_post", "n/a")}',
        '',
        '== PRE/POST KNOWLEDGE GAIN (matched item Q3.4 -> Q2.2) ==',
        f'  Pre  correct: {mc.get("pre_pct", float("nan")):.1f}%',
        f'  Post correct: {mc.get("post_pct", float("nan")):.1f}%',
        f'  Gain        : {mc.get("gain_pp", float("nan")):.1f} pp',
        f'  McNemar chi^2 = {mc.get("chi2", float("nan")):.3f}, p = {mc.get("p", float("nan")):.4f}',
        '',
        '== SENSOR CONFIDENCE DROPS ==',
        f'  LiDAR       : mean {sd.get("LiDAR",{}).get("mean_drop_pp",float("nan")):.1f} +/- {sd.get("LiDAR",{}).get("std_drop_pp",float("nan")):.1f} pp',
        f'  Camera      : mean {sd.get("Camera",{}).get("mean_drop_pp",float("nan")):.1f} +/- {sd.get("Camera",{}).get("std_drop_pp",float("nan")):.1f} pp',
        f'  Speedometer : mean {sd.get("Speedometer",{}).get("mean_drop_pp",float("nan")):.1f} +/- {sd.get("Speedometer",{}).get("std_drop_pp",float("nan")):.1f} pp',
        '',
        '== LIDAR DOMINANCE ==',
        f'  Students for whom LiDAR removal was largest drop: {ld.get("lidar_dominant_count", "n/a")}/{ld.get("n_cohort", "n/a")} = {ld.get("lidar_dominant_pct", float("nan")):.1f}%',
        '',
        '== RANKING SHIFT ==',
        f'  Changed pre -> post ranking: {rk.get("changed", "n/a")}/{rk.get("n", "n/a")} = {rk.get("rate_pct", float("nan")):.1f}%',
        '',
        '== DEMO CRASHES -> AI CRASHES ==',
        f'  Pearson r = {dc.get("r", float("nan")):.3f}, p = {dc.get("p", float("nan")):.4f}, n = {dc.get("n", "n/a")}',
        '',
        '== COMPOSITE KNOWLEDGE SCORE (post-survey, partial-credit multi-select) ==',
        f'  Mean = {cs.get("mean_pct", float("nan")):.1f}% (sd {cs.get("std_pct", float("nan")):.1f})',
        '',
        '== TRIANGULATION ==',
        f'  Themes total : {convergence["total_themes"]}',
        f'  Strong       : {convergence["strong"]}',
        f'  Moderate     : {convergence["moderate"]}',
        f'  Weak         : {convergence["weak"]}',
    ]

    out_path.write_text('\n'.join(lines), encoding='utf-8')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--sessions', required=True, help='Directory of session JSON logs')
    p.add_argument('--pre-survey', required=True, help='Pre-survey xlsx path')
    p.add_argument('--post-survey', required=True, help='Post-survey csv path')
    p.add_argument('--transcripts', default=None, help='Optional transcripts directory')
    p.add_argument('--outputs', default='outputs', help='Output directory')
    args = p.parse_args()

    out = Path(args.outputs)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'figures').mkdir(parents=True, exist_ok=True)

    print(f'[1/7] Parsing {args.sessions} ...')
    sessions, errors = parse_sessions.parse_session_directory(args.sessions)
    if errors:
        for fn, err in errors:
            print(f'  WARN: {fn}: {err}')
    print(f'      {len(sessions)} sessions parsed')

    print('[2/7] Classifying driving styles ...')
    sessions = classify_driving.classify_driving(sessions)
    sessions.to_csv(out / 'sessions_with_style.csv', index=False)
    print('      drive_style distribution:')
    for k, v in sessions['drive_style'].value_counts().items():
        print(f'        {k:18s} {v}')

    print(f'[3/7] Parsing surveys ...')
    pre = parse_surveys.parse_pre_survey(args.pre_survey)
    post = parse_surveys.parse_post_survey(args.post_survey)
    pre.to_csv(out / 'pre_survey.csv', index=False)
    post.to_csv(out / 'post_survey.csv', index=False)
    print(f'      pre {len(pre)}  post {len(post)}')

    print(f'[4/7] Merging ...')
    merged = parse_surveys.merge_pre_post(pre, post, sessions)
    merged.to_csv(out / 'merged.csv', index=False)
    print(f'      merged {len(merged)}')

    print(f'[5/7] Computing statistics ...')
    report = compute_stats.full_report(
        sessions, post_df=post, merged_df=merged, pre_df=pre
    )
    (out / 'stats_report.json').write_text(
        json.dumps(report, indent=2, default=str), encoding='utf-8'
    )

    print(f'[6/7] Triangulation ...')
    if args.transcripts:
        utterances = parse_transcripts.load_transcripts(args.transcripts)
        coded = parse_transcripts.code_themes(utterances)
        ts = parse_transcripts.theme_summary(coded)
    else:
        ts = {}
    tri = triangulation.triangulate(report, ts, sessions, post_df=post)
    tri.to_csv(out / 'triangulation.csv', index=False)
    print('      ' + str(triangulation.convergence_summary(tri)))

    print(f'[7/7] Generating figures ...')
    figs = make_figures.make_all_figures(sessions, report, out / 'figures')
    for f in figs:
        print(f'      {f.name}')

    _write_paper_numbers(report, tri, out / 'paper_numbers.txt')
    print()
    print(f'Done. Outputs written to: {out.resolve()}')
    print(f'Open {out / "paper_numbers.txt"} for the paper-claim crosswalk.')


if __name__ == '__main__':
    main()
