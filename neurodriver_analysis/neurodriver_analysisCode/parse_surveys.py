"""
parse_surveys.py
================
Loads and scores the Qualtrics pre-survey (xlsx) and post-survey (csv).

PRE-SURVEY (xlsx, two sheets):
  Sheet0 — knowledge + attitude items
    Q2.2-Q2.4  : Likert attitudes (positive/negative/excited)
    Q2.5       : free text "If I were to explain AI..."
    Q3.2-Q3.11 : 10 multiple-choice knowledge items
  Sheet1 — Q1.5 (gender), Q1.6 (race/ethnicity)

POST-SURVEY (csv, single sheet, Qualtrics format):
  Row 0 = column codes (Q2.1 ... Q2.7)
  Row 1 = full question text
  Row 2 = ImportId metadata
  Row 3+ = student responses

  Q2.1 — multi-select: AI behavior when distance sensor disabled (knowledge, scored)
  Q2.2 — single-select: how does AI learn (knowledge, scored — matched to pre Q3.4)
  Q2.3 — single-select: most important sensor
  Q2.4 — multi-select: thermal sensor real-world reasons (knowledge, scored)
  Q2.5 — free text: how did your driving affect AI (open response — manually tiered)
  Q2.6 — single-select: thermal disabled scenario (knowledge, scored)
  Q2.7 — single-select: why test individual sensors (knowledge, scored)

Composite knowledge score = mean of (Q2.1, Q2.4, Q2.6, Q2.7) correctness in [0,1].
"""

import re

import numpy as np
import pandas as pd


# ============================================================
# Answer keys
# ============================================================
# Pre-survey Q3.4 (matched to post Q2.2): "How does an AI learn to perform a task like driving?"
PRE_Q34_CORRECT = 'The AI watches examples of the task being performed and learns patterns from them'

# Post-survey Q2.2: same question, matched
POST_Q22_CORRECT = 'The AI watches examples of the task being performed and learns patterns from them'

# Post-survey Q2.1 (multi-select): distance sensor failure
POST_Q21_CORRECT = {
    'It would have trouble avoiding walls and obstacles',
}

# Post-survey Q2.4 (multi-select): real-world thermal sensor reasons
POST_Q24_CORRECT = {
    'To detect pedestrians who might step into the road',
    'To sense people in low-visibility conditions like fog or darkness',
    'To identify living things that cameras might miss',
}

# Post-survey Q2.6: thermal disabled scenario — single correct answer
POST_Q26_CORRECT = 'The car will not slow down or adjust its path near the pedestrian'

# Post-survey Q2.7 (multi-select): why test individual sensors
POST_Q27_CORRECT = {
    'To understand which sensors are most critical for safety',
    'To design backup systems for when sensors stop working',
    'To predict how the car will behave in real-world failure situations',
}

# Pre-survey Q3.2-Q3.11 answer key (used for matched knowledge scoring)
PRE_KNOWLEDGE_KEY = {
    'Q3.2':  'Make the pandas more important by giving it "extra points".',
    'Q3.3':  'Clear examples with correct answers',
    'Q3.4':  PRE_Q34_CORRECT,
    'Q3.5':  'WANT',
    'Q3.6':  'Transparency',
    'Q3.7':  'The AI must be trained using examples or data first',
    'Q3.8':  'It depends on how much the AI is trained',
    'Q3.9':  'Until the room is clean, the robot will continually move forward',
    'Q3.10': 'It randomly picks moves until it collects enough data from the player',
    'Q3.11': 'Conditions and actions',
}


# ============================================================
# Helpers
# ============================================================
def _multiselect_set(value):
    """Qualtrics multi-select responses are comma-separated. Returns a set of stripped strings."""
    if pd.isna(value):
        return set()
    return {p.strip() for p in str(value).split(',') if p.strip()}


def _score_multiselect(value, correct_set, partial_credit=True):
    """Score a multi-select answer.

    If partial_credit is True, returns proportion of correct picks minus penalty for wrong picks.
    Otherwise returns 1 only if the picks exactly match the key, else 0.
    """
    picks = _multiselect_set(value)
    if not partial_credit:
        return 1.0 if picks == correct_set else 0.0
    if not correct_set:
        return float('nan')
    correct_picks = len(picks & correct_set)
    wrong_picks = len(picks - correct_set)
    score = (correct_picks - wrong_picks) / len(correct_set)
    return float(max(0.0, min(1.0, score)))


