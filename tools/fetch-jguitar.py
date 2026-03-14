#!/usr/bin/env python3
"""
Fetch all guitar chord voicings from jguitar.com
Saves as a static JSON file for use in the app.

Usage: python3 tools/fetch-jguitar.py
Output: data/jguitar-chords.json
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

# All 12 root notes
ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

# Suffix → jguitar search suffix mapping
SUFFIXES = [
    ('', ''),           # major
    ('m', 'm'),         # minor
    ('dim', 'dim'),
    ('dim7', 'dim7'),
    ('sus2', 'sus2'),
    ('sus4', 'sus4'),
    ('7sus4', '7sus4'),
    ('aug', 'aug'),
    ('6', '6'),
    ('69', '6/9'),
    ('7', '7'),
    ('7b5', '7b5'),
    ('aug7', 'aug7'),
    ('9', '9'),
    ('7b9', '7b9'),
    ('7#9', '7#9'),
    ('11', '11'),
    ('13', '13'),
    ('maj7', 'maj7'),
    ('maj7#5', 'maj7#5'),
    ('maj9', 'maj9'),
    ('maj11', 'maj11'),
    ('maj13', 'maj13'),
    ('m6', 'm6'),
    ('m69', 'm6/9'),
    ('m7', 'm7'),
    ('m7b5', 'm7b5'),
    ('m9', 'm9'),
    ('m11', 'm11'),
    ('mmaj7', 'mMaj7'),
    ('add9', 'add9'),
    ('madd9', 'madd9'),
    ('5', '5'),
    ('7sus2', '7sus2'),
    ('aug9', 'aug9'),
    ('9#11', '9#11'),
    ('m13', 'm13'),
    ('mmaj9', 'mMaj9'),
]


def parse_frets(fret_str):
    """Parse fret string like '3,3,0,2,3,2' → [3,3,0,2,3,2]"""
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
    """Convert absolute frets to relative with baseFret."""
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
    """Convert absolute frets to position dict with barre detection."""
    rel_frets, base_fret = to_relative_frets(abs_frets)

    # Detect barres
    fret_counts = {}
    for f in rel_frets:
        if f > 0:
            fret_counts[f] = fret_counts.get(f, 0) + 1
    barres = [f for f, count in fret_counts.items() if count >= 2]

    return {
        'frets': rel_frets,
        'baseFret': base_fret,
        'barres': sorted(barres),
    }


def fetch_chord(chord_name):
    """Fetch chord voicings from jguitar.com"""
    url = f'https://jguitar.com/chordsearch?chordsearch={urllib.parse.quote(chord_name)}'

    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode('utf-8', errors='replace')
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, Exception) as e:
        return None, str(e)

    # Extract fret positions from image URLs
    img_regex = re.compile(r'images/chordshape/[^"]*?-([\dx%A-Fa-f,]+)\.png', re.IGNORECASE)
    positions = []
    seen = set()

    for match in img_regex.finditer(html):
        fret_str = urllib.parse.unquote(match.group(1))
        if fret_str in seen:
            continue
        seen.add(fret_str)

        abs_frets = parse_frets(fret_str)
        # Must have 6 values for guitar
        if len(abs_frets) != 6:
            continue
        # Must have at least 3 sounding strings
        if sum(1 for f in abs_frets if f >= 0) < 3:
            continue

        positions.append(abs_frets_to_position(abs_frets))

    return positions if positions else None, None


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    output_dir = os.path.join(project_dir, 'data')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'jguitar-chords.json')

    result = {}
    total = 0
    found = 0
    failed = 0
    total_chords = len(ROOTS) * len(SUFFIXES)

    print(f'Fetching {total_chords} chord voicings from jguitar.com...\n')

    for root in ROOTS:
        for suffix, search in SUFFIXES:
            chord_name = root + suffix       # Our key (e.g. "C#m7")
            search_name = root + search      # jguitar search term
            total += 1

            progress = f'[{total}/{total_chords}]'
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

            # Rate limiting: 300ms between requests
            time.sleep(0.3)

    # Save result
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)

    file_size = os.path.getsize(output_path) / 1024
    print(f'\n========================================')
    print(f'Total: {total} | Found: {found} | Failed: {failed}')
    print(f'Saved to: {output_path} ({file_size:.1f} KB)')
    print(f'========================================')


if __name__ == '__main__':
    main()
