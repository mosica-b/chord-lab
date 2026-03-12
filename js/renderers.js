/**
 * Renderers Module
 * Handles VexFlow staff/tab notation, chord diagrams, and piano keyboard rendering
 */
const Renderers = (() => {
  const VF = Vex.Flow;

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
    const width = Math.max(chords.length * 120 + 80, 400);
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, totalHeight);
    const context = renderer.getContext();
    context.setFont('Arial', 10);

    const stave = new VF.Stave(10, staveY, width - 20);
    stave.addClef('treble');
    stave.setContext(context).draw();

    const notes = chords.map(chordName => {
      const chordNotes = MusicTheory.getChordNotes(chordName);
      if (!chordNotes.length) {
        return new VF.StaveNote({
          clef: 'treble',
          keys: ['c/4'],
          duration: 'w',
        });
      }

      // Build VexFlow keys with octave assignments
      const keys = assignOctavesForStaff(chordNotes);

      const staveNote = new VF.StaveNote({
        clef: 'treble',
        keys: keys,
        duration: 'w',
      });

      // Add sharp/flat accidentals (VexFlow 3 API: addAccidental(index, accidental))
      keys.forEach((key, i) => {
        const noteName = key.split('/')[0];
        if (noteName.includes('#')) {
          staveNote.addAccidental(i, new VF.Accidental('#'));
        } else if (noteName.includes('b')) {
          staveNote.addAccidental(i, new VF.Accidental('b'));
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
   */
  function assignOctavesForStaff(noteNames) {
    const noteOrder = MusicTheory.NOTE_NAMES;
    const keys = [];
    let currentOctave = 4;

    for (let i = 0; i < noteNames.length; i++) {
      const noteName = noteNames[i];
      const vfNote = noteName.replace('#', '#');

      if (i > 0) {
        const prevIdx = noteOrder.indexOf(noteNames[i - 1].replace('#', '').replace('b', ''));
        const currIdx = noteOrder.indexOf(noteName.replace('#', '').replace('b', ''));
        if (currIdx <= prevIdx) {
          currentOctave++;
        }
      }

      // Clamp to reasonable range
      const octave = Math.min(Math.max(currentOctave, 3), 5);
      keys.push(`${vfNote}/${octave}`);
    }

    return keys;
  }

  // =========================================
  // Guitar Tab (기타 타브)
  // =========================================
  function renderGuitarTab(container, chords) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 기타 타브가 표시됩니다.</p>';
      return;
    }

    const chordsWithPositions = chords.map(name => {
      const positions = ChordDB.getGuitarChord(name);
      return { name, positions: positions ? positions[0] : null };
    });

    const width = Math.max(chordsWithPositions.length * 120 + 80, 400);
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
  function renderUkuleleTab(container, chords) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 우쿨렐레 타브가 표시됩니다.</p>';
      return;
    }

    const chordsWithPositions = chords.map(name => {
      const positions = ChordDB.getUkuleleChord(name);
      return { name, positions: positions ? positions[0] : null };
    });

    const width = Math.max(chordsWithPositions.length * 120 + 80, 400);
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
  function renderGuitarDiagrams(container, chords) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 기타 다이어그램이 표시됩니다.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'diagram-grid';

    chords.forEach(name => {
      const positions = ChordDB.getGuitarChord(name);
      const item = document.createElement('div');
      item.className = 'diagram-item';

      const svgContainer = document.createElement('div');
      svgContainer.style.width = '100px';
      svgContainer.style.height = '150px';
      item.appendChild(svgContainer);

      if (positions && positions[0]) {
        drawGuitarDiagram(svgContainer, positions[0], name);
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
    const nameText = createSVGText(width / 2, 14, chordName, '13px', 'middle');
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

    // Draw barres
    barres.forEach(barreFret => {
      const fretIdx = barreFret;
      const y = marginTop + (fretIdx - 0.5) * fretSpacing;
      // Find the range of strings for this barre
      let fromStr = numStrings - 1;
      let toStr = 0;
      for (let i = 0; i < frets.length; i++) {
        if (frets[i] === barreFret) {
          fromStr = Math.min(fromStr, i);
          toStr = Math.max(toStr, i);
        }
      }
      const x1 = marginLeft + fromStr * stringSpacing;
      const x2 = marginLeft + toStr * stringSpacing;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x1 - 3);
      rect.setAttribute('y', y - 5);
      rect.setAttribute('width', x2 - x1 + 6);
      rect.setAttribute('height', 10);
      rect.setAttribute('rx', 5);
      rect.setAttribute('fill', '#333');
      svg.appendChild(rect);
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
  function renderUkuleleDiagrams(container, chords) {
    container.innerHTML = '';
    if (!chords.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 p-4">코드를 추가하면 우쿨렐레 다이어그램이 표시됩니다.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'diagram-grid';

    chords.forEach(name => {
      const positions = ChordDB.getUkuleleChord(name);
      const item = document.createElement('div');
      item.className = 'diagram-item';

      const svgContainer = document.createElement('div');
      svgContainer.style.width = '80px';
      svgContainer.style.height = '150px';
      item.appendChild(svgContainer);

      if (positions && positions[0]) {
        drawUkuleleDiagram(svgContainer, positions[0], name);
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
    const nameText = createSVGText(width / 2, 14, chordName, '13px', 'middle');
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

    barres.forEach(barreFret => {
      const y = marginTop + (barreFret - 0.5) * fretSpacing;
      let fromStr = numStrings - 1, toStr = 0;
      for (let i = 0; i < frets.length; i++) {
        if (frets[i] === barreFret) {
          fromStr = Math.min(fromStr, i);
          toStr = Math.max(toStr, i);
        }
      }
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', marginLeft + fromStr * stringSpacing - 3);
      rect.setAttribute('y', y - 5);
      rect.setAttribute('width', (toStr - fromStr) * stringSpacing + 6);
      rect.setAttribute('height', 10);
      rect.setAttribute('rx', 5);
      rect.setAttribute('fill', '#333');
      svg.appendChild(rect);
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
    // Draw 2 octaves (C to B x2) to avoid inversion issues
    const whiteKeysOneOctave = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const blackKeysOneOctave = [
      { note: 'C#', pos: 0 },
      { note: 'D#', pos: 1 },
      { note: 'F#', pos: 3 },
      { note: 'G#', pos: 4 },
      { note: 'A#', pos: 5 },
    ];

    // Build 2-octave key layout
    const whiteKeys = [...whiteKeysOneOctave, ...whiteKeysOneOctave];
    const blackKeys = [
      ...blackKeysOneOctave,
      ...blackKeysOneOctave.map(k => ({ note: k.note, pos: k.pos + 7 })),
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
      const nameText = createSVGText(width / 2, 14, chordName, '12px', 'middle');
      nameText.setAttribute('font-weight', 'bold');
      svg.appendChild(nameText);
    }

    const keyboardY = labelHeight;

    // Normalize highlight notes and find the best octave range
    const normalizedHighlight = highlightNotes.map(n => MusicTheory.normalizeNote(n));

    // Determine which octave to highlight: pick the range starting from root note
    // Highlight notes in ascending order starting from root
    const noteOrder = MusicTheory.NOTE_NAMES;
    const rootIdx = normalizedHighlight.length > 0 ? noteOrder.indexOf(normalizedHighlight[0]) : 0;

    // Build highlight set with octave position (0=first octave, 1=second)
    const highlightPositions = new Set();
    if (normalizedHighlight.length > 0) {
      let prevIdx = -1;
      let octave = 0;
      normalizedHighlight.forEach((note, i) => {
        const idx = noteOrder.indexOf(note);
        if (i > 0 && idx <= prevIdx) octave = 1;
        highlightPositions.add(`${note}-${octave}`);
        prevIdx = idx;
      });
    }

    // Draw white keys (2 octaves)
    whiteKeys.forEach((note, i) => {
      const x = i * keyWidth + 1;
      const octave = i < 7 ? 0 : 1;
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

    // Draw black keys (2 octaves)
    blackKeys.forEach(({ note, pos }) => {
      const x = (pos + 1) * keyWidth - blackKeyWidth / 2 + 1;
      const octave = pos < 7 ? 0 : 1;
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
  };
})();
