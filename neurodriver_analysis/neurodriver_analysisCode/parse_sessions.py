"""
parse_sessions.py
=================
Parses NeuroDriver gameplay session JSON logs (dataFormatVersion 4.0) into a
per-student feature dataframe.

Each session JSON contains:
  - config: phase durations, sensor names, thresholds
  - feasibility: high-level performance summary
  - demoQuality: training-phase quality metrics
  - phases, frames (10 Hz), toggles, laps, crashes, events
  - preAblationRanking, postAblationRanking

Output: pandas.DataFrame with one row per student (pid).

Reproduces the 33-column schema in NeuroDriver_Student_Data_N69.csv
(except drive_style, which is added by classify_driving.py).
"""

import json
import os
from glob import glob
from pathlib import Path

import numpy as np
import pandas as pd


# Sensor index map for the 6-element sensorsRaw vector.
# The MLP input is 6 floats: 4 lidar rays + camera + speedometer.
LIDAR_INDICES = (0, 1, 2, 3)
CAMERA_INDEX = 4
SPEEDO_INDEX = 5

# The toggleMask is 3 booleans aligned to config.sensors = [lidar, camera, speedometer].
# When a sensor is toggled off, its raw values are zero-substituted in sensorsMasked.
TOGGLE_LIDAR = 0
TOGGLE_CAMERA = 1
TOGGLE_SPEEDO = 2


