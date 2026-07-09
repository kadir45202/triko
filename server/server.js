/**
 * Maskot Backend — Sprint 2 "lite"
 *
 * Sıfır bağımlılık (sadece Node yerleşikleri). Demo/pitch amaçlı:
 *  - POST /api/widget/event       → analitik event'i events.jsonl'e ekler
 *  - GET  /api/widget/config      → token'a göre konfig döner (şimdilik demo config)
 *  - GET  /api/analytics/summary  → event özetini hesaplar (JSON)
 *  - GET  /analytics (ve /)       → canlı analitik dashboard'u (HTML)
 *
 * Üretim sürümü spec'e göre Fastify + PostgreSQL + Redis olacak;
 * bu sunucu widget'ın uçtan uca akışını ve pitch dashboard'unu çalıştırır.
 *
 * Çalıştırma: node server/server.js  (port 3001)
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = process.env.PORT || 3001;
var EVENTS_FILE = path.join(__dirname, 'events.jsonl');
var ROOT = path.join(__dirname, '..'); // repo kökü — statik servis buradan

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
};

// Statik dosya servisi: /store/, /widget/, /demo/ → tek komutla tüm demo
function serveStatic(req, res, urlPath) {
  var clean = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  var filePath = path.resolve(path.join(ROOT, clean));
  if (filePath.indexOf(path.resolve(ROOT)) !== 0) {
    sendJSON(res, 403, { error: 'forbidden' });
    return;
  }
  fs.stat(filePath, function (err, st) {
    if (!err && st.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, function (err2, data) {
      if (err2) { sendJSON(res, 404, { error: 'not_found' }); return; }
      cors(res);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      });
      res.end(data);
    });
  });
}

var VALID_EVENTS = [
  'mascot_shown', 'combo_shown', 'combo_dismissed',
  'preview_opened', 'product_page_visit', 'combo_add_to_cart', 'mascot_clicked',
  'recs_shown',
];

// Basit rate limit: token başına dakikada 100 event (spec gereği)
var rateBuckets = {};
function rateLimited(token) {
  var now = Date.now();
  var b = rateBuckets[token];
  if (!b || now - b.start > 60000) {
    rateBuckets[token] = { start: now, count: 1 };
    return false;
  }
  b.count++;
  return b.count > 100;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb) {
  var chunks = [];
  var size = 0;
  req.on('data', function (c) {
    size += c.length;
    if (size > 10240) { req.destroy(); return; } // 10KB üstü: şüpheli, kes
    chunks.push(c);
  });
  req.on('end', function () {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch (e) { cb(e); }
  });
}

// ---------------------------------------------------------------
// Analitik özet
// ---------------------------------------------------------------
function loadEvents() {
  var events = [];
  try {
    var lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try { events.push(JSON.parse(lines[i])); } catch (e) { /* bozuk satırı atla */ }
    }
  } catch (e) { /* dosya henüz yok */ }
  return events;
}

function summarize() {
  var events = loadEvents();
  var byType = {};
  var byCombo = {};
  var sessions = {};
  var seen = {}; // dedup: aynı session aynı comboyu aynı tipte çift saymasın

  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    var dedupKey = e.sessionId + '|' + e.eventType + '|' + (e.comboId || '-');
    if (e.eventType !== 'mascot_shown' && seen[dedupKey]) continue;
    seen[dedupKey] = true;

    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    if (e.sessionId) sessions[e.sessionId] = true;
    if (e.comboId) {
      if (!byCombo[e.comboId]) byCombo[e.comboId] = { shown: 0, preview: 0, visit: 0, dismissed: 0 };
      var c = byCombo[e.comboId];
      if (e.eventType === 'combo_shown') c.shown++;
      else if (e.eventType === 'preview_opened') c.preview++;
      else if (e.eventType === 'product_page_visit') c.visit++;
      else if (e.eventType === 'combo_dismissed') c.dismissed++;
    }
  }

  var shown = byType.combo_shown || 0;
  var preview = byType.preview_opened || 0;
  var visit = byType.product_page_visit || 0;

  var cart = byType.combo_add_to_cart || 0;

  return {
    totalEvents: events.length,
    uniqueSessions: Object.keys(sessions).length,
    byType: byType,
    byCombo: byCombo,
    funnel: { shown: shown, preview: preview, visit: visit, cart: cart },
    rates: {
      previewRate: shown ? Math.round((preview / shown) * 1000) / 10 : 0,   // balon → önizleme %
      visitRate: preview ? Math.round((visit / preview) * 1000) / 10 : 0,   // önizleme → ürün sayfası %
    },
    recent: events.slice(-20).reverse().map(function (e) {
      return { type: e.eventType, comboId: e.comboId, ts: e.ts, page: e.pageUrl };
    }),
  };
}

