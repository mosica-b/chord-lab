const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({
  console: { log() {}, error: console.error },
  fetch: async url => url.startsWith('data/')
    ? { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url), 'utf8')) }
    : { ok: false },
});
for (const file of ['js/music-theory.js', 'js/chord-db.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const theory = vm.runInContext('MusicTheory', context);
const db = vm.runInContext('ChordDB', context);
const plain = value => JSON.parse(JSON.stringify(value));

async function main() {
  for (const name of ['D7(sus4)', 'D7sus4']) {
    assert.deepEqual(plain(theory.getChordNotesDisplay(name)), ['D', 'G', 'A', 'C']);
    assert.deepEqual(plain(theory.getChordNotes(name)), ['D', 'G', 'A', 'C']);
    assert.deepEqual(plain(theory.getChordNotesWithOctave(name)).map(item => item.note), ['D', 'G', 'A', 'C']);
    assert.deepEqual(plain(theory.getChordDegreeLabels(name)), ['1', '4', '5', '♭7']);
  }
  assert.deepEqual(plain(theory.getChordNotesDisplay('D(sus4)')), ['D', 'G', 'A']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('D(sus2)')), ['D', 'E', 'A']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('D7(sus4,b9)')), ['D', 'G', 'A', 'C', 'Eb']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('D7(b9,sus4)/A')), ['A', 'C', 'Eb', 'D', 'G']);
  assert.equal(theory.transposeChord('D7(sus4,b9)/A', 2), 'E7(sus4,b9)/B');
  assert.deepEqual(plain(theory.getChordNotesDisplay('D7')), ['D', 'F#', 'A', 'C']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('D7(#9)')), ['D', 'F#', 'A', 'C', 'E#']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('DmMaj7')), ['D', 'F', 'A', 'C#']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('G/F#')), ['F#', 'G', 'B', 'D']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('G/E')), ['E', 'G', 'B', 'D']);
  assert.deepEqual(plain(theory.getChordNotesDisplay('G/D')), ['D', 'G', 'B']);

  await db.load();
  assert(db.isLoaded(), 'chord voicing data failed to load');
  for (const instrument of ['getGuitarChord', 'getUkuleleChord']) {
    const canonical = db[instrument]('D7sus4');
    assert(canonical && canonical.length, `${instrument}: missing reference voicings`);
    assert.deepEqual(plain(db[instrument]('D7(sus4)')), plain(canonical));
  }
  console.log('Chord suspension, slash bass, transposition and voicing checks passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
