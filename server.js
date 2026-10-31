// Serveur minimal : catalogue de vidéos + téléchargement avec quota de 35 par jour et par utilisateur.
// Aucune dépendance externe. Lancer avec : node server.js  (puis ouvrir http://localhost:3000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DAILY_LIMIT = 35;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'videos.json');
const QUOTA_FILE = path.join(ROOT, 'data', 'quota.json');

const readJSON = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const today = () => new Date().toISOString().slice(0, 10);

function getUserId(req, res) {
  const cookie = (req.headers.cookie || '').match(/uid=([a-f0-9]{32})/);
  if (cookie) return cookie[1];
  const uid = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `uid=${uid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  return uid;
}

function quotaFor(uid) {
  const all = readJSON(QUOTA_FILE, {});
  const used = (all[uid] && all[uid].date === today()) ? all[uid].count : 0;
  return { used, remaining: Math.max(0, DAILY_LIMIT - used) };
}

function consumeQuota(uid) {
  const all = readJSON(QUOTA_FILE, {});
  const entry = all[uid] && all[uid].date === today() ? all[uid] : { date: today(), count: 0 };
  if (entry.count >= DAILY_LIMIT) return false;
  entry.count += 1;
  all[uid] = entry;
  writeJSON(QUOTA_FILE, all);
  return true;
}

const sendJSON = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const uid = getUserId(req, res);

  if (req.method === 'GET' && url.pathname === '/api/videos') {
    return sendJSON(res, 200, readJSON(DATA_FILE, []));
  }

  if (req.method === 'GET' && url.pathname === '/api/quota') {
    return sendJSON(res, 200, quotaFor(uid));
  }

  // Téléchargement : vérifie le quota, incrémente, puis renvoie le fichier.
  const dl = url.pathname.match(/^\/api\/download\/([\w-]+)$/);
  if (req.method === 'GET' && dl) {
    const video = readJSON(DATA_FILE, []).find(v => v.id === dl[1]);
    if (!video) return sendJSON(res, 404, { error: 'Vidéo introuvable' });
    if (!consumeQuota(uid)) {
      return sendJSON(res, 429, { error: `Limite de ${DAILY_LIMIT} téléchargements atteinte pour aujourd'hui` });
    }
    const file = path.join(PUBLIC, 'uploads', path.basename(video.file));
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: 'Fichier manquant' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(file)}"`
    });
    return fs.createReadStream(file).pipe(res);
  }

  // Fichiers statiques
  let filePath = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC)) return sendJSON(res, 403, { error: 'Interdit' });
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }
  sendJSON(res, 404, { error: 'Introuvable' });
}).listen(PORT, () => console.log(`Plateforme sur http://localhost:${PORT}`));
