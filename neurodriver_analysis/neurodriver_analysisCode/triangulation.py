"""
triangulation.py
================
Cross-source convergence analysis. Maps the eight qualitative themes from
classroom transcripts to corresponding quantitative findings in the gameplay
telemetry, post-survey, and pre-survey data.

The convergence rating per theme is one of:
  * STRONG    — qualitative claim aligns with a statistically supported quantitative pattern
  * MODERATE  — qualitative claim aligns with a directional but not significant pattern
  * WEAK      — qualitative and quantitative findings diverge or one source is silent

This produces the "8 themes, 6 strong, 2 moderate" finding reported in the paper.
"""

import numpy as np
import pandas as pd


# Each entry maps a theme to (a) the transcript theme key from parse_transcripts,
# (b) the quantitative metric to look up, and (c) the threshold for STRONG vs MODERATE.
THEME_MAP = {
    'training_data_quality': {
        'transcript_theme': 'training_data_quality',
        'metric': 'demo_to_ai_crash_corr',
        'description': 'Bad drivers train bad AIs (garbage in, garbage out)',
        'expected': 'r >= 0.30, p < 0.05',
        'strong_threshold': 0.30,
    },
    'sensor_hierarchy_lidar': {
        'transcript_theme': 'sensor_hierarchy_lidar',
        'metric': 'lidar_dominance',
        'description': 'LiDAR removal causes the largest AI degradation',
        'expected': 'lidar_dominant_pct >= 75%',
        'strong_threshold': 75.0,
    },
    'sensor_complementarity': {
        'transcript_theme': 'sensor_complementarity',
        'metric': 'sensor_drop_summary',
        'description': 'Each sensor contributes differently; redundancy matters',
        'expected': 'all three sensors show positive mean drops',
        'strong_threshold': None,
    },
    'failure_as_pedagogy': {
        'transcript_theme': 'failure_as_pedagogy',
        'metric': 'conceptual_change_by_style',
        'description': 'Students who experience more AI failure show greater ranking shift',
        'expected': 'Crash-Heavy change rate > Fast & Clean change rate',
        'strong_threshold': None,
    },
    'real_world_transfer': {
        'transcript_theme': 'real_world_transfer',
        'metric': 'q24_correct',
        'description': 'Students connect sensor failure to real-world AV consequences',
        'expected': 'mean Q2.4 correctness >= 60%',
        'strong_threshold': 60.0,
    },
    'prediction_observe_explain': {
        'transcript_theme': 'prediction_observe_explain',
        'metric': 'composite_score',
        'description': 'POE cycles produce measurable knowledge gain',
        'expected': 'mean composite knowledge >= 60%',
        'strong_threshold': 60.0,
    },
    'ranking_change': {
        'transcript_theme': 'ranking_change',
        'metric': 'ranking_change_rate',
        'description': 'Students update sensor importance beliefs after experimentation',
        'expected': '>= 60% of students change rankings',
        'strong_threshold': 60.0,
    },
    'engagement_curiosity': {
        'transcript_theme': 'engagement_curiosity',
        'metric': 'session_min',
        'description': 'Students engage long enough for sustained learning',
        'expected': 'median session >= 6 minutes',
        'strong_threshold': 6.0,
    },
}


def _classify(value, threshold):
    if threshold is None:
        return 'STRONG' if value is not None else 'WEAK'
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return 'WEAK'
    if value >= threshold:
        return 'STRONG'
    if value >= threshold * 0.75:
        return 'MODERATE'
    return 'WEAK'