def _score_single(value, correct_answer):
    if pd.isna(value):
        return float('nan')
    return 1.0 if str(value).strip() == correct_answer else 0.0


# ============================================================
# Pre-survey
# ============================================================
def parse_pre_survey(xlsx_path):
    """Parse the consented pre-survey workbook into a per-student dataframe.

    Returns
    -------
    pandas.DataFrame
        Columns: pid, gender, race, attitude_positive, attitude_concerned,
                 attitude_excited, q25_text, q34_correct (matched item),
                 pre_knowledge_pct, plus raw Q3.2-Q3.11 columns.
    """
    sheet0 = pd.read_excel(xlsx_path, sheet_name='Sheet0', header=None)
    sheet1 = pd.read_excel(xlsx_path, sheet_name='Sheet1', header=None)

    # Headers in row 0 of Sheet0
    headers = [str(sheet0.iloc[0, j]) for j in range(sheet0.shape[1])]

    # Demographics in Sheet1: cols 0=Q1.5 (gender), 1=Q1.6 (race)
    # Sheet1 also has a ResponseId-aligned section in cols 3-4 in row 0; the
    # data rows align with Sheet0 by index, since both sheets are dumps of
    # the same Qualtrics responses.
    rows = []
    for i in range(2, len(sheet0)):
        pid = sheet0.iloc[i, 0]
        if pd.isna(pid) or str(pid).strip() == '' or str(pid).startswith('{'):
            continue

        row = {'pid': str(pid).strip()}

        # Demographics: read from Sheet1 same row index when present
        if i < len(sheet1):
            row['gender'] = str(sheet1.iloc[i, 0]) if pd.notna(sheet1.iloc[i, 0]) else ''
            row['race'] = str(sheet1.iloc[i, 1]) if pd.notna(sheet1.iloc[i, 1]) else ''
        else:
            row['gender'] = ''
            row['race'] = ''

        # Attitudes (Q2.2 positive impact, Q2.3 worried about bias, Q2.4 excited)
        for code, name in (('Q2.2', 'attitude_positive'),
                           ('Q2.3', 'attitude_concerned'),
                           ('Q2.4', 'attitude_excited')):
            j = headers.index(code) if code in headers else None
            row[name] = sheet0.iloc[i, j] if j is not None else np.nan

        # Free text
        j = headers.index('Q2.5') if 'Q2.5' in headers else None
        row['q25_text'] = str(sheet0.iloc[i, j]) if j is not None and pd.notna(sheet0.iloc[i, j]) else ''

        # Knowledge items Q3.2-Q3.11
        knowledge_correct = 0
        knowledge_total = 0
        for code, key in PRE_KNOWLEDGE_KEY.items():
            j = headers.index(code) if code in headers else None
            if j is None:
                continue
            answer = sheet0.iloc[i, j]
            row[code] = answer
            if pd.notna(answer):
                knowledge_total += 1
                if str(answer).strip() == key:
                    knowledge_correct += 1
        row['pre_knowledge_correct'] = knowledge_correct
        row['pre_knowledge_total'] = knowledge_total
        row['pre_knowledge_pct'] = (
            100.0 * knowledge_correct / knowledge_total if knowledge_total else float('nan')
        )
        row['pre_q34_correct'] = _score_single(row.get('Q3.4'), PRE_Q34_CORRECT)

        rows.append(row)

    return pd.DataFrame(rows)


# ============================================================
# Post-survey
# ============================================================
# Free-text tier rubric for Q2.5 ("How did your driving affect the AI?")
# Tier 3: explicit causal statement linking driving quality to AI behavior
# Tier 2: implicit recognition that the AI imitates/copies the human
# Tier 1: any acknowledgment that driving had some effect, no mechanism
# Tier 0: no answer, off-topic, or refusal
TIER3_PATTERNS = [
    r'\b(learn(s|ed|ing)?|train(s|ed|ing)?|teach(es|ed|ing)?)\b.*\b(from|by|how)\b',
    r'\b(copy|copies|copied|copying|imitat\w*|mirror\w*|mimic\w*)\b.*\b(driv\w+|me|my|i)\b',
    r'\bbecause\b.*\b(i|my)\b.*\b(drove|crash\w*|drive)\b',
]
TIER2_PATTERNS = [
    r'\b(copy|copies|copied|imitat\w*|mirror\w*|mimic\w*)\b',
    r'\b(learn\w*|train\w*|teach\w*)\b',
    r'\bsame as me\b|\blike me\b|\blike i\b',
]
TIER1_PATTERNS = [
    r'\b(affect\w*|impact\w*|change\w*|determin\w*)\b',
    r'\b(bad|good|better|worse|crash\w*)\b',
    r'\b(drive|drove|driving)\b',
]


