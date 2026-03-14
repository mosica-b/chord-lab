#!/usr/bin/env python3
"""
Fetch all ukulele chord voicings from jguitar.com (with pagination).
Includes basic chords + slash chords.
Appends to existing data/jguitar-ukulele-chords.json if present.

Usage: python3 tools/fetch-jguitar-ukulele.py [--slash-only] [--force]
  --slash-only  Only fetch slash chords (skip basic chords)
  --force       Re-fetch even if chord already exists in data
Output: data/jguitar-ukulele-chords.json + data/jguitar-ukulele-chords.min.json
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
BASIC_SUFFIXES = [
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

# Slash chord types (subset of basic types commonly used with slash)
SLASH_SUFFIXES = [
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

BASS_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def parse_frets(fret_str):
    """Parse fret string like '0,0,0,3' → [0,0,0,3]"""
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


def fetch_chord(chord_name, max_pages=5):
    """Fetch ALL ukulele chord voicings from jguitar.com (with pagination)."""
    all_positions = []
    seen = set()
    # Ukulele image pattern: ...-FRETS-sharps-...Ukulele.png
    # FRETS = 4 values separated by %2C (URL-encoded commas)
    img_regex = re.compile(r'chordshape/[^"]*?-((?:[\dx]+%2C){3}[\dx]+)-', re.IGNORECASE)

    for page in range(1, max_pages + 1):
        url = (
            f'https://jguitar.com/chordsearch?'
            f'chordsearch={urllib.parse.quote(chord_name)}'
            f'&tuning=C6&instrument=Ukulele'
        )
        if page > 1:
            url += f'&page={page}'

        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        })

        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                html = response.read().decode('utf-8', errors='replace')
        except Exception as e:
            if page == 1:
                return None, str(e)
            break

        page_count = 0
        for match in img_regex.finditer(html):
            fret_str = urllib.parse.unquote(match.group(1))
            if fret_str in seen:
                continue
            seen.add(fret_str)

            abs_frets = parse_frets(fret_str)
            # Ukulele has 4 strings
            if len(abs_frets) != 4:
                continue
            # At least 2 sounding strings (4 strings total)
            if sum(1 for f in abs_frets if f >= 0) < 2:
                continue

            all_positions.append(abs_frets_to_position(abs_frets))
            page_count += 1

        # No new voicings on this page → stop
        if page_count == 0:
            break

        # Check if next page exists
        if f'page={page + 1}' not in html:
            break

        # Rate limit between pages
        time.sleep(0.2)

    return all_positions if all_positions else None, None


def main():
    slash_only = '--slash-only' in sys.argv
    force = '--force' in sys.argv

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    output_dir = os.path.join(project_dir, 'data')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'jguitar-ukulele-chords.json')
    min_path = output_path.replace('.json', '.min.json')

    # Load existing data
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8') as f:
            result = json.load(f)
        print(f'Loaded existing data: {len(result)} chords')
    else:
        result = {}
        print('Starting fresh (no existing data)')

    # Build list of chords to fetch
    to_fetch = []

    # Basic chords
    if not slash_only:
        for root in ROOTS:
            for suffix, search_suffix in BASIC_SUFFIXES:
                chord_name = root + suffix
                search_name = root + search_suffix
                if not force and chord_name in result:
                    continue
                to_fetch.append((chord_name, search_name))

    # Slash chords
    for root in ROOTS:
        for suffix, search_suffix in SLASH_SUFFIXES:
            for bass in BASS_NOTES:
                if enharmonic_equal(root, bass):
                    continue
                chord_name = f'{root}{suffix}/{bass}'
                search_name = f'{root}{search_suffix}/{bass}'
                if not force and chord_name in result:
                    continue
                to_fetch.append((chord_name, search_name))

    total = len(to_fetch)
    if total == 0:
        print('No new chords to fetch!')
        return

    print(f'Fetching {total} ukulele chord voicings from jguitar.com (with pagination)...\n')

    found = 0
    failed = 0
    save_interval = 100  # Save every N chords

    for i, (chord_name, search_name) in enumerate(to_fetch):
        progress = f'[{i+1}/{total}]'
        sys.stdout.write(f'{progress} {chord_name}...')
        sys.stdout.flush()

        positions, error = fetch_chord(search_name)

        if positions:
            result[chord_name] = positions
            found += 1
            print(f' ✓ {len(positions)} voicings')
        else:
            failed += 1
            if error:
                print(f' ✗ error: {error[:50]}')
            else:
                print(f' ✗ not found')

        # Periodic save
        if (i + 1) % save_interval == 0:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False)
            sys.stdout.write(f'  [saved {len(result)} chords]\n')

        time.sleep(0.3)

    # Final save
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)

    with open(min_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, separators=(',', ':'), ensure_ascii=False)

    file_size = os.path.getsize(min_path) / 1024
    print(f'\n========================================')
    print(f'New: {found} found / {failed} not found')
    print(f'Total chords in DB: {len(result)}')
    print(f'Minified size: {file_size:.1f} KB')
    print(f'========================================')


if __name__ == '__main__':
    main()
