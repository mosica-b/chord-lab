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
for (const file of ['js/music-theory.js', 'js/chord-db.js', 'js/pdf-parser.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const theory = vm.runInContext('MusicTheory', context);
const db = vm.runInContext('ChordDB', context);
const pdf = vm.runInContext('SibeliusPDFParser', context);
const plain = value => JSON.parse(JSON.stringify(value));
const renderers = fs.readFileSync(path.join(root, 'js/renderers.js'), 'utf8');
const staffStart = renderers.indexOf('function assignOctavesForStaff(');
const staffEnd = renderers.indexOf('\n  // =========================================', staffStart);
assert(staffStart >= 0 && staffEnd > staffStart);
vm.runInContext(renderers.slice(staffStart, staffEnd) + '\nthis.assignOctavesForStaff = assignOctavesForStaff;', context);

const examples = [
  ['Em11', ['E', 'G', 'B', 'D', 'F#', 'A']],
  ['F#m11', ['F#', 'A', 'C#', 'E', 'G#', 'B']],
  ['G13', ['G', 'B', 'D', 'F', 'A', 'C', 'E']],
  ['Dm(maj7)', ['D', 'F', 'A', 'C#']],
  ['Abm(maj7b5)', ['Ab', 'Cb', 'Ebb', 'G']],
  ['E9(sus4)', ['E', 'A', 'B', 'D', 'F#']],
  ['G7(b9sus4)', ['G', 'C', 'D', 'F', 'Ab']],
  ['C(add2sus4)', ['C', 'F', 'G', 'D']],
  ['A#m7(b5)', ['A#', 'C#', 'E', 'G#']],
  ['C#/E#', ['E#', 'G#', 'C#']],
  ['C#7/F', ['F', 'G#', 'B', 'C#']],
  ['Cbdim7', ['Cb', 'Ebb', 'Gbb', 'Bbbb']],
  ['C%', ['C', 'E', 'G', 'A', 'D']],
  ['B¬7', ['Bbb', 'Db', 'Fb', 'Abb']],
  ['Dm(;5)/G', ['G', 'D', 'F']],
  ['G#7(;3)', ['G#', 'D#', 'F#']],
  ['D7[äÆ]', ['D', 'F#', 'A', 'C', 'E#', 'Bb']],
  ['B7[âÅ]', ['B', 'D#', 'F#', 'A', 'C', 'E#']],
  ['Em/B/C', ['C', 'E', 'G', 'B']],
];

async function main() {
  for (const [name, expected] of examples) {
    const displayed = plain(theory.getChordNotesDisplay(name));
    const audio = plain(theory.getChordNotes(name));
    const piano = plain(theory.getChordNotesWithOctave(name)).map(item => item.note);
    assert.deepEqual(displayed, expected, `${name}: displayed notes`);
    assert.deepEqual(audio.map(theory.noteIndex), displayed.map(theory.noteIndex), `${name}: audio pitches`);
    assert.deepEqual(piano.map(theory.noteIndex), displayed.map(theory.noteIndex), `${name}: piano pitches`);
    assert(audio.every(note => theory.noteIndex(note) >= 0), `${name}: invalid audio pitch`);
  }
  assert.deepEqual(plain(theory.getChordDegreeLabels('A#m7(b5)')), ['1', '♭3', '♭5', '♭7']);
  assert.deepEqual(plain(theory.getChordDegreeLabels('Em11')), ['1', '♭3', '5', '♭7', '9', '11']);
  assert.equal(theory.normalizeNote('E#'), 'F');
  assert.equal(theory.normalizeNote('B#'), 'C');
  assert.equal(theory.normalizeNote('Bbbb'), 'G#');
  assert.deepEqual(plain(theory.getChordNotesWithOctave('Em11/A')), [
    { note: 'A', octaveOffset: 0 }, { note: 'E', octaveOffset: 0 },
    { note: 'G', octaveOffset: 0 }, { note: 'B', octaveOffset: 1 },
    { note: 'D', octaveOffset: 1 }, { note: 'F#', octaveOffset: 1 },
  ]);
  assert.deepEqual(plain(context.assignOctavesForStaff(['E', 'G', 'B', 'D', 'F#', 'A'])),
    ['e/4', 'g/4', 'b/4', 'd/5', 'f#/5', 'a/5']);
  assert.deepEqual(plain(context.assignOctavesForStaff(['B', 'A', 'C#', 'E', 'G', 'F#'])),
    ['b/4', 'c#/5', 'e/5', 'f#/5', 'g/5', 'a/5']);
  assert.deepEqual(plain(theory.getChordNotes('G7alt')), [], 'unspecified altered chord is ambiguous');
  assert.deepEqual(plain(theory.getChordNotes('C7(unknown)')), [], 'unknown modifier must not be ignored');
  assert.equal(theory.transposeChord('D7(sus4,b9)/A', 2), 'E7(sus4,b9)/B');
  for (const symbol of ['Em11', 'F#m13', 'Dm(maj7)', 'C#/E#', 'C%', 'B¬7']) {
    assert.equal(pdf.tryParseChord(symbol), symbol, `PDF import rejected ${symbol}`);
  }
  assert.equal(pdf.tryParseChord('E9(sus4)'), 'E9sus4');
  assert.equal(pdf.tryParseChord('Cnotachord'), null);

  await db.load();
  assert(db.isLoaded());
  for (const instrument of ['getGuitarChord', 'getUkuleleChord']) {
    const canonical = db[instrument]('DmMaj7');
    assert(canonical && canonical.length, `${instrument}: missing minor-major seventh reference`);
    assert.deepEqual(plain(db[instrument]('Dm(maj7)')), plain(canonical));
    assert.equal(db[instrument]('G7alt'), null, `${instrument}: ambiguous chord must not guess a voicing`);
  }
  for (const [method, tuning] of [
    ['getGuitarChord', theory.GUITAR_TUNING], ['getUkuleleChord', theory.UKULELE_TUNING],
  ]) {
    for (const name of ['Em11', 'E9(sus4)', 'G7(b9sus4)', 'F(add2)/A', 'G/F#', 'G/E', 'G/D']) {
      const positions = db[method](name);
      assert(positions && positions.length, `${method}: ${name} should have a usable shape`);
      const allowed = new Set(theory.getChordNotes(name).map(theory.noteIndex));
      const required = theory.getChordEssentialNotes(name).map(theory.noteIndex);
      const bass = theory.parseChordName(name).bassNote;
      for (const position of positions) {
        const pitches = position.frets.flatMap((fret, i) => {
          if (!(fret >= 0)) return [];
          assert(Number(fret) <= 4, `${method}: shape must fit its diagram`);
          const absolute = Number(fret) === 0 ? 0 : Number(fret) + (position.baseFret || 1) - 1;
          const note = theory.fretToNote(tuning, i, absolute);
          return [{ pc: theory.noteIndex(note.note), pitch: note.octave * 12 + theory.noteIndex(note.note) }];
        });
        assert(pitches.every(item => allowed.has(item.pc)), `${method}: ${name} has a foreign note`);
        assert(required.every(pc => pitches.some(item => item.pc === pc)), `${method}: ${name} lost a defining note`);
        if (bass) assert.equal(Math.min(...pitches.map(item => item.pitch)) % 12, theory.noteIndex(bass), `${method}: ${name} bass`);
      }
    }
  }
  console.log('Chord notes, spelling, extensions, omissions, suspensions and ambiguous inputs passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