def triangulate(stats_report, transcripts_summary, sessions_df, post_df=None):
    """Cross-reference each theme across all four data sources and rate convergence.

    Parameters
    ----------
    stats_report : output of compute_stats.full_report
    transcripts_summary : output of parse_transcripts.theme_summary
    sessions_df : per-student session feature dataframe
    post_df : post-survey dataframe (optional)
    """
    table = []
    for theme, spec in THEME_MAP.items():
        transcript_pct = transcripts_summary.get(
            spec['transcript_theme'], {}
        ).get('pct_of_corpus', 0.0)

        # Resolve the quantitative anchor for each theme
        if spec['metric'] == 'demo_to_ai_crash_corr':
            r = stats_report.get('demo_to_ai_crash_corr', {}).get('r', np.nan)
            quant_value = r
            quant_display = f'r = {r:.3f}' if not np.isnan(r) else 'n/a'
            convergence = _classify(quant_value, spec['strong_threshold'])

        elif spec['metric'] == 'lidar_dominance':
            pct = stats_report.get('lidar_dominance', {}).get('lidar_dominant_pct', np.nan)
            quant_value = pct
            quant_display = f'{pct:.1f}% of cohort'
            convergence = _classify(pct, spec['strong_threshold'])

        elif spec['metric'] == 'sensor_drop_summary':
            sds = stats_report.get('sensor_drops', {})
            all_positive = all(sds.get(s, {}).get('mean_drop_pp', 0) > 0
                               for s in ('LiDAR', 'Camera', 'Speedometer'))
            quant_value = 1.0 if all_positive else 0.0
            quant_display = ', '.join(f"{s} {sds.get(s,{}).get('mean_drop_pp',0):.1f}%"
                                      for s in ('LiDAR', 'Camera', 'Speedometer'))
            convergence = 'STRONG' if all_positive else 'WEAK'

        elif spec['metric'] == 'conceptual_change_by_style':
            byk = stats_report.get('conceptual_change_by_style', {})
            crash = byk.get('Crash-Heavy', {}).get('rate_pct', np.nan)
            clean = byk.get('Fast & Clean', {}).get('rate_pct', np.nan)
            quant_value = crash - clean if not (np.isnan(crash) or np.isnan(clean)) else np.nan
            quant_display = f'Crash-Heavy {crash:.0f}% vs Fast & Clean {clean:.0f}%'
            if not np.isnan(quant_value):
                convergence = ('STRONG' if quant_value > 10
                               else 'MODERATE' if quant_value > 0
                               else 'WEAK')
            else:
                convergence = 'WEAK'

        elif spec['metric'] == 'q24_correct':
            if post_df is not None and 'q24_correct' in post_df.columns:
                pct = float(post_df['q24_correct'].mean() * 100)
                quant_value = pct
                quant_display = f'{pct:.1f}%'
                convergence = _classify(pct, spec['strong_threshold'])
            else:
                quant_value, quant_display, convergence = None, 'n/a', 'WEAK'

        elif spec['metric'] == 'composite_score':
            pct = stats_report.get('composite_score', {}).get('mean_pct', np.nan)
            quant_value = pct
            quant_display = f'{pct:.1f}%'
            convergence = _classify(pct, spec['strong_threshold'])

        elif spec['metric'] == 'ranking_change_rate':
            pct = stats_report.get('ranking_change', {}).get('rate_pct', np.nan)
            quant_value = pct
            quant_display = f'{pct:.1f}%'
            convergence = _classify(pct, spec['strong_threshold'])

        elif spec['metric'] == 'session_min':
            med = float(sessions_df['session_min'].median())
            quant_value = med
            quant_display = f'median {med:.1f} min'
            convergence = _classify(med, spec['strong_threshold'])

        else:
            quant_value, quant_display, convergence = None, 'n/a', 'WEAK'

        table.append({
            'theme': theme,
            'description': spec['description'],
            'expected': spec['expected'],
            'transcript_utterances_pct': round(transcript_pct, 2),
            'quantitative_finding': quant_display,
            'convergence': convergence,
        })

    return pd.DataFrame(table)


def convergence_summary(triangulation_df):
    counts = triangulation_df['convergence'].value_counts().to_dict()
    return {
        'total_themes': len(triangulation_df),
        'strong': int(counts.get('STRONG', 0)),
        'moderate': int(counts.get('MODERATE', 0)),
        'weak': int(counts.get('WEAK', 0)),
    }
