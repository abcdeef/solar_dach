const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'values.json');

// Ensure data directory and file exist
if (!fsSync.existsSync(dataDir)) fsSync.mkdirSync(dataDir, { recursive: true });
if (!fsSync.existsSync(dataFile)) fsSync.writeFileSync(dataFile, JSON.stringify({}), 'utf8');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: get last saved values
app.get('/api/values', async (req, res) => {
  try {
    const content = await fs.readFile(dataFile, 'utf8');
    const json = content ? JSON.parse(content) : {};
    res.json(json);
  } catch (err) {
    console.error('Error reading data file', err);
    res.status(500).json({ error: 'Unable to read data' });
  }
});

// API: save values (width, height, area, timestamp)
app.post('/api/values', async (req, res) => {
  try {
    const body = req.body || {};
    const w = Number(body.width);
    const h = Number(body.height);
    const a = Number(body.area);
    if (!isFinite(w) || !isFinite(h)) {
      return res.status(400).json({ error: 'Invalid width or height' });
    }

    const payload = {
      width: w,
      height: h,
      area: isFinite(a) ? a : 0,
      dachform: String(body.dachform || 'zeltdach'),
      firstLength: Number(body.firstLength) || 0,
      moduleWidth: Number(body.moduleWidth) || 0,
      moduleHeight: Number(body.moduleHeight) || 0,
      rotation: Number(body.rotation) || 0,
      power: Number(body.power) || 0,
      voc: Number(body.voc) || 0,
      current: Number(body.current) || 0,
      mittelstegweite: Number(body.mittelstegweite) || 0,
      verbotszone: Number(body.verbotszone) || 0,
      modules: Array.isArray(body.modules) ? body.modules : [],
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(dataFile, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, saved: payload });
  } catch (err) {
    console.error('Error writing data file', err);
    res.status(500).json({ error: 'Unable to save data' });
  }
});

app.listen(port, () => console.log(`Server läuft: http://localhost:${port}`));
