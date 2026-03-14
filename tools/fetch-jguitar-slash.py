#!/usr/bin/env python3
"""
Fetch slash chord voicings from jguitar.com
Appends to existing data/jguitar-chords.json

Usage: python3 tools/fetch-jguitar-slash.py
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
BASS_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

# ALL chord types to collect slash chords for
CHORD_TYPES = [
    ('', ''),           # major
    ('m', 'm'),         # minor
    ('7', '7'),         # dom7
    ('m7', 'm7'),       # min7
    ('maj7', 'maj7'),   # maj7
    ('dim', 'dim'),
    ('dim7', 'dim7'),
    ('aug', 'aug'),
    ('sus2', 'sus2'),
    ('sus4', 'sus4'),
    ('6', '6'),
    ('m6', 'm6'),
    ('9', '9'),
    ('m9', 'm9'),
    ('add9', 'add9'),
    ('maj9', 'maj9'),
    ('m7b5', 'm7b5'),
    ('7sus4', '7sus4'),
    ('5', '5'),
    ('aug7', 'aug7'),
    ('11', '11'),
    ('13', '13'),
    ('mmaj7', 'mMaj7'),
]


def parse_frets(fret_str):
    result = []
    for f in fret_str.split(','):
        s = f.strip()
        if s.lower() == 'x':
            result.append(-1)
        else:
            try:
                result.append(int(s))
            except ValueError:
                result.append(-1)
    return result


def to_relative_frets(abs_frets):
    fretted = [f for f in abs_frets if f > 0]
    if not fretted:
        return list(abs_frets), 1
    min_fret = min(fretted)
    max_fret = max(fretted)
    new_base = 1 if max_fret <= 4 else min_fret
    rel_frets = []
    for f in abs_frets:
        if f <= 0:
            rel_frets.append(f)
        else:
            rel_frets.append(f - (new_base - 1))
    return rel_frets, new_base


def abs_frets_to_position(abs_frets):
    rel_frets, base_fret = to_relative_frets(abs_frets)
    fret_counts = {}
    for f in rel_frets:
        if f > 0:
            fret_counts[f] = fret_counts.get(f, 0) + 1
    barres = sorted([f for f, count in fret_counts.items() if count >= 2])
    return {
        'frets': rel_frets,
        'baseFret': base_fret,
        'barres': barres,
    }


def fetch_chord(chord_name):
    url = f'https://jguitar.com/chordsearch?chordsearch={urllib.parse.quote(chord_name)}'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode('utf-8', errors='replace')
    except Exception as e:
        return None, str(e)

    img_regex = re.compile(r'images/chordshape/[^"]*?-([\dx%A-Fa-f,]+)\.png', re.IGNORECASE)
    positions = []
    seen = set()

    for match in img_regex.finditer(html):
        fret_str = urllib.parse.unquote(match.group(1))
        if fret_str in seen:
            continue
        seen.add(fret_str)
        abs_frets = parse_frets(fret_str)
        if len(abs_frets) != 6:
            continue
        if sum(1 for f in abs_frets if f >= 0) < 3:
            continue
        positions.append(abs_frets_to_position(abs_frets))

    return positions if positions else None, None


def enharmonic_equal(note1, note2):
    """Check if two notes are enharmonically equivalent"""
    semitone_map = {
        'C': 0, 'C#': 1, 'Db': 1,
        'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5,
        'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8,
        'A': 9, 'A#': 10, 'Bb': 10,
        'B': 11,
    }
    return semitone_map.get(note1, -1) == semitone_map.get(note2, -2)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    data_path = os.path.join(project_dir, 'data', 'jguitar-chords.json')

    # Load existing data
    if os.path.exists(data_path):
        with open(data_path, 'r', encoding='utf-8') as f:
            result = json.load(f)
        print(f'Loaded existing data: {len(result)} chords')
    else:
        result = {}
        print('Starting fresh (no existing data)')

    # Build list of slash chords to fetch
    to_fetch = []
    for root in ROOTS:
        for suffix, search_suffix in CHORD_TYPES:
            for bass in BASS_NOTES:
                # Skip if bass == root (not really a slash chord)
                if enharmonic_equal(root, bass):
                    continue
                chord_name = f'{root}{suffix}/{bass}'
                search_name = f'{root}{search_suffix}/{bass}'
                # Skip if already in data
                if chord_name in result:
                    continue
                to_fetch.append((chord_name, search_name))

    total = len(to_fetch)
    if total == 0:
        print('No new slash chords to fetch!')
        return

    print(f'Fetching {total} slash chord voicings from jguitar.com...\n')

    found = 0
    failed = 0

    for i, (chord_name, search_name) in enumerate(to_fetch):
        progress = f'[{i+1}/{total}]'
        sys.stdout.write(f'{progress} {chord_name}...')
        sys.stdout.flush()

        positions, error = fetch_chord(search_name)

        if positions:
            result[chord_name] = positions
            found += 1
            print(f' \u2713 {len(positions)} voicings')
        else:
            failed += 1
            if error:
                print(f' \u2717 error: {error[:50]}')
            else:
                print(f' \u2717 not found')

        time.sleep(0.3)

    # Save result (full + minified)
    with open(data_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)

    min_path = data_path.replace('.json', '.min.json')
    with open(min_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, separators=(',', ':'), ensure_ascii=False)

    file_size = os.path.getsize(min_path) / 1024
    print(f'\n========================================')
    print(f'New slash chords: {found} found / {failed} not found')
    print(f'Total chords in DB: {len(result)}')
    print(f'Minified size: {file_size:.1f} KB')
    print(f'========================================')


if __name__ == '__main__':
    main()
