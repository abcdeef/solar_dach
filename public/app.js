(function(){
  const svg = document.getElementById('roof');
  const widthInput = document.getElementById('width');
  const heightInput = document.getElementById('height');
  const drawBtn = document.getElementById('draw');
  const areaEl = document.getElementById('area');
  const modWidthInput = document.getElementById('mod-width');
  const modHeightInput = document.getElementById('mod-height');
  const modPowerInput = document.getElementById('mod-power');
  const modVocInput = document.getElementById('mod-voc');
  const modCurrentInput = document.getElementById('mod-current');
  const mittelstegInput = document.getElementById('mittelstegweite');
  const verbotszoneInput = document.getElementById('verbotszone');
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

  function render(width, height) {
    const area = 0.5 * width * height;
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

    const points = `${x1},${baseY} ${x2},${baseY} ${topX},${topY}`;

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

    // Draw verbotszone (forbidden margin). Allowed area is the inner offset triangle.
    const verbotszoneMeters = (parseFloat(verbotszoneInput.value) || 0) / 100;
    if (verbotszoneMeters > 0) {
      const d = verbotszoneMeters;
      const roofW = width;
      const roofH = height;
      // Triangle vertices (meters)
      const A = { x: 0, y: roofH };           // bottom-left
      const B = { x: roofW, y: roofH };       // bottom-right
      const C = { x: roofW / 2, y: 0 };       // top

      // Helper: build offset line (ax + by + c = 0) with inward normal so that inside is >=0
      const makeOffsetLine = (p1, p2, inwardPoint, offset) => {
        let a = p1.y - p2.y;
        let b = p2.x - p1.x;
        let c = p1.x * p2.y - p2.x * p1.y;
        const side = a * inwardPoint.x + b * inwardPoint.y + c;
        if (side < 0) {
          a *= -1; b *= -1; c *= -1;
        }
        const len = Math.hypot(a, b);
        c -= offset * len; // move inward by offset
        return { a, b, c };
      };

      // Intersection of two lines ax + by + c = 0
      const intersect = (L1, L2) => {
        const det = L1.a * L2.b - L2.a * L1.b;
        return {
          x: (L1.b * L2.c - L2.b * L1.c) / det,
          y: (L1.c * L2.a - L2.c * L1.a) / det
        };
      };

      const inwardTest = { x: roofW / 2, y: roofH / 3 }; // inside the triangle
      const lineLeft = makeOffsetLine(A, C, inwardTest, d);
      const lineRight = makeOffsetLine(B, C, inwardTest, d);
      const lineBottom = makeOffsetLine(A, B, inwardTest, d);

      const P1 = intersect(lineLeft, lineBottom);  // left-bottom inner vertex
      const P2 = intersect(lineRight, lineBottom); // right-bottom inner vertex
      const P3 = intersect(lineLeft, lineRight);   // top inner vertex

      // Convert to pixels
      const innerX1 = x1 + P1.x * scale;
      const innerX2 = x1 + P2.x * scale;
      const innerTopX = x1 + P3.x * scale;
      const innerBaseY = baseY - (roofH - P1.y) * scale;
      const innerTopY = topY + P3.y * scale;

      const innerPoints = `${innerX1},${innerBaseY} ${innerX2},${innerBaseY} ${innerTopX},${innerTopY}`;

      // Shade the forbidden margin (outer area) and highlight the allowed inner triangle
      const forbiddenOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      forbiddenOverlay.setAttribute('points', points);
      forbiddenOverlay.setAttribute('fill', 'rgba(255,0,0,0.12)');
      forbiddenOverlay.setAttribute('stroke', 'none');
      bg.appendChild(forbiddenOverlay);

      const allowedPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      allowedPolygon.setAttribute('points', innerPoints);
      allowedPolygon.setAttribute('fill', '#cfe8ff');
      allowedPolygon.setAttribute('stroke', '#f00');
      allowedPolygon.setAttribute('stroke-width', '1.5');
      bg.appendChild(allowedPolygon);
    }

    // render modules into modulesLayer
    renderModulesIntoLayer(modulesLayer, x1, vbH, baseY, scale);
  }

  async function save(width, height) {
    const area = 0.5 * width * height;
    const payload = {
      width, height, area,
      moduleWidth: parseFloat(modWidthInput.value) || 0,
      moduleHeight: parseFloat(modHeightInput.value) || 0,
      power: parseFloat(modPowerInput.value) || 0,
      voc: parseFloat(modVocInput.value) || 0,
      current: parseFloat(modCurrentInput.value) || 0,
      mittelstegweite: (parseFloat(mittelstegInput.value) || 0) / 100,
      verbotszone: (parseFloat(verbotszoneInput.value) || 0) / 100,
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
          const rightB = m.left + (m.width || parseFloat(modWidthInput.value) || 0);
          const minDist = (m.width || parseFloat(modWidthInput.value) || 0) + widthMeters + gap;
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
    
    const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
    const rightMeters = leftMeters + widthMeters;
    const bottomMeters = topMeters + heightMeters;
    
    for (const m of modules) {
      if (String(m.id) === String(excludeId)) continue;
      
      const mWidth = m.width || parseFloat(modWidthInput.value) || 0;
      const mTop = Number(m.top) || 0;
      const mRight = m.left + mWidth;
      const mBottom = mTop + moduleHeightMeters;
      
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
    const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
    
    // Calculate bounds for the module being checked
    const boundsA = getModuleBounds(leftMeters, topMeters, widthMeters, moduleHeightMeters, rotationDegrees);
    
    // Check verbotszone boundaries (module must stay inside the inner triangle)
    // We only check the verbotszone - not the outer roof shape
    if (verbotszoneMeters > 0) {
      // Compute inner triangle via parallel offset of each edge by distance d
      const d = verbotszoneMeters;
      const A = { x: 0, y: roofH };
      const B = { x: roofW, y: roofH };
      const C = { x: roofW / 2, y: 0 };

      const makeOffsetLine = (p1, p2, inwardPoint, offset) => {
        let a = p1.y - p2.y;
        let b = p2.x - p1.x;
        let c = p1.x * p2.y - p2.x * p1.y;
        const side = a * inwardPoint.x + b * inwardPoint.y + c;
        if (side < 0) { a *= -1; b *= -1; c *= -1; }
        const len = Math.hypot(a, b);
        c -= offset * len;
        return { a, b, c };
      };

      const intersect = (L1, L2) => {
        const det = L1.a * L2.b - L2.a * L1.b;
        return {
          x: (L1.b * L2.c - L2.b * L1.c) / det,
          y: (L1.c * L2.a - L2.c * L1.a) / det
        };
      };

      const inwardTest = { x: roofW / 2, y: roofH / 3 };
      const lineLeft = makeOffsetLine(A, C, inwardTest, d);
      const lineRight = makeOffsetLine(B, C, inwardTest, d);
      const lineBottom = makeOffsetLine(A, B, inwardTest, d);

      const P1 = intersect(lineLeft, lineBottom);
      const P2 = intersect(lineRight, lineBottom);
      const P3 = intersect(lineLeft, lineRight);

      // Point-in-triangle test (barycentric via sign of areas)
      const ptInTri = (p, a, b, c) => {
        const sign = (p, q, r) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
        const d1 = sign(p, a, b);
        const d2 = sign(p, b, c);
        const d3 = sign(p, c, a);
        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        return !(hasNeg && hasPos);
      };

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
        if (!ptInTri(corner, P1, P2, P3)) return false; // outside allowed triangle
      }
    }
    
    // Check collisions with all other modules
    for (const m of modules) {
      if (String(m.id) === String(excludeId)) continue;
      
      const mWidth = m.width || parseFloat(modWidthInput.value) || 0;
      const mTop = Number(m.top) || 0;
      const mRotation = Number(m.rotation) || 0;
      
      const boundsB = getModuleBounds(m.left, mTop, mWidth, moduleHeightMeters, mRotation);
      
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
      
      // Different colors for selected vs unselected modules
      const isSelected = selectedModules.has(String(m.id));
      rect.setAttribute('fill', isSelected ? '#9ecfff' : '#ffd59e');
      rect.setAttribute('stroke', isSelected ? '#0066cc' : '#b36b00');
      rect.setAttribute('stroke-width', isSelected ? '2' : '1');
      
      rect.setAttribute('data-id', m.id);
      rect.style.cursor = 'grab';
      // Apply rotation transform around center of rect
      const rotation = Number(m.rotation) || 0;
      if (rotation !== 0) {
        const centerX = pxLeft + pxWidth / 2;
        const centerY = rectY + pxHeight / 2;
        rect.setAttribute('transform', `rotate(${rotation} ${centerX} ${centerY})`);
      }
      layer.appendChild(rect);
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
    const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
    const pxHeight = moduleHeightMeters * lastScale;
    const desiredTopMeters = (lastBaseY - clickY - pxHeight) / lastScale;
    const mw = parseFloat(modWidthInput.value) || 0;
    const left = ensureSpacing(desiredLeftMeters, mw);
    const newModule = createModule(left, mw);
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
      const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
      const pxHeight0 = moduleHeightMeters * lastScale;
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
      const pxWidth0 = (m.width || parseFloat(modWidthInput.value) || 0) * lastScale;
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
      const mw = dragging.moduleWidth || parseFloat(modWidthInput.value) || 0;
      const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
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
      const isValid = isPositionValid(targetLeftMeters, targetTopMeters, mw, dragging.id, dragging.moduleRotation);
      
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
      const mw = m.width || parseFloat(modWidthInput.value) || 0;
      const moduleHeightMeters = parseFloat(modHeightInput.value) || 0;
      const pxHeight = moduleHeightMeters * lastScale;
      // compute new position based on pointer minus initial offset
      const targetLeftPx = pt.x - dragging.offsetX;
      const desiredLeftMeters = pxToMeters(targetLeftPx - lastX1);
      const rectY = pt.y - dragging.offsetY;
      const desiredTopMeters = (lastBaseY - rectY - pxHeight) / lastScale;
      
      // Apply height line snapping
      const snappedLeftMeters = snapToHeightLine(desiredLeftMeters, mw, 0.2);
      
      // Check if position is valid with collision detection
      if (isPositionValid(snappedLeftMeters, desiredTopMeters, mw, dragging.id, dragging.moduleRotation)) {
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
  mittelstegInput.addEventListener('change', drawAndSave);
  verbotszoneInput.addEventListener('change', drawAndSave);
  modWidthInput.addEventListener('change', drawAndSave);
  modHeightInput.addEventListener('change', drawAndSave);
  modPowerInput.addEventListener('change', drawAndSave);
  modVocInput.addEventListener('change', drawAndSave);
  modCurrentInput.addEventListener('change', drawAndSave);
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
        widthInput.value = json.width;
        heightInput.value = json.height || heightInput.value;
        modWidthInput.value = json.moduleWidth || modWidthInput.value;
        modHeightInput.value = json.moduleHeight || modHeightInput.value;
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
