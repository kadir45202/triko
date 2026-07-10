/**
 * ATELIER demo mağaza — ürün kataloğu, kart render ve maskot entegrasyonu.
 * Görsel odaklı demo: görseller emoji + gradient "fotoğraf" olarak temsil edilir.
 * Gerçek siteye geçerken `visual`/`gradient` yerine image URL koymak yeterli.
 */
(function () {
  'use strict';

  // Katalog verisi paylaşılan tek kaynaktan gelir (catalog-data.js —
  // lite server da sitemap.xml ve JSON-LD üretirken aynı veriyi kullanır)
  var CATALOG = window.ATELIER_DATA || [];

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

  // ---------- Maskot kombin config'i ----------
  function comboFor(productId) {
    var defs = COMBO_MAP[productId] || [];
    var combos = [];
    for (var i = 0; i < defs.length; i++) {
      var s = byId(defs[i].suggest);
      if (!s) continue;
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
    byId: byId,
    cardHTML: cardHTML,
    renderGrid: renderGrid,
    comboFor: comboFor,
    initMascot: initMascot,
  };
})();
