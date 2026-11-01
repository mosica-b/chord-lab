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

  function renderUnavailable(container, name, message) {
    const p = document.createElement('p');
    p.className = 'text-sm text-gray-500 p-4';
    p.textContent = `${name} — ${message}`;
    container.appendChild(p);
  }

  function separateUnavailable(container, chords, available, renderSingle, message) {
    if (available.every(Boolean)) return false;
    if (chords.length === 1) {
      renderUnavailable(container, chords[0], message);
      return true;
    }
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    chords.forEach((name, index) => {
      const item = document.createElement('div');
      item.style.minWidth = '180px';
      if (available[index]) renderSingle(item, name);
      else renderUnavailable(item, name, message);
      row.appendChild(item);
    });
    container.appendChild(row);
    return true;
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
    const noteSets = chords.map(name => MusicTheory.getChordNotesDisplay(name));
    if (separateUnavailable(container, chords, noteSets.map(notes => notes.length > 0),
      (item, name) => renderStaffNotation(item, [name]), '구성음을 확인할 수 없습니다.')) return;

    const labelHeight = 14; // Space reserved for chord names above stave
    const staveY = 36 + labelHeight;
    // Extra top room so labels can rise above tall notehead stacks (e.g. B7(b9,b13)
    // pushes ledger-line notes well above the stave).
    const extraTopRoom = 36;
    const totalHeight = staveY + 120 + extraTopRoom;
    const minContentWidth = chords.length * 120 + 80;
    const width = getAvailableWidth(container, minContentWidth);
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, totalHeight);
    const context = renderer.getContext();
    context.setFont('Arial', 10);

    const stave = new VF.Stave(10, staveY, width - 20);
    stave.addClef('treble');
    stave.setContext(context).draw();

    const notes = chords.map((chordName, chordIndex) => {
      // Use theory-correct enharmonic spelling (Bb not A#, Eb not D#, etc.)
      const chordNotes = noteSets[chordIndex];

      // Build VexFlow keys with octave assignments
      // VexFlow 3 cannot draw triple accidentals; use the same sounding pitch.
      const staffNotes = chordNotes.map(note => /(?:#{3,}|b{3,})$/.test(note)
        ? MusicTheory.normalizeNote(note) : note);
      const keys = assignOctavesForStaff(staffNotes, chordName);

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

    // Draw chord names as fixed SVG text above the stave (not as VexFlow annotations).
    // Per-note baseline = min(default position, real SVG top of the rendered note
    // group - padding) so that high noteheads + ledger lines (e.g. B7(b9,b13))
    // push the label up instead of overlapping it. SVG's native getBBox() captures
    // ledger lines and accidentals which VexFlow's getBoundingBox() can miss.
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      const defaultTextY = staveY - 5;
      const labelPadding = 14; // gap between top of notes (incl. ledger lines) and label baseline
      const noteGroups = svgEl.querySelectorAll('g.vf-stavenote');
      notes.forEach((note, i) => {
        const vfBbox = note.getBoundingBox();
        const centerX = vfBbox.getX() + vfBbox.getW() / 2;
        let noteTopY = vfBbox.getY();
        const groupEl = noteGroups[i];
        if (groupEl && typeof groupEl.getBBox === 'function') {
          try {
            const realBbox = groupEl.getBBox();
            // Use whichever is higher (smaller Y)
            noteTopY = Math.min(noteTopY, realBbox.y);
          } catch (e) { /* getBBox can throw on detached/hidden — fall back to vfBbox */ }
        }
        const textY = Math.min(defaultTextY, noteTopY - labelPadding);
        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('x', centerX);
        textEl.setAttribute('y', textY);
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
    const naturalPitch = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    function assign(notes) {
      let octave = 4, previous = -Infinity, first = null;
      const keys = notes.map(name => {
        const accidental = [...name.slice(1)].reduce((sum, char) => sum + (char === '#' ? 1 : -1), 0);
        let pitch = octave * 12 + naturalPitch[name[0]] + accidental;
        while (pitch <= previous) { octave++; pitch += 12; }
        if (first === null) first = pitch;
        previous = pitch;
        return `${name.toLowerCase()}/${octave}`;
      });
      return { keys, span: previous - first, octave };
    }
    let result = assign(noteNames);
    if (result.octave > 6 || result.span > 28) {
      // Inversions with added extensions can wrap twice. Keep the written
      // bass lowest and bring the remaining notes into a readable close voicing.
      const bass = MusicTheory.noteIndex(noteNames[0]);
      const rest = noteNames.slice(1).sort((a, b) =>
        ((MusicTheory.noteIndex(a) - bass + 12) % 12) - ((MusicTheory.noteIndex(b) - bass + 12) % 12));
      result = assign([noteNames[0], ...rest]);
    }
    return result.keys;
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
    if (separateUnavailable(container, chords, chordsWithPositions.map(item => !!item.positions),
      (item, name) => renderGuitarTab(item, [name], voicingIndexMap, options), '표시할 운지법을 찾지 못했습니다.')) return;

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
    if (separateUnavailable(container, chords, chordsWithPositions.map(item => !!item.positions),
      (item, name) => renderUkuleleTab(item, [name], voicingIndexMap, options), '표시할 운지법을 찾지 못했습니다.')) return;

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

      const chordNotesOct = MusicTheory.getChordNotesWithOctave(name);
      if (chordNotesOct.length) drawPianoKeyboard(svgContainer, chordNotesOct, name);
      else renderUnavailable(svgContainer, name, '구성음을 확인할 수 없습니다.');

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

    // Support both formats: array of strings OR array of { note, octaveOffset }
    const hasOctaveInfo = highlightNotes.length > 0 && typeof highlightNotes[0] === 'object';

    // Normalize and sort notes with octave offset info
    const noteOrder = MusicTheory.NOTE_NAMES;
    let notesWithOctOffset;
    if (hasOctaveInfo) {
      // Has octave info from getChordNotesWithOctave
      const first = highlightNotes[0];
      const rest = highlightNotes.slice(1);
      const rootSt = noteOrder.indexOf(MusicTheory.normalizeNote(first.note));
      // Sort by interval (semitones from root)
      const sorted = rest.sort((a, b) => {
        const intA = ((noteOrder.indexOf(MusicTheory.normalizeNote(a.note)) - rootSt + 12) % 12) + a.octaveOffset * 12;
        const intB = ((noteOrder.indexOf(MusicTheory.normalizeNote(b.note)) - rootSt + 12) % 12) + b.octaveOffset * 12;
        return intA - intB;
      });
      // Compute keyboard octave from root position + interval
      notesWithOctOffset = [first, ...sorted].map(entry => {
        const norm = MusicTheory.normalizeNote(entry.note);
        const interval = ((noteOrder.indexOf(norm) - rootSt + 12) % 12) + entry.octaveOffset * 12;
        return { note: norm, octaveOffset: Math.floor((rootSt + interval) / 12) };
      });
    } else {
      // Legacy: plain note strings, compute octave from pitch order
      const normalizedRaw = highlightNotes.map(n => MusicTheory.normalizeNote(n));
      const sorted = normalizedRaw.length > 1
        ? [normalizedRaw[0], ...normalizedRaw.slice(1).sort((a, b) => {
            const bassSt = noteOrder.indexOf(normalizedRaw[0]);
            return ((noteOrder.indexOf(a) - bassSt + 12) % 12) - ((noteOrder.indexOf(b) - bassSt + 12) % 12);
          })]
        : [...normalizedRaw];
      let relOct = 0, prevIdx = -1;
      notesWithOctOffset = sorted.map((note, i) => {
        const idx = noteOrder.indexOf(note);
        if (i > 0 && idx <= prevIdx) relOct++;
        prevIdx = idx;
        return { note, octaveOffset: relOct };
      });
    }

    // Wide inversions with an added 13th can exceed three octaves. Include
    // every highlighted note instead of silently drawing it outside the keys.
    const octaveCount = Math.max(3, ...notesWithOctOffset.map(entry =>
      entry.octaveOffset + (MusicTheory.normalizeNote(entry.note) === 'C' ? 0 : 1)));
    const whiteKeys = Array.from({ length: octaveCount }, () => whiteKeysOneOctave).flat().concat('C');
    const blackKeys = Array.from({ length: octaveCount }, (_, octave) =>
      blackKeysOneOctave.map(key => ({ note: key.note, pos: key.pos + octave * 7 }))).flat();

    const keyWidth = 18;
    const keyHeight = 70;
    const blackKeyWidth = 12;
    const blackKeyHeight = 44;
    const labelHeight = 18;
    const width = whiteKeys.length * keyWidth + 2;
    const height = keyHeight + labelHeight + 10;
    const svg = createSVG(width, height);
    if (chordName) {
      const nameText = createSVGText(width / 2, 11, chordName, '12px', 'middle');
      nameText.setAttribute('font-weight', 'bold');
      svg.appendChild(nameText);
    }
    const keyboardY = labelHeight;

    // Build highlight set with octave position
    const highlightPositions = new Set();
    if (notesWithOctOffset.length > 0) {
      const noteVisPos = { C: 0, 'C#': 0.5, D: 1, 'D#': 1.5, E: 2, F: 3, 'F#': 3.5, G: 4, 'G#': 4.5, A: 5, 'A#': 5.5, B: 6 };
      const totalKbWidth = octaveCount * 7;

      // Calculate max octave span
      const span = Math.max(...notesWithOctOffset.map(entry => entry.octaveOffset));

      // Find best starting octave for centering
      const maxStart = Math.max(0, octaveCount - 1 - span);
      let bestStart = 0;
      let bestImbalance = Infinity;
      for (let s = 0; s <= maxStart; s++) {
        const norm0 = MusicTheory.normalizeNote(notesWithOctOffset[0].note);
        const firstPos = (noteVisPos[norm0] || 0) + s * 7;
        const lastEntry = notesWithOctOffset[notesWithOctOffset.length - 1];
        const normLast = MusicTheory.normalizeNote(lastEntry.note);
        const lastPos = (noteVisPos[normLast] || 0) + (s + lastEntry.octaveOffset) * 7;
        const imbalance = Math.abs(firstPos - (totalKbWidth - lastPos));
        if (imbalance <= bestImbalance) {
          bestImbalance = imbalance;
          bestStart = s;
        }
      }

      // Assign octaves
      notesWithOctOffset.forEach(entry => {
        const norm = MusicTheory.normalizeNote(entry.note);
        const oct = Math.min(bestStart + entry.octaveOffset, octaveCount);
        highlightPositions.add(`${norm}-${oct}`);
      });
    }

    // Draw white keys and the final C.
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

    // Draw black keys.
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
