"""
make_figures.py
===============
Publication-quality matplotlib charts for the NeuroDriver paper.

Figures produced:
  fig1_session_completion.png        — n=69 sessions, distribution of session duration
  fig2_pre_post_knowledge.png        — pre/post bar chart (paper Fig. 2)
  fig3_sensor_confidence_drops.png   — mean confidence drop per sensor (paper Fig. 3)
  fig4_lidar_dominance.png           — pie/bar chart of which sensor caused largest drop
  fig5_ranking_shift.png             — pre/post sensor rank distribution
  fig6_drive_style_breakdown.png     — n per driving-style archetype
  fig7_demo_vs_ai_crashes.png        — scatter: demo crashes vs AI ablation crashes
  fig8_archetype_summary.png         — cross-archetype confidence drop comparison

All figures use IEEE-compatible styling: 9 pt sans-serif, 300 dpi, white
background, no top/right spines.
"""

import os
from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# Apply consistent IEEE-style theming once on import
mpl.rcParams.update({
    'font.family': 'DejaVu Sans',
    'font.size': 9,
    'axes.titlesize': 10,
    'axes.labelsize': 9,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.grid': True,
    'grid.alpha': 0.25,
    'grid.linestyle': '--',
    'axes.axisbelow': True,
    'figure.dpi': 200,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.facecolor': 'white',
})

COLORS = {
    'lidar': '#1f4e79',
    'camera': '#c0504d',
    'speedometer': '#9bbb59',
    'pre': '#777777',
    'post': '#1f4e79',
    'gain': '#2e7d32',
}


# ============================================================
# Figure 1: Session duration histogram
# ============================================================
def fig_session_completion(sessions_df, out_path):
    fig, ax = plt.subplots(figsize=(5.5, 3.0))
    durations = sessions_df['session_min'].dropna()
    ax.hist(durations, bins=15, color=COLORS['lidar'], edgecolor='white', alpha=0.85)
    ax.axvline(durations.median(), color=COLORS['gain'], linestyle='--', linewidth=1.5,
               label=f'Median = {durations.median():.1f} min')
    ax.axvline(10, color='red', linestyle=':', linewidth=1.5, label='10 min budget')
    ax.set_xlabel('Session duration (minutes)')
    ax.set_ylabel('Number of students')
    ax.set_title(f'Session duration distribution (n = {len(durations)})')
    ax.legend(frameon=False)
    fig.savefig(out_path)
    plt.close(fig)


# ============================================================
# Figure 2: Pre/Post knowledge gain
# ============================================================
def fig_pre_post_knowledge(stats_report, out_path):
    mc = stats_report.get('mcnemar_q34_q22', {})
    pre_pct = mc.get('pre_pct', float('nan'))
    post_pct = mc.get('post_pct', float('nan'))
    chi2 = mc.get('chi2', float('nan'))
    p = mc.get('p', float('nan'))
    n = mc.get('n', 0)

    fig, ax = plt.subplots(figsize=(4.5, 3.5))
    bars = ax.bar(['Pre-test', 'Post-test'], [pre_pct, post_pct],
                  color=[COLORS['pre'], COLORS['post']], width=0.55, edgecolor='white')
    for bar, val in zip(bars, [pre_pct, post_pct]):
        ax.text(bar.get_x() + bar.get_width() / 2, val + 1.5,
                f'{val:.1f}%', ha='center', fontsize=10, fontweight='bold')
    ax.set_ylim(0, max(post_pct, pre_pct) + 15)
    ax.set_ylabel('% correct on matched item')
    ax.set_title(f'Pre/post knowledge gain (n = {n})')
    ax.text(0.5, -0.18,
            f'McNemar $\\chi^2$ = {chi2:.3f}, p = {p:.4f}',
            transform=ax.transAxes, ha='center', fontsize=9)
    fig.savefig(out_path)
    plt.close(fig)


