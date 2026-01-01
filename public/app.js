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
  const endweiteInput = document.getElementById('endweite');
  const contextMenu = document.getElementById('context-menu');
  const ctxAdd = document.getElementById('ctx-add');
  const ctxDelete = document.getElementById('ctx-delete');
  const ctxRotate = document.getElementById('ctx-rotate');

  let modules = []; // stored as {id, leftMeters, widthMeters}
  let dragging = null;
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
    if (!bg) { bg = document.createElementNS('http://www.w3.org/2000/svg','g'); bg.setAttribute('id','bg-layer'); svg.appendChild(bg); }
    if (!modulesLayer) { modulesLayer = document.createElementNS('http://www.w3.org/2000/svg','g'); modulesLayer.setAttribute('id','modules-layer'); svg.appendChild(modulesLayer); }
    if (!overlay) { overlay = document.createElementNS('http://www.w3.org/2000/svg','g'); overlay.setAttribute('id','overlay-layer'); svg.appendChild(overlay); }

    // clear and draw background and modules layer (leave overlay intact so ghostRect survives)
    bg.innerHTML = '';
    modulesLayer.innerHTML = '';

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

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', topX);
    text.setAttribute('y', topY - 8);
    text.setAttribute('fill', '#222');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = `${height} m`;
    bg.appendChild(text);

    const textBase = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textBase.setAttribute('x', (x1 + x2) / 2);
    textBase.setAttribute('y', baseY + 28);
    textBase.setAttribute('fill', '#222');
    textBase.setAttribute('text-anchor', 'middle');
    textBase.textContent = `${width} m`;
    bg.appendChild(textBase);

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
      current: parseFloat(modCurrentInput.value) || 0
      ,mittelstegweite: parseFloat(mittelstegInput.value) || 0
      ,endweite: parseFloat(endweiteInput.value) || 0
      ,modules: modules
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
    if (width > 0 && height > 0) save(width, height);
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
    const gap = parseFloat(mittelstegInput.value) || 0;
    const roofW = parseFloat(widthInput.value) || 0;
    const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
    
    // Calculate bounds for the module being checked
    const boundsA = getModuleBounds(leftMeters, topMeters, widthMeters, moduleHeightMeters, rotationDegrees);
    
    // Check roof bounds
    if (boundsA.left < 0 || boundsA.right > roofW) return false;
    
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
      rect.setAttribute('fill', '#ffd59e');
      rect.setAttribute('stroke', '#b36b00');
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
    save(w,h);
  });

  ctxDelete.addEventListener('click', () => {
    contextMenu.style.display = 'none';
    if (!contextTarget || contextTarget.type !== 'module') return;
    modules = modules.filter(m => String(m.id) !== String(contextTarget.id));
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w,h);
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
    save(w,h);
  });

  // Drag & drop: pointer events on svg
  svg.addEventListener('pointerdown', (ev) => {
    const target = ev.target;
    if (target && target.tagName === 'rect' && target.dataset && target.dataset.id) {
      ev.preventDefault();
      const id = target.dataset.id;
      const m = findModuleById(id);
      if (!m) return;
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
    // update ghost rect position directly (follow pointer)
    if (ghostRect) {
      const pxLeft = pt.x - dragging.offsetX;
      const pxTop = pt.y - dragging.offsetY;
      
      // Calculate target position in meters
      const mw = dragging.moduleWidth || parseFloat(modWidthInput.value) || 0;
      const moduleHeightMeters = parseFloat(modHeightInput.value) || 0.0;
      const pxHeight = moduleHeightMeters * lastScale;
      const targetLeftMeters = pxToMeters(pxLeft - lastX1);
      const targetTopMeters = (lastBaseY - pxTop - pxHeight) / lastScale;
      
      // Check collision
      const isValid = isPositionValid(targetLeftMeters, Math.max(0, targetTopMeters), mw, dragging.id, dragging.moduleRotation);
      
      // Update last valid position if current position is valid
      const m = findModuleById(dragging.id);
      if (isValid) {
        dragging.lastValidLeft = targetLeftMeters;
        dragging.lastValidTop = Math.max(0, targetTopMeters);
      }
      
      // Set color based on validity
      ghostRect.setAttribute('fill', isValid ? '#ffd59e' : '#ff6b6b');
      
      ghostRect.setAttribute('x', pxLeft);
      ghostRect.setAttribute('y', pxTop);
      // update transform center for rotation to follow the new position
      if (m) {
        const rotation = Number(m.rotation) || 0;
        if (rotation !== 0) {
          const pxWidth0 = (m.width || parseFloat(modWidthInput.value) || 0) * lastScale;
          const pxHeight0 = moduleHeightMeters * lastScale;
          const centerX = pxLeft + pxWidth0 / 2;
          const centerY = pxTop + pxHeight0 / 2;
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
      
      // Check if position is valid with collision detection
      if (isPositionValid(desiredLeftMeters, Math.max(0, desiredTopMeters), mw, dragging.id, dragging.moduleRotation)) {
        m.left = Math.max(0, Math.min(desiredLeftMeters, (parseFloat(widthInput.value)||0) - mw));
        m.top = Math.max(0, desiredTopMeters);
      } else {
        // Position invalid, use last valid position
        m.left = dragging.lastValidLeft;
        m.top = dragging.lastValidTop;
      }
      
      // Ensure top is within bounds
      const maxTopMeters = Math.max(0, (lastBaseY - moduleHeightMeters*lastScale) / lastScale);
      m.top = Math.max(0, Math.min(maxTopMeters, m.top));
    }
    dragging = null;
    // remove ghost and re-render final state
    if (ghostRect) { try { ghostRect.remove(); } catch(e) {} ghostRect = null; }
    const w = parseFloat(widthInput.value) || 0;
    const h = parseFloat(heightInput.value) || 0;
    render(w,h);
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
  });

  drawBtn.addEventListener('click', drawAndSave);
  widthInput.addEventListener('change', drawAndSave);
  heightInput.addEventListener('change', drawAndSave);
  mittelstegInput.addEventListener('change', drawAndSave);
  endweiteInput.addEventListener('change', drawAndSave);
  modWidthInput.addEventListener('change', drawAndSave);
  modHeightInput.addEventListener('change', drawAndSave);
  modPowerInput.addEventListener('change', drawAndSave);
  modVocInput.addEventListener('change', drawAndSave);
  modCurrentInput.addEventListener('change', drawAndSave);
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
        modRotationInput.value = json.rotation || modRotationInput.value;
        modPowerInput.value = json.power || modPowerInput.value;
        modVocInput.value = json.voc || modVocInput.value;
        modCurrentInput.value = json.current || modCurrentInput.value;
        mittelstegInput.value = json.mittelstegweite || mittelstegInput.value;
        endweiteInput.value = json.endweite || endweiteInput.value;
        modules = Array.isArray(json.modules) ? json.modules.map(m => ({ id: m.id || (Date.now()+Math.floor(Math.random()*1000)), left: Number(m.left||m.leftMeters||0), width: Number(m.width||m.widthMeters||modWidthInput.value||0), top: Number(m.top||0), rotation: Number(m.rotation||0) })) : modules;
        render(Number(json.width), Number(json.height || heightInput.value));
      } else {
        drawAndSave();
      }
    } catch (e) {
      drawAndSave();
    }
  })();
})();
