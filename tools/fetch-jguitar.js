#!/usr/bin/env node
/**
 * Fetch all guitar chord voicings from jguitar.com
 * Saves as a static JSON file for use in the app.
 *
 * Usage: node tools/fetch-jguitar.js
 * Output: data/jguitar-chords.json
 */

const fs = require('fs');
const path = require('path');

// All 12 root notes
const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Suffix → jguitar search suffix mapping
// jguitar uses specific naming conventions
const SUFFIXES = [
  { suffix: '',       search: '' },        // major
  { suffix: 'm',      search: 'm' },       // minor
  { suffix: 'dim',    search: 'dim' },
  { suffix: 'dim7',   search: 'dim7' },
  { suffix: 'sus2',   search: 'sus2' },
  { suffix: 'sus4',   search: 'sus4' },
  { suffix: '7sus4',  search: '7sus4' },
  { suffix: 'aug',    search: 'aug' },
  { suffix: '6',      search: '6' },
  { suffix: '69',     search: '6/9' },
  { suffix: '7',      search: '7' },
  { suffix: '7b5',    search: '7b5' },
  { suffix: 'aug7',   search: 'aug7' },
  { suffix: '9',      search: '9' },
  { suffix: '7b9',    search: '7b9' },
  { suffix: '7#9',    search: '7#9' },
  { suffix: '11',     search: '11' },
  { suffix: '13',     search: '13' },
  { suffix: 'maj7',   search: 'maj7' },
  { suffix: 'maj7#5', search: 'maj7#5' },
  { suffix: 'maj9',   search: 'maj9' },
  { suffix: 'maj11',  search: 'maj11' },
  { suffix: 'maj13',  search: 'maj13' },
  { suffix: 'm6',     search: 'm6' },
  { suffix: 'm69',    search: 'm6/9' },
  { suffix: 'm7',     search: 'm7' },
  { suffix: 'm7b5',   search: 'm7b5' },
  { suffix: 'm9',     search: 'm9' },
  { suffix: 'm11',    search: 'm11' },
  { suffix: 'mmaj7',  search: 'mMaj7' },
  { suffix: 'add9',   search: 'add9' },
  { suffix: 'madd9',  search: 'madd9' },
  { suffix: '5',      search: '5' },
  { suffix: '7sus2',  search: '7sus2' },
  { suffix: 'aug9',   search: 'aug9' },
  { suffix: '9#11',   search: '9#11' },
  { suffix: 'm13',    search: 'm13' },
  { suffix: 'mmaj9',  search: 'mMaj9' },
];

/**
 * Parse fret string from jguitar image URL.
 * e.g. "3,3,0,2,3,2" → [3,3,0,2,3,2]
 */
function parseJGuitarFrets(fretStr) {
  return fretStr.split(',').map(f => {
    const s = f.trim();
    if (s === 'x' || s === 'X') return -1;
    const n = parseInt(s, 10);
    return isNaN(n) ? -1 : n;
  });
}

/**
 * Convert absolute fret array to position format with baseFret.
 */
function toRelativeFrets(absFrets) {
  const fretted = absFrets.filter(f => f > 0);
  if (fretted.length === 0) {
    return { frets: [...absFrets], baseFret: 1 };
  }
  const minFret = Math.min(...fretted);
  const maxFret = Math.max(...fretted);
  const newBaseFret = maxFret <= 4 ? 1 : minFret;
  const relFrets = absFrets.map(f => {
    if (f <= 0) return f;
    return f - (newBaseFret - 1);
  });
  return { frets: relFrets, baseFret: newBaseFret };
}

/**
 * Convert absolute frets to position with barre detection.
 */
function absFretsToPosition(absFrets) {
  const rel = toRelativeFrets(absFrets);
  const barres = [];
  const fretCounts = {};
  rel.frets.forEach(f => {
    if (f > 0) fretCounts[f] = (fretCounts[f] || 0) + 1;
  });
  for (const [fret, count] of Object.entries(fretCounts)) {
    if (count >= 2) barres.push(parseInt(fret, 10));
  }
  return {
    frets: rel.frets,
    baseFret: rel.baseFret,
    barres,
  };
}

/**
 * Fetch chord voicings from jguitar.com
 */
async function fetchChord(chordName) {
  const url = `https://jguitar.com/chordsearch?chordsearch=${encodeURIComponent(chordName)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) return null;

    const html = await res.text();

    const imgRegex = /images\/chordshape\/[^"]*?-([\dx%A-Fa-f,]+)\.png/gi;
    const positions = [];
    const seen = new Set();
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const fretStr = decodeURIComponent(match[1]);
      if (seen.has(fretStr)) continue;
      seen.add(fretStr);

      const absFrets = parseJGuitarFrets(fretStr);
      if (absFrets.length !== 6) continue;
      if (absFrets.filter(f => f >= 0).length < 3) continue;

      positions.push(absFretsToPosition(absFrets));
    }

    return positions.length > 0 ? positions : null;
  } catch (e) {
    console.error(`  ✗ ${chordName}: ${e.message}`);
    return null;
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main: fetch all chords and save to JSON
 */
async function main() {
  const outputDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'jguitar-chords.json');
  const result = {};
  let total = 0;
  let found = 0;
  let failed = 0;

  const totalChords = ROOTS.length * SUFFIXES.length;
  console.log(`Fetching ${totalChords} chord voicings from jguitar.com...\n`);

  for (const root of ROOTS) {
    for (const { suffix, search } of SUFFIXES) {
      const chordName = root + suffix;        // Our key (e.g. "C#m7")
      const searchName = root + search;       // jguitar search term
      total++;

      const progress = `[${total}/${totalChords}]`;
      process.stdout.write(`${progress} ${chordName}...`);

      const positions = await fetchChord(searchName);

      if (positions) {
        result[chordName] = positions;
        found++;
        console.log(` ✓ ${positions.length} voicings`);
      } else {
        failed++;
        console.log(` ✗ not found`);
      }

      // Rate limiting: 300ms between requests
      await sleep(300);
    }
  }

  // Save result
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  const fileSize = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`\n========================================`);
  console.log(`Total: ${total} | Found: ${found} | Failed: ${failed}`);
  console.log(`Saved to: ${outputPath} (${fileSize} KB)`);
  console.log(`========================================`);
}

main().catch(console.error);
