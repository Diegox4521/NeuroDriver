"""
compute_stats.py
================
Statistical tests reported in the NeuroDriver paper.

Each function returns a dict with the test statistic, effect size, sample size,
and p-value, so results can be serialized directly to JSON for reproducibility.

Implemented tests:
  * mcnemar_paired       — pre/post matched-item significance test (paper: chi2=5.882, p=0.0153)
  * ranking_change_rate  — % of students whose sensor ranking changed (paper: 71%)
  * kendall_tau_rankings — directional ranking shift via Kendall tau distance
  * lidar_dominance      — % of students for whom LiDAR removal had the largest
                           confidence drop (paper: 88.4%)
  * sensor_drop_summary  — mean/std confidence drop per sensor (paper: LiDAR 25.6 +/- 4.6,
                           Camera 14.4, Speedometer 13.2 +/- 8.7)
  * demo_to_ai_crash_corr  — Pearson r between demo crashes and AI ablation crashes
                              (paper: r=0.39)
  * survey_confidence_corr — Pearson r between AI baseline confidence and composite
                              survey score (paper: r=+0.38)
  * composite_score       — mean composite knowledge score across cohort (paper: 76.5%)
  * conceptual_change_by_failure — change rate broken down by drive_style (paper: 85% Crash-Heavy
                                    vs 59% Fast & Clean)
"""

from itertools import permutations

import numpy as np
import pandas as pd
from scipy import stats


# ============================================================
# McNemar's test (paired binary outcome)
# ============================================================
def mcnemar_paired(pre, post, continuity_correction=True):
    """Paired McNemar's test on a binary item.

    Parameters
    ----------
    pre, post : 1-D iterables of {0, 1, NaN}
    continuity_correction : if True, use the standard (|b-c|-1)^2/(b+c) form
                            preferred for small samples.

    Returns
    -------
    dict with chi2, p, n, b (pre-correct -> post-wrong), c (pre-wrong -> post-correct),
    and the 2x2 contingency.
    """
    pre = pd.Series(pre).reset_index(drop=True)
    post = pd.Series(post).reset_index(drop=True)
    valid = pre.notna() & post.notna()
    pre = pre[valid].astype(int)
    post = post[valid].astype(int)

    a = int(((pre == 1) & (post == 1)).sum())  # both correct
    b = int(((pre == 1) & (post == 0)).sum())  # regressed
    c = int(((pre == 0) & (post == 1)).sum())  # gained
    d = int(((pre == 0) & (post == 0)).sum())  # both wrong

    if (b + c) == 0:
        chi2_stat = 0.0
        p = 1.0
    else:
        if continuity_correction:
            chi2_stat = (abs(b - c) - 1) ** 2 / (b + c)
        else:
            chi2_stat = (b - c) ** 2 / (b + c)
        p = 1.0 - stats.chi2.cdf(chi2_stat, df=1)

    return {
        'test': 'McNemar (continuity-corrected)' if continuity_correction else 'McNemar',
        'chi2': float(chi2_stat),
        'p': float(p),
        'n': int(valid.sum()),
        'pre_correct_post_wrong': b,
        'pre_wrong_post_correct': c,
        'both_correct': a,
        'both_wrong': d,
        'pre_pct': float(pre.mean() * 100) if len(pre) else float('nan'),
        'post_pct': float(post.mean() * 100) if len(post) else float('nan'),
        'gain_pp': float((post.mean() - pre.mean()) * 100) if len(pre) else float('nan'),
    }


# ============================================================
# Sensor ranking analyses
# ============================================================
def _parse_rank(rank_str):
    """'LiDAR > Camera > Speedometer' -> ['LiDAR','Camera','Speedometer']."""
    if not rank_str or pd.isna(rank_str):
        return []
    return [p.strip() for p in str(rank_str).split('>')]


def ranking_change_rate(df):
    """Percent of students whose pre/post sensor ranking changed."""
    d = df.dropna(subset=['pre_rank', 'post_rank'])
    d = d[(d['pre_rank'] != '') & (d['post_rank'] != '')]
    changed = (d['pre_rank'] != d['post_rank']).sum()
    return {
        'n': len(d),
        'changed': int(changed),
        'rate_pct': float(100.0 * changed / len(d)) if len(d) else float('nan'),
    }


