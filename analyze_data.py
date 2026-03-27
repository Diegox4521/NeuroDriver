import os
import json
import glob
import argparse
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from collections import defaultdict

def load_data(paths):
    """Loads neurodriver JSON files from a list of files or directories."""
    files_to_process = set()
    
    # Resolve directories and individual files
    for path in paths:
        if os.path.isdir(path):
            for f in glob.glob(os.path.join(path, "*.json")):
                files_to_process.add(os.path.abspath(f))
        elif os.path.isfile(path) and path.endswith('.json'):
            files_to_process.add(os.path.abspath(path))
        else:
            print(f"Warning: '{path}' is not a valid JSON file or directory.")

    sessions = []
    for f in list(files_to_process):
        try:
            with open(f, 'r') as file:
                data = json.load(file)
                if "dataFormatVersion" in data:
                    sessions.append(data)
                else:
                    print(f"Skipping {f}: Not a valid NeuroDriver log format.")
        except Exception as e:
            print(f"Error reading {f}: {e}")
            
    return sessions

def analyze_and_plot(sessions, output_dir="."):
    """Analyzes data, plots graphs, and generates a markdown report."""
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Ablation Crashes
    crash_counts = defaultdict(int)
    for session in sessions:
        for crash in session.get("crashes", []):
            mask = crash.get("toggleMask", [True, True, True])
            if mask == [True, True, True]: crash_counts["All Sensors ON"] += 1
            elif mask == [False, True, True]: crash_counts["No LiDAR"] += 1
            elif mask == [True, False, True]: crash_counts["No Camera"] += 1
            elif mask == [True, True, False]: crash_counts["No Speedometer"] += 1
            else: crash_counts["Multiple OFF"] += 1

    if crash_counts:
        plt.figure(figsize=(10, 6))
        sns.barplot(x=list(crash_counts.keys()), y=list(crash_counts.values()), palette="viridis")
        plt.title("AI Crashes by Disabled Sensor (Ablation Study)")
        plt.xlabel("Sensor State")
        plt.ylabel("Total Crashes")
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "ablation_crashes.png"))
        plt.close()

    # 2. Rankings
    pre_ranks = {"lidar": [], "camera": [], "speedometer": []}
    post_ranks = {"lidar": [], "camera": [], "speedometer": []}
    
    for session in sessions:
        pre = session.get("preAblationRanking")
        post = session.get("postAblationRanking")
        if pre and isinstance(pre, list):
            for i, sensor in enumerate(pre):
                if sensor in pre_ranks: pre_ranks[sensor].append(i + 1)
        if post and isinstance(post, list):
            for i, sensor in enumerate(post):
                if sensor in post_ranks: post_ranks[sensor].append(i + 1)

    avg_pre = {k: (sum(v)/len(v) if v else 0) for k, v in pre_ranks.items()}
    avg_post = {k: (sum(v)/len(v) if v else 0) for k, v in post_ranks.items()}
    
    if any(avg_pre.values()) or any(avg_post.values()):
        df_data = []
        for s in ["lidar", "camera", "speedometer"]:
            df_data.append({"Sensor": s.capitalize(), "Phase": "Pre-Experiment", "Avg Rank (1=Best)": avg_pre[s]})
            df_data.append({"Sensor": s.capitalize(), "Phase": "Post-Experiment", "Avg Rank (1=Best)": avg_post[s]})
            
        df = pd.DataFrame(df_data)
        plt.figure(figsize=(10, 6))
        sns.barplot(data=df, x="Sensor", y="Avg Rank (1=Best)", hue="Phase", palette="muted")
        plt.title("Average Sensor Importance Ranking (Lower is Better)")
        plt.gca().invert_yaxis()
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "sensor_rankings.png"))
        plt.close()

    # 3. Demo Quality
    accept_rates = []
    for session in sessions:
        rate = session.get("demoQuality", {}).get("demoFilterAcceptRate")
        if rate is not None: accept_rates.append(rate)
            
    if accept_rates:
        plt.figure(figsize=(8, 5))
        sns.histplot(accept_rates, bins=10, kde=True, color="skyblue")
        plt.title("Distribution of Human Teaching Quality")
        plt.xlabel("Demo Filter Accept Rate (1.0 = All frames used)")
        plt.ylabel("Number of Sessions")
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "teaching_quality.png"))
        plt.close()

    # --- Generate Markdown Report ---
    report_path = os.path.join(output_dir, "analysis_report.md")
    with open(report_path, "w") as f:
        f.write("# NeuroDriver Analysis Report\\n\\n")
        f.write(f"**Total Sessions Analyzed:** {len(sessions)}\\n\\n")
        
        f.write("## 1. Ablation Crash Analysis\\n")
        if crash_counts:
            f.write("Total crashes observed under different sensor conditions:\\n")
            for condition, count in crash_counts.items():
                f.write(f"- **{condition}**: {count} crashes\\n")
        else:
            f.write("*No crashes recorded in this dataset.*\\n")
            
        f.write("\\n## 2. Shift in Student Understanding\\n")
        f.write("Average rankings of sensor importance (1 = Most Important, 3 = Least Important):\\n")
        f.write("| Sensor | Pre-Experiment Avg | Post-Experiment Avg | Shift |\\n")
        f.write("|--------|-------------------|--------------------|-------|\\n")
        for s in ["lidar", "camera", "speedometer"]:
            pre_val = avg_pre.get(s, 0)
            post_val = avg_post.get(s, 0)
            shift = pre_val - post_val
            shift_str = f"{abs(shift):.2f}"
            dir_str = "↑ (more important)" if shift > 0 else "↓ (less important)" if shift < 0 else "-"
            f.write(f"| **{s.capitalize()}** | {pre_val:.2f} | {post_val:.2f} | {shift_str} {dir_str} |\\n")
            
        f.write("\\n## 3. Human Teaching Quality\\n")
        if accept_rates:
            avg_rate = sum(accept_rates) / len(accept_rates)
            f.write(f"- **Average Demo Acceptance Rate**: {avg_rate*100:.1f}% \\n")
            f.write("  *(This represents the percentage of human driving data that the AI found useful/valid for training.)*\\n")
        else:
            f.write("*No demo quality metrics found.*\\n")
            
    print(f"Report and graphs generated in: '{os.path.abspath(output_dir)}'")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NeuroDriver JSON Analysis Script")
    parser.add_argument("paths", nargs="*", default=["."], help="List of specific .json files or directories to load.")
    parser.add_argument("-o", "--out", default=".", help="Directory to save the generated graphs and report.")
    
    args = parser.parse_args()

    print(f"Looking for JSON data in: {args.paths}")
    sessions = load_data(args.paths)
    print(f"Loaded {len(sessions)} valid session(s).")
    
    if sessions:
        analyze_and_plot(sessions, args.out)
    else:
        print("No JSON data files found. Exiting.")
