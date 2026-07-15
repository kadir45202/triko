/**
 * ATELIER demo mağaza — ürün kataloğu, kart render ve maskot entegrasyonu.
 * Görsel odaklı demo: görseller emoji + gradient "fotoğraf" olarak temsil edilir.
 * Gerçek siteye geçerken `visual`/`gradient` yerine image URL koymak yeterli.
 */
(function () {
  'use strict';

  // Katalog verisi paylaşılan tek kaynaktan gelir (catalog-data.js —
  // lite server da sitemap.xml ve JSON-LD üretirken aynı veriyi kullanır).
  // Backend (panel) kataloğu çevrimiçiyse taranan ürünler buna eklenir;
  // kapalıysa yalnız statik demo kataloğu gösterilir.
  // ATELIER küratörlü vitrin — ana grid ve maskot kombinleri bunu kullanır.
  var CATALOG = window.ATELIER_DATA || [];
  // Backend ajanının taradığı katalog ATELIER'den ayrı tutulur: ana vitrine
  // karışmaz, mağazada kendi "Taranan ürünler" bölümünde gösterilir.
  var EXTERNAL = [];

  // ---------- Backend katalog yüklemesi (asenkron) ----------
  // Sayfalar render'larını ATELIER.ready() içine sararak katalog gelene kadar
  // bekler; backend yoksa/zaman aşımına uğrarsa statik kataloğa düşer.
  var _settled = false;
  var _readyCbs = [];
  function _settle() {
    if (_settled) return;
    _settled = true;
    for (var i = 0; i < _readyCbs.length; i++) { try { _readyCbs[i](); } catch (e) { /* sessiz */ } }
    _readyCbs = [];
  }
  function ready(cb) { if (_settled) cb(); else _readyCbs.push(cb); }

  function apiBase() {
    return window.location.port === '3001' ? window.location.origin : 'http://localhost:3001';
  }

  var CAT_LABELS = {
    'ust-giyim': 'Üst Giyim', 'alt-giyim': 'Alt Giyim', 'elbise': 'Elbise',
    'dis-giyim': 'Dış Giyim', 'ayakkabi': 'Ayakkabı', 'canta': 'Çanta', 'aksesuar': 'Aksesuar',
  };
  var CAT_EMOJI = {
    'ust-giyim': '👚', 'alt-giyim': '👖', 'elbise': '👗',
    'dis-giyim': '🧥', 'ayakkabi': '👠', 'canta': '👜', 'aksesuar': '🕶️',
  };

  // Backend ürününü mağaza kart şemasına çevir. Taranan ürünlerin görselleri
  // var; gradient/emoji yalnız görsel yoksa yedek olarak kullanılır.
  function mapBackend(p) {
    var label = CAT_LABELS[p.category] || 'Ürün';
    var priceStr = (p.price != null)
      ? (p.currency && p.currency !== 'TRY' ? p.currency + ' ' : '₺') + Number(p.price).toLocaleString('tr-TR')
      : '';
    return {
      id: p.id,
      img: p.image || null,
      color: p.color || null,
      priceNum: p.price != null ? Number(p.price) : null,
      name: p.name,
      cat: 'kadin', // taranan katalog (Koton) kadın koleksiyonu
      catLabel: 'Kadın / ' + label,
      price: priceStr,
      old: null,
      visual: CAT_EMOJI[p.category] || '🛍️',
      gradient: 'linear-gradient(150deg,#eef1f4,#d9dfe6)',
      tag: 'Yeni',
      desc: p.name + ' — mağaza kataloğundan.',
      external: true,
      cat_raw: p.category || null,
      type: p.category || null, // otomatik kombin motoru bu alandan tamamlayıcı seçer
    };
  }

  function loadBackend() {
    if (!window.fetch) { _settle(); return; }
    var done = false;
    var to = window.setTimeout(function () { if (!done) { done = true; _settle(); } }, 1500);
    fetch(apiBase() + '/api/widget/catalog?token=demo')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!done && d && d.products && d.products.length) {
          var ids = {};
          for (var i = 0; i < CATALOG.length; i++) ids[CATALOG[i].id] = 1;
          for (var j = 0; j < d.products.length; j++) {
            var m = mapBackend(d.products[j]);
            if (!ids[m.id]) { EXTERNAL.push(m); ids[m.id] = 1; } // ayrı bölüme
          }
        }
      })
      .catch(function () { /* backend yok — statik katalog */ })
      .then(function () { if (!done) { done = true; window.clearTimeout(to); _settle(); } });
  }

  // Ürün bazlı kombin önerileri (uzman kadro girdisi — maskot bunları taşır)
  var COMBO_MAP = {
    'k-elbise-midi':   [{ suggest: 'k-topuklu',       text: 'Bu elbiseye desenli stiletto — bacak boyu +10 cm etkisi!',   proof: '2.480 kişi bu kombini yaptı' },
                        { suggest: 'k-canta',          text: 'Mini omuz çantası bu elbiseyle davet hazır!',             proof: '1.940 kişi bu kombini yaptı' }],
    'k-trenckot':      [{ suggest: 'k-bluz',           text: 'Trençkotun altına ipek bluz — Paris sokak stili!',        proof: '1.720 kişi bu kombini yaptı' },
                        { suggest: 'k-gunes-gozlugu',  text: 'Oversize gözlükle bu trençkot star görünümü verir ✨',    proof: '980 kişi bu kombini yaptı' }],
    'k-topuklu':       [{ suggest: 'k-elbise-midi',    text: 'Bu stiletto saten elbiseyle muhteşem uyumlu!',            proof: '2.480 kişi bu kombini yaptı' }],
    'k-canta':         [{ suggest: 'k-elbise-midi',    text: 'Bu çanta + saten elbise = davet kombini hazır!',          proof: '1.940 kişi bu kombini yaptı' }],
    'k-bluz':          [{ suggest: 'k-trenckot',       text: 'İpek bluzun üstüne trençkot — ofis şıklığı!',             proof: '1.720 kişi bu kombini yaptı' }],
    'k-gunes-gozlugu': [{ suggest: 'k-hasir-sapka',    text: 'Gözlük + hasır şapka: yaz ikilisi tamamlandı ☀️',         proof: '860 kişi bu kombini yaptı' }],
    'k-hasir-sapka':   [{ suggest: 'k-gunes-gozlugu',  text: 'Bu şapkaya oversize gözlük çok yakışır!',                 proof: '860 kişi bu kombini yaptı' }],

    'e-gomlek':        [{ suggest: 'e-ceket',          text: 'Beyaz gömlek + blazer — toplantıdan yemeğe geçiş!',       proof: '2.140 kişi bu kombini yaptı' },
                        { suggest: 'e-saat',           text: 'Çelik saat bu gömleğin manşetiyle harika durur.',         proof: '1.310 kişi bu kombini yaptı' }],
    'e-tisort':        [{ suggest: 'e-jean',           text: 'Siyah + siyah — güçlü monoblock kombin!',                 proof: '3.120 kişi bu kombini yaptı' },
                        { suggest: 'e-sneaker',        text: 'Bu tişörte beyaz sneaker kontrastı çok iyi!',             proof: '1.874 kişi bu kombini yaptı' }],
    'e-jean':          [{ suggest: 'e-tisort',         text: 'Bu jean oversize tişörtle sokak stili tamamlar!',         proof: '3.120 kişi bu kombini yaptı' },
                        { suggest: 'e-sneaker',        text: 'Bilekte daralan jean + minimal sneaker = ✨',             proof: '2.660 kişi bu kombini yaptı' }],
    'e-sneaker':       [{ suggest: 'e-jean',           text: 'Bu sneaker slim jean ile en iyi halinde!',                proof: '2.660 kişi bu kombini yaptı' }],
    'e-ceket':         [{ suggest: 'e-gomlek',         text: 'Blazerın altına poplin gömlek — klasik ama taze!',        proof: '2.140 kişi bu kombini yaptı' },
                        { suggest: 'e-tisort',         text: 'Blazer + siyah tişört: smart casual formülü!',            proof: '1.590 kişi bu kombini yaptı' }],
    'e-sapka':         [{ suggest: 'e-tisort',         text: 'Şapka + oversize tişört: hafta sonu üniforması!',         proof: '740 kişi bu kombini yaptı' }],
    'e-saat':          [{ suggest: 'e-gomlek',         text: 'Bu saat beyaz gömlekle zamansız bir ikili!',              proof: '1.310 kişi bu kombini yaptı' }],
  };

  function byId(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    for (var j = 0; j < EXTERNAL.length; j++) if (EXTERNAL[j].id === id) return EXTERNAL[j];
    return null;
  }

  // ---------- Kart render ----------
  function cardHTML(p) {
    return (
      '<a class="card" href="urun.html?id=' + p.id + '">' +
        '<div class="frame product-photo" style="background:' + p.gradient + '">' +
          (p.tag ? '<span class="tag">' + p.tag + '</span>' : '') +
          (p.img ? '<img src="' + p.img + '" alt="' + p.name + '" loading="lazy">' : p.visual) +
        '</div>' +
        '<div class="meta">' +
          '<div class="name">' + p.name + '</div>' +
          '<div class="cat">' + p.catLabel + '</div>' +
          '<div class="price">' + p.price + '</div>' +
        '</div>' +
      '</a>'
    );
  }

  function renderGrid(containerId, filterFn, limit) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var items = CATALOG.filter(filterFn || function () { return true; });
    if (limit) items = items.slice(0, limit);
    el.innerHTML = items.map(cardHTML).join('');
  }

  // Taranan (backend ajanı) ürünlerini ayrı bir grid'e bas. Dönen sayı 0 ise
  // çağıran, bölümü gizli tutabilir (backend kapalı/boşsa hiç görünmez).
  function renderExternal(containerId, limit) {
    var el = document.getElementById(containerId);
    if (!el) return 0;
    var items = limit ? EXTERNAL.slice(0, limit) : EXTERNAL;
    el.innerHTML = items.map(cardHTML).join('');
    return items.length;
  }

  // ---------- Otomatik kombin motoru ----------
  // Elle yazılmış COMBO_MAP flagship ürünlere küratörlü metin verir; geri kalan
  // her ürün için kombinler katalog metadata'sından türetilir. Bu, backend
  // ajanının kural mantığının (ruleBasedCombos) mağaza tarafındaki eşdeğeri:
  // katalog büyüdükçe kombinler elle bakım gerektirmeden çoğalır.
  var COMBO_TARGET = 3; // ürün başına gösterilecek kombin sayısı hedefi

  // Hangi kategori hangi kategorilerle kombinlenir (öncelik sırasıyla)
  var COMPLEMENTS = {
    'elbise':    ['ayakkabi', 'canta', 'dis-giyim', 'aksesuar'],
    'ust-giyim': ['alt-giyim', 'dis-giyim', 'ayakkabi', 'aksesuar'],
    'alt-giyim': ['ust-giyim', 'ayakkabi', 'dis-giyim', 'aksesuar'],
    'dis-giyim': ['ust-giyim', 'alt-giyim', 'elbise', 'ayakkabi'],
    'ayakkabi':  ['elbise', 'alt-giyim', 'ust-giyim', 'canta'],
    'canta':     ['elbise', 'dis-giyim', 'ust-giyim', 'ayakkabi'],
    'aksesuar':  ['elbise', 'ust-giyim', 'dis-giyim', 'alt-giyim'],
  };
  var NEUTRALS = { 'siyah': 1, 'beyaz': 1, 'bej': 1, 'gri': 1, 'krem': 1, 'ekru': 1, 'lacivert': 1 };
  var AUTO_TEMPLATES = [
    function (n) { return 'Bu parçaya ' + n + ' çok yakışır — birlikte dene! ✨'; },
    function (n) { return n + ' ile bu ikili kombinin yıldızı olur!'; },
    function (n) { return 'Stil ipucu: yanına ' + n + ' ekle, görünüm tamamlansın!'; },
    function (n) { return n + ' bu kombini bir üst seviyeye taşır 👌'; },
  ];

  // id çiftinden kararlı bir sayı (şablon ve sosyal kanıt seçimi tutarlı kalsın)
  function hashNum(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  // Bir ürün için katalog metadata'sından tamamlayıcı kombinler üret.
  // used: zaten önerilmiş id'ler (elle yazılan kombinlerle çakışmayı önler).
  function autoCombosFor(productId, used, limit) {
    var base = byId(productId);
    if (!base || !base.type) return [];
    var wanted = COMPLEMENTS[base.type] || [];
    if (!wanted.length || limit <= 0) return [];
    // Kombin havuzu ürünün ait olduğu katalog: ATELIER ürünü ATELIER'le,
    // taranan ürün taranan katalogla eşleşir (markalar karışmaz).
    var pool = base.external ? EXTERNAL : CATALOG;
    var scored = [];
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (p.id === base.id || (used && used[p.id])) continue;
      if (p.cat && base.cat && p.cat !== base.cat) continue; // aynı reyon (kadın/erkek)
      var rank = wanted.indexOf(p.type);
      if (rank === -1) continue;
      var score = (wanted.length - rank); // tercih edilen kategori daha yüksek
      if (base.color && p.color === base.color) score += 2;          // ton uyumu
      else if (p.color && NEUTRALS[p.color]) score += 1;             // nötr her şeyle gider
      if (base.priceNum && p.priceNum &&
          Math.abs(p.priceNum - base.priceNum) / base.priceNum < 1) score += 1; // fiyat seviyesi yakın
      scored.push({ p: p, score: score });
    }
    scored.sort(function (a, b) { return b.score - a.score; });

    var out = [];
    var seenName = {}; // aynı isimli ürünü (ör. taranan renk varyantları) tekrar önerme
    for (var j = 0; j < scored.length && out.length < limit; j++) {
      var s = scored[j].p;
      var nameKey = (s.name || '').toLowerCase();
      if (seenName[nameKey]) continue;
      seenName[nameKey] = 1;
      var seed = hashNum(base.id + '>' + s.id);
      out.push({
        id: 'combo_' + base.id + '_' + s.id,
        suggestedProductName: s.name,
        suggestedProductPrice: s.price,
        suggestedProductUrl: 'urun.html?id=' + s.id,
        suggestedProductImage: s.img || null,
        suggestedProductEmoji: s.visual,
        suggestedColor: s.color || null,
        suggestedCategory: s.cat || null,
        suggestedPriceNum: s.priceNum || null,
        mascotText: AUTO_TEMPLATES[seed % AUTO_TEMPLATES.length](s.name),
        socialProof: (600 + (seed % 3200)).toLocaleString('tr-TR') + ' kişi bu kombini yaptı',
        expertNote: 'Triko önerisi',
      });
    }
    return out;
  }

  // ---------- Maskot kombin config'i ----------
  // Önce elle yazılmış kombinler (küratörlü metin), sonra hedefe kadar
  // otomatik üretilenlerle tamamla. Böylece her ürünün en az birkaç önerisi olur.
  function comboFor(productId) {
    var defs = COMBO_MAP[productId] || [];
    var combos = [];
    var used = {};
    used[productId] = 1;
    for (var i = 0; i < defs.length; i++) {
      var s = byId(defs[i].suggest);
      if (!s || used[s.id]) continue;
      used[s.id] = 1;
      combos.push({
        id: 'combo_' + productId + '_' + s.id,
        suggestedProductName: s.name,
        suggestedProductPrice: s.price,
        suggestedProductUrl: 'urun.html?id=' + s.id,
        suggestedProductImage: s.img || null,
        suggestedProductEmoji: s.visual,
        // Akıllı seçim için metadata (widget profil skorlamasında kullanır)
        suggestedColor: s.color || null,
        suggestedCategory: s.cat || null,
        suggestedPriceNum: s.priceNum || null,
        mascotText: defs[i].text,
        socialProof: defs[i].proof,
        expertNote: 'Uzman önerisi',
      });
    }
    if (combos.length < COMBO_TARGET) {
      combos = combos.concat(autoCombosFor(productId, used, COMBO_TARGET - combos.length));
    }
    return combos;
  }

  // Sayfaya maskotu bağla: kombinleri kur, widget script'ini enjekte et
  function initMascot(opts) {
    opts = opts || {};
    var combos = [];
    if (opts.productId) {
      combos = comboFor(opts.productId);
    } else if (opts.productIds) {
      for (var i = 0; i < opts.productIds.length; i++) {
        combos = combos.concat(comboFor(opts.productIds[i]));
      }
    }
    if (!combos.length) {
      // Kategori/anasayfa: öne çıkan kombinlerden bir seçki
      combos = comboFor('e-tisort').concat(comboFor('k-elbise-midi'));
    }

    window.MASKOT_CONFIG = {
      mascot: { name: 'Triko', primaryColor: '#7c3aed' },
      behavior: { proactiveDelayMs: 4500, proactiveIntervalMs: 35000 },
      combos: combos,
    };

    // Oturum profili beslemesi: ürün sayfası görüntülemesini kuyruğa yaz
    // (widget başlarken işler — renk/kategori/fiyat, KVKK uyumlu, anonim)
    if (opts.productId) {
      var vp = byId(opts.productId);
      if (vp) {
        window.MASKOT_Q = window.MASKOT_Q || [];
        window.MASKOT_Q.push(['productView', {
          id: vp.id, name: vp.name,
          category: vp.cat, color: vp.color || null, price: vp.priceNum || null,
        }]);
      }
    }

    var s = document.createElement('script');
    s.src = '../widget/widget.js';
    s.setAttribute('data-token', 'demo-atelier');
    // Backend çalışıyorsa event'ler oraya da gider; kapalıysa widget sessizce console'da kalır.
    // Node sunucusundan (3001) servis ediliyorsak aynı origin'i kullan.
    s.setAttribute('data-api',
      window.location.port === '3001' ? window.location.origin : 'http://localhost:3001');
    s.async = true;
    document.body.appendChild(s);
  }

  window.ATELIER = {
    CATALOG: CATALOG,
    EXTERNAL: EXTERNAL,
    byId: byId,
    cardHTML: cardHTML,
    renderGrid: renderGrid,
    renderExternal: renderExternal,
    comboFor: comboFor,
    initMascot: initMascot,
    ready: ready,
  };

  // Backend kataloğunu çekmeye başla (sayfalar ATELIER.ready ile bekler)
  loadBackend();
})();