def kendall_tau_distance(rank_a, rank_b):
    """Kendall tau distance (number of pairwise inversions) between two rankings."""
    a = list(rank_a)
    b = list(rank_b)
    if set(a) != set(b) or len(a) != len(b):
        return float('nan')
    dist = 0
    n = len(a)
    pos_b = {item: i for i, item in enumerate(b)}
    for i in range(n):
        for j in range(i + 1, n):
            if pos_b[a[i]] > pos_b[a[j]]:
                dist += 1
    return dist


def kendall_tau_rankings(df, ground_truth=('LiDAR', 'Camera', 'Speedometer')):
    """Mean Kendall tau distance from pre to post and from post to ground truth.

    Returns alignment with the expert ordering and an exact-permutation test
    against the null that ranking-shift direction is random.
    """
    d = df.dropna(subset=['pre_rank', 'post_rank'])
    d = d[(d['pre_rank'] != '') & (d['post_rank'] != '')]
    pre_taus = []
    post_taus = []
    pre_post_taus = []
    for _, row in d.iterrows():
        pre = _parse_rank(row['pre_rank'])
        post = _parse_rank(row['post_rank'])
        if len(pre) == 3 and len(post) == 3:
            pre_taus.append(kendall_tau_distance(pre, ground_truth))
            post_taus.append(kendall_tau_distance(post, ground_truth))
            pre_post_taus.append(kendall_tau_distance(pre, post))

    if not pre_post_taus:
        return {'n': 0}

    # Exact permutation test for whether mean pre-to-post tau differs from
    # the expected value under random ordering (3! = 6 permutations).
    all_orderings = list(permutations(ground_truth))
    expected_mean = np.mean([
        kendall_tau_distance(p, q) for p in all_orderings for q in all_orderings
    ])

    return {
        'n': len(pre_post_taus),
        'mean_pre_tau_to_truth': float(np.mean(pre_taus)),
        'mean_post_tau_to_truth': float(np.mean(post_taus)),
        'mean_pre_to_post_tau': float(np.mean(pre_post_taus)),
        'expected_random_tau': float(expected_mean),
        'shift_toward_truth_pp': float(100.0 * (np.mean(pre_taus) - np.mean(post_taus)) / 3),
    }


def lidar_dominance(df):
    """% of students for whom LiDAR removal produced the largest confidence drop.

    Paper figure: 88.4% = 61/69 (denominator is full cohort, not just students
    with non-NaN drops).
    """
    if len(df) == 0:
        return {'n': 0}

    def winner(row):
        drops = {
            'LiDAR': row.get('lidar_drop', np.nan),
            'Camera': row.get('camera_drop', np.nan),
            'Speedometer': row.get('speedo_drop', np.nan),
        }
        drops = {k: v for k, v in drops.items() if not (isinstance(v, float) and np.isnan(v))}
        if not drops:
            return None
        return max(drops, key=drops.get)

    winners = df.apply(winner, axis=1)
    counts = winners.value_counts()
    lidar_count = int(counts.get('LiDAR', 0))
    return {
        'n_cohort': len(df),
        'n_with_data': int(winners.notna().sum()),
        'lidar_dominant_count': lidar_count,
        'lidar_dominant_pct': float(100.0 * lidar_count / len(df)),
        'distribution': counts.to_dict(),
    }


def sensor_drop_summary(df):
    """Mean and std of per-sensor confidence drop, plus percentage of students
    showing a positive drop (i.e., AI got worse without that sensor).
    """
    out = {}
    for sensor, col in (('LiDAR', 'lidar_drop'),
                        ('Camera', 'camera_drop'),
                        ('Speedometer', 'speedo_drop')):
        s = df[col].dropna()
        out[sensor] = {
            'n': int(len(s)),
            'mean_drop_pp': float(s.mean() * 100),
            'std_drop_pp': float(s.std() * 100),
            'pct_positive': float(100.0 * (s > 0).mean()),
            'pct_negative': float(100.0 * (s < 0).mean()),
        }
    return out


# ============================================================
# Correlations
# ============================================================
def _pearson(x, y):
    s = pd.DataFrame({'x': x, 'y': y}).dropna()
    if len(s) < 3:
        return {'r': float('nan'), 'p': float('nan'), 'n': len(s)}
    r, p = stats.pearsonr(s['x'], s['y'])
    return {'r': float(r), 'p': float(p), 'n': int(len(s))}


def demo_to_ai_crash_corr(df):
    """Pearson r between human demo crash count and AI ablation crash count.
    Paper figure: r=0.39, p<0.01.
    """
    return _pearson(df['demo_crashes'], df['ai_ablation_crashes'])