# ============================================================
# Figure 3: Sensor confidence drops
# ============================================================
def fig_sensor_confidence_drops(stats_report, out_path):
    sd = stats_report.get('sensor_drops', {})
    sensors = ['LiDAR', 'Camera', 'Speedometer']
    means = [sd.get(s, {}).get('mean_drop_pp', 0) for s in sensors]
    stds = [sd.get(s, {}).get('std_drop_pp', 0) for s in sensors]
    colors = [COLORS['lidar'], COLORS['camera'], COLORS['speedometer']]

    fig, ax = plt.subplots(figsize=(5.0, 3.5))
    bars = ax.bar(sensors, means, yerr=stds, color=colors, alpha=0.9,
                  edgecolor='white', capsize=6)
    for bar, m, s in zip(bars, means, stds):
        ax.text(bar.get_x() + bar.get_width() / 2, m + s + 1.5,
                f'{m:.1f}±{s:.1f}', ha='center', fontsize=9)
    ax.set_ylabel('Mean confidence drop (pp)')
    ax.set_title('AI confidence drop when each sensor is removed')
    fig.savefig(out_path)
    plt.close(fig)


# ============================================================
# Figure 4: LiDAR dominance breakdown
# ============================================================
def fig_lidar_dominance(stats_report, out_path):
    ld = stats_report.get('lidar_dominance', {})
    dist = ld.get('distribution', {})
    labels = ['LiDAR', 'Camera', 'Speedometer', 'No data']
    n_cohort = ld.get('n_cohort', 1)
    n_with_data = ld.get('n_with_data', 0)
    counts = [
        dist.get('LiDAR', 0),
        dist.get('Camera', 0),
        dist.get('Speedometer', 0),
        max(0, n_cohort - n_with_data),
    ]
    colors = [COLORS['lidar'], COLORS['camera'], COLORS['speedometer'], '#cccccc']

    fig, ax = plt.subplots(figsize=(5.0, 3.5))
    bars = ax.bar(labels, counts, color=colors, edgecolor='white')
    for bar, c in zip(bars, counts):
        if c:
            ax.text(bar.get_x() + bar.get_width() / 2, c + 0.5,
                    f'{c} ({100*c/n_cohort:.1f}%)', ha='center', fontsize=9)
    ax.set_ylabel('Number of students')
    ax.set_title(f'Which sensor removal caused the largest confidence drop? (n = {n_cohort})')
    fig.savefig(out_path)
    plt.close(fig)


# ============================================================
# Figure 5: Ranking shift breakdown
# ============================================================
def fig_ranking_shift(sessions_df, out_path):
    pre_first = sessions_df['pre_rank'].dropna().str.split(' > ').str[0].value_counts()
    post_first = sessions_df['post_rank'].dropna().str.split(' > ').str[0].value_counts()

    sensors = ['LiDAR', 'Camera', 'Speedometer']
    pre_pct = [100.0 * pre_first.get(s, 0) / pre_first.sum() if pre_first.sum() else 0
               for s in sensors]
    post_pct = [100.0 * post_first.get(s, 0) / post_first.sum() if post_first.sum() else 0
                for s in sensors]

    x = np.arange(len(sensors))
    width = 0.38
    fig, ax = plt.subplots(figsize=(5.5, 3.5))
    ax.bar(x - width / 2, pre_pct, width, label='Pre', color=COLORS['pre'], edgecolor='white')
    ax.bar(x + width / 2, post_pct, width, label='Post', color=COLORS['post'], edgecolor='white')
    for i, (a, b) in enumerate(zip(pre_pct, post_pct)):
        ax.text(i - width / 2, a + 1, f'{a:.0f}%', ha='center', fontsize=8)
        ax.text(i + width / 2, b + 1, f'{b:.0f}%', ha='center', fontsize=8)
    ax.set_xticks(x)
    ax.set_xticklabels(sensors)
    ax.set_ylabel('% of students ranking this sensor #1')
    ax.set_title('Pre/post sensor importance ranking shift')
    ax.legend(frameon=False)
    fig.savefig(out_path)
    plt.close(fig)


# ============================================================
# Figure 6: Drive-style breakdown
# ============================================================
def fig_drive_style_breakdown(sessions_df, out_path):
    if 'drive_style' not in sessions_df.columns:
        return
    counts = sessions_df['drive_style'].value_counts()

    fig, ax = plt.subplots(figsize=(5.5, 3.5))
    colors = ['#1f4e79', '#c0504d', '#9bbb59', '#f79646', '#7030a0']
    bars = ax.bar(counts.index, counts.values, color=colors[:len(counts)], edgecolor='white')
    for bar, n in zip(bars, counts.values):
        ax.text(bar.get_x() + bar.get_width() / 2, n + 0.3, str(n),
                ha='center', fontsize=9, fontweight='bold')
    ax.set_ylabel('Number of students')
    ax.set_title(f'Driving-style archetypes (n = {len(sessions_df)})')
    plt.setp(ax.get_xticklabels(), rotation=15, ha='right')
    fig.savefig(out_path)
    plt.close(fig)