def _tier_q25(text):
    """Heuristic tier classification for Q2.5 free text. Manual review recommended."""
    if not text or pd.isna(text):
        return 0
    t = str(text).lower().strip()
    if not t or t in ('idk', 'i dont know', "i don't know", 'no', 'na', 'n/a'):
        return 0
    for pat in TIER3_PATTERNS:
        if re.search(pat, t):
            return 3
    for pat in TIER2_PATTERNS:
        if re.search(pat, t):
            return 2
    for pat in TIER1_PATTERNS:
        if re.search(pat, t):
            return 1
    return 0


def parse_post_survey(csv_path):
    """Parse the post-activity Qualtrics CSV into a per-student dataframe.

    Returns
    -------
    pandas.DataFrame
        Columns: pid, q21_correct, q22_correct, q23_raw, q24_correct,
                 q25_text, q25_tier, q26_correct, q27_correct,
                 survey_total_pct (composite knowledge score).
    """
    raw = pd.read_csv(csv_path, header=None)
    headers = [str(raw.iloc[0, j]) for j in range(raw.shape[1])]
    col_idx = {h: j for j, h in enumerate(headers)}

    # Skip rows 0 (header), 1 (full text), 2 (Qualtrics metadata)
    rows = []
    for i in range(2, len(raw)):
        pid = raw.iloc[i, col_idx['ResponseId']]
        if pd.isna(pid) or str(pid).startswith('{') or str(pid).strip() == '':
            continue
        if str(pid).strip() == 'Response ID':
            continue

        q21 = raw.iloc[i, col_idx['Q2.1']]
        q22 = raw.iloc[i, col_idx['Q2.2']]
        q23 = raw.iloc[i, col_idx['Q2.3']]
        q24 = raw.iloc[i, col_idx['Q2.4']]
        q25 = raw.iloc[i, col_idx['Q2.5']]
        q26 = raw.iloc[i, col_idx['Q2.6']]
        q27 = raw.iloc[i, col_idx['Q2.7']]

        row = {
            'pid': str(pid).strip(),
            'q21_correct': _score_multiselect(q21, POST_Q21_CORRECT, partial_credit=True),
            'q22_correct': _score_single(q22, POST_Q22_CORRECT),
            'q23_raw': str(q23) if pd.notna(q23) else '',
            'q24_correct': _score_multiselect(q24, POST_Q24_CORRECT, partial_credit=True),
            'q25_text': str(q25) if pd.notna(q25) else '',
            'q25_tier': _tier_q25(q25),
            'q26_correct': _score_single(q26, POST_Q26_CORRECT),
            'q27_correct': _score_multiselect(q27, POST_Q27_CORRECT, partial_credit=True),
        }
        # Composite knowledge score: mean of the four knowledge items
        knowledge_items = [row['q21_correct'], row['q24_correct'],
                           row['q26_correct'], row['q27_correct']]
        valid = [v for v in knowledge_items if not (isinstance(v, float) and np.isnan(v))]
        row['survey_total_pct'] = 100.0 * np.mean(valid) if valid else float('nan')

        rows.append(row)

    return pd.DataFrame(rows)


def merge_pre_post(pre_df, post_df, sessions_df=None):
    """Merge pre-survey, post-survey, and (optionally) session features by pid.

    The merge is left-on the post-survey participants because students with a
    completed post-survey are the analysis cohort.
    """
    merged = post_df.merge(pre_df, on='pid', how='left', suffixes=('', '_pre'))
    if sessions_df is not None:
        merged = merged.merge(sessions_df, on='pid', how='left', suffixes=('', '_session'))
    return merged


if __name__ == '__main__':
    import sys
    pre_path = sys.argv[1] if len(sys.argv) > 1 else 'data/pre_survey.xlsx'
    post_path = sys.argv[2] if len(sys.argv) > 2 else 'data/post_survey.csv'
    pre = parse_pre_survey(pre_path)
    post = parse_post_survey(post_path)
    print(f'Pre-survey rows : {len(pre)}')
    print(f'Post-survey rows: {len(post)}')
    print(f'Mean pre knowledge: {pre.pre_knowledge_pct.mean():.1f}%')
    print(f'Mean post composite: {post.survey_total_pct.mean():.1f}%')
    matched = pre.merge(post, on='pid')
    print(f'Matched pre/post pairs: {len(matched)}')