def survey_confidence_corr(df):
    """Pearson r between AI baseline confidence and composite survey score.
    Paper figure: r=+0.38.
    Requires the merged dataframe with both baseline_conf and survey_total_pct.
    """
    if 'survey_total_pct' not in df.columns or 'baseline_conf' not in df.columns:
        return {'r': float('nan'), 'p': float('nan'), 'n': 0,
                'note': 'requires merged sessions+survey dataframe'}
    return _pearson(df['baseline_conf'], df['survey_total_pct'])


# ============================================================
# Composite & subgroup scores
# ============================================================
def composite_score(post_df):
    """Mean composite knowledge score across the cohort. Paper: 76.5%."""
    s = post_df['survey_total_pct'].dropna()
    return {
        'n': int(len(s)),
        'mean_pct': float(s.mean()),
        'std_pct': float(s.std()),
        'median_pct': float(s.median()),
    }


def conceptual_change_by_style(merged_df):
    """Ranking-change rate broken down by drive_style.

    Paper figure: 85% Crash-Heavy versus 59% Fast & Clean.
    Requires drive_style and ranking_changed columns.
    """
    if 'drive_style' not in merged_df.columns or 'ranking_changed' not in merged_df.columns:
        return {}
    out = {}
    for style, sub in merged_df.groupby('drive_style'):
        out[style] = {
            'n': int(len(sub)),
            'changed': int(sub['ranking_changed'].sum()),
            'rate_pct': float(100.0 * sub['ranking_changed'].mean()),
        }
    return out


def changers_vs_nonchangers_ttest(merged_df):
    """T-test comparing composite survey scores of Changers vs Non-Changers."""
    if 'ranking_changed' not in merged_df.columns or 'survey_total_pct' not in merged_df.columns:
        return {}
    
    changers = merged_df[merged_df['ranking_changed'] == True]['survey_total_pct'].dropna()
    non_changers = merged_df[merged_df['ranking_changed'] == False]['survey_total_pct'].dropna()
    
    if len(changers) < 2 or len(non_changers) < 2:
        return {}
        
    t_stat, p_val = stats.ttest_ind(changers, non_changers, equal_var=False)
    
    # Calculate Cohen's d
    n1, n2 = len(changers), len(non_changers)
    v1, v2 = changers.var(ddof=1), non_changers.var(ddof=1)
    pooled_sd = np.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2))
    cohens_d = (changers.mean() - non_changers.mean()) / pooled_sd
    
    return {
        'changers': {
            'n': int(n1),
            'mean_pct': float(changers.mean()),
            'std_pct': float(changers.std())
        },
        'non_changers': {
            'n': int(n2),
            'mean_pct': float(non_changers.mean()),
            'std_pct': float(non_changers.std())
        },
        't_stat': float(t_stat),
        'p_val': float(p_val),
        'cohens_d': float(cohens_d),
        'df': float(n1 + n2 - 2)
    }


# ============================================================
# Master report
# ============================================================
def full_report(sessions_df, post_df=None, merged_df=None, pre_df=None):
    """Run every test and return a single nested dict, suitable for JSON dump."""
    report = {
        'cohort': {
            'n_sessions': int(len(sessions_df)),
        },
        'sensor_drops': sensor_drop_summary(sessions_df),
        'lidar_dominance': lidar_dominance(sessions_df),
        'ranking_change': ranking_change_rate(sessions_df),
        'kendall_tau': kendall_tau_rankings(sessions_df),
        'demo_to_ai_crash_corr': demo_to_ai_crash_corr(sessions_df),
    }

    if post_df is not None:
        report['composite_score'] = composite_score(post_df)
        report['cohort']['n_post_survey'] = int(len(post_df))

    if pre_df is not None and post_df is not None:
        matched = pre_df.merge(post_df, on='pid', how='inner')
        report['cohort']['n_matched_pre_post'] = int(len(matched))
        report['mcnemar_q34_q22'] = mcnemar_paired(
            matched['pre_q34_correct'], matched['q22_correct']
        )

    if merged_df is not None:
        report['survey_confidence_corr'] = survey_confidence_corr(merged_df)
        report['conceptual_change_by_style'] = conceptual_change_by_style(merged_df)
        report['changers_vs_nonchangers_ttest'] = changers_vs_nonchangers_ttest(merged_df)

    return report
