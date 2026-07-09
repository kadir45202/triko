/**
 * ATELIER demo mağaza — ürün kataloğu, kart render ve maskot entegrasyonu.
 * Görsel odaklı demo: görseller emoji + gradient "fotoğraf" olarak temsil edilir.
 * Gerçek siteye geçerken `visual`/`gradient` yerine image URL koymak yeterli.
 */
(function () {
  'use strict';

  var CATALOG = [
    // ---- Kadın ----
    { id: 'k-elbise-midi', img: 'assets/img/k-elbise-midi.jpg', color: 'kırmızı', priceNum: 1249,   name: 'Saten Gece Elbisesi',      cat: 'kadin', catLabel: 'Kadın / Elbise',   price: '₺1.249', old: '₺1.699', visual: '👗', gradient: 'linear-gradient(150deg,#f6e7ee,#e9d0de)', tag: 'Yeni',    desc: 'Akışkan saten kumaşıyla gün batımından gece davetine uzanan zarif bir silüet. Yanları hafif drapeli, midi boy.' },
    { id: 'k-trenckot', img: 'assets/img/k-trenckot.jpg', color: 'bej', priceNum: 2899,      name: 'Klasik Bej Trençkot',    cat: 'kadin', catLabel: 'Kadın / Dış Giyim', price: '₺2.899', old: null,     visual: '🧥', gradient: 'linear-gradient(150deg,#f1e8d8,#e2d3b8)', tag: null,      desc: 'Zamansız çift düğmeli kesim, kuşaklı bel. Mevsim geçişlerinin kurtarıcısı.' },
    { id: 'k-topuklu', img: 'assets/img/k-topuklu.jpg', color: 'mavi', priceNum: 1799,       name: 'Desenli Saten Stiletto',          cat: 'kadin', catLabel: 'Kadın / Ayakkabı',  price: '₺1.799', old: null,     visual: '👠', gradient: 'linear-gradient(150deg,#f7ece4,#ecd9c8)', tag: null,      desc: '9 cm ince topuk, sivri burun. Çiçek desenli saten yüzeyiyle kombinin yıldızı.' },
    { id: 'k-canta', img: 'assets/img/k-canta.jpg', color: 'mercan', priceNum: 1549,         name: 'Deri El Çantası', cat: 'kadin', catLabel: 'Kadın / Aksesuar',  price: '₺1.549', old: '₺1.999', visual: '👜', gradient: 'linear-gradient(150deg,#efe3d9,#dfc9b4)', tag: 'İndirim', desc: 'Yumuşak dokulu gerçek deri, altın detaylı zincir askı. Gün içinden akşama.' },
    { id: 'k-bluz', img: 'assets/img/k-bluz.jpg', color: 'beyaz', priceNum: 899,          name: 'İşlemeli Beyaz Bluz',      cat: 'kadin', catLabel: 'Kadın / Üst Giyim', price: '₺899',   old: null,     visual: '👚', gradient: 'linear-gradient(150deg,#eee9f4,#dcd2ea)', tag: null,      desc: 'Dökümlü ipek karışımı, gizli düğme patlı. Ofisten yemeğe tek parçayla geçiş.' },
    { id: 'k-gunes-gozlugu', img: 'assets/img/k-gunes-gozlugu.jpg', color: 'siyah', priceNum: 749, name: 'Oversize Güneş Gözlüğü', cat: 'kadin', catLabel: 'Kadın / Aksesuar',  price: '₺749',   old: null,     visual: '🕶️', gradient: 'linear-gradient(150deg,#e8e8ec,#d2d2da)', tag: null,      desc: 'Retro oversize çerçeve, UV400 koruma. Görünümün son dokunuşu.' },
    { id: 'k-hasir-sapka', img: 'assets/img/k-hasir-sapka.jpg', color: 'bej', priceNum: 549,   name: 'Hasır Fötr Şapka',       cat: 'kadin', catLabel: 'Kadın / Aksesuar',  price: '₺549',   old: null,     visual: '👒', gradient: 'linear-gradient(150deg,#f5eeda,#e8dcba)', tag: 'Yaz',     desc: 'El örgüsü hasır, grogren kurdele detayı. Plajdan şehre yaz şıklığı.' },

    // ---- Erkek ----
    { id: 'e-gomlek', img: 'assets/img/e-gomlek.jpg', color: 'beyaz', priceNum: 799,        name: 'Beyaz Poplin Gömlek',    cat: 'erkek', catLabel: 'Erkek / Gömlek',    price: '₺799',   old: null,     visual: '👔', gradient: 'linear-gradient(150deg,#eef1f4,#d9dfe6)', tag: null,      desc: 'Ütü tutan poplin kumaş, slim kesim. Gardırobun en çok çalışan parçası.' },
    { id: 'e-tisort', img: 'assets/img/e-tisort.jpg', color: 'siyah', priceNum: 349,        name: 'Siyah Baskılı Tişört',  cat: 'erkek', catLabel: 'Erkek / Tişört',    price: '₺349',   old: '₺499',   visual: '👕', gradient: 'linear-gradient(150deg,#e4e4e8,#c9c9d1)', tag: 'İndirim', desc: '%100 pamuk, düşük omuzlu oversize kalıp. Basic ama asla sıradan değil.' },
    { id: 'e-jean', img: 'assets/img/e-jean.jpg', color: 'siyah', priceNum: 459,          name: 'Slim Fit Siyah Jean',    cat: 'erkek', catLabel: 'Erkek / Pantolon',  price: '₺459',   old: null,     visual: '👖', gradient: 'linear-gradient(150deg,#e3e6ec,#c6ccd8)', tag: null,      desc: 'Esnek dokuma, bilekte hafif daralan kesim. Sneaker ile de bot ile de çalışır.' },
    { id: 'e-sneaker', img: 'assets/img/e-sneaker.jpg', color: 'beyaz', priceNum: 899,       name: 'Beyaz Minimal Sneaker',  cat: 'erkek', catLabel: 'Erkek / Ayakkabı',  price: '₺899',   old: null,     visual: '👟', gradient: 'linear-gradient(150deg,#eceef0,#d7dbdf)', tag: 'Çok Satan', desc: 'Temiz hatlı deri gövde, yastıklamalı taban. Her kombinin sessiz kahramanı.' },
    { id: 'e-ceket', img: 'assets/img/e-ceket.jpg', color: 'gri', priceNum: 2499,         name: 'Yünlü Blazer Ceket',     cat: 'erkek', catLabel: 'Erkek / Dış Giyim', price: '₺2.499', old: null,     visual: '🧥', gradient: 'linear-gradient(150deg,#e7e4de,#cfc9be)', tag: 'Yeni',    desc: 'Yarı astarlı yün karışımı, doğal omuz. Tişört üstüne de gömlek üstüne de.' },
    { id: 'e-sapka', img: 'assets/img/e-sapka.jpg', color: 'gri', priceNum: 189,         name: 'Basic Beyzbol Şapkası',  cat: 'erkek', catLabel: 'Erkek / Aksesuar',  price: '₺189',   old: null,     visual: '🧢', gradient: 'linear-gradient(150deg,#e6e9ea,#ccd3d5)', tag: null,      desc: 'Yıkanmış pamuk, ayarlanabilir arka bant. Günlük görünümün tamamlayıcısı.' },
    { id: 'e-saat', img: 'assets/img/e-saat.jpg', color: 'gri', priceNum: 3299,          name: 'Minimalist Çelik Saat',  cat: 'erkek', catLabel: 'Erkek / Aksesuar',  price: '₺3.299', old: null,     visual: '⌚', gradient: 'linear-gradient(150deg,#e9e9ed,#d0d0d8)', tag: null,      desc: '38 mm kasa, yumuşak deri kordon. Az, öz ve her daim şık.' },
  ];

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
      mascot: { name: 'Stil', primaryColor: '#7c3aed' },
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
          category: vp.cat, color: vp.color || null, price: vp.priceNum || null,
        }]);
      }
    }

    var s = document.createElement('script');
    s.src = '../widget/widget.js';
    s.setAttribute('data-token', 'demo-atelier');
    // Backend çalışıyorsa event'ler oraya da gider; kapalıysa widget sessizce console'da kalır
    s.setAttribute('data-api', 'http://localhost:3001');
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
