# Triko — KVKK / Gizlilik Bildirimi

Bu belge, Triko maskot widget'ının son kullanıcı verisiyle ilişkisini tanımlar.
Müşteri (e-ticaret sitesi), entegrasyon sözleşmesinde bu işleyişi kabul eder.

## Widget'ın işlediği veriler

Widget yüklendiğinde yalnızca şu bilgiler işlenir:

| Veri | Saklama yeri | Süre | Kimlik ilişkisi |
|---|---|---|---|
| Anonim oturum ID'si | Tarayıcı (localStorage) | 24 saatte sıfırlanır | Yok — rastgele üretilir |
| Ziyaret edilen sayfa URL'leri | Backend (analitik event) | Müşteri hesabı süresince | Oturum ID üzerinden anonim |
| Görülen/tıklanan kombinler | Backend (analitik event) | Müşteri hesabı süresince | Oturum ID üzerinden anonim |
| Gezilen ürünlerin renk/kategori/fiyatı | Tarayıcı (localStorage) | 24 saatte sıfırlanır | Yok — cihazdan çıkmaz* |

\* AI öneri özelliği aktifse bu profil, öneri üretmek için oturum bazında
backend'e gönderilir; kalıcı olarak saklanmaz (10 dakikalık cache).

## İşlenmeyen veriler

- Kullanıcı adı, e-posta, telefon veya herhangi bir gerçek kimlik bilgisi
  **hiçbir şekilde** toplanmaz ve saklanmaz.
- Kullanıcı IP adresi analitik event'lerine **yazılmaz** (bkz.
  `backend/src/routes/widget.ts` — event şemasında IP alanı yoktur).
- Çerez kullanılmaz; oturum ID'si localStorage'dadır ve 24 saatte yenilenir.

## Teknik güvenceler

- Analitik event'leri token başına 100 istek/dk ile sınırlandırılır ve aynı
  oturumda aynı event 30 dk içinde tekilleştirilir.
- Widget yalnızca müşterinin kayıtlı domain'lerinden çalışır
  (`allowedDomains`, Origin/Referer doğrulaması).
- Panel erişimi JWT ile korunur (15 dk access + 7 gün refresh).

## Aydınlatma yükümlülüğü

Widget'ı sitesine ekleyen müşteri, kendi gizlilik politikasında anonim
oturum analitiği yapıldığını belirtmekle yükümlüdür. Triko, veri işleyen
sıfatıyla yalnızca yukarıdaki anonim verileri işler.