// ---------------------------------------------------------------
// Dashboard HTML
// ---------------------------------------------------------------
var DASHBOARD = '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Maskot Analitik</title><style>' +
  'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f5f8;color:#14141a;margin:0;padding:32px}' +
  'h1{font-size:20px;letter-spacing:2px}h1 em{font-style:normal;color:#7c3aed}' +
  '.sub{color:#6b7280;font-size:13px;margin-bottom:28px}' +
  '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:32px}' +
  '.card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.05)}' +
  '.card .v{font-size:26px;font-weight:800}.card .l{font-size:11px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-top:4px}' +
  'table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.05)}' +
  'th,td{text-align:left;padding:11px 16px;font-size:13px;border-bottom:1px solid #f0eef4}' +
  'th{background:#faf9fc;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6b7280}' +
  'tr:last-child td{border-bottom:0}.mono{font-family:ui-monospace,monospace;font-size:12px}' +
  '.empty{color:#9ca3af;padding:24px;text-align:center}' +
  'h2{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#6b7280;margin:30px 0 12px}' +
  '.funnel{display:flex;gap:8px;align-items:flex-end;background:#fff;border-radius:14px;padding:22px;box-shadow:0 2px 10px rgba(0,0,0,.05)}' +
  '.fstep{flex:1;text-align:center}.fbar{background:linear-gradient(180deg,#9f6bfd,#7c3aed);border-radius:8px 8px 3px 3px;margin:0 auto;width:70%;min-height:6px;transition:height .5s ease}' +
  '.fstep .fv{font-size:18px;font-weight:800;margin-top:8px}.fstep .fl{font-size:10.5px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-top:2px}' +
  '.farrow{align-self:center;color:#c9c2dd;font-size:18px;padding-bottom:34px}' +
  '.feed{background:#fff;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.05);max-height:300px;overflow-y:auto}' +
  '.fe{display:flex;gap:10px;align-items:center;padding:9px 16px;border-bottom:1px solid #f0eef4;font-size:12.5px}' +
  '.fe:last-child{border-bottom:0}.fe .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}' +
  '.fe .t{color:#9ca3af;font-size:11px;margin-left:auto;white-space:nowrap}' +
  '</style></head><body>' +
  '<h1>TRİKO <em>ANALİTİK</em></h1>' +
  '<div class="sub">Canlı demo verisi — 5 sn\'de bir yenilenir</div>' +
  '<div class="cards" id="cards"></div>' +
  '<h2>Dönüşüm Hunisi</h2><div class="funnel" id="funnel"></div>' +
  '<h2>Kombin Performansı</h2>' +
  '<table><thead><tr><th>Kombin</th><th>Gösterim</th><th>Önizleme</th><th>Ürün Ziyareti</th><th>Kapatma</th><th>Tıklama Oranı</th></tr></thead>' +
  '<tbody id="rows"><tr><td colspan="6" class="empty">Veri bekleniyor…</td></tr></tbody></table>' +
  '<h2>Canlı Akış (son 20 event)</h2><div class="feed" id="feed"><div class="empty">Veri bekleniyor…</div></div>' +
  '<script>' +
  'var TYPE_TR={mascot_shown:["Maskot göründü","#94a3b8"],combo_shown:["Kombin gösterildi","#7c3aed"],combo_dismissed:["Kapatıldı","#f59e0b"],preview_opened:["Önizleme açıldı","#0ea5e9"],product_page_visit:["Ürün sayfası ziyareti","#10b981"],combo_add_to_cart:["Sepete eklendi","#16a34a"],mascot_clicked:["Maskota tıklandı","#d946ef"]};' +
  'function comboName(id){if(!id)return"";var m=id.match(/^combo_(.+)_((?:e|k)-[a-z-]+)$/);return m?m[1]+" → "+m[2]:id}' +
  'function card(v,l){return \'<div class="card"><div class="v">\'+v+\'</div><div class="l">\'+l+\'</div></div>\'}' +
  'function fstep(v,max,l){var h=max?Math.max(6,Math.round(v/max*90)):6;return \'<div class="fstep"><div class="fbar" style="height:\'+h+\'px"></div><div class="fv">\'+v+\'</div><div class="fl">\'+l+\'</div></div>\'}' +
  'function refresh(){fetch("/api/analytics/summary").then(function(r){return r.json()}).then(function(s){' +
  'var t=s.byType||{};var f=s.funnel||{shown:0,preview:0,visit:0,cart:0};' +
  'document.getElementById("cards").innerHTML=' +
  'card(s.uniqueSessions,"Oturum")+card(t.combo_shown||0,"Kombin Gösterimi")+' +
  'card(t.preview_opened||0,"Önizleme")+card(t.product_page_visit||0,"Ürün Ziyareti")+' +
  'card(s.rates.previewRate+"%","Önizleme Oranı")+card(s.rates.visitRate+"%","Geçiş Oranı");' +
  'var ar=\'<div class="farrow">→</div>\';' +
  'document.getElementById("funnel").innerHTML=' +
  'fstep(f.shown,f.shown,"Gösterim")+ar+fstep(f.preview,f.shown,"Önizleme")+ar+fstep(f.visit,f.shown,"Ürün Ziyareti")+ar+fstep(f.cart,f.shown,"Sepet");' +
  'var rows="";var ids=Object.keys(s.byCombo||{});' +
  'for(var i=0;i<ids.length;i++){var c=s.byCombo[ids[i]];' +
  'var rate=c.shown?Math.round(c.preview/c.shown*1000)/10+"%":"—";' +
  'rows+="<tr><td class=mono>"+comboName(ids[i])+"</td><td>"+c.shown+"</td><td>"+c.preview+"</td><td>"+c.visit+"</td><td>"+c.dismissed+"</td><td>"+rate+"</td></tr>"}' +
  'document.getElementById("rows").innerHTML=rows||\'<tr><td colspan="6" class="empty">Henüz kombin verisi yok — mağazada gezinin!</td></tr>\';' +
  'var feed="";var rc=s.recent||[];' +
  'for(var j=0;j<rc.length;j++){var e=rc[j];var m=TYPE_TR[e.type]||[e.type,"#9ca3af"];' +
  'feed+=\'<div class="fe"><span class="dot" style="background:\'+m[1]+\'"></span><span>\'+m[0]+(e.comboId?\' · <b>\'+comboName(e.comboId)+\'</b>\':"")+\'</span><span class="t">\'+new Date(e.ts).toLocaleTimeString("tr-TR")+\'</span></div>\'}' +
  'document.getElementById("feed").innerHTML=feed||\'<div class="empty">Henüz event yok</div>\';' +
  '}).catch(function(){})}' +
  'refresh();setInterval(refresh,5000);' +
  '</script></body></html>';

