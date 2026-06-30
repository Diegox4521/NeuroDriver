"""
classify_driving.py
===================
Classifies each student's demonstration-phase driving into one of five archetypes:

  * Crash-Heavy       — many demo crashes (>= cohort 75th percentile)
  * Boom-or-Bust      — high steering extremes + low center deviation when in lane
  * Wavy/Oscillating  — high steering reversal rate (>= cohort 75th percentile)
  * Mostly Straight   — low absolute steering, low reversal rate
  * Fast & Clean      — high speed, low crashes, low center deviation (default)

The classifier consumes the dataframe produced by parse_sessions.parse_session_directory()
and returns the same dataframe with a new `drive_style` column.

Thresholds are computed as cohort-relative quantiles so the classifier remains
calibrated regardless of the participant pool.
"""

import numpy as np
import pandas as pd


def _q(series, q):
    """Robust quantile that handles NaN."""
    s = series.dropna()
    if len(s) == 0:
        return float('nan')
    return float(s.quantile(q))


def classify_driving(df):
    """Add a `drive_style` column to the per-student dataframe.

    Parameters
    ----------
    df : pandas.DataFrame
        Output of parse_session_directory(). Must contain:
        demo_crashes, mean_abs_steer, reversal_rate, center_dev,
        extreme_pct, near_zero_pct, full_speed_pct, avg_demo_speed.

    Returns
    -------
    pandas.DataFrame
        Same frame with an added `drive_style` column.
    """
    df = df.copy()

    crash_threshold = _q(df['demo_crashes'], 0.75)
    reversal_threshold = _q(df['reversal_rate'], 0.75)
    extreme_threshold = _q(df['extreme_pct'], 0.75)
    nearzero_threshold = _q(df['near_zero_pct'], 0.75)
    speed_threshold = _q(df['avg_demo_speed'], 0.6)
    center_dev_low = _q(df['center_dev'], 0.5)

    styles = []
    for _, row in df.iterrows():
        crashes = row.get('demo_crashes', 0) or 0
        rev_rate = row.get('reversal_rate', 0) or 0
        extreme = row.get('extreme_pct', 0) or 0
        near_zero = row.get('near_zero_pct', 0) or 0
        speed = row.get('avg_demo_speed', 0) or 0
        cdev = row.get('center_dev', 1) or 1

        # Priority 1: Crash-Heavy
        if crashes >= max(crash_threshold, 8):
            styles.append('Crash-Heavy')
            continue
        # Priority 2: Wavy/Oscillating
        if rev_rate >= reversal_threshold:
            styles.append('Wavy/Oscillating')
            continue
        # Priority 3: Boom-or-Bust (lots of extreme inputs combined with crashes)
        if extreme >= extreme_threshold and crashes >= 4:
            styles.append('Boom-or-Bust')
            continue
        # Priority 4: Mostly Straight (steering held near zero most of the time)
        if near_zero >= nearzero_threshold:
            styles.append('Mostly Straight')
            continue
        # Default: Fast & Clean
        styles.append('Fast & Clean')

    df['drive_style'] = styles
    return df


def style_summary(df):
    """Return a per-style aggregate dataframe for paper tables / figures."""
    cols = ['demo_crashes', 'ai_ablation_crashes', 'lidar_drop',
            'camera_drop', 'speedo_drop', 'baseline_conf',
            'mean_abs_steer', 'reversal_rate', 'center_dev']
    cols = [c for c in cols if c in df.columns]
    summary = df.groupby('drive_style')[cols].mean(numeric_only=True)
    summary['n'] = df.groupby('drive_style').size()
    return summary.reset_index()


if __name__ == '__main__':
    import sys
    sys.path.insert(0, '.')
    from neurodriver.parse_sessions import parse_session_directory
    sessions_dir = sys.argv[1] if len(sys.argv) > 1 else 'data/sessions'
    df, _ = parse_session_directory(sessions_dir)
    df = classify_driving(df)
    print(df.drive_style.value_counts())
    print()
    print(style_summary(df).to_string())
