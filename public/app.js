(function(){
  const svg = document.getElementById('roof');
  const widthInput = document.getElementById('width');
  const heightInput = document.getElementById('height');
  const drawBtn = document.getElementById('draw');
  const areaEl = document.getElementById('area');
  const modWidthInput = document.getElementById('mod-width');
  const modHeightInput = document.getElementById('mod-height');
  const modTiltInput = document.getElementById('mod-tilt');
  const modTiltRow = document.getElementById('mod-tilt-row');
  const modPowerInput = document.getElementById('mod-power');
  const modVocInput = document.getElementById('mod-voc');
  const modCurrentInput = document.getElementById('mod-current');
  const mittelstegInput = document.getElementById('mittelstegweite');
  const verbotszoneInput = document.getElementById('verbotszone');
  const dachformSelect = document.getElementById('dachform');
  const firstLengthInput = document.getElementById('first-length');
  const firstLengthRow = document.getElementById('first-length-row');
  const contextMenu = document.getElementById('context-menu');
  const ctxAdd = document.getElementById('ctx-add');
  const ctxDelete = document.getElementById('ctx-delete');
  const ctxRotate = document.getElementById('ctx-rotate');
  const gesamtleistungEl = document.getElementById('Gesamtleistung');
  const vocEl = document.getElementById('voc');
  const selXInput = document.getElementById('sel-x');
  const selYInput = document.getElementById('sel-y');
  const resetBtn = document.getElementById('reset-modules');

  let modules = []; // stored as {id, leftMeters, widthMeters}
  let selectedModules = new Set(); // IDs of selected modules
  let dragging = null;
  let wasDragged = false; // Track if pointer moved during drag
  let lastScale = 1;
  let lastX1 = 0;
  let lastBaseY = 0;
  let dragStartSvgX = 0;
  let dragStartSvgY = 0;
  let ghostRect = null;

  function clampNumber(value, min, max) {
    if (!isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function getModuleTiltDeg() {
    if (!modTiltInput) return 0;
    const raw = parseFloat(modTiltInput.value);
    const val = isFinite(raw) ? raw : 0;
    return clampNumber(val, 0, 45);
  }

  function getEffectiveModuleTiltDeg() {
    return getDachform() === 'flachdach' ? getModuleTiltDeg() : 0;
  }

  function getProjectedModuleDimsMeters(moduleWidthMeters) {
    const physicalWidth = isFinite(moduleWidthMeters) ? Math.max(0, moduleWidthMeters) : 0;
    const physicalHeight = Math.max(0, parseFloat(modHeightInput.value) || 0);
    const tiltDeg = getEffectiveModuleTiltDeg();
    if (!(tiltDeg > 0) || physicalWidth === 0 || physicalHeight === 0) {
      return { widthMeters: physicalWidth, heightMeters: physicalHeight };
    }

    // Tilt is defined between the roof plane and the module's short side.
    // In our UI, that short side is the module width (Breite). The long side (Höhe) stays unchanged.
    const s = Math.cos((tiltDeg * Math.PI) / 180);
    return { widthMeters: physicalWidth * s, heightMeters: physicalHeight };
  }

  function ensureTiltLinearGradient(tiltDeg) {
    if (!svg) return null;
    const t = isFinite(tiltDeg) ? tiltDeg : 0;
    const key = Math.round(t);
    const gradientId = `tilt-linear-${key}`;

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    if (svg.querySelector(`#${gradientId}`)) return gradientId;

    // Strength increases with angle (0° -> almost none, 45° -> stronger)
    const strength = clampNumber(Math.sin((t * Math.PI) / 180), 0, 1);
    const darkOpacity = Math.min(0.55, 0.06 + 0.44 * strength);
    const midOpacity = darkOpacity * 0.45;

    // Linear gradient: dark -> light (like the example). "End" (dark side) gets darker with angle.
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', gradientId);
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '0%');

    const stop0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop0.setAttribute('offset', '0%');
    stop0.setAttribute('stop-color', '#000');
    stop0.setAttribute('stop-opacity', String(darkOpacity));

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '60%');
    stop1.setAttribute('stop-color', '#000');
    stop1.setAttribute('stop-opacity', String(midOpacity));

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#000');
    stop2.setAttribute('stop-opacity', String(0));

    grad.appendChild(stop0);
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);

    return gradientId;
  }

  function getDachform() {
    return (dachformSelect && dachformSelect.value) ? dachformSelect.value : 'zeltdach';
  }

  function getFirstLengthMeters(roofWidthMeters) {
    if (!firstLengthInput) return 0;
    const raw = parseFloat(firstLengthInput.value);
    const val = isFinite(raw) ? raw : 0;
    return clampNumber(val, 0, Math.max(0, roofWidthMeters));
  }

  function getRoofPolygonMeters(roofWidthMeters, roofHeightMeters) {
    const form = getDachform();
    if (form === 'flachdach') {
      return [
        { x: 0, y: roofHeightMeters },
        { x: roofWidthMeters, y: roofHeightMeters },
        { x: roofWidthMeters, y: 0 },
        { x: 0, y: 0 }
      ];
    }
    if (form === 'walmdach') {
      const firstLengthMeters = getFirstLengthMeters(roofWidthMeters);
      const topLeft = (roofWidthMeters - firstLengthMeters) / 2;
      const topRight = topLeft + firstLengthMeters;
      // Coordinate system: y=0 at top (ridge), y=roofHeight at base (downward positive)
      return [
        { x: 0, y: roofHeightMeters },
        { x: roofWidthMeters, y: roofHeightMeters },
        { x: topRight, y: 0 },
        { x: topLeft, y: 0 }
      ];
    }
    // default: zeltdach (triangle)
    return [
      { x: 0, y: roofHeightMeters },
      { x: roofWidthMeters, y: roofHeightMeters },
      { x: roofWidthMeters / 2, y: 0 }
    ];
  }

  function insetConvexPolygon(polygonMeters, insetMeters) {
    if (!Array.isArray(polygonMeters) || polygonMeters.length < 3) return null;
    if (!(insetMeters > 0)) return polygonMeters;

    // Use centroid as an inward test point
    const centroid = polygonMeters.reduce((acc, p) => {
      acc.x += p.x;
      acc.y += p.y;
      return acc;
    }, { x: 0, y: 0 });
    centroid.x /= polygonMeters.length;
    centroid.y /= polygonMeters.length;

    const makeOffsetLine = (p1, p2, inwardPoint, offset) => {
      let a = p1.y - p2.y;
      let b = p2.x - p1.x;
      let c = p1.x * p2.y - p2.x * p1.y;
      const side = a * inwardPoint.x + b * inwardPoint.y + c;
      if (side < 0) { a *= -1; b *= -1; c *= -1; }
      const len = Math.hypot(a, b);
      if (!isFinite(len) || len === 0) return null;
      c -= offset * len;
      return { a, b, c };
    };

    const intersect = (L1, L2) => {
      const det = L1.a * L2.b - L2.a * L1.b;
      if (!isFinite(det) || Math.abs(det) < 1e-9) return null;
      return {
        x: (L1.b * L2.c - L2.b * L1.c) / det,
        y: (L1.c * L2.a - L2.c * L1.a) / det
      };
    };

    const lines = [];
    for (let i = 0; i < polygonMeters.length; i++) {
      const p1 = polygonMeters[i];
      const p2 = polygonMeters[(i + 1) % polygonMeters.length];
      const L = makeOffsetLine(p1, p2, centroid, insetMeters);
      if (!L) return null;
      lines.push(L);
    }

    const insetPoly = [];
    for (let i = 0; i < lines.length; i++) {
      const Lprev = lines[(i - 1 + lines.length) % lines.length];
      const Lcur = lines[i];
      const P = intersect(Lprev, Lcur);
      if (!P || !isFinite(P.x) || !isFinite(P.y)) return null;
      insetPoly.push(P);
    }

    return insetPoly;
  }

  function pointInConvexPolygon(pointMeters, polygonMeters) {
    if (!Array.isArray(polygonMeters) || polygonMeters.length < 3) return false;
    let sign = 0;
    for (let i = 0; i < polygonMeters.length; i++) {
      const a = polygonMeters[i];
      const b = polygonMeters[(i + 1) % polygonMeters.length];
      const cross = (b.x - a.x) * (pointMeters.y - a.y) - (b.y - a.y) * (pointMeters.x - a.x);
      if (Math.abs(cross) < 1e-10) continue; // on edge
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  function computeRoofArea(width, height) {
    const form = getDachform();
    if (form === 'flachdach') {
      return width * height;
    }
    if (form === 'walmdach') {
      const L = getFirstLengthMeters(width);
      return ((width + L) / 2) * height;
    }
    // default: zeltdach
    return 0.5 * width * height;
  }

  function updateDachformUI() {
    const form = getDachform();
    if (firstLengthRow) firstLengthRow.style.display = (form === 'walmdach') ? 'block' : 'none';
    if (modTiltRow) modTiltRow.style.display = (form === 'flachdach') ? 'block' : 'none';
    if (form === 'walmdach' && firstLengthInput) {
      const v = String(firstLengthInput.value || '').trim();
      if (v === '') firstLengthInput.value = '5';
    }
  }

  function render(width, height) {
    const area = computeRoofArea(width, height);
    areaEl.textContent = isFinite(area) ? area.toFixed(2) : '-';

    const margin = 20;
    const vbW = Math.max(100, Math.floor(svg.clientWidth));
    const vbH = Math.max(100, Math.floor(svg.clientHeight));
    // Set SVG viewBox to match actual pixel size so coordinates map 1:1
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);

    if (width <= 0 || height <= 0) {
      svg.innerHTML = '';
      return;
    }

    const scale = Math.min((vbW - margin*2) / width, (vbH - margin*2) / height);
    const pxWidth = width * scale;
    const pxHeight = height * scale;

    const baseY = (vbH - pxHeight) / 2 + pxHeight;
    const x1 = (vbW - pxWidth) / 2;
    const x2 = x1 + pxWidth;
    const topX = x1 + pxWidth / 2;
    const topY = baseY - pxHeight;

    // store last transform data for module placement
    lastScale = scale;
    lastX1 = x1;
    lastBaseY = baseY;

    let points;
    const form = getDachform();
    if (form === 'flachdach') {
      points = `${x1},${baseY} ${x2},${baseY} ${x2},${topY} ${x1},${topY}`;
    } else if (form === 'walmdach') {
      const firstLengthMeters = getFirstLengthMeters(width);
      const firstLengthPx = firstLengthMeters * scale;
      const topLeftX = topX - firstLengthPx / 2;
      const topRightX = topX + firstLengthPx / 2;
      points = `${x1},${baseY} ${x2},${baseY} ${topRightX},${topY} ${topLeftX},${topY}`;
    } else {
      points = `${x1},${baseY} ${x2},${baseY} ${topX},${topY}`;
    }

    // ensure layers exist
    let bg = svg.querySelector('#bg-layer');
    let modulesLayer = svg.querySelector('#modules-layer');
    let overlay = svg.querySelector('#overlay-layer');
    let fg = svg.querySelector('#fg-layer');
    if (!bg) { bg = document.createElementNS('http://www.w3.org/2000/svg','g'); bg.setAttribute('id','bg-layer'); svg.appendChild(bg); }
    if (!modulesLayer) { modulesLayer = document.createElementNS('http://www.w3.org/2000/svg','g'); modulesLayer.setAttribute('id','modules-layer'); svg.appendChild(modulesLayer); }
    if (!overlay) { overlay = document.createElementNS('http://www.w3.org/2000/svg','g'); overlay.setAttribute('id','overlay-layer'); svg.appendChild(overlay); }
    if (!fg) { fg = document.createElementNS('http://www.w3.org/2000/svg','g'); fg.setAttribute('id','fg-layer'); svg.appendChild(fg); }

    // clear and draw background and modules layer (leave overlay intact so ghostRect survives)
    bg.innerHTML = '';
    modulesLayer.innerHTML = '';
    fg.innerHTML = '';

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', '#cfe8ff');
    polygon.setAttribute('stroke', '#2b6fb6');
    polygon.setAttribute('stroke-width', '2');
    bg.appendChild(polygon);

    const baseLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    baseLine.setAttribute('x1', x1);
    baseLine.setAttribute('y1', baseY + 10);
    baseLine.setAttribute('x2', x2);
    baseLine.setAttribute('y2', baseY + 10);
    baseLine.setAttribute('stroke', '#444');
    bg.appendChild(baseLine);

    // (removed top label) -- height is shown by the dashed line and midpoint label

    // draw altitude (height) line from apex to base and label it
    const heightLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    heightLine.setAttribute('x1', topX);
    heightLine.setAttribute('y1', topY);
    heightLine.setAttribute('x2', topX);
    heightLine.setAttribute('y2', baseY);
    heightLine.setAttribute('stroke', '#b00');
    heightLine.setAttribute('stroke-width', '1');
    heightLine.setAttribute('stroke-dasharray', '4,3');
    // append height line and label to foreground layer so they are always on top
    fg.appendChild(heightLine);

    // label the height (placed at midpoint)
    const midY = (topY + baseY) / 2;
    const heightLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    heightLabel.setAttribute('x', topX + 8);
    heightLabel.setAttribute('y', midY);
    heightLabel.setAttribute('fill', '#b00');
    heightLabel.setAttribute('font-size', '12');
    heightLabel.textContent = `${height} m`;
    fg.appendChild(heightLabel);

    const textBase = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textBase.setAttribute('x', (x1 + x2) / 2);
    textBase.setAttribute('y', baseY + 28);
    textBase.setAttribute('fill', '#222');
    textBase.setAttribute('text-anchor', 'middle');
    textBase.textContent = `${width} m`;
    bg.appendChild(textBase);

    // Draw verbotszone (forbidden margin). Allowed area is the inner offset roof polygon.
    const verbotszoneMeters = (parseFloat(verbotszoneInput.value) || 0) / 100;
    if (verbotszoneMeters > 0) {
      const roofPolyMeters = getRoofPolygonMeters(width, height);
      const allowedPolyMeters = insetConvexPolygon(roofPolyMeters, verbotszoneMeters);

      let innerPoints = '';
      if (allowedPolyMeters && allowedPolyMeters.length >= 3) {
        innerPoints = allowedPolyMeters
          .map(p => `${x1 + p.x * scale},${topY + p.y * scale}`)
          .join(' ');
      }

      // Shade the forbidden margin (outer area) and highlight the allowed inner triangle
      const forbiddenOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      forbiddenOverlay.setAttribute('points', points);
      forbiddenOverlay.setAttribute('fill', 'rgba(255,0,0,0.12)');
      forbiddenOverlay.setAttribute('stroke', 'none');
      bg.appendChild(forbiddenOverlay);

      if (innerPoints) {
        const allowedPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        allowedPolygon.setAttribute('points', innerPoints);
        allowedPolygon.setAttribute('fill', '#cfe8ff');
        allowedPolygon.setAttribute('stroke', '#f00');
        allowedPolygon.setAttribute('stroke-width', '1.5');
        bg.appendChild(allowedPolygon);
      }
    }

    // render modules into modulesLayer
    renderModulesIntoLayer(modulesLayer, x1, vbH, baseY, scale);
  }

  async function save(width, height) {
    const area = computeRoofArea(width, height);
    const payload = {
      width, height, area,
      moduleWidth: parseFloat(modWidthInput.value) || 0,
      moduleHeight: parseFloat(modHeightInput.value) || 0,
      moduleTiltDeg: getModuleTiltDeg(),
      power: parseFloat(modPowerInput.value) || 0,
      voc: parseFloat(modVocInput.value) || 0,
      current: parseFloat(modCurrentInput.value) || 0,
      mittelstegweite: (parseFloat(mittelstegInput.value) || 0) / 100,
      verbotszone: (parseFloat(verbotszoneInput.value) || 0) / 100,
      dachform: dachformSelect.value || 'zeltdach',
      firstLength: getFirstLengthMeters(width),
      modules: modules
    };
    try {
      await fetch('/api/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Unable to save values', e);
    }
  }

  function drawAndSave() {
    const width = parseFloat(widthInput.value) || 0;
    const height = parseFloat(heightInput.value) || 0;
    render(width, height);
    updateStringValues();
    if (width > 0 && height > 0) save(width, height);
  }

  function updateStringValues() {
    const moduleCount = modules.length;
    const modulePower = parseFloat(modPowerInput.value) || 0;
    const moduleVoc = parseFloat(modVocInput.value) || 0;
    
    const totalPower = moduleCount * modulePower;
    const totalVoc = moduleCount * moduleVoc;
    
    gesamtleistungEl.value = totalPower;
    vocEl.value = totalVoc;
  }

  function updateSelectionUI() {
    if (selectedModules.size === 0) {
      selXInput.value = '';
      selYInput.value = '';
      selXInput.disabled = true;
      selYInput.disabled = true;
      return;
    }
    
    selXInput.disabled = false;
    selYInput.disabled = false;
    
    const selectedList = Array.from(selectedModules).map(id => findModuleById(id)).filter(m => m);
    
    // Check if all X values are the same
    const xValues = selectedList.map(m => Number(m.left));
    const allXSame = xValues.every(v => v === xValues[0]);
    selXInput.value = allXSame ? xValues[0].toFixed(2) : '<...>';
    
    // Check if all Y values are the same
    const yValues = selectedList.map(m => Number(m.top || 0));
    const allYSame = yValues.every(v => v === yValues[0]);
    selYInput.value = allYSame ? yValues[0].toFixed(2) : '<...>';
  }

  // Module helpers
  function createModule(leftMeters, widthMeters) {
    return { id: Date.now() + Math.floor(Math.random()*1000), left: leftMeters, width: widthMeters, top: 0, rotation: 0 };
  }

  function metersToPx(m) { return m * lastScale; }
  function pxToMeters(px) { return px / lastScale; }

  function svgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  function ensureSpacing(desiredLeft, widthMeters) {
    const gap = parseFloat(mittelstegInput.value) || 0;
    const roofW = parseFloat(widthInput.value) || 0;
    const minLeft = 0;
    const maxLeft = Math.max(0, roofW - widthMeters);
    // Try offsets from 0 to roofW in small steps to find a non-overlapping spot (simple)
    const step = Math.max(0.01, widthMeters/10);
    for (let offset=0; offset<=roofW; offset+=step) {
      const candidates = [desiredLeft + offset, desiredLeft - offset];
      for (const c of candidates) {
        if (c < minLeft || c > maxLeft) continue;
        let ok = true;
        for (const m of modules) {
          const leftA = c;
          const rightA = c + widthMeters + 0.000001;
          const leftB = m.left;
          const otherPhysicalWidth = (m.width || parseFloat(modWidthInput.value) || 0);
          const otherProjectedWidth = getProjectedModuleDimsMeters(otherPhysicalWidth).widthMeters;
          const rightB = m.left + otherProjectedWidth;
          const minDist = otherProjectedWidth + widthMeters + gap;
          // check center distance approx
          if (Math.abs(leftA - leftB) < minDist && Math.abs(rightA - rightB) < minDist) { ok = false; break; }
          // simple overlap check
          if (!(rightA + gap <= leftB || leftA >= rightB + gap)) { ok = false; break; }
        }
        if (ok) return c;
      }
    }
    return Math.max(minLeft, Math.min(maxLeft, desiredLeft));
  }

  function snapToModules(leftMeters, topMeters, widthMeters, heightMeters, excludeId, snapThreshold = 0.05) {
    // Try to snap to edges of other modules
    let snappedLeft = leftMeters;
    let snappedTop = topMeters;
    let minDistLeft = snapThreshold;
    let minDistTop = snapThreshold;
    
    const rightMeters = leftMeters + widthMeters;
    const bottomMeters = topMeters + heightMeters;
    
    for (const m of modules) {
      if (String(m.id) === String(excludeId)) continue;
      
      const mPhysicalWidth = m.width || parseFloat(modWidthInput.value) || 0;
      const otherDims = getProjectedModuleDimsMeters(mPhysicalWidth);
      const mWidth = otherDims.widthMeters;
      const mHeight = otherDims.heightMeters;
      const mTop = Number(m.top) || 0;
      const mRight = m.left + mWidth;
      const mBottom = mTop + mHeight;
      
      // Snap left edge to other module's right edge
      const distToRight = Math.abs(leftMeters - mRight);
      if (distToRight < minDistLeft) {
        minDistLeft = distToRight;
        snappedLeft = mRight;
      }
      
      // Snap right edge to other module's left edge
      const distToLeft = Math.abs(rightMeters - m.left);
      if (distToLeft < minDistLeft) {
        minDistLeft = distToLeft;
        snappedLeft = m.left - widthMeters;
      }
      
      // Snap left edges together
      const distLeftToLeft = Math.abs(leftMeters - m.left);
      if (distLeftToLeft < minDistLeft) {
        minDistLeft = distLeftToLeft;
        snappedLeft = m.left;
      }
      
      // Snap right edges together
      const distRightToRight = Math.abs(rightMeters - mRight);
      if (distRightToRight < minDistLeft) {
        minDistLeft = distRightToRight;
        snappedLeft = mRight - widthMeters;
      }
      
      // Snap top edge to other module's bottom edge
      const distToBottom = Math.abs(topMeters - mBottom);
      if (distToBottom < minDistTop) {
        minDistTop = distToBottom;
        snappedTop = mBottom;
      }
      
      // Snap bottom edge to other module's top edge
      const distToTop = Math.abs(bottomMeters - mTop);
      if (distToTop < minDistTop) {
        minDistTop = distToTop;
        snappedTop = mTop - heightMeters;
      }
      
      // Snap top edges together
      const distTopToTop = Math.abs(topMeters - mTop);
      if (distTopToTop < minDistTop) {
        minDistTop = distTopToTop;
        snappedTop = mTop;
      }
      
      // Snap bottom edges together
      const distBottomToBottom = Math.abs(bottomMeters - mBottom);
      if (distBottomToBottom < minDistTop) {
        minDistTop = distBottomToBottom;
        snappedTop = mBottom - heightMeters;
      }
    }
    
    return { left: snappedLeft, top: snappedTop };
  }

  function snapToHeightLine(leftMeters, widthMeters, snapThreshold = 0.2) {
    // Snap module center to the height line (vertical center of roof) if within threshold
    const roofWidth = parseFloat(widthInput.value) || 0;
    const roofCenter = roofWidth / 2;
    const moduleCenter = leftMeters + widthMeters / 2;
    
    const distanceToLine = Math.abs(moduleCenter - roofCenter);
    if (distanceToLine < snapThreshold) {
      // Snap: place module so its center aligns with roof center
      return roofCenter - widthMeters / 2;
    }
    return leftMeters;
  }

  function getModuleBounds(leftMeters, topMeters, widthMeters, heightMeters, rotationDegrees) {
    // Calculate axis-aligned bounding box for a rotated rectangle
    const centerX = leftMeters + widthMeters / 2;
    const centerY = topMeters + heightMeters / 2;
    
    if (rotationDegrees === 0 || rotationDegrees === 180 || rotationDegrees === -180) {
      // No rotation or 180° - just return the rectangle
      return {
        left: leftMeters,
        right: leftMeters + widthMeters,
        top: topMeters,
        bottom: topMeters + heightMeters
      };
    }
    
    // Calculate bounding box for rotated rectangle
    const rad = (rotationDegrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    
    const boundWidth = widthMeters * cos + heightMeters * sin;
    const boundHeight = widthMeters * sin + heightMeters * cos;
    
    return {
      left: centerX - boundWidth / 2,
      right: centerX + boundWidth / 2,
      top: centerY - boundHeight / 2,
      bottom: centerY + boundHeight / 2
    };
  }

  function isPositionValid(leftMeters, topMeters, widthMeters, excludeId, rotationDegrees = 0) {
    const gap = (parseFloat(mittelstegInput.value) || 0) / 100; // convert cm to m
    const verbotszoneMeters = (parseFloat(verbotszoneInput.value) || 0) / 100; // convert cm to m
    const roofW = parseFloat(widthInput.value) || 0;
    const roofH = parseFloat(heightInput.value) || 0;
    const dimsA = getProjectedModuleDimsMeters(widthMeters);
    const moduleWidthMeters = dimsA.widthMeters;
    const moduleHeightMeters = dimsA.heightMeters;
    
    // Calculate bounds for the module being checked
    const boundsA = getModuleBounds(leftMeters, topMeters, moduleWidthMeters, moduleHeightMeters, rotationDegrees);
    
    // Check verbotszone boundaries (module must stay inside the inner offset roof polygon)
    // We only check the verbotszone - not the outer roof shape
    if (verbotszoneMeters > 0) {
      const d = verbotszoneMeters;
      const roofPolyMeters = getRoofPolygonMeters(roofW, roofH);
      const allowedPolyMeters = insetConvexPolygon(roofPolyMeters, d);
      if (!allowedPolyMeters || allowedPolyMeters.length < 3) return false;

      // Check all four corners of module bounds
      // Triangle coords: y=0 at apex, y=roofH at base (downward positive)
      // Module coords: top=0 at base, increases upward
      const corners = [
        { x: boundsA.left, y: roofH - boundsA.top },
        { x: boundsA.right, y: roofH - boundsA.top },
        { x: boundsA.left, y: roofH - boundsA.bottom },
        { x: boundsA.right, y: roofH - boundsA.bottom }
      ];

      for (const corner of corners) {
        if (!pointInConvexPolygon(corner, allowedPolyMeters)) return false; // outside allowed area
      }
    }
    
    // Check collisions with all other modules
    for (const m of modules) {
      if (String(m.id) === String(excludeId)) continue;
      
      const mPhysicalWidth = m.width || parseFloat(modWidthInput.value) || 0;
      const dimsB = getProjectedModuleDimsMeters(mPhysicalWidth);
      const mWidth = dimsB.widthMeters;
      const mHeight = dimsB.heightMeters;
      const mTop = Number(m.top) || 0;
      const mRotation = Number(m.rotation) || 0;
      
      const boundsB = getModuleBounds(m.left, mTop, mWidth, mHeight, mRotation);
      
      // AABB collision detection with gap
      const collides = !(
        boundsA.right + gap <= boundsB.left ||
        boundsA.left >= boundsB.right + gap ||
        boundsA.bottom + gap <= boundsB.top ||
        boundsA.top >= boundsB.bottom + gap
      );
      
      if (collides) return false;
    }
    return true;
  }

  function renderModules(x1, vbH, baseY, scale) {
    // draw module rects; modules can have vertical offset `top` in meters
    const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
    modules.forEach(m => {
      if (dragging && String(m.id) === String(dragging.id)) return; // skip drawing the dragging module (we use ghostRect)
      const pxLeft = x1 + (m.left * scale);
      const pxWidth = (m.width || parseFloat(modWidthInput.value) || 0) * scale;
      const pxHeight = moduleHeightMeters * scale;
      const topMeters = Number(m.top) || 0;
      const rectY = baseY - pxHeight - (topMeters * scale);
      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', pxLeft);
      rect.setAttribute('y', rectY);
      rect.setAttribute('width', pxWidth);
      rect.setAttribute('height', pxHeight);
      rect.setAttribute('fill', '#ffd59e');
      rect.setAttribute('stroke', '#b36b00');
      rect.setAttribute('data-id', m.id);
      rect.style.cursor = 'grab';
      svg.appendChild(rect);
    });
  }

  function renderModulesIntoLayer(layer, x1, vbH, baseY, scale) {
    // draw module rects into provided layer; modules can have vertical offset `top` in meters
    const tiltDeg = getEffectiveModuleTiltDeg();
    modules.forEach(m => {
      if (dragging && String(m.id) === String(dragging.id)) return; // skip drawing the dragging module (we use ghostRect)
      const physicalWidth = (m.width || parseFloat(modWidthInput.value) || 0);
      const dims = getProjectedModuleDimsMeters(physicalWidth);
      const pxLeft = x1 + (m.left * scale);
      const pxWidth = dims.widthMeters * scale;
      const pxHeight = dims.heightMeters * scale;
      const topMeters = Number(m.top) || 0;
      const rectY = baseY - pxHeight - (topMeters * scale);
      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', pxLeft);
      rect.setAttribute('y', rectY);
      rect.setAttribute('width', pxWidth);
      rect.setAttribute('height', pxHeight);
      
      // Different colors for selected vs unselected modules
      const isSelected = selectedModules.has(String(m.id));
      rect.setAttribute('fill', isSelected ? '#9ecfff' : '#ffd59e');
      rect.setAttribute('stroke', isSelected ? '#0066cc' : '#b36b00');
      rect.setAttribute('stroke-width', isSelected ? '2' : '1');
      
      rect.setAttribute('data-id', m.id);
      rect.style.cursor = 'grab';
      // Apply rotation transform around center of rect
      const rotation = Number(m.rotation) || 0;
      const centerX = pxLeft + pxWidth / 2;
      const centerY = rectY + pxHeight / 2;
      if (rotation !== 0) {
        rect.setAttribute('transform', `rotate(${rotation} ${centerX} ${centerY})`);
      }
      layer.appendChild(rect);

      // Visual hint for tilt (2D top view): linear gradient shading over the full module area.
      if (tiltDeg > 0.1) {
        const gradientId = ensureTiltLinearGradient(tiltDeg);
        if (gradientId) {
          const shade = document.createElementNS('http://www.w3.org/2000/svg','rect');
          shade.setAttribute('x', pxLeft);
          shade.setAttribute('y', rectY);
          shade.setAttribute('width', pxWidth);
          shade.setAttribute('height', pxHeight);
          shade.setAttribute('fill', `url(#${gradientId})`);
          shade.style.pointerEvents = 'none';
          if (rotation !== 0) {
            shade.setAttribute('transform', `rotate(${rotation} ${centerX} ${centerY})`);
          }
          layer.appendChild(shade);
        }
      }
    });
  }

  function findModuleById(id) {
    return modules.find(m => String(m.id) === String(id));
  }

  // Context menu handling
  let contextTarget = null; // {type:'svg'|'module', xPx, id}
  svg.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const p = svgPoint(ev.clientX, ev.clientY);
    const x = p.x;
    const y = p.y;
    // determine if clicked on module
    const target = ev.target;
    if (target && target.tagName === 'rect' && target.dataset && target.dataset.id) {
      contextTarget = { type: 'module', id: target.dataset.id, x, y };
      ctxDelete.style.display = 'block';
      ctxRotate.style.display = 'block';
    } else {
      contextTarget = { type: 'svg', x, y };
      ctxDelete.style.display = 'none';
      ctxRotate.style.display = 'none';
    }
    contextMenu.style.left = ev.clientX + 'px';
    contextMenu.style.top = ev.clientY + 'px';
    contextMenu.style.display = 'block';
  });

  document.addEventListener('click', () => { contextMenu.style.display = 'none'; });

  ctxAdd.addEventListener('click', () => {
    contextMenu.style.display = 'none';
    if (!contextTarget) return;
    // compute meters position from contextTarget (x, y in svg coords)
    const clickX = contextTarget.x;
    const clickY = contextTarget.y;
    const desiredLeftMeters = pxToMeters(clickX - lastX1);
    const mwPhysical = parseFloat(modWidthInput.value) || 0;
    const dims = getProjectedModuleDimsMeters(mwPhysical);
    const pxHeight = dims.heightMeters * lastScale;
    const desiredTopMeters = (lastBaseY - clickY - pxHeight) / lastScale;
    const left = ensureSpacing(desiredLeftMeters, dims.widthMeters);
    const newModule = createModule(left, mwPhysical);
    newModule.top = Math.max(0, desiredTopMeters);
    modules.push(newModule);
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w, h);
    updateStringValues();
    save(w,h);
  });

  ctxDelete.addEventListener('click', () => {
    contextMenu.style.display = 'none';
    if (!contextTarget || contextTarget.type !== 'module') return;
    modules = modules.filter(m => String(m.id) !== String(contextTarget.id));
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w,h);
    updateStringValues();
    save(w,h);
  });

  ctxRotate.addEventListener('click', () => {
    contextMenu.style.display = 'none';
    if (!contextTarget || contextTarget.type !== 'module') return;
    const m = findModuleById(contextTarget.id);
    if (!m) return;
    m.rotation = (Number(m.rotation) || 0) + 90;
    if (m.rotation >= 360) m.rotation -= 360;
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w,h);
    updateStringValues();
    save(w,h);
  });

  // Drag & drop: pointer events on svg
  svg.addEventListener('pointerdown', (ev) => {
    const target = ev.target;
    if (target && target.tagName === 'rect' && target.dataset && target.dataset.id) {
      const id = target.dataset.id;
      const m = findModuleById(id);
      if (!m) return;
      
      wasDragged = false; // Reset drag tracking
      
      const pt = svgPoint(ev.clientX, ev.clientY);
      dragStartSvgX = pt.x;
      dragStartSvgY = pt.y;
      const moduleLeftPx = lastX1 + (m.left * lastScale);
      const mwPhysical0 = (m.width || parseFloat(modWidthInput.value) || 0);
      const dims0 = getProjectedModuleDimsMeters(mwPhysical0);
      const pxWidth0 = dims0.widthMeters * lastScale;
      const pxHeight0 = dims0.heightMeters * lastScale;
      const moduleRectY = lastBaseY - pxHeight0 - (Number(m.top)||0) * lastScale;
      const offsetX = pt.x - moduleLeftPx;
      const offsetY = pt.y - moduleRectY;
      dragging = { id: m.id, startSvgX: pt.x, startSvgY: pt.y, origLeft: m.left, origTop: Number(m.top) || 0, offsetX, offsetY, moduleWidth: m.width || parseFloat(modWidthInput.value) || 0, lastValidLeft: m.left, lastValidTop: Number(m.top) || 0, moduleRotation: Number(m.rotation) || 0 };
      svg.setPointerCapture(ev.pointerId);
      // create ghost rect for smooth dragging in overlay layer
      if (ghostRect) { try { ghostRect.remove(); } catch(e) {} }
      const overlay = svg.querySelector('#overlay-layer') || (function(){ const g = document.createElementNS('http://www.w3.org/2000/svg','g'); g.setAttribute('id','overlay-layer'); svg.appendChild(g); return g; })();
      ghostRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      ghostRect.setAttribute('fill', '#ffd59e');
      ghostRect.setAttribute('stroke', '#b36b00');
      ghostRect.setAttribute('opacity', '0.95');
      ghostRect.setAttribute('data-id', m.id);
      ghostRect.style.pointerEvents = 'none';
      overlay.appendChild(ghostRect);
      // position initial ghost at module position so it doesn't jump
      const pxLeft0 = moduleLeftPx;
      const rectY0 = moduleRectY;
      ghostRect.setAttribute('x', pxLeft0);
      ghostRect.setAttribute('y', rectY0);
      ghostRect.setAttribute('width', pxWidth0);
      ghostRect.setAttribute('height', pxHeight0);
      // Apply rotation transform to ghost rect
      const rotation0 = Number(m.rotation) || 0;
      if (rotation0 !== 0) {
        const centerX0 = pxLeft0 + pxWidth0 / 2;
        const centerY0 = rectY0 + pxHeight0 / 2;
        ghostRect.setAttribute('transform', `rotate(${rotation0} ${centerX0} ${centerY0})`);
      }
    }
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    ev.preventDefault();
    
    const pt = svgPoint(ev.clientX, ev.clientY);
    
    // Check if mouse moved enough to be considered a drag (3px threshold)
    const dx = pt.x - dragging.startSvgX;
    const dy = pt.y - dragging.startSvgY;
    const distance = Math.sqrt(dx*dx + dy*dy);
    if (distance > 3) {
      wasDragged = true; // Mark that dragging occurred
    }
    
    // update ghost rect position directly (follow pointer)
    if (ghostRect) {
      const pxLeft = pt.x - dragging.offsetX;
      const pxTop = pt.y - dragging.offsetY;
      
      // Calculate target position in meters
      const mwPhysical = dragging.moduleWidth || parseFloat(modWidthInput.value) || 0;
      const dims = getProjectedModuleDimsMeters(mwPhysical);
      const mw = dims.widthMeters;
      const moduleHeightMeters = dims.heightMeters;
      const pxHeight = moduleHeightMeters * lastScale;
      let targetLeftMeters = pxToMeters(pxLeft - lastX1);
      let targetTopMeters = (lastBaseY - pxTop - pxHeight) / lastScale;
      
      // Apply snapping
      const snapped = snapToModules(targetLeftMeters, targetTopMeters, mw, moduleHeightMeters, dragging.id);
      targetLeftMeters = snapped.left;
      targetTopMeters = snapped.top;
      
      // Apply height line snapping
      targetLeftMeters = snapToHeightLine(targetLeftMeters, mw, 0.2);
      
      // Check collision
      const isValid = isPositionValid(targetLeftMeters, targetTopMeters, mwPhysical, dragging.id, dragging.moduleRotation);
      
      // Update last valid position if current position is valid
      const m = findModuleById(dragging.id);
      if (isValid) {
        dragging.lastValidLeft = targetLeftMeters;
        dragging.lastValidTop = targetTopMeters;
      }
      
      // Set color based on validity
      ghostRect.setAttribute('fill', isValid ? '#ffd59e' : '#ff6b6b');
      
      // Update ghost position with snapped coordinates
      const snappedPxLeft = lastX1 + (targetLeftMeters * lastScale);
      const snappedPxTop = lastBaseY - pxHeight - (targetTopMeters * lastScale);
      
      ghostRect.setAttribute('x', snappedPxLeft);
      ghostRect.setAttribute('y', snappedPxTop);
      // update transform center for rotation to follow the new position
      if (m) {
        const rotation = Number(m.rotation) || 0;
        if (rotation !== 0) {
          const pxWidth0 = mw * lastScale;
          const centerX = snappedPxLeft + pxWidth0 / 2;
          const centerY = snappedPxTop + pxHeight / 2;
          ghostRect.setAttribute('transform', `rotate(${rotation} ${centerX} ${centerY})`);
        } else {
          ghostRect.removeAttribute('transform');
        }
      }
    }
    // re-render modules layer to hide dragging module
    const modulesLayer = svg.querySelector('#modules-layer');
    if (modulesLayer) {
      modulesLayer.innerHTML = '';
      const w = parseFloat(widthInput.value) || 0;
      const h = parseFloat(heightInput.value) || 0;
      renderModulesIntoLayer(modulesLayer, lastX1, svg.viewBox.baseVal.height, lastBaseY, lastScale);
    }
  });

  svg.addEventListener('pointerup', (ev) => {
    if (!dragging) return;
    try { svg.releasePointerCapture(ev.pointerId); } catch(e) {}
    
    const draggedModuleId = dragging.id;
    
    // compute final module position from ghost position
    const pt = svgPoint(ev.clientX, ev.clientY);
    const m = findModuleById(dragging.id);
    if (m) {
      const mwPhysical = m.width || parseFloat(modWidthInput.value) || 0;
      const dims = getProjectedModuleDimsMeters(mwPhysical);
      const mw = dims.widthMeters;
      const moduleHeightMeters = dims.heightMeters;
      const pxHeight = moduleHeightMeters * lastScale;
      // compute new position based on pointer minus initial offset
      const targetLeftPx = pt.x - dragging.offsetX;
      const desiredLeftMeters = pxToMeters(targetLeftPx - lastX1);
      const rectY = pt.y - dragging.offsetY;
      const desiredTopMeters = (lastBaseY - rectY - pxHeight) / lastScale;
      
      // Apply height line snapping
      const snappedLeftMeters = snapToHeightLine(desiredLeftMeters, mw, 0.2);
      
      // Check if position is valid with collision detection
      if (isPositionValid(snappedLeftMeters, desiredTopMeters, mwPhysical, dragging.id, dragging.moduleRotation)) {
        m.left = Math.max(0, Math.min(snappedLeftMeters, (parseFloat(widthInput.value)||0) - mw));
        m.top = desiredTopMeters;
      } else {
        // Position invalid, use last valid position
        m.left = dragging.lastValidLeft;
        m.top = dragging.lastValidTop;
      }
    }
    dragging = null;
    // remove ghost and re-render final state
    if (ghostRect) { try { ghostRect.remove(); } catch(e) {} ghostRect = null; }
    
    // Handle selection if it was a click (not a drag)
    if (!wasDragged) {
      const id = String(draggedModuleId);
      if (selectedModules.has(id)) {
        selectedModules.delete(id);
      } else {
        selectedModules.add(id);
      }
      updateSelectionUI();
    }
    
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w,h);
    updateStringValues();
    save(w,h);
  });

  svg.addEventListener('pointercancel', (ev) => {
    if (!dragging) return;
    try { svg.releasePointerCapture(ev.pointerId); } catch(e) {}
    dragging = null;
    if (ghostRect) { try { ghostRect.remove(); } catch(e) {} ghostRect = null; }
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w,h);
    updateStringValues();
    save(w,h);
  });

  if (drawBtn) drawBtn.addEventListener('click', drawAndSave);
  widthInput.addEventListener('change', drawAndSave);
  heightInput.addEventListener('change', drawAndSave);
  if (firstLengthInput) firstLengthInput.addEventListener('change', drawAndSave);
  mittelstegInput.addEventListener('change', drawAndSave);
  verbotszoneInput.addEventListener('change', drawAndSave);
  modWidthInput.addEventListener('change', drawAndSave);
  modHeightInput.addEventListener('change', drawAndSave);
  if (modTiltInput) modTiltInput.addEventListener('change', drawAndSave);
  modPowerInput.addEventListener('change', drawAndSave);
  modVocInput.addEventListener('change', drawAndSave);
  modCurrentInput.addEventListener('change', drawAndSave);
  if (dachformSelect) {
    // `input` updates immediately (e.g. keyboard navigation), `change` persists/redraws.
    dachformSelect.addEventListener('input', updateDachformUI);
    dachformSelect.addEventListener('change', () => { updateDachformUI(); drawAndSave(); });
    updateDachformUI();
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      modules = [];
      selectedModules.clear();
      const w = parseFloat(widthInput.value) || 0;
      const h = parseFloat(heightInput.value) || 0;
      render(w, h);
      updateStringValues();
      updateSelectionUI();
      save(w, h);
    });
  }
  
  // Selection position input handlers
  selXInput.addEventListener('change', () => {
    const val = selXInput.value;
    if (val === '<...>' || val === '') return;
    const newX = parseFloat(val);
    if (!isFinite(newX)) return;
    
    Array.from(selectedModules).forEach(id => {
      const m = findModuleById(id);
      if (m) m.left = Math.max(0, newX);
    });
    
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w, h);
    save(w, h);
  });
  
  selYInput.addEventListener('change', () => {
    const val = selYInput.value;
    if (val === '<...>' || val === '') return;
    const newY = parseFloat(val);
    if (!isFinite(newY)) return;
    
    Array.from(selectedModules).forEach(id => {
      const m = findModuleById(id);
      if (m) m.top = newY;
    });
    
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w, h);
    save(w, h);
  });
  
  window.addEventListener('resize', () => {
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w, h);
  });

  // Load saved values from server
  (async function loadSaved(){
    try {
      const res = await fetch('/api/values');
      if (!res.ok) throw new Error('no data');
      const json = await res.json();
      if (json && json.width) {
        if (dachformSelect) dachformSelect.value = json.dachform || 'zeltdach';
        if (firstLengthInput) firstLengthInput.value = (json.firstLength != null ? json.firstLength : 0);
        updateDachformUI();
        widthInput.value = json.width;
        heightInput.value = json.height || heightInput.value;
        modWidthInput.value = json.moduleWidth || modWidthInput.value;
        modHeightInput.value = json.moduleHeight || modHeightInput.value;
        if (modTiltInput) modTiltInput.value = (json.moduleTiltDeg != null ? json.moduleTiltDeg : (json.moduleTilt || 0));
        modPowerInput.value = json.power || modPowerInput.value;
        modVocInput.value = json.voc || modVocInput.value;
        modCurrentInput.value = json.current || modCurrentInput.value;
        mittelstegInput.value = ((json.mittelstegweite || 0) * 100) || mittelstegInput.value;
        verbotszoneInput.value = ((json.verbotszone || 0) * 100) || verbotszoneInput.value;
        modules = Array.isArray(json.modules) ? json.modules.map(m => ({ id: m.id || (Date.now()+Math.floor(Math.random()*1000)), left: Number(m.left||m.leftMeters||0), width: Number(m.width||m.widthMeters||modWidthInput.value||0), top: Number(m.top||0), rotation: Number(m.rotation||0) })) : modules;
        render(Number(json.width), Number(json.height || heightInput.value));
        updateStringValues();
        updateSelectionUI();
      } else {
        drawAndSave();
      }
    } catch (e) {
      drawAndSave();
    }
    updateSelectionUI(); // Initialize selection UI
  })();
})();