// ---------------------------------------------------------------
// HTTP sunucu
// ---------------------------------------------------------------
var server = http.createServer(function (req, res) {
  var url = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Analitik event kaydı
  if (req.method === 'POST' && url === '/api/widget/event') {
    readBody(req, function (err, body) {
      if (err || !body) return sendJSON(res, 400, { error: 'invalid_json' });
      if (VALID_EVENTS.indexOf(body.eventType) === -1) return sendJSON(res, 400, { error: 'invalid_event' });
      var token = String(body.token || 'unknown').slice(0, 64);
      if (rateLimited(token)) return sendJSON(res, 429, { error: 'rate_limited' });
      var record = {
        token: token,
        eventType: body.eventType,
        comboId: body.comboId ? String(body.comboId).slice(0, 128) : null,
        sessionId: String(body.sessionId || '').slice(0, 64),
        pageUrl: String(body.pageUrl || '').slice(0, 512),
        ts: new Date().toISOString(),
      };
      fs.appendFile(EVENTS_FILE, JSON.stringify(record) + '\n', function () {});
      sendJSON(res, 200, { ok: true });
    });
    return;
  }

  // Widget config (şimdilik statik demo — üretimde müşteri DB'sinden gelecek)
  if (req.method === 'GET' && url === '/api/widget/config') {
    sendJSON(res, 200, {
      mascot: { name: 'Triko', primaryColor: '#7c3aed' },
      behavior: { proactiveDelayMs: 4500, proactiveIntervalMs: 35000 },
    });
    return;
  }

  // AI önerileri: üretim backend'i (4000) çalışıyorsa oraya aktar (Faz 5).
  // Demo mağaza token'ı ne olursa olsun backend'in seed'li 'demo' müşterisine eşlenir.
  if (req.method === 'POST' && url === '/api/widget/recommendations') {
    readBody(req, function (err, body) {
      if (err || !body) return sendJSON(res, 400, { error: 'invalid_json' });
      body.token = 'demo';
      var payload = JSON.stringify(body);
      var preq = http.request({
        host: 'localhost', port: 4000, path: '/api/widget/recommendations', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 5000,
      }, function (pres) {
        var data = '';
        pres.on('data', function (c) { data += c; });
        pres.on('end', function () {
          try { sendJSON(res, pres.statusCode || 200, JSON.parse(data)); }
          catch (e) { sendJSON(res, 200, { source: 'none', recommendations: [] }); }
        });
      });
      preq.on('error', function () { sendJSON(res, 200, { source: 'none', recommendations: [] }); });
      preq.on('timeout', function () { preq.destroy(); });
      preq.end(payload);
    });
    return;
  }

  // Analitik özet (JSON)
  if (req.method === 'GET' && url === '/api/analytics/summary') {
    sendJSON(res, 200, summarize());
    return;
  }

  // Dashboard
  if (req.method === 'GET' && url === '/analytics') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD);
    return;
  }

  // Kök: mağazaya yönlendir (tek komut demo deneyimi)
  if (req.method === 'GET' && url === '/') {
    res.writeHead(302, { Location: '/store/' });
    res.end();
    return;
  }

  // Statik dosyalar: /store/, /widget/, /demo/
  if (req.method === 'GET' && /^\/(store|widget|demo)(\/|$)/.test(url)) {
    serveStatic(req, res, url);
    return;
  }

  sendJSON(res, 404, { error: 'not_found' });
});

server.listen(PORT, function () {
  console.log('Triko demo: http://localhost:' + PORT + '/store/  (analitik: /analytics)');
});
