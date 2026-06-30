"""
parse_transcripts.py
====================
Loads classroom audio transcripts and extracts theme matches via keyword
dictionaries. The full thematic coding reported in the paper was performed
manually; this module provides the reproducible quantitative count of how
often each theme's keywords appear in the transcripts, which is the basis
for the triangulation report.

Transcripts are timestamped text files in the format produced by automated
transcription services:
    HH:MM:SS:ms - HH:MM:SS:ms
    Speaker
    Utterance text

The themes mapped here mirror the eight themes in
AI_Learning_Event_Transcript_Analysis.md.
"""

import os
import re
from glob import glob
from pathlib import Path

import pandas as pd


# Eight themes with paper-aligned keyword sets. Keywords are lowercased and
# matched as whole words (or word-boundary phrases). Tune as needed for
# your transcript corpus.
THEMES = {
    'training_data_quality':       ['garbage in', 'bad driver', 'good driver', "i was a better",
                                    'crashed', 'no drivers license', 'no driver\'s license',
                                    'how you drove', 'how i drove', 'wider implications',
                                    'because i', 'data', 'training'],
    'sensor_hierarchy_lidar':      ['lidar', 'distance sensor', 'needed lidar', 'without the lidar',
                                    'most important', 'critical sensor'],
    'sensor_complementarity':      ['camera', 'speedometer', 'all three', 'turn off', 'toggle',
                                    'with just', 'without the', 'sensor'],
    'failure_as_pedagogy':         ['crash', 'fail', 'wobble', 'oscillat', 'not working',
                                    'turned it off', 'broke', 'did not crash', 'crashed at all'],
    'real_world_transfer':         ['real life', 'real world', 'real cars', 'real-world',
                                    'tesla', 'self-driving', 'autonomous', 'pedestrian',
                                    'engineer', 'street', 'highway'],
    'prediction_observe_explain':  ['predict', 'thought it would', 'i think', 'expected',
                                    'guessed', 'turned out', 'observ', 'because'],
    'ranking_change':              ['ranking', 'most important', 'rank', 'changed my mind',
                                    'turns out', 'now i think', 'before i thought'],
    'engagement_curiosity':        ['cool', 'awesome', 'whoa', 'wow', 'no way',
                                    'try again', 'one more', 'can i', 'let me'],
}


# ============================================================
# Transcript parsing
# ============================================================
TIMESTAMP_RE = re.compile(r'\d{2}:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}:\d{2}')


def parse_transcript_file(path):
    """Parse one timestamp-style transcript into a list of (speaker, text) tuples."""
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()

    blocks = re.split(r'\n\s*\n', text)
    utterances = []
    for blk in blocks:
        lines = [ln.strip() for ln in blk.splitlines() if ln.strip()]
        if not lines:
            continue
        # Discard the timestamp line if present
        if TIMESTAMP_RE.match(lines[0]):
            lines = lines[1:]
        if not lines:
            continue
        speaker = lines[0]
        utterance = ' '.join(lines[1:])
        if utterance:
            utterances.append({'speaker': speaker, 'text': utterance,
                               'source': os.path.basename(path)})
    return utterances


def load_transcripts(transcripts_dir):
    """Load every *.txt transcript in a directory into a single dataframe."""
    rows = []
    for p in sorted(glob(os.path.join(transcripts_dir, '*.txt'))):
        rows.extend(parse_transcript_file(p))
    return pd.DataFrame(rows)


# ============================================================
# Theme extraction
# ============================================================
def _matches(text, keywords):
    """Count keyword occurrences in lowercased text."""
    t = text.lower()
    count = 0
    matched = []
    for kw in keywords:
        if ' ' in kw:
            # phrase
            n = t.count(kw)
        else:
            # whole-word
            n = len(re.findall(r'\b' + re.escape(kw) + r'\b', t))
        if n:
            count += n
            matched.append(kw)
    return count, matched


def code_themes(transcripts_df, themes=None):
    """Tag each utterance with the themes whose keywords appear in it."""
    themes = themes or THEMES
    rows = []
    for _, row in transcripts_df.iterrows():
        utterance_themes = {}
        for name, keywords in themes.items():
            count, matched = _matches(row['text'], keywords)
            if count:
                utterance_themes[name] = {'count': count, 'matched': matched}
        rows.append({
            'source': row.get('source', ''),
            'speaker': row.get('speaker', ''),
            'text': row['text'],
            'themes': list(utterance_themes.keys()),
            'theme_detail': utterance_themes,
        })
    return pd.DataFrame(rows)


def theme_summary(coded_df):
    """Per-theme utterance counts across the full corpus."""
    summary = {}
    for theme in THEMES:
        match = coded_df['themes'].apply(lambda lst: theme in lst)
        summary[theme] = {
            'utterances_with_theme': int(match.sum()),
            'pct_of_corpus': float(100.0 * match.mean()) if len(coded_df) else 0.0,
        }
    return summary


def extract_anchor_quotes(coded_df, theme, max_quotes=3, min_words=8):
    """Pull the longest utterances for a given theme as candidate paper quotes."""
    matches = coded_df[coded_df['themes'].apply(lambda lst: theme in lst)].copy()
    matches['word_count'] = matches['text'].str.split().str.len()
    matches = matches[matches['word_count'] >= min_words]
    matches = matches.sort_values('word_count', ascending=False)
    return matches.head(max_quotes)[['source', 'speaker', 'text']].to_dict('records')


if __name__ == '__main__':
    import sys, json
    transcripts_dir = sys.argv[1] if len(sys.argv) > 1 else 'data/transcripts'
    df = load_transcripts(transcripts_dir)
    print(f'Loaded {len(df)} utterances from {df["source"].nunique()} files')
    coded = code_themes(df)
    summary = theme_summary(coded)
    print(json.dumps(summary, indent=2))
