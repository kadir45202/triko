/**
 * Maskot Widget — Sprint 1 (Temel Widget)
 *
 * Tek dosya, framework bağımlılığı yok. Müşteri sitesine şöyle eklenir:
 *   <script src="https://cdn.maskot.app/widget.js" data-token="TOKEN" async></script>
 *
 * Sprint 1 kapsamı:
 *  - Hardcoded config (backend henüz yok; window.MASKOT_CONFIG ile override edilebilir)
 *  - No-go zone tespiti + hareket sırasında çakışma kontrolü
 *  - Senaryo tabanlı hareket (CSS transition, rAF yok)
 *  - Kombin gösterimi: düşünme → mini kart → balon → önizleme modalı → yönlendirme
 *  - Analitik event'leri console'a yazılır
 *
 * Prensipler: !important yok, sessiz fail, i18n hazır metinler, yüksek
 * specificity ile CSS izolasyonu.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // Sessiz fail: widget hatası müşteri sitesini asla bozmamalı
  // ---------------------------------------------------------------
  function safely(fn) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        destroy(); // widget kendini kapatır, sayfa etkilenmez
      }
    };
  }

  // ---------------------------------------------------------------
  // i18n — şimdilik Türkçe, yapı genişlemeye hazır
  // ---------------------------------------------------------------
  var I18N = {
    tr: {
      expertLabel: '✨ Uzman Kombini',
      previewCta: 'Ürünü İncele →',
      close: 'Kapat',
    },
  };
  var LOCALE = 'tr';
  function t(key) {
    return (I18N[LOCALE] && I18N[LOCALE][key]) || key;
  }

  // ---------------------------------------------------------------
  // Analitik event'leri — Sprint 1: console'a yaz
  // ---------------------------------------------------------------
  var EVENTS = {
    MASCOT_SHOWN: 'mascot_shown',
    COMBO_SHOWN: 'combo_shown',
    COMBO_DISMISSED: 'combo_dismissed',
    PREVIEW_OPENED: 'preview_opened',
    PRODUCT_PAGE_VISIT: 'product_page_visit',
    COMBO_ADD_TO_CART: 'combo_add_to_cart',
    MASCOT_CLICKED: 'mascot_clicked',
  };

  function getSessionId() {
    // 24 saatte sıfırlanan anonim oturum ID (KVKK: kimlik bilgisi yok)
    var KEY = 'maskot_sid';
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) { /* storage kapalı olabilir */ }
    var now = Date.now();
    if (raw) {
      var parts = raw.split('|');
      if (parts.length === 2 && now - Number(parts[1]) < 24 * 60 * 60 * 1000) {
        return parts[0];
      }
    }
    var sid = 'sid_' + Math.random().toString(36).slice(2) + now.toString(36);
    try {
      window.localStorage.setItem(KEY, sid + '|' + now);
    } catch (e) { /* yoksay */ }
    return sid;
  }

  var sessionId = null;

  function track(eventType, comboId) {
    var payload = {
      eventType: eventType,
      comboId: comboId || null,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
    };
    if (window.console && console.info) {
      console.info('[maskot:event]', payload);
    }
    // Backend'e gönder (varsa) — sessiz fail, UX'i asla etkilemez
    if (state.apiBase && window.fetch) {
      try {
        payload.token = CONFIG.token;
        fetch(state.apiBase + '/api/widget/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(function () { /* sunucu kapalıysa yoksay */ });
      } catch (e) { /* yoksay */ }
    }
  }

  // ---------------------------------------------------------------
  // Oturum profili — KVKK uyumlu: sadece anonim renk/kategori/fiyat,
  // 24 saatte sıfırlanır, kimlik bilgisi yok. Sayfalar window.MASKOT_Q
  // kuyruğuna ['productView', {category,color,price}] iterek besler.
  // ---------------------------------------------------------------
  var PROFILE_KEY = 'maskot_profile';

  function loadProfile() {
    try {
      var p = JSON.parse(window.localStorage.getItem(PROFILE_KEY) || 'null');
      if (p && p.views) return p;
    } catch (e) { /* yoksay */ }
    return { views: [] };
  }

  function saveProfile(p) {
    try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* yoksay */ }
  }

  function addProductView(meta) {
    if (!meta) return;
    var p = loadProfile();
    var now = Date.now();
    p.views = p.views.filter(function (v) { return now - v.ts < 86400000; }).slice(-19);
    p.views.push({ id: meta.id || null, name: meta.name || null, cat: meta.category || null, color: meta.color || null, price: meta.price || null, ts: now });
    saveProfile(p);
  }

  function profileSummary() {
    var views = loadProfile().views;
    if (!views.length) return null;
    var colors = {}, cats = {}, priceSum = 0, priceCount = 0;
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (v.color) colors[v.color] = (colors[v.color] || 0) + 1;
      if (v.cat) cats[v.cat] = (cats[v.cat] || 0) + 1;
      if (v.price) { priceSum += v.price; priceCount++; }
    }
    function top(map) {
      var bk = null, bc = 0;
      for (var k in map) if (map[k] > bc) { bc = map[k]; bk = k; }
      return { key: bk, count: bc };
    }
    var tc = top(colors), tk = top(cats);
    return {
      total: views.length,
      topColor: tc.key, topColorCount: tc.count,
      topCat: tk.key,
      avgPrice: priceCount ? priceSum / priceCount : null,
    };
  }

  function processQueue() {
    var q = window.MASKOT_Q;
    if (!q || !q.length) return;
    for (var i = 0; i < q.length; i++) {
      if (q[i] && q[i][0] === 'productView') addProductView(q[i][1]);
    }
  }

  // ---------------------------------------------------------------
  // Katalog ajanı — pasif sinyal. Sayfadaki schema.org/Product JSON-LD
  // verisini okuyup backend'e bildirir; ajan bilinmeyen ürünü kataloğa
  // ekler, kategorize eder ve kombinlere dahil eder. Ürün başına oturumda
  // 1 kez gönderilir; backend yoksa/hata olursa sessizce yok sayılır.
  // ---------------------------------------------------------------
  var INGEST_KEY = 'maskot_ingested';

  function readJsonLdProduct() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      var parsed;
      try { parsed = JSON.parse(scripts[i].textContent); } catch (e) { continue; }
      var nodes = [].concat(parsed && parsed['@graph'] ? parsed['@graph'] : parsed);
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        if (!n || !n['@type']) continue;
        var type = [].concat(n['@type']).join(',').toLowerCase();
        if (type.indexOf('product') === -1 || !n.name) continue;
        var offers = n.offers ? [].concat(n.offers)[0] : null;
        return {
          id: n.sku || n.productID || null,
          url: n.url || window.location.href.split('#')[0],
          name: String(n.name),
          price: offers && offers.price ? parseFloat(offers.price) : null,
          currency: (offers && offers.priceCurrency) || 'TRY',
          image: typeof n.image === 'string' ? n.image : (n.image && n.image[0]) || null,
          category: n.category || null,
        };
      }
    }
    return null;
  }

  function ingestPageProduct() {
    if (!state.apiBase || !window.fetch) return;
    var product = readJsonLdProduct();
    if (!product) return;

    var key = product.id || product.url;
    var sent = [];
    try { sent = JSON.parse(window.sessionStorage.getItem(INGEST_KEY) || '[]'); } catch (e) { /* yoksay */ }
    if (sent.indexOf(key) !== -1) return;

    fetch(state.apiBase + '/api/widget/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONFIG.token, product: product }),
    }).then(function (r) {
      if (!r.ok) return;
      sent.push(key);
      try { window.sessionStorage.setItem(INGEST_KEY, JSON.stringify(sent.slice(-100))); } catch (e) { /* yoksay */ }
    }).catch(function () { /* backend kapalı — sorun değil */ });
  }

  // ---------------------------------------------------------------
  // "Bunları da seversin" — AI öneri motoru (Faz 5). Backend'deki
  // /api/widget/recommendations ucuna oturum profili + katalog gider;
  // cevap 10 dk localStorage'da tutulur. Backend/AI yoksa sessizce yok sayılır.
  // ---------------------------------------------------------------
  var RECS_KEY = 'maskot_recs';

  function fetchRecommendations() {
    if (!state.apiBase || !window.fetch) return;
    var atelier = window.ATELIER;
    if (!atelier || !atelier.CATALOG) return;

    try {
      var cached = JSON.parse(window.localStorage.getItem(RECS_KEY) || 'null');
      if (cached && Date.now() - cached.ts < 600000) { state.recs = cached.items; return; }
    } catch (e) { /* yoksay */ }

    var views = loadProfile().views.filter(function (v) { return v.id; });
    if (views.length < 3) return;

    var viewed = views.map(function (v) {
      return { id: v.id, name: v.name, category: v.cat, color: v.color, price: v.price };
    });
    var catalog = atelier.CATALOG.map(function (p) {
      return { id: p.id, name: p.name, category: p.cat, color: p.color || null, price: p.priceNum || null };
    });

    fetch(state.apiBase + '/api/widget/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONFIG.token, sessionId: sessionId, viewed: viewed, catalog: catalog }),
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.recommendations || !data.recommendations.length) return;
      var items = [];
      for (var i = 0; i < data.recommendations.length; i++) {
        var rec = data.recommendations[i];
        var p = atelier.byId(rec.productId);
        if (p) items.push({ id: p.id, name: p.name, price: p.price, reason: rec.reason });
      }
      if (!items.length) return;
      state.recs = items;
      try { window.localStorage.setItem(RECS_KEY, JSON.stringify({ ts: Date.now(), items: items })); } catch (e) { /* yoksay */ }
    }).catch(function () { /* backend kapalı — sorun değil */ });
  }

  function showRecsBalloon() {
    state.balloonOpen = true;
    state.tipOpen = true;
    state.recsShown = true;

    var opensLeft = currentPos.x > window.innerWidth / 2;
    balloonEl.classList.remove('maskot-left', 'maskot-right');
    balloonEl.classList.add(opensLeft ? 'maskot-left' : 'maskot-right');
    balloonEl.innerHTML = '';

    var label = document.createElement('span');
    label.className = 'maskot-b-label';
    label.textContent = '✨ Bunları da seversin';
    var close = document.createElement('button');
    close.className = 'maskot-b-close';
    close.type = 'button';
    close.setAttribute('aria-label', t('close'));
    close.textContent = '✕';
    close.onclick = safely(function (e) {
      e.stopPropagation();
      closeBalloon();
      state.tipOpen = false;
    });
    balloonEl.appendChild(close);
    balloonEl.appendChild(label);

    for (var i = 0; i < state.recs.length; i++) {
      var rec = state.recs[i];
      var row = document.createElement('a');
      row.href = 'urun.html?id=' + encodeURIComponent(rec.id) + '&ref=maskot';
      row.style.cssText = 'display:block;font-size:12px;line-height:1.5;color:inherit;text-decoration:none;padding:3px 0;border-bottom:1px solid rgba(0,0,0,0.06)';
      row.innerHTML = '';
      var nameEl = document.createElement('strong');
      nameEl.textContent = rec.name;
      var metaEl = document.createElement('span');
      metaEl.style.opacity = '0.65';
      metaEl.textContent = ' ' + (rec.price || '') + (rec.reason ? ' · ' + rec.reason : '');
      row.appendChild(nameEl);
      row.appendChild(metaEl);
      balloonEl.appendChild(row);
    }
    balloonEl.classList.add('maskot-open');
    track('recs_shown');

    later(function () {
      if (state.tipOpen) { closeBalloon(); state.tipOpen = false; }
    }, 12000);
  }

  // Kişiselleştirilmiş balon satırı — şablon tabanlı, AI yok, sıfır maliyet
  var PERSONAL_LINES = {
    siyah: 'Siyah parçaları seviyorsun galiba — bu tam senlik 🖤',
    beyaz: 'Beyaz senin rengin olmuş, itiraf et ✨',
    bej: 'Bej tonları sana çok iyi gidiyor 🤎',
    _default: 'Tarzını çözmeye başladım — bu tam senlik ✨',
  };

  function personalLineFor(combo) {
    var prof = profileSummary();
    if (!prof || prof.total < 3 || !prof.topColor || prof.topColorCount < 2) return null;
    if (combo.suggestedColor && combo.suggestedColor === prof.topColor) {
      return PERSONAL_LINES[prof.topColor] || PERSONAL_LINES._default;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Stil ipuçları (maskota tıklayınca rastgele biri)
  // ---------------------------------------------------------------
  var STYLE_TIPS = [
    'Monokrom kombin boyu uzun gösterir — tepeden tırnağa tek renk dene! 📏',
    'Oversize üst + dar alt = her zaman dengeli bir silüet. ⚖️',
    'Aksesuar kuralı: çıkmadan önce aynaya bak, bir parçayı çıkar. 💍',
    'Beyaz sneaker her kombini %20 daha taze gösterir. 👟',
    'Trençkotun kuşağını bağlama, arkadan düğümle — Paris usulü. 🇫🇷',
    'Desen + desen zor iştir; birini desenli seçtiysen diğerini düz tut. 🎨',
    'Kıyafet değil, kombin satın al: dolabındakilerle eşleşmeyeni alma. 🧠',
    'Altın aksesuar sıcak tenlere, gümüş soğuk tenlere daha iyi uyar. ✨',
  ];

  // ---------------------------------------------------------------
  // Konfigürasyon — Sprint 1: hardcoded demo, Sprint 2'de API'dan gelecek
  // ---------------------------------------------------------------
  var DEFAULT_CONFIG = {
    token: 'demo',
    mascot: {
      imageUrl: null, // null → yerleşik SVG maskot kullanılır
      size: 68,
      primaryColor: '#7c3aed',
      name: 'Triko',
    },
    behavior: {
      proactiveDelayMs: 6000,
      proactiveIntervalMs: 50000,
      proximityThresholdPx: 150,
      dismissCooldownMs: 90000,
      maxDailyShows: 12,
      mobileEnabled: true,
      mobileSize: 52,
    },
    noGoSelectors: [],
    combos: [
      {
        id: 'combo_demo_001',
        suggestedProductName: 'Slim Fit Siyah Jean',
        suggestedProductPrice: '₺459',
        suggestedProductUrl: '#/urun/slim-fit-siyah-jean',
        suggestedProductImage: null, // null → emoji placeholder
        suggestedProductEmoji: '👖',
        mascotText: 'Siyah + siyah — güçlü monoblock kombin!',
        socialProof: '3.120 kişi bu kombini yaptı',
        expertNote: 'Uzman önerisi',
      },
      {
        id: 'combo_demo_002',
        suggestedProductName: 'Beyaz Sneaker',
        suggestedProductPrice: '₺899',
        suggestedProductUrl: '#/urun/beyaz-sneaker',
        suggestedProductImage: null,
        suggestedProductEmoji: '👟',
        mascotText: 'Bu görünüme beyaz sneaker çok yakışır!',
        socialProof: '1.874 kişi bu kombini yaptı',
        expertNote: 'Uzman önerisi',
      },
    ],
  };

  function mergeConfig(base, override) {
    if (!override) return base;
    var out = {};
    for (var k in base) out[k] = base[k];
    for (var k2 in override) {
      if (
        override[k2] && typeof override[k2] === 'object' &&
        !Array.isArray(override[k2]) && base[k2] && typeof base[k2] === 'object'
      ) {
        out[k2] = mergeConfig(base[k2], override[k2]);
      } else {
        out[k2] = override[k2];
      }
    }
    return out;
  }

  var CONFIG = null;

  // ---------------------------------------------------------------
  // No-Go Zone sistemi
  // ---------------------------------------------------------------
  var NOGO_PADDING = 24;
  var noGoZones = []; // viewport koordinatlarında { x1, y1, x2, y2 }

  var BASE_NOGO_SELECTORS = [
    '[data-maskot-nogo]',
    '.product-image', '.product-photo', '.pdp-image',
    '.add-to-cart', '.buy-now', '.sepete-ekle',
    '.product-price', '.price-box',
    '.size-selector', '.color-selector',
    'nav', 'header', '.navbar',
    'form[action*="checkout"]', '.checkout-form',
  ];

  function detectNoGoZones() {
    var selectors = BASE_NOGO_SELECTORS.concat(CONFIG.noGoSelectors || []);
    var zones = [];
    for (var i = 0; i < selectors.length; i++) {
      var nodes;
      try {
        nodes = document.querySelectorAll(selectors[i]);
      } catch (e) {
        continue; // geçersiz custom selector — atla
      }
      for (var j = 0; j < nodes.length; j++) {
        var r = nodes[j].getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Sadece viewport'ta görünen alanlar hareketi kısıtlar
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        zones.push({
          x1: r.left - NOGO_PADDING,
          y1: r.top - NOGO_PADDING,
          x2: r.right + NOGO_PADDING,
          y2: r.bottom + NOGO_PADDING,
        });
      }
    }
    noGoZones = zones;
    return zones;
  }

  function rectIntersectsNoGo(x, y, size) {
    for (var i = 0; i < noGoZones.length; i++) {
      var z = noGoZones[i];
      if (x < z.x2 && x + size > z.x1 && y < z.y2 && y + size > z.y1) {
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------
  // Hareket senaryoları — waypoint'ler viewport yüzdesi cinsinden
  // ---------------------------------------------------------------
  var MOVEMENT_SCENARIOS = {
    'left-descend': [
      { xPercent: 0.04, yPercent: 0.15, durationMs: 2600, easing: 'ease-in-out' },
      { xPercent: 0.06, yPercent: 0.45, durationMs: 2800, easing: 'ease-in-out' },
      { xPercent: 0.04, yPercent: 0.75, durationMs: 2600, easing: 'ease-in-out' },
    ],
    'right-descend': [
      { xPercent: 0.90, yPercent: 0.15, durationMs: 2600, easing: 'ease-in-out' },
      { xPercent: 0.88, yPercent: 0.45, durationMs: 2800, easing: 'ease-in-out' },
      { xPercent: 0.90, yPercent: 0.75, durationMs: 2600, easing: 'ease-in-out' },
    ],
    'bottom-slide': [
      { xPercent: 0.85, yPercent: 0.82, durationMs: 2400, easing: 'ease-in-out' },
      { xPercent: 0.50, yPercent: 0.85, durationMs: 3000, easing: 'ease-in-out' },
      { xPercent: 0.08, yPercent: 0.82, durationMs: 3000, easing: 'ease-in-out' },
    ],
    'top-slide': [
      { xPercent: 0.08, yPercent: 0.14, durationMs: 2400, easing: 'ease-in-out' },
      { xPercent: 0.50, yPercent: 0.12, durationMs: 3000, easing: 'ease-in-out' },
      { xPercent: 0.85, yPercent: 0.14, durationMs: 3000, easing: 'ease-in-out' },
    ],
    'corner-bounce': [
      { xPercent: 0.88, yPercent: 0.15, durationMs: 3200, easing: 'ease-in-out' },
      { xPercent: 0.06, yPercent: 0.78, durationMs: 3600, easing: 'ease-in-out' },
      { xPercent: 0.88, yPercent: 0.78, durationMs: 3200, easing: 'ease-in-out' },
    ],
  };

  // ---------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------
  var root = null;         // widget container
  var mascotEl = null;     // hareket eden dış eleman
  var bodyEl = null;       // maskot gövdesi (idle bob bunun üstünde)
  var balloonEl = null;
  var miniCardEl = null;
  var modalEl = null;
  var styleEl = null;

  var state = {
    destroyed: false,
    frozen: false,          // modal açıkken hareket durur
    balloonOpen: false,
    lastScenario: null,
    scenarioTimer: null,
    proactiveTimer: null,
    lastComboId: null,
    lastComboAt: 0,
    dailyShows: 0,
    reducedMotion: false,
    isMobile: false,
    mascotSize: 68,
    pendingTimers: [],
    expr: 'happy',
    mouse: { x: -1, y: -1 },
    lastInteraction: Date.now(),
    lastScrollY: 0,
    lastScrollTs: 0,
    tipOpen: false,
    apiBase: null,
    recs: null,           // "bunları da seversin" önerileri (Faz 5)
    recsShown: false,
    busy: false,          // dwell yaklaşması gibi öncelikli hareketlerde senaryo bekler
    exitShown: false,
    moveTimer: null,
  };

  function nearMouse(px) {
    var cx = currentPos.x + state.mascotSize / 2;
    var cy = currentPos.y + state.mascotSize / 2;
    var dx = state.mouse.x - cx, dy = state.mouse.y - cy;
    return dx * dx + dy * dy < px * px;
  }

  function later(fn, ms) {
    var id = window.setTimeout(safely(fn), ms);
    state.pendingTimers.push(id);
    return id;
  }

  function destroy() {
    state.destroyed = true;
    try {
      for (var i = 0; i < state.pendingTimers.length; i++) {
        window.clearTimeout(state.pendingTimers[i]);
      }
      if (root && root.parentNode) root.parentNode.removeChild(root);
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch (e) { /* yoksay */ }
  }

  // ---------------------------------------------------------------
  // CSS — yüksek specificity, !important yok, izolasyon için all:initial
  // ---------------------------------------------------------------
  function injectStyles() {
    var c = CONFIG.mascot.primaryColor;
    var css = [
      // İzolasyon: container altındaki her şey sıfırdan başlar
      '.maskot-w.maskot-w{all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:none;}',
      '.maskot-w.maskot-w *{box-sizing:border-box;}',

      // Hareket eden eleman — sadece transform anim (compositor thread)
      '.maskot-w .maskot-mover{position:fixed;top:0;left:0;will-change:transform;pointer-events:auto;transition-property:transform;}',

      // Gövde + idle bob
      '.maskot-w .maskot-body{position:relative;cursor:pointer;animation:maskot-bob 2.6s ease-in-out infinite;}',
      '@keyframes maskot-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
      '.maskot-w .maskot-body.maskot-thinking{animation:maskot-think .6s ease-in-out;}',
      '@keyframes maskot-think{0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}',
      '.maskot-w .maskot-img{display:block;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 14px rgba(0,0,0,.18));overflow:visible;}',

      // Yüz: göz bebekleri (gaze), göz kırpma, ifadeler
      '.maskot-w .maskot-pupils{transition:transform .45s ease;}',
      '.maskot-w .maskot-lids{opacity:0;animation:maskot-blink 4.2s infinite;}',
      '@keyframes maskot-blink{0%,91%,100%{opacity:0}93%,97%{opacity:1}}',
      '.maskot-w .m-mouth{opacity:0;transition:opacity .15s ease;}',
      '.maskot-w .m-brow{opacity:0;transition:opacity .2s ease,transform .2s ease;transform-box:fill-box;transform-origin:center;}',
      '.maskot-w .maskot-body.maskot-expr-happy .m-mouth-happy{opacity:1;}',
      '.maskot-w .maskot-body.maskot-expr-excited .m-mouth-excited{opacity:1;}',
      '.maskot-w .maskot-body.maskot-expr-excited .m-brow{opacity:1;transform:translateY(-2px);}',
      '.maskot-w .maskot-body.maskot-expr-think .m-mouth-think{opacity:1;}',
      '.maskot-w .maskot-body.maskot-expr-think .m-brow-l{opacity:1;transform:translateY(-2.5px) rotate(-8deg);}',
      '.maskot-w .maskot-body.maskot-expr-sad .m-mouth-sad{opacity:1;}',
      '.maskot-w .maskot-body.maskot-expr-sad .m-brow{opacity:1;transform:translateY(1px) rotate(8deg);}',
      '.maskot-w .maskot-body.maskot-expr-sad .m-brow-l{transform:translateY(1px) rotate(-8deg);}',

      // Eller: bekleme, el sallama, mini kartı "sunma"
      '.maskot-w .maskot-hand{transition:transform .3s ease;transform-box:fill-box;transform-origin:center;}',
      '@keyframes maskot-wave{0%,100%{transform:translate(0,0) rotate(0)}20%{transform:translate(-2px,-16px) rotate(-20deg)}40%{transform:translate(-1px,-15px) rotate(16deg)}60%{transform:translate(-2px,-16px) rotate(-20deg)}80%{transform:translate(-1px,-15px) rotate(12deg)}}',
      '.maskot-w .maskot-body.maskot-waving .maskot-hand-l{animation:maskot-wave 1.1s ease-in-out;}',
      '.maskot-w .maskot-body.maskot-presenting .maskot-hand-r{transform:translate(-7px,9px) scale(1.15);}',
      '.maskot-w .maskot-body.maskot-thinking .maskot-hand-r{transform:translate(-9px,-11px);}',

      // Zıplama (tıklama etkileşimi)
      '@keyframes maskot-jump{0%,100%{transform:translateY(0)}30%{transform:translateY(-22px)}50%{transform:translateY(0)}68%{transform:translateY(-10px)}84%{transform:translateY(0)}}',
      '.maskot-w .maskot-body.maskot-jumping{animation:maskot-jump .75s cubic-bezier(.34,1.56,.64,1);}',

      // Alkış (maskot önerisinden ürüne gelince)
      '@keyframes maskot-clap-l{0%,100%{transform:none}50%{transform:translate(19px,-9px)}}',
      '@keyframes maskot-clap-r{0%,100%{transform:none}50%{transform:translate(-19px,-9px)}}',
      '.maskot-w .maskot-body.maskot-clapping .maskot-hand-l{animation:maskot-clap-l .4s ease-in-out 4;}',
      '.maskot-w .maskot-body.maskot-clapping .maskot-hand-r{animation:maskot-clap-r .4s ease-in-out 4;}',

      // Uyuklama (uzun süre etkileşim yoksa)
      '.maskot-w .maskot-body.maskot-expr-sleepy .maskot-lids{opacity:.75;animation:none;}',
      '.maskot-w .maskot-body.maskot-expr-sleepy .m-mouth-think{opacity:1;}',
      '.maskot-w .maskot-zzz{position:absolute;top:-14px;right:-8px;font-size:16px;opacity:0;transition:opacity .4s ease;pointer-events:none;}',
      '.maskot-w .maskot-body.maskot-expr-sleepy .maskot-zzz{opacity:1;animation:maskot-zzz 2.2s ease-in-out infinite;}',
      '@keyframes maskot-zzz{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}',

      // Şaşırma (hızlı scroll)
      '.maskot-w .maskot-body.maskot-expr-surprised .m-mouth-think{opacity:1;transform:scale(1.6);transform-box:fill-box;transform-origin:center;}',
      '.maskot-w .maskot-body.maskot-expr-surprised .m-brow{opacity:1;transform:translateY(-3.5px);}',

      // Kişiselleştirilmiş balon satırı
      '.maskot-w .maskot-b-personal{display:block;font-size:11px;color:' + c + ';font-style:italic;margin-bottom:6px;}',

      // Mini ürün ETİKETİ — maskotun elinden iple sarkar, hafifçe sallanır
      '.maskot-w .maskot-mini{position:absolute;right:-30px;bottom:-22px;width:56px;height:68px;border-radius:10px;background:#fff;box-shadow:0 6px 16px rgba(0,0,0,.22);cursor:pointer;transform-origin:50% -14px;transform:rotate(-8deg) scale(.3);opacity:0;transition:transform .5s cubic-bezier(.34,1.56,.64,1),opacity .25s ease;padding:8px 4px 4px;display:flex;align-items:center;justify-content:center;}',
      '.maskot-w .maskot-mini:before{content:"";position:absolute;top:-15px;left:50%;width:2px;height:16px;background:linear-gradient(rgba(60,50,90,0),rgba(60,50,90,.55));transform:translateX(-50%) rotate(8deg);}',
      '.maskot-w .maskot-mini:after{content:"";position:absolute;top:3px;left:50%;width:5px;height:5px;border-radius:50%;background:#e8e4f0;transform:translateX(-50%);box-shadow:inset 0 1px 1px rgba(0,0,0,.15);}',
      '.maskot-w .maskot-mini.maskot-open{opacity:1;transform:rotate(-6deg) scale(1);animation:maskot-swing 3.4s ease-in-out .55s infinite;}',
      '@keyframes maskot-swing{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(5deg)}}',
      '.maskot-w .maskot-mini img{width:100%;height:100%;object-fit:cover;border-radius:6px;}',
      '.maskot-w .maskot-mini .maskot-mini-emoji{font-size:30px;line-height:1;}',

      // Üründen ele uçan etiket ("alıp getirdi" animasyonu)
      '.maskot-w .maskot-fly{position:fixed;top:0;left:0;width:56px;height:68px;border-radius:10px;background:#fff;box-shadow:0 12px 28px rgba(0,0,0,.28);padding:6px 4px 4px;display:flex;align-items:center;justify-content:center;pointer-events:none;will-change:transform;transition:transform .85s cubic-bezier(.45,.05,.35,1);}',
      '.maskot-w .maskot-fly img{width:100%;height:100%;object-fit:cover;border-radius:6px;}',
      '.maskot-w .maskot-fly .maskot-mini-emoji{font-size:30px;line-height:1;}',

      // Zemin gölgesi — bob ile ters senkron (yukarıdayken küçülür)
      '.maskot-w .maskot-shadow{position:absolute;left:50%;bottom:-13px;width:74%;height:11px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(22,16,44,.28),rgba(22,16,44,0) 70%);transform:translateX(-50%);animation:maskot-shadow-bob 2.6s ease-in-out infinite;pointer-events:none;}',
      '@keyframes maskot-shadow-bob{0%,100%{transform:translateX(-50%) scale(1);opacity:1}50%{transform:translateX(-50%) scale(.84);opacity:.75}}',

      // Yürüme: gidiş yönüne eğilir + hop döngüsü (zıplaya zıplaya gider), varışta iniş esnemesi
      '.maskot-w .maskot-img{transition:transform .4s ease;}',
      '@keyframes maskot-hopcycle{0%,100%{transform:translateY(0) scale(1,1)}30%{transform:translateY(-9px) scale(1.02,.98)}65%{transform:translateY(-1px) scale(.97,1.04)}}',
      '.maskot-w .maskot-body.maskot-moving{animation:maskot-hopcycle .5s ease-in-out infinite;}',
      '.maskot-w .maskot-body.maskot-lean-r .maskot-img{transform:rotate(6deg);}',
      '.maskot-w .maskot-body.maskot-lean-l .maskot-img{transform:rotate(-6deg);}',
      '@keyframes maskot-land{0%{transform:scale(1.08,.9)}55%{transform:scale(.96,1.04)}100%{transform:scale(1)}}',
      '.maskot-w .maskot-body.maskot-landing .maskot-img{animation:maskot-land .4s ease-out;}',

      // Konuşma: balon metni yazılırken ağız açılıp kapanır
      '@keyframes maskot-talk{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}',
      '.maskot-w .m-mouth-talk{transform-box:fill-box;transform-origin:center;}',
      '.maskot-w .maskot-body.maskot-talking .m-mouth{opacity:0;}',
      '.maskot-w .maskot-body.maskot-talking .m-mouth-talk{opacity:1;animation:maskot-talk .26s ease-in-out infinite;}',

      // Ürün görselini inceleme: gözlerle birlikte kafa da hedefe döner
      '.maskot-w .maskot-body.maskot-look-l .maskot-img{transform:rotate(-4deg);}',
      '.maskot-w .maskot-body.maskot-look-r .maskot-img{transform:rotate(4deg);}',

      // Boşta gerinme (ara sıra, canlılık hissi)
      '@keyframes maskot-stretch{0%,100%{transform:scale(1)}35%{transform:scale(.93,1.09) translateY(-3px)}70%{transform:scale(1.05,.95)}}',
      '.maskot-w .maskot-body.maskot-stretching .maskot-img{animation:maskot-stretch .95s ease-in-out;}',

      // Antenler hafifçe salınır
      '.maskot-w .maskot-antennas{transform-box:fill-box;transform-origin:center bottom;animation:maskot-ant 3.2s ease-in-out infinite;}',
      '@keyframes maskot-ant{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}',

      // Konuşma balonu
      '.maskot-w .maskot-balloon{position:absolute;bottom:calc(100% + 12px);width:230px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.16);padding:12px 14px;opacity:0;transform:translateY(8px) scale(.92);transition:opacity .25s ease,transform .3s cubic-bezier(.34,1.56,.64,1);pointer-events:none;}',
      '.maskot-w .maskot-balloon.maskot-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}',
      '.maskot-w .maskot-balloon.maskot-right{left:0;}',
      '.maskot-w .maskot-balloon.maskot-left{right:0;}',
      '.maskot-w .maskot-balloon:after{content:"";position:absolute;top:100%;border:8px solid transparent;border-top-color:#fff;}',
      '.maskot-w .maskot-balloon.maskot-right:after{left:22px;}',
      '.maskot-w .maskot-balloon.maskot-left:after{right:22px;}',
      '.maskot-w .maskot-b-label{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.4px;color:' + c + ';background:' + c + '14;border-radius:999px;padding:3px 8px;margin-bottom:6px;}',
      '.maskot-w .maskot-b-text{display:block;font-size:13px;line-height:1.45;color:#1f2937;margin-bottom:8px;}',
      '.maskot-w .maskot-b-product{display:flex;align-items:center;gap:8px;background:#f8f7fc;border-radius:10px;padding:6px 8px;cursor:pointer;transition:background .15s ease;}',
      '.maskot-w .maskot-b-product:hover{background:#efeafb;}',
      '.maskot-w .maskot-b-p-emoji{font-size:20px;line-height:1;}',
      '.maskot-w .maskot-b-p-name{flex:1;font-size:12px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.maskot-w .maskot-b-p-price{font-size:12px;font-weight:700;color:' + c + ';}',
      '.maskot-w .maskot-b-social{display:block;font-size:10.5px;color:#6b7280;margin-top:7px;}',
      '.maskot-w .maskot-b-close{position:absolute;top:6px;right:8px;border:0;background:none;font-size:14px;line-height:1;color:#9ca3af;cursor:pointer;padding:4px;}',
      '.maskot-w .maskot-b-close:hover{color:#374151;}',

      // Önizleme modalı
      '.maskot-w .maskot-modal-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(17,24,39,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .25s ease;pointer-events:auto;}',
      '.maskot-w .maskot-modal-backdrop.maskot-open{opacity:1;}',
      '.maskot-w .maskot-modal{width:320px;max-width:calc(100vw - 40px);background:#fff;border-radius:20px;padding:22px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.3);transform:scale(.9);transition:transform .3s cubic-bezier(.34,1.56,.64,1);position:relative;}',
      '.maskot-w .maskot-open .maskot-modal{transform:scale(1);}',
      '.maskot-w .maskot-m-visual{font-size:84px;line-height:1;margin:10px 0 14px;}',
      '.maskot-w .maskot-m-visual img{width:180px;height:180px;object-fit:contain;}',
      '.maskot-w .maskot-m-name{display:block;font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;}',
      '.maskot-w .maskot-m-price{display:block;font-size:15px;font-weight:700;color:' + c + ';margin-bottom:14px;}',
      '.maskot-w .maskot-m-cta{display:inline-block;background:' + c + ';color:#fff;font-size:14px;font-weight:600;border:0;border-radius:12px;padding:11px 22px;cursor:pointer;transition:opacity .15s ease;text-decoration:none;}',
      '.maskot-w .maskot-m-cta:hover{opacity:.9;}',
      '.maskot-w .maskot-m-close{position:absolute;top:10px;right:12px;border:0;background:none;font-size:18px;color:#9ca3af;cursor:pointer;padding:4px;}',

      // prefers-reduced-motion: tüm animasyon/geçişleri kapat
      '@media (prefers-reduced-motion:reduce){.maskot-w .maskot-body{animation:none;}.maskot-w .maskot-body.maskot-moving{animation:none;}.maskot-w .maskot-body.maskot-talking .m-mouth-talk{animation:none;}.maskot-w .maskot-body.maskot-stretching .maskot-img{animation:none;}.maskot-w .maskot-mover{transition:none;}.maskot-w .maskot-lids{animation:none;}.maskot-w .maskot-pupils{transition:none;}.maskot-w .maskot-body.maskot-waving .maskot-hand-l{animation:none;}.maskot-w .maskot-mini.maskot-open{animation:none;}.maskot-w .maskot-shadow{animation:none;}.maskot-w .maskot-antennas{animation:none;}.maskot-w .maskot-fly{transition:none;}}',
    ].join('\n');

    styleEl = document.createElement('style');
    styleEl.setAttribute('data-maskot', '');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ---------------------------------------------------------------
  // Yerleşik SVG maskot (müşteri görsel yüklemediyse)
  // ---------------------------------------------------------------
  // Hex rengi yüzdeyle açar/koyulaştırır (SVG gölgelendirme için)
  function shade(hex, pct) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function s(v) {
      v = pct > 0 ? v + (255 - v) * pct : v * (1 + pct);
      return Math.round(Math.min(255, Math.max(0, v)));
    }
    return 'rgb(' + s(r) + ',' + s(g) + ',' + s(b) + ')';
  }

  function builtinMascotSVG(size, color) {
    var light = shade(color, 0.35);
    var dark = shade(color, -0.18);
    var darker = shade(color, -0.32);
    return (
      '<svg class="maskot-img" width="' + size + '" height="' + size + '" viewBox="0 0 76 76" xmlns="http://www.w3.org/2000/svg">' +

      '<defs>' +
        '<radialGradient id="mg-body" cx="0.34" cy="0.28" r="0.95">' +
          '<stop offset="0%" stop-color="' + light + '"/>' +
          '<stop offset="55%" stop-color="' + color + '"/>' +
          '<stop offset="100%" stop-color="' + dark + '"/>' +
        '</radialGradient>' +
      '</defs>' +

      // Antenler (hafif salınır)
      '<g class="maskot-antennas">' +
        '<path d="M27 15 Q30 18 32 22 M49 15 Q46 18 44 22" stroke="' + dark + '" stroke-width="4.5" stroke-linecap="round" fill="none"/>' +
        '<circle cx="26" cy="13" r="3.4" fill="' + light + '"/><circle cx="50" cy="13" r="3.4" fill="' + light + '"/>' +
      '</g>' +

      // Gövde (top) — gradyan + tepe parlaması
      '<circle cx="38" cy="42" r="29" fill="url(#mg-body)"/>' +
      '<ellipse cx="28" cy="26" rx="10" ry="6" fill="#fff" opacity=".18" transform="rotate(-24 28 26)"/>' +

      // Yanaklar
      '<ellipse cx="22" cy="45" rx="4.2" ry="2.6" fill="#ff8fae" opacity=".38"/>' +
      '<ellipse cx="54" cy="45" rx="4.2" ry="2.6" fill="#ff8fae" opacity=".38"/>' +

      // Papyon — stilist kimliği
      '<g class="maskot-bow">' +
        '<path d="M38 64 L29 60 Q27 64 29 68 Z" fill="' + darker + '"/>' +
        '<path d="M38 64 L47 60 Q49 64 47 68 Z" fill="' + darker + '"/>' +
        '<circle cx="38" cy="64" r="2.6" fill="' + dark + '"/>' +
      '</g>' +

      // Eller — gövdenin iki yanında, jestlerde hareket eder
      '<g class="maskot-hand maskot-hand-l"><circle cx="9" cy="49" r="6.2" fill="' + light + '" stroke="' + dark + '" stroke-width="2"/></g>' +
      '<g class="maskot-hand maskot-hand-r"><circle cx="67" cy="49" r="6.2" fill="' + light + '" stroke="' + dark + '" stroke-width="2"/></g>' +

      // Gözler: beyaz + gezen göz bebekleri + göz kırpma kapakları
      '<circle cx="28" cy="36" r="6.5" fill="#fff"/><circle cx="48" cy="36" r="6.5" fill="#fff"/>' +
      '<g class="maskot-pupils">' +
        '<circle cx="28" cy="36" r="2.9" fill="#1f2937"/><circle cx="48" cy="36" r="2.9" fill="#1f2937"/>' +
        '<circle cx="29" cy="35" r="1" fill="#fff"/><circle cx="49" cy="35" r="1" fill="#fff"/>' +
      '</g>' +
      '<g class="maskot-lids">' +
        '<circle cx="28" cy="36" r="6.6" fill="' + color + '"/><circle cx="48" cy="36" r="6.6" fill="' + color + '"/>' +
      '</g>' +

      // Kaşlar (ifadeye göre görünür)
      '<path class="m-brow m-brow-l" d="M23 27 Q28 24.5 33 27" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
      '<path class="m-brow m-brow-r" d="M43 27 Q48 24.5 53 27" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +

      // Ağızlar (ifadeye göre biri görünür)
      '<path class="m-mouth m-mouth-happy" d="M28 52 Q38 60 48 52" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      '<path class="m-mouth m-mouth-excited" d="M28 51 Q38 64 48 51 Z" fill="#fff"/>' +
      '<circle class="m-mouth m-mouth-think" cx="38" cy="55" r="2.6" fill="#fff"/>' +
      '<path class="m-mouth m-mouth-sad" d="M29 57 Q38 49 47 57" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      '<ellipse class="m-mouth m-mouth-talk" cx="38" cy="54" rx="5.6" ry="4" fill="#fff"/>' +

      '</svg>'
    );
  }

  // ---------------------------------------------------------------
  // İfade ve bakış (gaze) sistemi — sadece yerleşik SVG maskotta
  // ---------------------------------------------------------------
  var EXPRESSIONS = ['happy', 'excited', 'think', 'sad', 'sleepy', 'surprised'];
  var pupilsEl = null;

  function setExpression(name) {
    if (!bodyEl) return;
    for (var i = 0; i < EXPRESSIONS.length; i++) {
      bodyEl.classList.remove('maskot-expr-' + EXPRESSIONS[i]);
    }
    bodyEl.classList.add('maskot-expr-' + name);
    state.expr = name;
  }

  function updateGaze() {
    if (!pupilsEl || state.destroyed) return;
    var dx = 0, dy = 0, looking = 0;
    if (state.frozen) {
      // Modal açık: kullanıcıya (öne) bak
      dx = 0; dy = 0;
    } else if (state.balloonOpen) {
      // Elindeki mini ürün kartına bak (sağ alt)
      dx = 1.8; dy = 2.4;
    } else if (state.mouse.x >= 0 && nearMouse(180)) {
      // Kullanıcı yaklaştı: imleci takip et
      var mx = state.mouse.x - (currentPos.x + state.mascotSize / 2);
      var my = state.mouse.y - (currentPos.y + state.mascotSize / 2);
      var mm = Math.sqrt(mx * mx + my * my) || 1;
      dx = (mx / mm) * 2.6;
      dy = (my / mm) * 2.6;
    } else {
      // En yakın ürün görseline ("modele") bak
      var imgs = document.querySelectorAll('.product-image, .product-photo, .pdp-image');
      var cx = currentPos.x + state.mascotSize / 2;
      var cy = currentPos.y + state.mascotSize / 2;
      var best = null, bestDist = Infinity;
      for (var i = 0; i < imgs.length; i++) {
        var r = imgs[i].getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        var tx = (r.left + r.right) / 2;
        var ty = (r.top + r.bottom) / 2;
        var d = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy);
        if (d < bestDist) { bestDist = d; best = { x: tx, y: ty }; }
      }
      if (best) {
        var vx = best.x - cx, vy = best.y - cy;
        var mag = Math.sqrt(vx * vx + vy * vy) || 1;
        dx = (vx / mag) * 2.6;
        dy = (vy / mag) * 2.6;
        // Görsel belirgin şekilde yandaysa kafa da o yöne döner
        looking = dx > 1.4 ? 1 : dx < -1.4 ? -1 : 0;
      }
    }
    pupilsEl.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';

    // Ürün görselini inceleme: kafa dönüşü + ara sıra "hmm" jesti.
    // Yürürken (lean sınıfları aktif) ve balon açıkken karışmayız.
    if (bodyEl && !state.balloonOpen && !bodyEl.classList.contains('maskot-moving')) {
      bodyEl.classList.toggle('maskot-look-r', looking === 1);
      bodyEl.classList.toggle('maskot-look-l', looking === -1);
      if (looking && state.expr === 'happy' && Date.now() - (state.lastInspectAt || 0) > 25000) {
        state.lastInspectAt = Date.now();
        bodyEl.classList.add('maskot-thinking');
        setExpression('think');
        later(function () {
          bodyEl.classList.remove('maskot-thinking');
          if (state.expr === 'think') setExpression('happy');
        }, 1300);
      }
    } else if (bodyEl) {
      bodyEl.classList.remove('maskot-look-l', 'maskot-look-r');
    }
  }

  function startGazeLoop() {
    if (!pupilsEl) return;
    var loop = function () {
      if (state.destroyed) return;
      updateGaze();

      // Uyuklama: 45 sn etkileşim yoksa kestirmeye başla, etkileşimde uyan
      var idleMs = Date.now() - state.lastInteraction;
      if (idleMs > 45000 && !state.balloonOpen && !state.frozen && state.expr !== 'sleepy') {
        setExpression('sleepy');
      } else if (idleMs < 2000 && state.expr === 'sleepy') {
        setExpression('happy');
      }

      // Boşta gerinme: arada bir (ortalama ~17 sn'de bir) esneyip canlanır
      if (
        !state.reducedMotion && !state.balloonOpen && !state.frozen &&
        state.expr === 'happy' && idleMs > 6000 && Math.random() < 0.04 &&
        bodyEl && !bodyEl.classList.contains('maskot-moving')
      ) {
        bodyEl.classList.add('maskot-stretching');
        later(function () { bodyEl.classList.remove('maskot-stretching'); }, 1000);
      }

      later(loop, 700);
    };
    later(loop, 700);
  }

  // ---------------------------------------------------------------
  // DOM kurulumu
  // ---------------------------------------------------------------
  function buildDOM() {
    root = document.createElement('div');
    root.className = 'maskot-w';

    mascotEl = document.createElement('div');
    mascotEl.className = 'maskot-mover';

    bodyEl = document.createElement('div');
    bodyEl.className = 'maskot-body';
    if (CONFIG.mascot.imageUrl) {
      var img = document.createElement('img');
      img.className = 'maskot-img';
      img.src = CONFIG.mascot.imageUrl;
      img.alt = CONFIG.mascot.name;
      img.width = state.mascotSize;
      img.height = state.mascotSize;
      bodyEl.appendChild(img);
    } else {
      bodyEl.innerHTML = builtinMascotSVG(state.mascotSize, CONFIG.mascot.primaryColor);
      pupilsEl = bodyEl.querySelector('.maskot-pupils');
      bodyEl.classList.add('maskot-expr-happy');
    }

    // Uyuklama baloncuğu
    var zzz = document.createElement('span');
    zzz.className = 'maskot-zzz';
    zzz.textContent = '💤';
    bodyEl.appendChild(zzz);

    // Hover: kullanıcı üzerine gelince sevinsin
    bodyEl.addEventListener('mouseenter', safely(function () {
      state.lastInteraction = Date.now();
      if (!state.balloonOpen && !state.frozen) setExpression('excited');
    }));
    bodyEl.addEventListener('mouseleave', safely(function () {
      if (!state.balloonOpen && !state.frozen && state.expr === 'excited') setExpression('happy');
    }));

    // Tıklama: zıpla + stil ipucu
    bodyEl.addEventListener('click', safely(onMascotClick));

    miniCardEl = document.createElement('div');
    miniCardEl.className = 'maskot-mini';

    balloonEl = document.createElement('div');
    balloonEl.className = 'maskot-balloon';

    bodyEl.appendChild(miniCardEl);
    mascotEl.appendChild(balloonEl);
    mascotEl.appendChild(bodyEl);

    // Zemin gölgesi — bob'dan bağımsız, mascotEl'e bağlı (yere basma hissi)
    var shadowEl = document.createElement('div');
    shadowEl.className = 'maskot-shadow';
    mascotEl.appendChild(shadowEl);
    root.appendChild(mascotEl);
    document.body.appendChild(root);

    // Başlangıç pozisyonu: sağ alt güvenli köşe
    setMascotPos(window.innerWidth * 0.88, window.innerHeight * 0.78, 0);
    track(EVENTS.MASCOT_SHOWN);
  }

  var currentPos = { x: 0, y: 0 };

  // 4 kenar güvenli sınırı: balon/mini kart her pozisyonda ekran içinde kalsın
  var SAFE_MARGIN = {
    top: 170,    // konuşma balonu maskotun üstüne açılır (~150px) + boşluk
    bottom: 60,  // mini kart taşması + idle bob payı
    left: 16,
    right: 34,   // mini kart sağa 18px taşar + kenar payı
  };

  function clampPos(x, y) {
    var maxX = window.innerWidth - state.mascotSize - SAFE_MARGIN.right;
    var maxY = window.innerHeight - state.mascotSize - SAFE_MARGIN.bottom;
    return {
      x: Math.min(Math.max(x, SAFE_MARGIN.left), Math.max(maxX, SAFE_MARGIN.left)),
      y: Math.min(Math.max(y, SAFE_MARGIN.top), Math.max(maxY, SAFE_MARGIN.top)),
    };
  }

  function setMascotPos(x, y, durationMs, easing) {
    var p = clampPos(x, y); // her pozisyon 4 kenar sınırından geçer
    x = p.x;
    y = p.y;
    var movingRight = x >= currentPos.x;
    currentPos.x = x;
    currentPos.y = y;
    mascotEl.style.transitionDuration = (state.reducedMotion ? 0 : durationMs || 0) + 'ms';
    mascotEl.style.transitionTimingFunction = easing || 'ease-in-out';
    mascotEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';

    // Yürüme dili: yöne eğil + hop-hop, varışta iniş esnemesi
    if (bodyEl && durationMs > 400 && !state.reducedMotion) {
      bodyEl.classList.remove('maskot-lean-l', 'maskot-lean-r');
      bodyEl.classList.add('maskot-moving', movingRight ? 'maskot-lean-r' : 'maskot-lean-l');
      if (state.moveTimer) window.clearTimeout(state.moveTimer);
      state.moveTimer = later(function () {
        bodyEl.classList.remove('maskot-moving', 'maskot-lean-l', 'maskot-lean-r');
        bodyEl.classList.add('maskot-landing');
        later(function () { bodyEl.classList.remove('maskot-landing'); }, 420);
      }, durationMs);
    }
  }

  // ---------------------------------------------------------------
  // Hareket döngüsü
  // ---------------------------------------------------------------
  function pickScenario() {
    var keys = Object.keys(MOVEMENT_SCENARIOS).filter(function (k) {
      return k !== state.lastScenario;
    });
    var key = keys[Math.floor(Math.random() * keys.length)];
    state.lastScenario = key;
    return MOVEMENT_SCENARIOS[key];
  }

  // Görünür ürün görselleri (amaçlı hareket hedefleri)
  function visibleProductRects() {
    var imgs = document.querySelectorAll('.product-image, .product-photo, .pdp-image');
    var out = [];
    for (var i = 0; i < imgs.length; i++) {
      var r = imgs[i].getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.bottom < 80 || r.top > window.innerHeight - 80) continue;
      out.push(r);
    }
    return out;
  }

  // Ürünün yanında durulacak nokta: geniş kenarın 40px dışı
  function standPointBeside(r) {
    var side = (r.left + r.width / 2 > window.innerWidth / 2) ? -1 : 1;
    var tx = side === 1 ? r.right + 40 : r.left - 40 - state.mascotSize;
    var ty = r.top + r.height / 2 - state.mascotSize / 2;
    return clampPos(tx, ty);
  }

  // Amaçlı hareket: bir ürüne yürü, DUR, incele (bak + düşün), sonra devam
  function visitProduct(done) {
    var rects = visibleProductRects();
    if (!rects.length) { done(false); return; }
    var r = rects[Math.floor(Math.random() * rects.length)];
    var p = standPointBeside(r);
    if (rectIntersectsNoGo(p.x, p.y, state.mascotSize)) { done(false); return; }

    var dist = Math.sqrt(
      (p.x - currentPos.x) * (p.x - currentPos.x) +
      (p.y - currentPos.y) * (p.y - currentPos.y)
    );
    var dur = Math.max(1200, Math.min(3600, dist * 2.2));
    setMascotPos(p.x, p.y, dur);

    later(function () {
      if (state.destroyed || state.frozen || state.balloonOpen) { done(true); return; }
      // Durdu — ürüne bakıyor, düşünüyor ("fark etti" anı)
      setExpression('think');
      updateGaze();
      later(function () {
        if (state.destroyed) return;
        if (state.expr === 'think') setExpression('happy');
        checkProximity(); // yeterince yakınsa öneri burada doğar
        done(true);
      }, 1400 + Math.random() * 700);
    }, state.reducedMotion ? 60 : dur);
  }

  // Ana hareket döngüsü: senaryo gezintisi ile ürün ziyareti arasında geçiş
  function nextMove() {
    if (state.destroyed) return;
    if (state.frozen || state.balloonOpen || state.busy) {
      state.scenarioTimer = later(nextMove, 1200);
      return;
    }
    if (Math.random() < 0.5) {
      visitProduct(function () {
        state.scenarioTimer = later(nextMove, 1500 + Math.random() * 1500);
      });
    } else {
      runScenario();
    }
  }

  function runScenario() {
    if (state.destroyed || state.frozen) return;
    detectNoGoZones(); // her senaryo başında güncel viewport'a göre yenile
    var waypoints = pickScenario();
    stepWaypoint(waypoints, 0);
  }

  function stepWaypoint(waypoints, idx) {
    if (state.destroyed) return;
    if (state.frozen || state.balloonOpen || state.busy) {
      // Balon/modal açık veya öncelikli hareket var: bekle, sonra devam
      later(function () { stepWaypoint(waypoints, idx); }, 1000);
      return;
    }
    if (idx >= waypoints.length) {
      // Senaryo bitti: 1.5-3sn idle, sonra sıradaki hamle
      state.scenarioTimer = later(nextMove, 1500 + Math.random() * 1500);
      return;
    }
    var wp = waypoints[idx];
    // Waypoint hedefi önce güvenli sınıra kelepçelenir, no-go kontrolü
    // kelepçelenmiş (gerçekten gidilecek) nokta üzerinden yapılır
    var target = clampPos(wp.xPercent * window.innerWidth, wp.yPercent * window.innerHeight);
    var x = target.x;
    var y = target.y;

    // No-go çakışması → bu waypoint atlanır
    if (rectIntersectsNoGo(x, y, state.mascotSize)) {
      stepWaypoint(waypoints, idx + 1);
      return;
    }

    setMascotPos(x, y, wp.durationMs, wp.easing);
    later(function () {
      checkProximity();
      stepWaypoint(waypoints, idx + 1);
    }, state.reducedMotion ? 50 : wp.durationMs);
  }

  // ---------------------------------------------------------------
  // Proximity: ürün görseli yakınından geçerken tetiklen
  // ---------------------------------------------------------------
  function checkProximity() {
    if (state.destroyed || state.balloonOpen || state.frozen) return;
    var threshold = CONFIG.behavior.proximityThresholdPx;
    var imgs = document.querySelectorAll('.product-image, .product-photo, .pdp-image');
    var cx = currentPos.x + state.mascotSize / 2;
    var cy = currentPos.y + state.mascotSize / 2;
    for (var i = 0; i < imgs.length; i++) {
      var r = imgs[i].getBoundingClientRect();
      if (r.width === 0) continue;
      var nx = Math.max(r.left, Math.min(cx, r.right));
      var ny = Math.max(r.top, Math.min(cy, r.bottom));
      var dist = Math.sqrt((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny));
      if (dist > 0 && dist < threshold) {
        maybeShowCombo('proximity');
        return;
      }
    }
  }

  // ---------------------------------------------------------------
  // Kombin gösterimi
  // ---------------------------------------------------------------
  function pickCombo() {
    var combos = CONFIG.combos || [];
    if (!combos.length) return null;
    var eligible = combos.filter(function (c) { return c.id !== state.lastComboId; });
    if (!eligible.length) eligible = combos;

    // Profil varsa skorla: renk > kategori > fiyat yakınlığı. Yoksa rastgele.
    var prof = profileSummary();
    if (!prof || prof.total < 2) {
      return eligible[Math.floor(Math.random() * eligible.length)];
    }
    var best = null, bestScore = -1;
    for (var i = 0; i < eligible.length; i++) {
      var c = eligible[i];
      var score = Math.random(); // eşitlik bozucu
      if (c.suggestedColor && c.suggestedColor === prof.topColor) score += 3;
      if (c.suggestedCategory && c.suggestedCategory === prof.topCat) score += 2;
      if (c.suggestedPriceNum && prof.avgPrice &&
          Math.abs(c.suggestedPriceNum - prof.avgPrice) / prof.avgPrice < 0.4) score += 1;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // Etiket üründen maskotun eline uçar ("gidip aldı, getirdi" hissi)
  function flyCard(combo, fromRect, cb) {
    if (state.reducedMotion) { cb(); return; }
    var el = document.createElement('div');
    el.className = 'maskot-fly';
    if (combo.suggestedProductImage) {
      var img = document.createElement('img');
      img.src = combo.suggestedProductImage;
      img.alt = '';
      el.appendChild(img);
    } else {
      var em = document.createElement('span');
      em.className = 'maskot-mini-emoji';
      em.textContent = combo.suggestedProductEmoji || '🛍️';
      el.appendChild(em);
    }
    // Başlangıç: ürün görselinin merkezi
    var sx = fromRect.left + fromRect.width / 2 - 28;
    var sy = fromRect.top + fromRect.height / 2 - 34;
    el.style.transitionDuration = '0ms';
    el.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px) scale(.5) rotate(14deg)';
    root.appendChild(el);
    // Hedef: maskotun sağ eli (etiketin asılacağı yer)
    later(function () {
      var tx = currentPos.x + state.mascotSize - 26;
      var ty = currentPos.y + state.mascotSize - 40;
      el.style.transitionDuration = '';
      el.style.transform = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px) scale(1) rotate(-6deg)';
    }, 30);
    later(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      cb();
    }, 900);
  }

  // Maskota en yakın görünür ürün görseli (uçuş başlangıcı için)
  function nearestProductRect() {
    var rects = visibleProductRects();
    var cx = currentPos.x + state.mascotSize / 2;
    var cy = currentPos.y + state.mascotSize / 2;
    var best = null, bd = Infinity;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      var d = Math.pow(r.left + r.width / 2 - cx, 2) + Math.pow(r.top + r.height / 2 - cy, 2);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  function maybeShowCombo(source) {
    if (state.destroyed || state.balloonOpen || state.frozen) return;
    if (state.dailyShows >= CONFIG.behavior.maxDailyShows) return;
    var now = Date.now();
    var since = now - state.lastComboAt;
    if (source === 'proximity' && since < CONFIG.behavior.proactiveIntervalMs * 0.9) return;
    if (source === 'dwell' && since < 20000) return;
    // Kullanıcı aktif geziniyorsa proaktif öneriyle araya girme — yavaşlamasını bekle
    if (source === 'proactive' && state.lastScrollTs && now - state.lastScrollTs < 3500) return;

    var combo = pickCombo();
    if (!combo) return;

    state.balloonOpen = true;
    state.lastComboId = combo.id;
    state.lastComboAt = now;
    state.dailyShows++;

    // 1) düşünme animasyonu — ifade: düşünüyor, el çenede
    setExpression('think');
    bodyEl.classList.add('maskot-thinking');
    later(function () {
      bodyEl.classList.remove('maskot-thinking');

      // 2) yakında ürün görseli varsa etiket oradan ele uçar ("getirdi")
      var fromRect = nearestProductRect();
      var show = function () {
        // 3) etiket elde — ifade: heyecanlı, el sallar + sunar
        setExpression('excited');
        bodyEl.classList.add('maskot-waving', 'maskot-presenting');
        later(function () { bodyEl.classList.remove('maskot-waving'); }, 1200);
        renderMiniCard(combo);
        miniCardEl.classList.add('maskot-open');
        updateGaze(); // hemen etikete baksın
        // 4) 350ms sonra balon
        later(function () {
          renderBalloon(combo);
          balloonEl.classList.add('maskot-open');
          track(EVENTS.COMBO_SHOWN, combo.id);
        }, 350);
      };
      if (fromRect) flyCard(combo, fromRect, show);
      else show();
    }, 600);
  }

  function renderMiniCard(combo) {
    miniCardEl.innerHTML = '';
    if (combo.suggestedProductImage) {
      var img = document.createElement('img');
      img.src = combo.suggestedProductImage;
      img.alt = combo.suggestedProductName;
      miniCardEl.appendChild(img);
    } else {
      var em = document.createElement('span');
      em.className = 'maskot-mini-emoji';
      em.textContent = combo.suggestedProductEmoji || '🛍️';
      miniCardEl.appendChild(em);
    }
    miniCardEl.onclick = safely(function (e) {
      e.stopPropagation();
      openPreview(combo);
    });
  }

  // Balon metnini harf harf yazar; bu sırada maskot "konuşur" (ağız animasyonu).
  // reduced-motion'da veya çok kısa metinde anında basılır.
  var speakTimer = null;
  function speakText(el, full) {
    full = full || '';
    if (speakTimer) {
      window.clearInterval(speakTimer);
      speakTimer = null;
      if (bodyEl) bodyEl.classList.remove('maskot-talking');
    }
    if (state.reducedMotion || full.length < 8) { el.textContent = full; return; }
    var step = Math.max(14, Math.min(40, Math.floor(2200 / full.length))); // toplam ~1-2.2 sn
    var i = 0;
    el.textContent = ' '; // yükseklik zıplamasın
    if (bodyEl) bodyEl.classList.add('maskot-talking');
    speakTimer = window.setInterval(function () {
      if (state.destroyed) { window.clearInterval(speakTimer); speakTimer = null; return; }
      i += 1;
      el.textContent = full.slice(0, i);
      if (i >= full.length) {
        window.clearInterval(speakTimer);
        speakTimer = null;
        later(function () { if (bodyEl) bodyEl.classList.remove('maskot-talking'); }, 160);
      }
    }, step);
  }

  function renderBalloon(combo) {
    // Balon yönü: maskot ekranın sağındaysa sola açıl
    var opensLeft = currentPos.x > window.innerWidth / 2;
    balloonEl.classList.remove('maskot-left', 'maskot-right');
    balloonEl.classList.add(opensLeft ? 'maskot-left' : 'maskot-right');

    balloonEl.innerHTML = '';

    var label = document.createElement('span');
    label.className = 'maskot-b-label';
    label.textContent = combo.expertNote ? '✨ ' + combo.expertNote : t('expertLabel');

    var text = document.createElement('span');
    text.className = 'maskot-b-text';
    speakText(text, combo.mascotText);

    var product = document.createElement('div');
    product.className = 'maskot-b-product';
    var pEmoji = document.createElement('span');
    pEmoji.className = 'maskot-b-p-emoji';
    pEmoji.textContent = combo.suggestedProductEmoji || '🛍️';
    var pName = document.createElement('span');
    pName.className = 'maskot-b-p-name';
    pName.textContent = combo.suggestedProductName;
    var pPrice = document.createElement('span');
    pPrice.className = 'maskot-b-p-price';
    pPrice.textContent = combo.suggestedProductPrice;
    product.appendChild(pEmoji);
    product.appendChild(pName);
    product.appendChild(pPrice);
    product.onclick = safely(function () { openPreview(combo); });

    var close = document.createElement('button');
    close.className = 'maskot-b-close';
    close.type = 'button';
    close.setAttribute('aria-label', t('close'));
    close.textContent = '✕';
    close.onclick = safely(function (e) {
      e.stopPropagation();
      dismissCombo(combo);
    });

    balloonEl.appendChild(close);
    balloonEl.appendChild(label);

    // Profil eşleşmesi varsa kişisel satır ("Siyah seviyorsun galiba...")
    var pLine = personalLineFor(combo);
    if (pLine) {
      var personal = document.createElement('span');
      personal.className = 'maskot-b-personal';
      personal.textContent = pLine;
      balloonEl.appendChild(personal);
    }

    balloonEl.appendChild(text);
    balloonEl.appendChild(product);

    if (combo.socialProof) {
      var social = document.createElement('span');
      social.className = 'maskot-b-social';
      social.textContent = '🔥 ' + combo.socialProof;
      balloonEl.appendChild(social);
    }
  }

  // Tek satırlık konuşma balonu — mikro-diyalog (etiketsiz, kendiliğinden kapanır)
  function sayLine(text, ms) {
    if (state.destroyed || state.balloonOpen || state.frozen) return;
    state.balloonOpen = true;
    state.tipOpen = true;

    var opensLeft = currentPos.x > window.innerWidth / 2;
    balloonEl.classList.remove('maskot-left', 'maskot-right');
    balloonEl.classList.add(opensLeft ? 'maskot-left' : 'maskot-right');
    balloonEl.innerHTML = '';

    var textEl = document.createElement('span');
    textEl.className = 'maskot-b-text';
    textEl.style.marginBottom = '0';
    speakText(textEl, text);
    var close = document.createElement('button');
    close.className = 'maskot-b-close';
    close.type = 'button';
    close.setAttribute('aria-label', t('close'));
    close.textContent = '✕';
    close.onclick = safely(function (e) {
      e.stopPropagation();
      closeBalloon();
      state.tipOpen = false;
    });
    balloonEl.appendChild(close);
    balloonEl.appendChild(textEl);
    balloonEl.classList.add('maskot-open');

    later(function () {
      if (state.tipOpen) { closeBalloon(); state.tipOpen = false; }
    }, ms || 3000);
  }

  // İlk / tekrar ziyaret karşılaması — karaktere "hafıza" hissi verir
  function greetVisitor() {
    var count = 1;
    try {
      if (window.sessionStorage.getItem('maskot_greeted')) return;
      window.sessionStorage.setItem('maskot_greeted', '1');
      var raw = window.localStorage.getItem('maskot_visits');
      var d = raw ? JSON.parse(raw) : null;
      var now = Date.now();
      if (!d || now - d.ts > 86400000) d = { c: 0, ts: now };
      d.c++;
      count = d.c;
      window.localStorage.setItem('maskot_visits', JSON.stringify(d));
    } catch (e) { /* storage yok — ilk ziyaret say */ }

    var msg = count >= 2
      ? 'Yine hoş geldin! 👋 Senin için yeni kombinlerim var.'
      : 'Merhaba! Ben ' + CONFIG.mascot.name + ' 👋 Göz attıklarına göre kombin fısıldarım.';
    later(function () {
      bodyEl.classList.add('maskot-waving');
      later(function () { bodyEl.classList.remove('maskot-waving'); }, 1200);
      sayLine(msg, 4000);
    }, 2200);
  }

  // Sepete ekleme kutlaması (mağazadaki butonu dinler)
  function watchAddToCart() {
    document.addEventListener('click', safely(function (e) {
      var btn = e.target && e.target.closest
        ? e.target.closest('.add-to-cart, .sepete-ekle, .buy-now')
        : null;
      if (!btn || state.destroyed) return;
      // Attribution: maskot önerisiyle gelinen sayfada sepete eklendi
      if (window.location.search.indexOf('ref=maskot') !== -1) {
        track(EVENTS.COMBO_ADD_TO_CART);
      }
      if (state.frozen || (state.balloonOpen && !state.tipOpen)) return;
      if (state.tipOpen) { closeBalloon(); state.tipOpen = false; }
      setExpression('excited');
      bodyEl.classList.add('maskot-clapping');
      later(function () { bodyEl.classList.remove('maskot-clapping'); }, 1700);
      sayLine('🎉 Harika seçim! Bu parça sana çok yakışacak.', 3200);
    }), true);
  }

  // Maskota tıklama: zıpla + rastgele stil ipucu göster
  function onMascotClick() {
    state.lastInteraction = Date.now();
    if (state.frozen) return;
    if (state.balloonOpen) {
      if (state.tipOpen) { closeBalloon(); state.tipOpen = false; }
      return; // kombin balonu açıkken karışma
    }
    track(EVENTS.MASCOT_CLICKED);
    setExpression('excited');
    bodyEl.classList.add('maskot-jumping');
    later(function () { bodyEl.classList.remove('maskot-jumping'); }, 800);

    // AI önerileri hazırsa ilk tıklamada onları göster, sonrakilerde ipucu
    if (state.recs && state.recs.length && !state.recsShown) {
      showRecsBalloon();
      return;
    }

    // İpucu balonu — kombin balonuyla aynı gövde, sade içerik
    var tip = STYLE_TIPS[Math.floor(Math.random() * STYLE_TIPS.length)];
    state.balloonOpen = true;
    state.tipOpen = true;

    var opensLeft = currentPos.x > window.innerWidth / 2;
    balloonEl.classList.remove('maskot-left', 'maskot-right');
    balloonEl.classList.add(opensLeft ? 'maskot-left' : 'maskot-right');
    balloonEl.innerHTML = '';

    var label = document.createElement('span');
    label.className = 'maskot-b-label';
    label.textContent = '💡 Stil İpucu';
    var text = document.createElement('span');
    text.className = 'maskot-b-text';
    speakText(text, tip);
    var close = document.createElement('button');
    close.className = 'maskot-b-close';
    close.type = 'button';
    close.setAttribute('aria-label', t('close'));
    close.textContent = '✕';
    close.onclick = safely(function (e) {
      e.stopPropagation();
      closeBalloon();
      state.tipOpen = false;
    });
    balloonEl.appendChild(close);
    balloonEl.appendChild(label);
    balloonEl.appendChild(text);
    balloonEl.classList.add('maskot-open');

    // 6 sn sonra kendiliğinden kapanır
    later(function () {
      if (state.tipOpen) { closeBalloon(); state.tipOpen = false; }
    }, 6000);
  }

  // Alkış jesti (maskot önerisiyle ürün sayfasına gelindiğinde)
  function celebrateArrival() {
    setExpression('excited');
    bodyEl.classList.add('maskot-clapping');
    later(function () {
      bodyEl.classList.remove('maskot-clapping');
      setExpression('happy');
    }, 1700);
  }

  function closeBalloon() {
    balloonEl.classList.remove('maskot-open');
    miniCardEl.classList.remove('maskot-open');
    bodyEl.classList.remove('maskot-presenting', 'maskot-talking');
    if (speakTimer) { window.clearInterval(speakTimer); speakTimer = null; }
    state.balloonOpen = false;
    setExpression('happy');
    updateGaze();
  }

  function dismissCombo(combo) {
    track(EVENTS.COMBO_DISMISSED, combo.id);
    closeBalloon();
    // Reddedilince kısa süre üzgün + espirili tek satır tepki, sonra toparlar
    setExpression('sad');
    later(function () {
      sayLine('Tamam tamam, karışmıyorum 😄', 2400);
    }, 300);
    later(function () { setExpression('happy'); }, 2800);
    // ✕'e basıldı → sonraki proaktif öneri dismissCooldown kadar ertelenir
    state.lastComboAt = Date.now() + (CONFIG.behavior.dismissCooldownMs - CONFIG.behavior.proactiveIntervalMs);
  }

  // ---------------------------------------------------------------
  // Önizleme modalı
  // ---------------------------------------------------------------
  function openPreview(combo) {
    if (state.frozen) return;
    state.frozen = true; // maskot donar, balon açık kalır
    setExpression('excited');
    updateGaze(); // öne (kullanıcıya) bakar
    track(EVENTS.PREVIEW_OPENED, combo.id);

    modalEl = document.createElement('div');
    modalEl.className = 'maskot-modal-backdrop';

    var modal = document.createElement('div');
    modal.className = 'maskot-modal';

    var close = document.createElement('button');
    close.className = 'maskot-m-close';
    close.type = 'button';
    close.setAttribute('aria-label', t('close'));
    close.textContent = '✕';
    close.onclick = safely(closePreview);

    var visual = document.createElement('div');
    visual.className = 'maskot-m-visual';
    if (combo.suggestedProductImage) {
      var img = document.createElement('img');
      img.src = combo.suggestedProductImage;
      img.alt = combo.suggestedProductName;
      visual.appendChild(img);
    } else {
      visual.textContent = combo.suggestedProductEmoji || '🛍️';
    }

    var name = document.createElement('span');
    name.className = 'maskot-m-name';
    name.textContent = combo.suggestedProductName;

    var price = document.createElement('span');
    price.className = 'maskot-m-price';
    price.textContent = combo.suggestedProductPrice;

    var cta = document.createElement('a');
    cta.className = 'maskot-m-cta';
    // Attribution: maskot kaynaklı ziyaret ürün sayfasında işaretlensin
    cta.href = combo.suggestedProductUrl +
      (combo.suggestedProductUrl.indexOf('?') >= 0 ? '&' : '?') + 'ref=maskot';
    cta.textContent = t('previewCta');
    cta.onclick = safely(function () {
      // PRODUCT_PAGE_VISIT varış sayfasında (ref=maskot) sayılır — çift sayma yok
      closePreview();
      closeBalloon();
      // href yönlendirmeyi yapar
    });

    modal.appendChild(close);
    modal.appendChild(visual);
    modal.appendChild(name);
    modal.appendChild(price);
    modal.appendChild(cta);
    modalEl.appendChild(modal);

    modalEl.onclick = safely(function (e) {
      if (e.target === modalEl) closePreview();
    });

    root.appendChild(modalEl);
    // reflow sonrası animasyon sınıfı
    later(function () { modalEl.classList.add('maskot-open'); }, 20);
  }

  function closePreview() {
    if (!modalEl) return;
    var el = modalEl;
    modalEl = null;
    el.classList.remove('maskot-open');
    later(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 260);
    state.frozen = false;
    setExpression('happy');
    updateGaze();
  }

  // ---------------------------------------------------------------
  // Proaktif zamanlayıcı
  // ---------------------------------------------------------------
  function scheduleProactive() {
    if (state.destroyed) return;
    var loop = function () {
      if (state.destroyed) return;
      var since = Date.now() - state.lastComboAt;
      if (!state.balloonOpen && !state.frozen && since >= CONFIG.behavior.proactiveIntervalMs) {
        maybeShowCombo('proactive');
      }
      state.proactiveTimer = later(loop, 5000);
    };
    // İlk öneri: sayfa açıldıktan proactiveDelayMs sonra
    later(function () {
      maybeShowCombo('proactive');
      state.proactiveTimer = later(loop, 5000);
    }, CONFIG.behavior.proactiveDelayMs);
  }

  // ---------------------------------------------------------------
  // Başlatma
  // ---------------------------------------------------------------
  var init = safely(function () {
    // Config öncelik sırası: DEFAULT < API config < sayfanın window.MASKOT_CONFIG'i
    var script = document.currentScript || document.querySelector('script[data-token]');
    var token = (script && script.getAttribute('data-token')) || 'demo';
    state.apiBase = (script && script.getAttribute('data-api')) || null;

    // Backend config şemasını widget şemasına çevir: sizeDesktop/sizeMobile →
    // mascot.size/behavior.mobileSize, behavior.noGoSelectors → kök,
    // combos[].product{...} → düz suggestedProduct* alanları. Göreli /uploads
    // yolları apiBase'e göre mutlaklaştırılır (görsel hangi origin'de
    // gösterilirse gösterilsin backend'den yüklensin).
    var absolutize = function (u) {
      return u && u.charAt(0) === '/' && state.apiBase ? state.apiBase + u : u;
    };
    var normalizeApiConfig = function (cfg) {
      if (!cfg) return cfg;
      var out = { mascot: {}, behavior: {} };
      var m = cfg.mascot || {};
      var b = cfg.behavior || {};
      for (var mk in m) out.mascot[mk] = m[mk];
      for (var bk in b) out.behavior[bk] = b[bk];
      if (m.imageUrl) out.mascot.imageUrl = absolutize(m.imageUrl);
      if (m.sizeDesktop) out.mascot.size = m.sizeDesktop;
      if (m.sizeMobile) out.behavior.mobileSize = m.sizeMobile;
      if (b.noGoSelectors) out.noGoSelectors = b.noGoSelectors;
      if (cfg.combos) {
        out.combos = [];
        for (var i = 0; i < cfg.combos.length; i++) {
          var c = cfg.combos[i];
          out.combos.push(c.product ? {
            id: c.id,
            suggestedProductName: c.product.name,
            suggestedProductPrice: c.product.price,
            suggestedProductUrl: c.product.url,
            suggestedProductImage: absolutize(c.product.image),
            mascotText: c.mascotText,
            socialProof: c.socialProof,
            expertNote: c.expertNote,
          } : c);
        }
      }
      return out;
    };

    var applyConfig = function (apiCfg) {
      CONFIG = mergeConfig(
        mergeConfig(DEFAULT_CONFIG, normalizeApiConfig(apiCfg || null)),
        window.MASKOT_CONFIG || null
      );
      CONFIG.token = token || CONFIG.token;
    };

    // Backend varsa config'i oradan çek — 800ms cevap yoksa yerel config ile sessizce devam
    if (state.apiBase && window.fetch) {
      var started = false;
      var proceed = function (apiCfg) {
        if (started) return;
        started = true;
        applyConfig(apiCfg);
        startWidget(script);
      };
      window.setTimeout(safely(function () { proceed(null); }), 800);
      try {
        fetch(state.apiBase + '/api/widget/config?token=' + encodeURIComponent(token) +
              '&url=' + encodeURIComponent(window.location.href))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (cfg) { proceed(cfg); })
          .catch(function () { proceed(null); });
      } catch (e) { proceed(null); }
    } else {
      applyConfig(null);
      startWidget(script);
    }
  });

  var startWidget = safely(function (script) {
    state.reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.isMobile = window.innerWidth < 768;

    if (state.isMobile && !CONFIG.behavior.mobileEnabled) return;
    state.mascotSize = state.isMobile ? CONFIG.behavior.mobileSize : CONFIG.mascot.size;

    sessionId = getSessionId();

    injectStyles();
    buildDOM();
    detectNoGoZones();

    // Scroll/resize sonrası zonlar bayatlar — pasif dinleyicilerle tazele (debounced)
    var refreshTimer = null;
    var refreshZones = function () {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(safely(detectNoGoZones), 200);
    };
    window.addEventListener('scroll', refreshZones, { passive: true });
    window.addEventListener('resize', refreshZones, { passive: true });

    // Pencere küçülünce maskot sınır dışında kalmasın — anında içeri çek
    window.addEventListener('resize', safely(function () {
      setMascotPos(currentPos.x, currentPos.y, 300);
    }), { passive: true });

    // Sayfanın beslediği ürün görüntüleme kuyruğunu işle (oturum profili)
    processQueue();

    // "Bunları da seversin" önerilerini arka planda getir (Faz 5) —
    // profil yeterliyse ve backend erişilebilirse; hata sessizce yutulur
    later(safely(fetchRecommendations), 2500);

    // Katalog ajanının pasif sinyali: sayfadaki schema.org/Product
    // JSON-LD verisini backend'e bildir (ürün başına oturumda 1 kez)
    later(safely(ingestPageProduct), 1500);

    // Fare takibi + etkileşim/uyanma sinyalleri
    window.addEventListener('mousemove', function (e) {
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
      state.lastInteraction = Date.now();
    }, { passive: true });
    window.addEventListener('click', function () {
      state.lastInteraction = Date.now();
    }, { passive: true });

    // Hızlı scroll → şaşırma
    window.addEventListener('scroll', safely(function () {
      var now = Date.now();
      var y = window.scrollY || 0;
      if (state.lastScrollTs) {
        var speed = Math.abs(y - state.lastScrollY) / Math.max(now - state.lastScrollTs, 1);
        if (speed > 3 && !state.balloonOpen && !state.frozen && state.expr !== 'surprised') {
          setExpression('surprised');
          later(function () {
            if (state.expr === 'surprised') setExpression('happy');
          }, 1300);
        }
      }
      state.lastScrollY = y;
      state.lastScrollTs = now;
      state.lastInteraction = now;
    }), { passive: true });

    // Kullanıcı bir ürüne uzun bakıyorsa (hover ≥2.5sn) maskot yavaşça sokulur
    var dwellTimer = null;
    document.addEventListener('mouseover', safely(function (e) {
      if (dwellTimer) { window.clearTimeout(dwellTimer); dwellTimer = null; }
      var img = e.target && e.target.closest
        ? e.target.closest('.product-image, .product-photo, .pdp-image')
        : null;
      if (!img) return;
      dwellTimer = later(function () {
        if (state.destroyed || state.balloonOpen || state.frozen || state.busy) return;
        var r = img.getBoundingClientRect();
        if (!r.width) return;
        var p = standPointBeside(r);
        if (rectIntersectsNoGo(p.x, p.y, state.mascotSize)) return;
        state.busy = true; // senaryo hareketi beklesin
        var dist = Math.sqrt(
          (p.x - currentPos.x) * (p.x - currentPos.x) +
          (p.y - currentPos.y) * (p.y - currentPos.y)
        );
        var dur = Math.max(1600, Math.min(4200, dist * 2.8)); // yavaş, "sokulma" temposu
        setMascotPos(p.x, p.y, dur);
        later(function () {
          state.busy = false;
          updateGaze();
          maybeShowCombo('dwell');
        }, (state.reducedMotion ? 60 : dur) + 300);
      }, 2500);
    }), true);

    // Exit-intent: imleç pencerenin üstünden çıkarken son bir öneri (oturumda 1 kez)
    document.addEventListener('mouseout', safely(function (e) {
      if (e.relatedTarget) return;
      if (e.clientY > 12) return;
      if (state.exitShown) return;
      state.exitShown = true;
      maybeShowCombo('exit');
    }));

    // Maskot önerisiyle mi gelindi? (ref=maskot) → alkışla karşıla
    if (window.location.search.indexOf('ref=maskot') !== -1) {
      track(EVENTS.PRODUCT_PAGE_VISIT);
      later(celebrateArrival, 900);
    } else {
      greetVisitor(); // ilk / tekrar ziyaret selamı
    }

    watchAddToCart();
    nextMove(); // hareket döngüsü: gezinti ↔ ürün ziyareti
    scheduleProactive();
    startGazeLoop();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
