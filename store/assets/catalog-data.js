/**
 * ATELIER ürün kataloğu — tek veri kaynağı.
 * Tarayıcıda window.ATELIER_DATA olarak (products.js kullanır),
 * Node'da module.exports olarak (lite server sitemap.xml ve ürün
 * sayfalarına JSON-LD basarken kullanır) erişilir.
 */
(function (root) {
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

  if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
  else root.ATELIER_DATA = CATALOG;
})(typeof window !== 'undefined' ? window : this);
