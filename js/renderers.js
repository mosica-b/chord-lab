/**
 * Renderers Module
 * Handles VexFlow staff/tab notation, chord diagrams, and piano keyboard rendering
 */
const Renderers = (() => {
  const VF = Vex.Flow;

  /**
   * Get available width for rendering, using container or parent card width.
   * Falls back to Math.max(minWidth, 400) if no measurable width.
   */
  function getAvailableWidth(container, minWidth) {
    let w = container.clientWidth;
    if (w <= 0) {
      const card = container.closest('.chord-card');
      if (card) {
        const cs = getComputedStyle(card);
        w = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      }
    }
    return w > 0 ? Math.max(minWidth, w) : Math.max(minWidth, 400);
  }

  // =========================================
  // Staff Notation (오선표기)
  // =========================================
  function renderStaffNotation(container, chords) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 오선표기가 표시됩니다.</p>';
      return;
    }

    const labelHeight = 14; // Space reserved for chord names above stave
    const staveY = 36 + labelHeight;
    const totalHeight = staveY + 120;
    const minContentWidth = chords.length * 120 + 80;
    const width = getAvailableWidth(container, minContentWidth);
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, totalHeight);
    const context = renderer.getContext();
    context.setFont('Arial', 10);

    const stave = new VF.Stave(10, staveY, width - 20);
    stave.addClef('treble');
    stave.setContext(context).draw();

    const notes = chords.map(chordName => {
      // Use theory-correct enharmonic spelling (Bb not A#, Eb not D#, etc.)
      const chordNotes = MusicTheory.getChordNotesDisplay(chordName);
      if (!chordNotes.length) {
        return new VF.StaveNote({
          clef: 'treble',
          keys: ['c/4'],
          duration: 'w',
        });
      }

      // Build VexFlow keys with octave assignments
      const keys = assignOctavesForStaff(chordNotes, chordName);

      const staveNote = new VF.StaveNote({
        clef: 'treble',
        keys: keys,
        duration: 'w',
      });

      // Add accidentals: parse letter + accidental from VexFlow key (e.g., "bb/4" → letter "b", accidental "b")
      keys.forEach((key, i) => {
        const notePart = key.split('/')[0];
        const accidental = notePart.substring(1); // everything after first letter char
        if (accidental) {
          staveNote.addAccidental(i, new VF.Accidental(accidental));
        }
      });

      return staveNote;
    });

    const voice = new VF.Voice({ num_beats: chords.length * 4, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(notes);

    new VF.Formatter().joinVoices([voice]).format([voice], width - 80);
    voice.draw(context, stave);

    // Draw chord names as fixed SVG text above the stave (not as VexFlow annotations)
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      notes.forEach((note, i) => {
        const bbox = note.getBoundingBox();
        const centerX = bbox.getX() + bbox.getW() / 2;
        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('x', centerX);
        textEl.setAttribute('y', staveY - 5);
        textEl.setAttribute('text-anchor', 'middle');
        textEl.setAttribute('font-family', 'Arial');
        textEl.setAttribute('font-size', '13');
        textEl.setAttribute('font-weight', 'bold');
        textEl.setAttribute('fill', '#000');
        textEl.textContent = chords[i];
        svgEl.appendChild(textEl);
      });
    }
  }

  /**
   * Assign octaves to chord notes for good staff notation display
   * Keeps notes in a reasonable range around C4-B5
   * Handles both sharp and flat note names (e.g., Bb, Eb, C#, F#)
   */
  function assignOctavesForStaff(noteNames, chordName) {
    if (noteNames.length === 0) return [];

    // Close voicing: stack notes in ascending pitch without large octave jumps.
    // Treble clef staff range: E4–F5 (no ledger lines). Avoid starting below D4.
    const LETTER_IDX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
    const isSlash = chordName && chordName.includes('/');

    // Always start at octave 4 to stay on the staff (no ledger lines)
    const keys = [];
    let currentOctave = 4;
    let prevLetterIdx = -1;

    for (let i = 0; i < noteNames.length; i++) {
      const noteName = noteNames[i];
      const vfNote = noteName.toLowerCase();
      const letterIdx = LETTER_IDX[noteName[0]];

      if (i === 0) {
        // First note: if below E (bottom line of treble clef), bump to avoid ledger lines
        // C4=ledger, D4=just below → both need ledger lines visually
        // For slash chords, bass note stays at 4 (on the staff)
        currentOctave = 4;
      } else if (letterIdx <= prevLetterIdx) {
        // Only bump octave for genuine wrap-around (large drop, e.g., B→C, A→C)
        // Small backward steps (1-2 letters like G→F, A→G) = close voicing, stay same octave
        const drop = prevLetterIdx - letterIdx;
        if (drop >= 3) {
          currentOctave++;
        }
      }

      prevLetterIdx = letterIdx;
      const octave = Math.min(Math.max(currentOctave, 4), 6);
      keys.push(`${vfNote}/${octave}`);
    }

    return keys;
  }

  // =========================================
  // Guitar Tab (기타 타브)
  // =========================================
  function renderGuitarTab(container, chords, voicingIndexMap, options) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 기타 타브가 표시됩니다.</p>';
      return;
    }

    const chordsWithPositions = chords.map(name => {
      const positions = ChordDB.getGuitarChord(name);
      const idx = voicingIndexMap ? (voicingIndexMap[name] || 0) : 0;
      const clamped = positions ? Math.min(idx, positions.length - 1) : 0;
      return { name, positions: positions ? positions[clamped] : null };
    });

    const compactWidth = options && options.compactWidth;
    const minContentWidth = chordsWithPositions.length * 120 + 80;
    const width = compactWidth || getAvailableWidth(container, minContentWidth);
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, 180);
    const context = renderer.getContext();

    const stave = new VF.TabStave(10, 20, width - 20);
    stave.addClef('tab');
    stave.setContext(context).draw();

    const tabNotes = chordsWithPositions.map(({ name, positions }) => {
      if (!positions) {
        // Fallback: show chord name only
        const note = new VF.TabNote({
          positions: [{ str: 1, fret: 0 }],
          duration: 'w',
        });
        note.addModifier(
          new VF.Annotation(name + ' (?)').setVerticalJustification(VF.Annotation.VerticalJustify.TOP), 0
        );
        return note;
      }

      const frets = positions.frets;
      const baseFret = positions.baseFret || 1;
      const tabPositions = [];

      for (let i = 0; i < frets.length; i++) {
        if (frets[i] >= 0) {
          const actualFret = frets[i] === 0 ? 0 : frets[i] + (baseFret - 1);
          tabPositions.push({
            str: 6 - i,  // VexFlow: string 1 = high E, string 6 = low E
            fret: actualFret,
          });
        }
      }

      if (tabPositions.length === 0) {
        tabPositions.push({ str: 1, fret: 0 });
      }

      const note = new VF.TabNote({
        positions: tabPositions,
        duration: 'w',
      });

      note.addModifier(
        new VF.Annotation(name)
          .setVerticalJustification(VF.Annotation.VerticalJustify.TOP)
          .setFont('Arial', 12, 'bold'), 0
      );

      return note;
    });

    const voice = new VF.Voice({ num_beats: chords.length * 4, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(tabNotes);

    new VF.Formatter().joinVoices([voice]).format([voice], width - 80);
    voice.draw(context, stave);
  }

  // =========================================
  // Ukulele Tab (우쿨렐레 타브)
  // =========================================
  function renderUkuleleTab(container, chords, voicingIndexMap, options) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 우쿨렐레 타브가 표시됩니다.</p>';
      return;
    }

    const chordsWithPositions = chords.map(name => {
      const positions = ChordDB.getUkuleleChord(name);
      const idx = voicingIndexMap ? (voicingIndexMap[name] || 0) : 0;
      const clamped = positions ? Math.min(idx, positions.length - 1) : 0;
      return { name, positions: positions ? positions[clamped] : null };
    });

    const compactWidth = options && options.compactWidth;
    const minContentWidth = chordsWithPositions.length * 120 + 80;
    const width = compactWidth || getAvailableWidth(container, minContentWidth);
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, 160);
    const context = renderer.getContext();

    const stave = new VF.TabStave(10, 20, width - 20, { num_lines: 4 });
    stave.addClef('tab');
    stave.setContext(context).draw();

    const tabNotes = chordsWithPositions.map(({ name, positions }) => {
      if (!positions) {
        const note = new VF.TabNote({
          positions: [{ str: 1, fret: 0 }],
          duration: 'w',
        });
        note.addModifier(
          new VF.Annotation(name + ' (?)').setVerticalJustification(VF.Annotation.VerticalJustify.TOP), 0
        );
        return note;
      }

      const frets = positions.frets;
      const baseFret = positions.baseFret || 1;
      const tabPositions = [];

      for (let i = 0; i < frets.length; i++) {
        if (frets[i] >= 0) {
          const actualFret = frets[i] === 0 ? 0 : frets[i] + (baseFret - 1);
          tabPositions.push({
            str: 4 - i,  // 4 strings for ukulele
            fret: actualFret,
          });
        }
      }

      if (tabPositions.length === 0) {
        tabPositions.push({ str: 1, fret: 0 });
      }

      const note = new VF.TabNote({
        positions: tabPositions,
        duration: 'w',
      });

      note.addModifier(
        new VF.Annotation(name)
          .setVerticalJustification(VF.Annotation.VerticalJustify.TOP)
          .setFont('Arial', 12, 'bold'), 0
      );

      return note;
    });

    const voice = new VF.Voice({ num_beats: chords.length * 4, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(tabNotes);

    new VF.Formatter().joinVoices([voice]).format([voice], width - 80);
    voice.draw(context, stave);
  }

  // =========================================
  // Guitar Chord Diagram (기타 코드 다이어그램)
  // =========================================
  function renderGuitarDiagrams(container, chords, voicingIndexMap) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 기타 다이어그램이 표시됩니다.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'diagram-grid';

    chords.forEach(name => {
      const positions = ChordDB.getGuitarChord(name);
      const idx = voicingIndexMap ? (voicingIndexMap[name] || 0) : 0;
      const clamped = positions ? Math.min(idx, positions.length - 1) : 0;
      const item = document.createElement('div');
      item.className = 'diagram-item';

      const svgContainer = document.createElement('div');
      svgContainer.style.width = '100px';
      svgContainer.style.height = '150px';
      item.appendChild(svgContainer);

      if (positions && positions[clamped]) {
        drawGuitarDiagram(svgContainer, positions[clamped], name);
      } else {
        svgContainer.innerHTML = `<p class="text-xs text-gray-400" style="text-align:center;font-weight:bold;">${name}<br>데이터 없음</p>`;
      }

      grid.appendChild(item);
    });

    container.appendChild(grid);
  }

  /**
   * Draw a guitar chord diagram using SVG
   */
  function drawGuitarDiagram(container, position, chordName) {
    const numStrings = 6;
    const numFrets = 4;
    const stringSpacing = 14;
    const fretSpacing = 22;
    const marginLeft = 25;
    const labelHeight = 20;
    const marginTop = 15 + labelHeight;
    const width = marginLeft + (numStrings - 1) * stringSpacing + 20;
    const height = marginTop + numFrets * fretSpacing + 25;

    const svg = createSVG(width, height);

    // Draw chord name at top of SVG
    const nameText = createSVGText(width / 2, 11, chordName, '13px', 'middle');
    nameText.setAttribute('font-weight', 'bold');
    svg.appendChild(nameText);
    const frets = position.frets;
    const baseFret = position.baseFret || 1;
    const barres = position.barres || [];

    // Draw fret position indicator
    if (baseFret > 1) {
      const text = createSVGText(marginLeft - 18, marginTop + fretSpacing / 2 + 4, `${baseFret}fr`, '10px');
      svg.appendChild(text);
    } else {
      // Draw nut (thick line at top)
      const nut = createSVGLine(marginLeft, marginTop, marginLeft + (numStrings - 1) * stringSpacing, marginTop, 3);
      svg.appendChild(nut);
    }

    // Draw frets (horizontal lines)
    for (let i = 0; i <= numFrets; i++) {
      const y = marginTop + i * fretSpacing;
      const line = createSVGLine(marginLeft, y, marginLeft + (numStrings - 1) * stringSpacing, y, 1);
      svg.appendChild(line);
    }

    // Draw strings (vertical lines)
    for (let i = 0; i < numStrings; i++) {
      const x = marginLeft + i * stringSpacing;
      const line = createSVGLine(x, marginTop, x, marginTop + numFrets * fretSpacing, 1);
      svg.appendChild(line);
    }

    // Draw barres (개방현/뮤트현 위치에서 끊어서 표기)
    barres.forEach(barreFret => {
      const y = marginTop + (barreFret - 0.5) * fretSpacing;
      let segStart = -1;
      for (let i = 0; i <= frets.length; i++) {
        if (i < frets.length && frets[i] === barreFret) {
          if (segStart === -1) segStart = i;
        } else {
          if (segStart !== -1) {
            if (segStart === i - 1) {
              // 1개 현: dot으로 표기
              const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circle.setAttribute('cx', marginLeft + segStart * stringSpacing);
              circle.setAttribute('cy', y);
              circle.setAttribute('r', 5);
              circle.setAttribute('fill', '#333');
              svg.appendChild(circle);
            } else {
              // 2개 이상 연속: 바레 rect
              const x1 = marginLeft + segStart * stringSpacing;
              const x2 = marginLeft + (i - 1) * stringSpacing;
              const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              rect.setAttribute('x', x1 - 3);
              rect.setAttribute('y', y - 5);
              rect.setAttribute('width', x2 - x1 + 6);
              rect.setAttribute('height', 10);
              rect.setAttribute('rx', 5);
              rect.setAttribute('fill', '#333');
              svg.appendChild(rect);
            }
            segStart = -1;
          }
        }
      }
    });

    // Draw finger dots and open/muted markers
    for (let i = 0; i < frets.length; i++) {
      const x = marginLeft + i * stringSpacing;
      const fret = frets[i];

      if (fret === -1 || fret === 'x') {
        // Muted string: X above
        const text = createSVGText(x, marginTop - 4, 'X', '10px', 'middle');
        svg.appendChild(text);
      } else if (fret === 0) {
        // Open string: O above
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', marginTop - 7);
        circle.setAttribute('r', 4);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#333');
        circle.setAttribute('stroke-width', '1.5');
        svg.appendChild(circle);
      } else if (!barres.includes(fret)) {
        // Finger dot
        const y = marginTop + (fret - 0.5) * fretSpacing;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', 5);
        circle.setAttribute('fill', '#333');
        svg.appendChild(circle);
      }
    }

    container.appendChild(svg);
  }

  // =========================================
  // Ukulele Chord Diagram (우쿨렐레 다이어그램)
  // =========================================
  function renderUkuleleDiagrams(container, chords, voicingIndexMap) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 우쿨렐레 다이어그램이 표시됩니다.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'diagram-grid';

    chords.forEach(name => {
      const positions = ChordDB.getUkuleleChord(name);
      const idx = voicingIndexMap ? (voicingIndexMap[name] || 0) : 0;
      const clamped = positions ? Math.min(idx, positions.length - 1) : 0;
      const item = document.createElement('div');
      item.className = 'diagram-item';

      const svgContainer = document.createElement('div');
      svgContainer.style.width = '80px';
      svgContainer.style.height = '150px';
      item.appendChild(svgContainer);

      if (positions && positions[clamped]) {
        drawUkuleleDiagram(svgContainer, positions[clamped], name);
      } else {
        svgContainer.innerHTML = `<p class="text-xs text-gray-400" style="text-align:center;font-weight:bold;">${name}<br>데이터 없음</p>`;
      }

      grid.appendChild(item);
    });

    container.appendChild(grid);
  }

  function drawUkuleleDiagram(container, position, chordName) {
    const numStrings = 4;
    const numFrets = 4;
    const stringSpacing = 16;
    const fretSpacing = 22;
    const marginLeft = 25;
    const labelHeight = 20;
    const marginTop = 15 + labelHeight;
    const width = marginLeft + (numStrings - 1) * stringSpacing + 20;
    const height = marginTop + numFrets * fretSpacing + 25;

    const svg = createSVG(width, height);

    // Draw chord name at top of SVG
    const nameText = createSVGText(width / 2, 11, chordName, '13px', 'middle');
    nameText.setAttribute('font-weight', 'bold');
    svg.appendChild(nameText);
    const frets = position.frets;
    const baseFret = position.baseFret || 1;
    const barres = position.barres || [];

    if (baseFret > 1) {
      const text = createSVGText(marginLeft - 18, marginTop + fretSpacing / 2 + 4, `${baseFret}fr`, '10px');
      svg.appendChild(text);
    } else {
      const nut = createSVGLine(marginLeft, marginTop, marginLeft + (numStrings - 1) * stringSpacing, marginTop, 3);
      svg.appendChild(nut);
    }

    for (let i = 0; i <= numFrets; i++) {
      const y = marginTop + i * fretSpacing;
      svg.appendChild(createSVGLine(marginLeft, y, marginLeft + (numStrings - 1) * stringSpacing, y, 1));
    }

    for (let i = 0; i < numStrings; i++) {
      const x = marginLeft + i * stringSpacing;
      svg.appendChild(createSVGLine(x, marginTop, x, marginTop + numFrets * fretSpacing, 1));
    }

    // Draw barres (개방현/뮤트현 위치에서 끊어서 표기)
    barres.forEach(barreFret => {
      const y = marginTop + (barreFret - 0.5) * fretSpacing;
      let segStart = -1;
      for (let i = 0; i <= frets.length; i++) {
        if (i < frets.length && frets[i] === barreFret) {
          if (segStart === -1) segStart = i;
        } else {
          if (segStart !== -1) {
            if (segStart === i - 1) {
              const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              circle.setAttribute('cx', marginLeft + segStart * stringSpacing);
              circle.setAttribute('cy', y);
              circle.setAttribute('r', 5);
              circle.setAttribute('fill', '#333');
              svg.appendChild(circle);
            } else {
              const x1 = marginLeft + segStart * stringSpacing;
              const x2 = marginLeft + (i - 1) * stringSpacing;
              const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              rect.setAttribute('x', x1 - 3);
              rect.setAttribute('y', y - 5);
              rect.setAttribute('width', x2 - x1 + 6);
              rect.setAttribute('height', 10);
              rect.setAttribute('rx', 5);
              rect.setAttribute('fill', '#333');
              svg.appendChild(rect);
            }
            segStart = -1;
          }
        }
      }
    });

    for (let i = 0; i < frets.length; i++) {
      const x = marginLeft + i * stringSpacing;
      const fret = frets[i];

      if (fret === -1 || fret === 'x') {
        svg.appendChild(createSVGText(x, marginTop - 4, 'X', '10px', 'middle'));
      } else if (fret === 0) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', marginTop - 7);
        circle.setAttribute('r', 4);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#333');
        circle.setAttribute('stroke-width', '1.5');
        svg.appendChild(circle);
      } else if (!barres.includes(fret)) {
        const y = marginTop + (fret - 0.5) * fretSpacing;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', 5);
        circle.setAttribute('fill', '#333');
        svg.appendChild(circle);
      }
    }

    container.appendChild(svg);
  }

  // =========================================
  // Piano Keyboard (피아노 건반)
  // =========================================
  function renderPianoKeyboards(container, chords) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 피아노 건반이 표시됩니다.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'piano-container';

    chords.forEach(name => {
      const item = document.createElement('div');
      item.className = 'piano-chord';

      const svgContainer = document.createElement('div');
      item.appendChild(svgContainer);

      const chordNotes = MusicTheory.getChordNotes(name);
      drawPianoKeyboard(svgContainer, chordNotes, name);

      grid.appendChild(item);
    });

    container.appendChild(grid);
  }

  function drawPianoKeyboard(container, highlightNotes, chordName) {
    // Draw 3 octaves (C to B x3) for tension chords (9th, 11th, 13th)
    const whiteKeysOneOctave = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const blackKeysOneOctave = [
      { note: 'C#', pos: 0 },
      { note: 'D#', pos: 1 },
      { note: 'F#', pos: 3 },
      { note: 'G#', pos: 4 },
      { note: 'A#', pos: 5 },
    ];

    // Build 3-octave + final C key layout (C~C~C~C)
    const whiteKeys = [...whiteKeysOneOctave, ...whiteKeysOneOctave, ...whiteKeysOneOctave, 'C'];
    const blackKeys = [
      ...blackKeysOneOctave,
      ...blackKeysOneOctave.map(k => ({ note: k.note, pos: k.pos + 7 })),
      ...blackKeysOneOctave.map(k => ({ note: k.note, pos: k.pos + 14 })),
    ];

    const keyWidth = 18;
    const keyHeight = 70;
    const blackKeyWidth = 12;
    const blackKeyHeight = 44;
    const labelHeight = 18;
    const width = whiteKeys.length * keyWidth + 2;
    const height = keyHeight + labelHeight + 10;

    const svg = createSVG(width, height);

    // Draw chord name at top
    if (chordName) {
      const nameText = createSVGText(width / 2, 11, chordName, '12px', 'middle');
      nameText.setAttribute('font-weight', 'bold');
      svg.appendChild(nameText);
    }

    const keyboardY = labelHeight;

    // Normalize highlight notes and sort non-bass notes in ascending pitch
    // to prevent octave jumps from slash chord rotation (e.g., A9/C# [C#,E,G,B,A] → [C#,E,G,A,B])
    const normalizedRaw = highlightNotes.map(n => MusicTheory.normalizeNote(n));
    const normalizedHighlight = normalizedRaw.length > 1
      ? [normalizedRaw[0], ...normalizedRaw.slice(1).sort((a, b) => {
          const noteOrder_ = MusicTheory.NOTE_NAMES;
          const bassSt = noteOrder_.indexOf(normalizedRaw[0]);
          const sa = (noteOrder_.indexOf(a) - bassSt + 12) % 12;
          const sb = (noteOrder_.indexOf(b) - bassSt + 12) % 12;
          return sa - sb;
        })]
      : [...normalizedRaw];

    // Determine which octave to highlight: pick the range starting from root note
    // Highlight notes in ascending order starting from root
    const noteOrder = MusicTheory.NOTE_NAMES;
    const rootIdx = normalizedHighlight.length > 0 ? noteOrder.indexOf(normalizedHighlight[0]) : 0;

    // Build highlight set with octave position (0=first, 1=second, 2=third)
    // Pick the starting octave that visually centers the chord on the keyboard
    const highlightPositions = new Set();
    if (normalizedHighlight.length > 0) {
      // Visual position of each note in white-key units (within one octave)
      const noteVisPos = { C: 0, 'C#': 0.5, D: 1, 'D#': 1.5, E: 2, F: 3, 'F#': 3.5, G: 4, 'G#': 4.5, A: 5, 'A#': 5.5, B: 6 };
      const totalKbWidth = 21; // 3 octaves + final C → white key indices 0..21

      // First pass: calculate relative octave offsets (starting from 0)
      const relOctaves = [];
      let relOct = 0;
      let prevScanIdx = -1;
      normalizedHighlight.forEach((note, i) => {
        const idx = noteOrder.indexOf(note);
        if (i > 0 && idx <= prevScanIdx) relOct++;
        relOctaves.push(relOct);
        prevScanIdx = idx;
      });
      const span = relOct;

      // Try each possible starting octave, pick the one that balances
      // left gap (first note ↔ keyboard start) and right gap (last note ↔ keyboard end)
      const maxStart = Math.max(0, 2 - span);
      let bestStart = 0;
      let bestImbalance = Infinity;
      for (let s = 0; s <= maxStart; s++) {
        const firstPos = (noteVisPos[normalizedHighlight[0]] || 0) + s * 7;
        const lastNote = normalizedHighlight[normalizedHighlight.length - 1];
        const lastPos = (noteVisPos[lastNote] || 0) + (s + relOctaves[relOctaves.length - 1]) * 7;
        const imbalance = Math.abs(firstPos - (totalKbWidth - lastPos));
        if (imbalance <= bestImbalance) {
          bestImbalance = imbalance;
          bestStart = s;
        }
      }

      // Second pass: assign octaves using the best starting position
      let prevIdx = -1;
      let octave = bestStart;
      normalizedHighlight.forEach((note, i) => {
        const idx = noteOrder.indexOf(note);
        if (i > 0 && idx <= prevIdx) octave++;
        if (octave > 3) octave = 3;
        highlightPositions.add(`${note}-${octave}`);
        prevIdx = idx;
      });
    }

    // Draw white keys (3 octaves)
    whiteKeys.forEach((note, i) => {
      const x = i * keyWidth + 1;
      const octave = Math.floor(i / 7);
      const isHighlighted = highlightPositions.has(`${note}-${octave}`);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', keyboardY);
      rect.setAttribute('width', keyWidth - 1);
      rect.setAttribute('height', keyHeight);
      rect.setAttribute('fill', isHighlighted ? '#3b82f6' : 'white');
      rect.setAttribute('stroke', '#333');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('rx', '0');
      rect.setAttribute('ry', '2');
      svg.appendChild(rect);

      if (isHighlighted) {
        const text = createSVGText(x + keyWidth / 2, keyboardY + keyHeight - 5, note, '8px', 'middle');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-weight', 'bold');
        svg.appendChild(text);
      }
    });

    // Draw black keys (3 octaves)
    blackKeys.forEach(({ note, pos }) => {
      const x = (pos + 1) * keyWidth - blackKeyWidth / 2 + 1;
      const octave = Math.floor(pos / 7);
      const normalizedNote = MusicTheory.normalizeNote(note);
      const isHighlighted = highlightPositions.has(`${normalizedNote}-${octave}`);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', keyboardY);
      rect.setAttribute('width', blackKeyWidth);
      rect.setAttribute('height', blackKeyHeight);
      rect.setAttribute('fill', isHighlighted ? '#2563eb' : '#333');
      rect.setAttribute('stroke', '#222');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('rx', '0');
      rect.setAttribute('ry', '2');
      svg.appendChild(rect);

      if (isHighlighted) {
        const text = createSVGText(x + blackKeyWidth / 2, keyboardY + blackKeyHeight - 5, note.replace('#', '#'), '6px', 'middle');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-weight', 'bold');
        svg.appendChild(text);
      }
    });

    container.appendChild(svg);
  }

  // =========================================
  // SVG Helpers
  // =========================================
  function createSVG(width, height) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return svg;
  }

  function createSVGLine(x1, y1, x2, y2, strokeWidth) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#333');
    line.setAttribute('stroke-width', strokeWidth);
    return line;
  }

  function createSVGText(x, y, text, fontSize, anchor) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('font-size', fontSize || '12px');
    el.setAttribute('font-family', 'Arial, sans-serif');
    el.setAttribute('text-anchor', anchor || 'middle');
    el.setAttribute('fill', '#333');
    el.textContent = text;
    return el;
  }

  // =========================================
  // Render all notations
  // =========================================
  function renderAll(chords) {
    renderStaffNotation(document.getElementById('tab-staff'), chords);
    renderGuitarTab(document.getElementById('tab-guitar-tab'), chords);
    renderUkuleleTab(document.getElementById('tab-ukulele-tab'), chords);
    renderGuitarDiagrams(document.getElementById('tab-guitar-diagram'), chords);
    renderUkuleleDiagrams(document.getElementById('tab-ukulele-diagram'), chords);
    renderPianoKeyboards(document.getElementById('tab-piano'), chords);
  }

  return {
    renderStaffNotation,
    renderGuitarTab,
    renderUkuleleTab,
    renderGuitarDiagrams,
    renderUkuleleDiagrams,
    renderPianoKeyboards,
    renderAll,
    drawGuitarDiagram,
    drawUkuleleDiagram,
  };
})();