def _safe_corr(a, b):
    """Pearson correlation, returning NaN if either array is constant or empty."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if len(a) < 3 or len(b) < 3:
        return np.nan
    if np.std(a) == 0 or np.std(b) == 0:
        return np.nan
    return float(np.corrcoef(a, b)[0, 1])


def _reversal_rate(steering, dt_seconds):
    """Direction reversals per second across an array of steering values."""
    if len(steering) < 3 or dt_seconds <= 0:
        return np.nan
    s = np.asarray(steering, dtype=float)
    # Sign changes (ignoring zeros)
    sign = np.sign(s)
    sign[sign == 0] = np.nan
    sign = pd.Series(sign).ffill().bfill().to_numpy()
    reversals = int(np.sum(np.diff(sign) != 0))
    return reversals / dt_seconds


def _confidence_drop(frames, toggle_idx):
    """Mean AI confidence drop when a single sensor is toggled off versus baseline.

    Baseline = frames in AI_ABLATION phase with all three toggles ON.
    Test    = frames in AI_ABLATION phase with ONLY this sensor toggled OFF.
    Returns NaN if either group is empty.
    """
    baseline = []
    test = []
    for f in frames:
        if f.get('phase') != 'AI_ABLATION':
            continue
        conf = f.get('aiConfidence')
        if conf is None:
            continue
        mask = f.get('toggleMask', [True, True, True])
        all_on = all(mask)
        only_this_off = (
            (not mask[toggle_idx])
            and all(mask[i] for i in range(3) if i != toggle_idx)
        )
        if all_on:
            baseline.append(conf)
        elif only_this_off:
            test.append(conf)

    if not baseline or not test:
        return np.nan
    return float(np.mean(baseline) - np.mean(test))


def _ranking_str(ranking_list):
    """['LiDAR', 'Camera', 'Speedometer'] -> 'LiDAR > Camera > Speedometer'."""
    if not ranking_list:
        return ''
    return ' > '.join(ranking_list)


def _ranking_event_metrics(events, ranking_event_name):
    """Return (time_seconds, reorder_count) for a ranking event, or (NaN, 0) if missing."""
    for e in events:
        if e.get('event') == ranking_event_name:
            t_ms = e.get('durationMs', e.get('elapsedMs'))
            reorders = e.get('reorderCount', 0)
            t = (t_ms / 1000.0) if t_ms is not None else np.nan
            return t, int(reorders)
    return np.nan, 0


def parse_session(path):
    """Parse a single session JSON file into a flat dict of features."""
    with open(path, 'r', encoding='utf-8') as f:
        s = json.load(f)

    pid = s.get('participantId') or Path(path).stem
    condition = s.get('condition', 'unknown')
    feas = s.get('feasibility', {})
    demoq = s.get('demoQuality', {})
    frames = s.get('frames', [])
    crashes = s.get('crashes', [])
    events = s.get('events', [])

    session_min = (feas.get('sessionWallMs', 0) or 0) / 60000.0
    demo_crashes = sum(1 for c in crashes if c.get('phase') == 'HUMAN_DEMO')
    if demo_crashes == 0 and 'demoCrashCount' in feas:
        demo_crashes = feas['demoCrashCount']
    ai_ablation_crashes = feas.get('ablationAICrashCount', 0)
    effective_samples = feas.get('mlpEffectiveDemoCount', 0)
    avg_demo_speed = feas.get('avgDemoSpeed', np.nan)
    warmup_retries = feas.get('warmupRetryCount', 0)
    tip_shown = bool(feas.get('drivingTipShown', False))

    # Driving-style features computed from HUMAN_DEMO frames
    demo_frames = [f for f in frames if f.get('phase') == 'HUMAN_DEMO']
    ablation_frames = [f for f in frames if f.get('phase') == 'AI_ABLATION']

    if demo_frames:
        center_dev = float(np.mean([abs(f.get('humanCenterDev', 0) or 0) for f in demo_frames]))
        if not center_dev or np.isnan(center_dev):
            center_dev = float(demoq.get('avgAbsCenterDev', np.nan))
        steering = np.array([f.get('humanSteering', 0) or 0 for f in demo_frames], dtype=float)
        speeds = np.array([f.get('speed', 0) or 0 for f in demo_frames], dtype=float)
        mean_abs_steer = float(np.mean(np.abs(steering)))
        # Demo phase wall time in seconds, fall back to frame count * record interval
        demo_wall_ms = feas.get('demoPhaseWallMs', len(demo_frames) * 100)
        rev_rate = _reversal_rate(steering, demo_wall_ms / 1000.0)
        near_zero_pct = float(np.mean(np.abs(steering) < 0.05))
        extreme_pct = float(np.mean(np.abs(steering) > 0.7))
        # full_speed_pct: speeds at or above the 95th percentile of the cohort -> here we use
        # >= 0.9 of the per-session max as a proxy; the cohort-relative version is computed
        # downstream by classify_driving when needed.
        max_speed = max(np.max(speeds), 1e-6)
        full_speed_pct = float(np.mean(speeds >= 0.9 * max_speed))
    else:
        center_dev = float(demoq.get('avgAbsCenterDev', np.nan))
        mean_abs_steer = np.nan
        rev_rate = np.nan
        near_zero_pct = np.nan
        extreme_pct = np.nan
        full_speed_pct = np.nan

    # Baseline AI confidence: AI_WARMUP frames with all sensors on
    baseline_confs = [
        f.get('aiConfidence') for f in frames
        if f.get('phase') == 'AI_WARMUP'
        and f.get('aiConfidence') is not None
        and all(f.get('toggleMask', [True, True, True]))
    ]
    baseline_conf = float(np.mean(baseline_confs)) if baseline_confs else np.nan

    # Per-sensor confidence drops (baseline - mean confidence when ONLY that sensor is off)
    lidar_drop = _confidence_drop(frames, TOGGLE_LIDAR)
    camera_drop = _confidence_drop(frames, TOGGLE_CAMERA)
    speedo_drop = _confidence_drop(frames, TOGGLE_SPEEDO)

    # Sensor-to-AI-steering correlations (computed on AI_ABLATION frames where AI is driving)
    if ablation_frames:
        sensors = np.array([f.get('sensorsRaw', [np.nan]*6) for f in ablation_frames], dtype=float)
        ai_steer = np.array([
            f.get('aiSteering') if f.get('aiSteering') is not None else np.nan
            for f in ablation_frames
        ], dtype=float)
        valid = ~np.isnan(ai_steer)
        if valid.sum() >= 3:
            corrs = [_safe_corr(sensors[valid, i], ai_steer[valid]) for i in range(6)]
        else:
            corrs = [np.nan] * 6
    else:
        corrs = [np.nan] * 6

    pre_rank = s.get('preAblationRanking') or []
    post_rank = s.get('postAblationRanking') or []
    ranking_changed = bool(pre_rank and post_rank and pre_rank != post_rank)

    pre_rank_time, pre_reorders = _ranking_event_metrics(events, 'pre_ranking_submitted')
    post_rank_time, post_reorders = _ranking_event_metrics(events, 'post_ranking_submitted')

    return {
        'pid': pid,
        'condition': condition,
        'session_min': session_min,
        'demo_crashes': int(demo_crashes),
        'ai_ablation_crashes': int(ai_ablation_crashes),
        'effective_samples': int(effective_samples),
        'avg_demo_speed': avg_demo_speed,
        'center_dev': center_dev,
        'mean_abs_steer': mean_abs_steer,
        'reversal_rate': rev_rate,
        'near_zero_pct': near_zero_pct,
        'extreme_pct': extreme_pct,
        'full_speed_pct': full_speed_pct,
        'baseline_conf': baseline_conf,
        'lidar_drop': lidar_drop,
        'camera_drop': camera_drop,
        'speedo_drop': speedo_drop,
        'corr_lidar1': corrs[0],
        'corr_lidar2': corrs[1],
        'corr_lidar3': corrs[2],
        'corr_lidar4': corrs[3],
        'corr_camera': corrs[4],
        'corr_speedo': corrs[5],
        'pre_rank': _ranking_str(pre_rank),
        'post_rank': _ranking_str(post_rank),
        'ranking_changed': ranking_changed,
        'pre_rank_time': pre_rank_time,
        'post_rank_time': post_rank_time,
        'pre_reorders': pre_reorders,
        'post_reorders': post_reorders,
        'tip_shown': tip_shown,
        'warmup_retries': int(warmup_retries),
        'demo_frames': len(demo_frames),
        'ablation_frames': len(ablation_frames),
    }


def parse_session_directory(sessions_dir):
    """Parse every *.json file in a directory. Returns (dataframe, errors)."""
    paths = sorted(glob(os.path.join(sessions_dir, '*.json')))
    rows = []
    errors = []
    for p in paths:
        try:
            rows.append(parse_session(p))
        except Exception as exc:  # noqa: BLE001 - we want to surface every failure
            errors.append((os.path.basename(p), str(exc)))
    df = pd.DataFrame(rows)
    return df, errors


if __name__ == '__main__':
    import sys
    sessions_dir = sys.argv[1] if len(sys.argv) > 1 else 'data/sessions'
    df, errors = parse_session_directory(sessions_dir)
    print(f'Parsed {len(df)} sessions, {len(errors)} errors')
    for fn, err in errors:
        print(f'  ERROR {fn}: {err}')
    print(df.head().to_string())
