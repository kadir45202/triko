/**
 * ATELIER ürün kataloğu — tek veri kaynağı.
 * Tarayıcıda window.ATELIER_DATA olarak (products.js kullanır),
 * Node'da module.exports olarak (lite server sitemap.xml ve ürün
 * sayfalarına JSON-LD basarken kullanır) erişilir.
 *
 * `type` alanı normalize kategoridir (backend ajanıyla aynı taksonomi:
 * ust-giyim | alt-giyim | elbise | dis-giyim | ayakkabi | canta | aksesuar).
 * Maskotun otomatik kombin motoru (products.js) tamamlayıcı parçaları bu
 * alandan seçer; katalog büyüdükçe kombinler kendiliğinden çoğalır.
 * Görsel yoksa emoji + gradient "fotoğraf" olarak kullanılır (demo estetiği).
 */
(function (root) {
  'use strict';

  var CATALOG = [
    // ==== KADIN ====
    // -- Elbise --
    { id: 'k-elbise-midi', type: 'elbise', img: 'assets/img/k-elbise-midi.jpg', color: 'kırmızı', priceNum: 1249, name: 'Saten Gece Elbisesi', cat: 'kadin', catLabel: 'Kadın / Elbise', price: '₺1.249', old: '₺1.699', visual: '👗', gradient: 'linear-gradient(150deg,#f6e7ee,#e9d0de)', tag: 'Yeni', desc: 'Akışkan saten kumaşıyla gün batımından gece davetine uzanan zarif bir silüet. Yanları hafif drapeli, midi boy.' },
    { id: 'k-cicek-elbise', type: 'elbise', img: null, color: 'yeşil', priceNum: 1349, name: 'Çiçek Desenli Midi Elbise', cat: 'kadin', catLabel: 'Kadın / Elbise', price: '₺1.349', old: null, visual: '👗', gradient: 'linear-gradient(150deg,#e6f0e4,#cfe2ca)', tag: 'Yeni', desc: 'Viskon karışımı hafif kumaş, kloş etek. Bahar-yaz gündüz davetlerinin favorisi.' },
    { id: 'k-abiye', type: 'elbise', img: null, color: 'siyah', priceNum: 2799, name: 'Uzun Saten Abiye', cat: 'kadin', catLabel: 'Kadın / Elbise', price: '₺2.799', old: '₺3.499', visual: '👗', gradient: 'linear-gradient(150deg,#e7e4ec,#cdc9da)', tag: 'İndirim', desc: 'Yırtmaç detaylı, sırt dekolteli uzun abiye. Özel gecelerin iddialı seçimi.' },

    // -- Üst Giyim --
    { id: 'k-bluz', type: 'ust-giyim', img: 'assets/img/k-bluz.jpg', color: 'beyaz', priceNum: 899, name: 'İşlemeli Beyaz Bluz', cat: 'kadin', catLabel: 'Kadın / Üst Giyim', price: '₺899', old: null, visual: '👚', gradient: 'linear-gradient(150deg,#eee9f4,#dcd2ea)', tag: null, desc: 'Dökümlü ipek karışımı, gizli düğme patlı. Ofisten yemeğe tek parçayla geçiş.' },
    { id: 'k-triko-kazak', type: 'ust-giyim', img: null, color: 'krem', priceNum: 949, name: 'Yumuşak Triko Kazak', cat: 'kadin', catLabel: 'Kadın / Üst Giyim', price: '₺949', old: null, visual: '🧶', gradient: 'linear-gradient(150deg,#f2ede4,#e2d9c8)', tag: null, desc: 'Tüy bırakmayan yumuşak örgü, bisiklet yaka. Sonbaharın en rahat katmanı.' },
    { id: 'k-oversize-gomlek', type: 'ust-giyim', img: null, color: 'beyaz', priceNum: 849, name: 'Oversize Poplin Gömlek', cat: 'kadin', catLabel: 'Kadın / Üst Giyim', price: '₺849', old: null, visual: '👔', gradient: 'linear-gradient(150deg,#eef1f4,#d9dfe6)', tag: null, desc: 'Salaş kesim, uzun boy. Tek başına elbise gibi ya da içine body ile.' },
    { id: 'k-crop', type: 'ust-giyim', img: null, color: 'pembe', priceNum: 549, name: 'Örme Crop Bluz', cat: 'kadin', catLabel: 'Kadın / Üst Giyim', price: '₺549', old: null, visual: '👚', gradient: 'linear-gradient(150deg,#f6e6ee,#ead0dd)', tag: null, desc: 'İnce örme, kısa boy. Yüksek bel pantolon ve eteklerle dengeli bir silüet.' },

    // -- Alt Giyim --
    { id: 'k-mom-jean', type: 'alt-giyim', img: null, color: 'mavi', priceNum: 1099, name: 'Yüksek Bel Mom Jean', cat: 'kadin', catLabel: 'Kadın / Alt Giyim', price: '₺1.099', old: null, visual: '👖', gradient: 'linear-gradient(150deg,#e3e6ec,#c6ccd8)', tag: 'Çok Satan', desc: 'Rahat mom kalıp, bilekte biten boy. Gardırobun en çok çalışan denimi.' },
    { id: 'k-midi-etek', type: 'alt-giyim', img: null, color: 'bej', priceNum: 1149, name: 'Pileli Saten Midi Etek', cat: 'kadin', catLabel: 'Kadın / Alt Giyim', price: '₺1.149', old: null, visual: '👗', gradient: 'linear-gradient(150deg,#f1e8d8,#e2d3b8)', tag: null, desc: 'Akışkan saten, ince pileli. Yürürken dökümlü bir hareket kazandırır.' },
    { id: 'k-kumas-pantolon', type: 'alt-giyim', img: null, color: 'lacivert', priceNum: 1049, name: 'Yüksek Bel Kumaş Pantolon', cat: 'kadin', catLabel: 'Kadın / Alt Giyim', price: '₺1.049', old: null, visual: '👖', gradient: 'linear-gradient(150deg,#e4e6ee,#c8ccdc)', tag: null, desc: 'Dökümlü kumaş, düz paça. Ofis şıklığının zahmetsiz temeli.' },

    // -- Dış Giyim --
    { id: 'k-trenckot', type: 'dis-giyim', img: 'assets/img/k-trenckot.jpg', color: 'bej', priceNum: 2899, name: 'Klasik Bej Trençkot', cat: 'kadin', catLabel: 'Kadın / Dış Giyim', price: '₺2.899', old: null, visual: '🧥', gradient: 'linear-gradient(150deg,#f1e8d8,#e2d3b8)', tag: null, desc: 'Zamansız çift düğmeli kesim, kuşaklı bel. Mevsim geçişlerinin kurtarıcısı.' },
    { id: 'k-blazer', type: 'dis-giyim', img: null, color: 'siyah', priceNum: 2199, name: 'Yapılandırılmış Blazer', cat: 'kadin', catLabel: 'Kadın / Dış Giyim', price: '₺2.199', old: null, visual: '🧥', gradient: 'linear-gradient(150deg,#e7e4de,#cfc9be)', tag: 'Yeni', desc: 'Omuzları belirgin, bel oturtan kesim. Pantolonla ofis, jeanle akşam.' },

    // -- Ayakkabı --
    { id: 'k-topuklu', type: 'ayakkabi', img: 'assets/img/k-topuklu.jpg', color: 'mavi', priceNum: 1799, name: 'Desenli Saten Stiletto', cat: 'kadin', catLabel: 'Kadın / Ayakkabı', price: '₺1.799', old: null, visual: '👠', gradient: 'linear-gradient(150deg,#f7ece4,#ecd9c8)', tag: null, desc: '9 cm ince topuk, sivri burun. Çiçek desenli saten yüzeyiyle kombinin yıldızı.' },
    { id: 'k-sneaker', type: 'ayakkabi', img: null, color: 'beyaz', priceNum: 1199, name: 'Beyaz Deri Sneaker', cat: 'kadin', catLabel: 'Kadın / Ayakkabı', price: '₺1.199', old: null, visual: '👟', gradient: 'linear-gradient(150deg,#eceef0,#d7dbdf)', tag: null, desc: 'Sade deri gövde, kalın taban. Elbisenin altında bile rahat ve şık.' },
    { id: 'k-bot', type: 'ayakkabi', img: null, color: 'siyah', priceNum: 1899, name: 'Deri Bilek Bot', cat: 'kadin', catLabel: 'Kadın / Ayakkabı', price: '₺1.899', old: null, visual: '👢', gradient: 'linear-gradient(150deg,#e6e4e2,#ccc8c4)', tag: null, desc: 'Yan fermuarlı, blok topuk. Sonbahar-kış kombinlerinin sağlam temeli.' },

    // -- Çanta --
    { id: 'k-canta', type: 'canta', img: 'assets/img/k-canta.jpg', color: 'mercan', priceNum: 1549, name: 'Deri El Çantası', cat: 'kadin', catLabel: 'Kadın / Çanta', price: '₺1.549', old: '₺1.999', visual: '👜', gradient: 'linear-gradient(150deg,#efe3d9,#dfc9b4)', tag: 'İndirim', desc: 'Yumuşak dokulu gerçek deri, altın detaylı zincir askı. Gün içinden akşama.' },
    { id: 'k-sirt-canta', type: 'canta', img: null, color: 'siyah', priceNum: 1299, name: 'Mini Deri Sırt Çantası', cat: 'kadin', catLabel: 'Kadın / Çanta', price: '₺1.299', old: null, visual: '🎒', gradient: 'linear-gradient(150deg,#e6e4e2,#ccc8c4)', tag: null, desc: 'Kompakt boy, ayarlanabilir askı. Şehir içi gün boyu pratik ve şık.' },

    // -- Aksesuar --
    { id: 'k-gunes-gozlugu', type: 'aksesuar', img: 'assets/img/k-gunes-gozlugu.jpg', color: 'siyah', priceNum: 749, name: 'Oversize Güneş Gözlüğü', cat: 'kadin', catLabel: 'Kadın / Aksesuar', price: '₺749', old: null, visual: '🕶️', gradient: 'linear-gradient(150deg,#e8e8ec,#d2d2da)', tag: null, desc: 'Retro oversize çerçeve, UV400 koruma. Görünümün son dokunuşu.' },
    { id: 'k-hasir-sapka', type: 'aksesuar', img: 'assets/img/k-hasir-sapka.jpg', color: 'bej', priceNum: 549, name: 'Hasır Fötr Şapka', cat: 'kadin', catLabel: 'Kadın / Aksesuar', price: '₺549', old: null, visual: '👒', gradient: 'linear-gradient(150deg,#f5eeda,#e8dcba)', tag: 'Yaz', desc: 'El örgüsü hasır, grogren kurdele detayı. Plajdan şehre yaz şıklığı.' },
    { id: 'k-kemer', type: 'aksesuar', img: null, color: 'kahverengi', priceNum: 449, name: 'Tokalı Deri Kemer', cat: 'kadin', catLabel: 'Kadın / Aksesuar', price: '₺449', old: null, visual: '🎀', gradient: 'linear-gradient(150deg,#ece1d6,#d8c4b0)', tag: null, desc: 'İnce deri, altın toka. Elbise ve oversize gömleğe bel vurgusu.' },
    { id: 'k-kolye', type: 'aksesuar', img: null, color: 'sarı', priceNum: 699, name: 'Altın Kaplama Kolye', cat: 'kadin', catLabel: 'Kadın / Aksesuar', price: '₺699', old: null, visual: '📿', gradient: 'linear-gradient(150deg,#f4eed8,#e6d9b2)', tag: null, desc: 'Katmanlı zincir, minimal madalyon. Sade üstleri anında toplar.' },

    // ==== ERKEK ====
    // -- Üst Giyim --
    { id: 'e-gomlek', type: 'ust-giyim', img: 'assets/img/e-gomlek.jpg', color: 'beyaz', priceNum: 799, name: 'Beyaz Poplin Gömlek', cat: 'erkek', catLabel: 'Erkek / Gömlek', price: '₺799', old: null, visual: '👔', gradient: 'linear-gradient(150deg,#eef1f4,#d9dfe6)', tag: null, desc: 'Ütü tutan poplin kumaş, slim kesim. Gardırobun en çok çalışan parçası.' },
    { id: 'e-tisort', type: 'ust-giyim', img: 'assets/img/e-tisort.jpg', color: 'siyah', priceNum: 349, name: 'Siyah Baskılı Tişört', cat: 'erkek', catLabel: 'Erkek / Tişört', price: '₺349', old: '₺499', visual: '👕', gradient: 'linear-gradient(150deg,#e4e4e8,#c9c9d1)', tag: 'İndirim', desc: '%100 pamuk, düşük omuzlu oversize kalıp. Basic ama asla sıradan değil.' },
    { id: 'e-polo', type: 'ust-giyim', img: null, color: 'lacivert', priceNum: 649, name: 'Pike Polo Tişört', cat: 'erkek', catLabel: 'Erkek / Üst Giyim', price: '₺649', old: null, visual: '👕', gradient: 'linear-gradient(150deg,#e4e6ee,#c8ccdc)', tag: null, desc: 'Nefes alan pike örgü, düğmeli yaka. Smart-casual günlerin dengesi.' },
    { id: 'e-kazak', type: 'ust-giyim', img: null, color: 'lacivert', priceNum: 1099, name: 'Yün Karışımlı Kazak', cat: 'erkek', catLabel: 'Erkek / Üst Giyim', price: '₺1.099', old: null, visual: '🧶', gradient: 'linear-gradient(150deg,#e4e6ee,#c8ccdc)', tag: null, desc: 'Bisiklet yaka, orta kalınlık. Gömlek üstüne katman ya da tek başına.' },
    { id: 'e-sweatshirt', type: 'ust-giyim', img: null, color: 'gri', priceNum: 799, name: 'Kapüşonlu Sweatshirt', cat: 'erkek', catLabel: 'Erkek / Üst Giyim', price: '₺799', old: null, visual: '🧥', gradient: 'linear-gradient(150deg,#e6e9ea,#ccd3d5)', tag: null, desc: 'Şardonlu iç yüzey, rahat kalıp. Hafta sonunun rahat üniforması.' },

    // -- Alt Giyim --
    { id: 'e-jean', type: 'alt-giyim', img: 'assets/img/e-jean.jpg', color: 'siyah', priceNum: 459, name: 'Slim Fit Siyah Jean', cat: 'erkek', catLabel: 'Erkek / Pantolon', price: '₺459', old: null, visual: '👖', gradient: 'linear-gradient(150deg,#e3e6ec,#c6ccd8)', tag: null, desc: 'Esnek dokuma, bilekte hafif daralan kesim. Sneaker ile de bot ile de çalışır.' },
    { id: 'e-mavi-jean', type: 'alt-giyim', img: null, color: 'mavi', priceNum: 749, name: 'Regular Fit Mavi Jean', cat: 'erkek', catLabel: 'Erkek / Pantolon', price: '₺749', old: null, visual: '👖', gradient: 'linear-gradient(150deg,#e3e6ec,#c6ccd8)', tag: 'Çok Satan', desc: 'Klasik beş cep, düz paça. Her tişört ve gömlekle uyumlu temel denim.' },
    { id: 'e-chino', type: 'alt-giyim', img: null, color: 'bej', priceNum: 899, name: 'Slim Chino Pantolon', cat: 'erkek', catLabel: 'Erkek / Pantolon', price: '₺899', old: null, visual: '👖', gradient: 'linear-gradient(150deg,#f1e8d8,#e2d3b8)', tag: null, desc: 'Yumuşak twill kumaş, temiz kesim. Ofisten buluşmaya nötr bir zemin.' },
    { id: 'e-keten-sort', type: 'alt-giyim', img: null, color: 'haki', priceNum: 549, name: 'Keten Bermuda Şort', cat: 'erkek', catLabel: 'Erkek / Şort', price: '₺549', old: null, visual: '🩳', gradient: 'linear-gradient(150deg,#e8e9df,#d0d3bf)', tag: 'Yaz', desc: 'Hafif keten karışımı, diz üstü boy. Sıcak günlerin rahat çözümü.' },

    // -- Dış Giyim --
    { id: 'e-ceket', type: 'dis-giyim', img: 'assets/img/e-ceket.jpg', color: 'gri', priceNum: 2499, name: 'Yünlü Blazer Ceket', cat: 'erkek', catLabel: 'Erkek / Dış Giyim', price: '₺2.499', old: null, visual: '🧥', gradient: 'linear-gradient(150deg,#e7e4de,#cfc9be)', tag: 'Yeni', desc: 'Yarı astarlı yün karışımı, doğal omuz. Tişört üstüne de gömlek üstüne de.' },
    { id: 'e-mont', type: 'dis-giyim', img: null, color: 'siyah', priceNum: 2699, name: 'Kapüşonlu Şişme Mont', cat: 'erkek', catLabel: 'Erkek / Dış Giyim', price: '₺2.699', old: null, visual: '🧥', gradient: 'linear-gradient(150deg,#e5e5e9,#cbcbd3)', tag: null, desc: 'Su itici dış yüzey, hafif dolgu. Kışın sıcak tutan pratik seçim.' },
    { id: 'e-trenckot', type: 'dis-giyim', img: null, color: 'bej', priceNum: 2899, name: 'Bej Klasik Trençkot', cat: 'erkek', catLabel: 'Erkek / Dış Giyim', price: '₺2.899', old: null, visual: '🧥', gradient: 'linear-gradient(150deg,#f1e8d8,#e2d3b8)', tag: null, desc: 'Kuşaklı bel, çift sıra düğme. Yağmurlu günlerin şık zırhı.' },

    // -- Ayakkabı --
    { id: 'e-sneaker', type: 'ayakkabi', img: 'assets/img/e-sneaker.jpg', color: 'beyaz', priceNum: 899, name: 'Beyaz Minimal Sneaker', cat: 'erkek', catLabel: 'Erkek / Ayakkabı', price: '₺899', old: null, visual: '👟', gradient: 'linear-gradient(150deg,#eceef0,#d7dbdf)', tag: 'Çok Satan', desc: 'Temiz hatlı deri gövde, yastıklamalı taban. Her kombinin sessiz kahramanı.' },
    { id: 'e-suet-bot', type: 'ayakkabi', img: null, color: 'kahverengi', priceNum: 1699, name: 'Süet Bilek Bot', cat: 'erkek', catLabel: 'Erkek / Ayakkabı', price: '₺1.699', old: null, visual: '👢', gradient: 'linear-gradient(150deg,#ece1d6,#d8c4b0)', tag: null, desc: 'Yumuşak süet, kauçuk taban. Jean ve chino ile sonbahar dostu.' },
    { id: 'e-loafer', type: 'ayakkabi', img: null, color: 'kahverengi', priceNum: 1499, name: 'Deri Loafer', cat: 'erkek', catLabel: 'Erkek / Ayakkabı', price: '₺1.499', old: null, visual: '👞', gradient: 'linear-gradient(150deg,#ece1d6,#d8c4b0)', tag: null, desc: 'El dikişi detay, bloklu taban. Chino ve kumaş pantolonun zarif kapanışı.' },

    // -- Çanta --
    { id: 'e-canta', type: 'canta', img: null, color: 'siyah', priceNum: 1799, name: 'Deri Postacı Çanta', cat: 'erkek', catLabel: 'Erkek / Çanta', price: '₺1.799', old: null, visual: '💼', gradient: 'linear-gradient(150deg,#e6e4e2,#ccc8c4)', tag: null, desc: 'Laptop bölmeli, çapraz askı. İş gününü toparlayan sağlam yoldaş.' },

    // -- Aksesuar --
    { id: 'e-sapka', type: 'aksesuar', img: 'assets/img/e-sapka.jpg', color: 'gri', priceNum: 189, name: 'Basic Beyzbol Şapkası', cat: 'erkek', catLabel: 'Erkek / Aksesuar', price: '₺189', old: null, visual: '🧢', gradient: 'linear-gradient(150deg,#e6e9ea,#ccd3d5)', tag: null, desc: 'Yıkanmış pamuk, ayarlanabilir arka bant. Günlük görünümün tamamlayıcısı.' },
    { id: 'e-saat', type: 'aksesuar', img: 'assets/img/e-saat.jpg', color: 'gri', priceNum: 3299, name: 'Minimalist Çelik Saat', cat: 'erkek', catLabel: 'Erkek / Aksesuar', price: '₺3.299', old: null, visual: '⌚', gradient: 'linear-gradient(150deg,#e9e9ed,#d0d0d8)', tag: null, desc: '38 mm kasa, yumuşak deri kordon. Az, öz ve her daim şık.' },
    { id: 'e-kemer', type: 'aksesuar', img: null, color: 'siyah', priceNum: 499, name: 'Klasik Deri Kemer', cat: 'erkek', catLabel: 'Erkek / Aksesuar', price: '₺499', old: null, visual: '🎀', gradient: 'linear-gradient(150deg,#e6e4e2,#ccc8c4)', tag: null, desc: 'Mat toka, düz deri. Pantolon ve chino ile bitmiş bir görünüm.' },
    { id: 'e-gozluk', type: 'aksesuar', img: null, color: 'siyah', priceNum: 699, name: 'Asetat Güneş Gözlüğü', cat: 'erkek', catLabel: 'Erkek / Aksesuar', price: '₺699', old: null, visual: '🕶️', gradient: 'linear-gradient(150deg,#e8e8ec,#d2d2da)', tag: null, desc: 'Kalın asetat çerçeve, UV korumalı cam. Günlük stile karakter katar.' },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
  else root.ATELIER_DATA = CATALOG;
})(typeof window !== 'undefined' ? window : this);