# ============================================================
# Figure 7: Demo crashes vs AI ablation crashes
# ============================================================
def fig_demo_vs_ai_crashes(sessions_df, stats_report, out_path):
    fig, ax = plt.subplots(figsize=(4.5, 4.5))
    x = sessions_df['demo_crashes']
    y = sessions_df['ai_ablation_crashes']
    valid = x.notna() & y.notna()
    ax.scatter(x[valid], y[valid], alpha=0.7, s=40,
               color=COLORS['lidar'], edgecolor='white')
    if valid.sum() >= 2:
        m, b = np.polyfit(x[valid], y[valid], 1)
        xs = np.linspace(0, x[valid].max(), 50)
        ax.plot(xs, m * xs + b, 'r--', alpha=0.6, linewidth=1.2)
    r = stats_report.get('demo_to_ai_crash_corr', {}).get('r', float('nan'))
    p = stats_report.get('demo_to_ai_crash_corr', {}).get('p', float('nan'))
    ax.set_xlabel('Demo-phase crashes (human)')
    ax.set_ylabel('AI ablation crashes')
    # Both axes are the same unit (crash counts); use an equal, shared scale
    # so distances read consistently on both axes (reviewer request).
    upper = float(np.nanmax([x[valid].max(), y[valid].max()]))
    lim = upper * 1.05
    ax.set_xlim(0, lim)
    ax.set_ylim(0, lim)
    ax.set_aspect('equal', adjustable='box')
    ax.set_title(f'Training-data quality predicts AI behavior\n(r = {r:.2f}, p = {p:.4f})')
    fig.savefig(out_path, bbox_inches='tight')
    plt.close(fig)


# ============================================================
# Figure 8: Cross-archetype summary
# ============================================================
def fig_archetype_summary(sessions_df, out_path):
    if 'drive_style' not in sessions_df.columns:
        return
    g = sessions_df.groupby('drive_style')[
        ['demo_crashes', 'ai_ablation_crashes', 'lidar_drop']
    ].mean(numeric_only=True).reset_index()
    g['lidar_drop'] = g['lidar_drop'] * 100  # convert to percentage points

    x = np.arange(len(g))
    width = 0.27
    fig, ax = plt.subplots(figsize=(7.0, 3.8))
    ax.bar(x - width, g['demo_crashes'], width, label='Demo crashes',
           color=COLORS['pre'], edgecolor='white')
    ax.bar(x, g['ai_ablation_crashes'], width, label='AI ablation crashes',
           color=COLORS['camera'], edgecolor='white')
    ax2 = ax.twinx()
    ax2.bar(x + width, g['lidar_drop'], width, label='LiDAR drop (%)',
            color=COLORS['lidar'], edgecolor='white')
    ax2.set_ylabel('LiDAR confidence drop (pp)')
    ax.set_xticks(x)
    ax.set_xticklabels(g['drive_style'])
    ax.set_ylabel('Crash count')
    ax.set_title('Cross-archetype outcomes')
    plt.setp(ax.get_xticklabels(), rotation=15, ha='right')

    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, frameon=False, loc='upper right', fontsize=8)
    fig.savefig(out_path)
    plt.close(fig)


# ============================================================
# Driver
# ============================================================
def make_all_figures(sessions_df, stats_report, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fig_session_completion(sessions_df, out_dir / 'fig1_session_completion.png')
    fig_pre_post_knowledge(stats_report, out_dir / 'fig2_pre_post_knowledge.png')
    fig_sensor_confidence_drops(stats_report, out_dir / 'fig3_sensor_confidence_drops.png')
    fig_lidar_dominance(stats_report, out_dir / 'fig4_lidar_dominance.png')
    fig_ranking_shift(sessions_df, out_dir / 'fig5_ranking_shift.png')
    fig_drive_style_breakdown(sessions_df, out_dir / 'fig6_drive_style_breakdown.png')
    fig_demo_vs_ai_crashes(sessions_df, stats_report, out_dir / 'fig7_demo_vs_ai_crashes.png')
    fig_archetype_summary(sessions_df, out_dir / 'fig8_archetype_summary.png')
    return sorted(out_dir.glob('*.png'))
