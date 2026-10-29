# Spartan Clean Bot

Tek Discord sunucusu için General/F9 log, boss bildirimi ve müzik botu.

## Railway Variables

Zorunlu:

```env
TOKEN=Discord bot tokeni
CLIENT_ID=Discord Application ID
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Müzik için önerilen:

```env
YOUTUBE_COOKIES=Netscape cookies.txt dosyasının tamamı
```

Sunucu ve kanal kimlikleri `index.js` içinde tanımlıdır.

## Log ve sonuç komutları

- `/log tur kivrik not`: İlgili ses kanalındaki her gerçek kullanıcıya otomatik +1 set ekler. Kıvrık bağımsız kaydedilir.
- `/set-ekle tur uye miktar`, `/set-sil tur uye miktar`: Kullanıcının güncel setini manuel değiştirir.
- `/kivrik-ekle tur miktar`, `/kivrik-sil tur miktar`: General/F9 kıvrık toplamını manuel değiştirir.
- `/sonuc tur uye`: Üye seçilirse kullanıcı sonucu; boş bırakılırsa genel sıralama gösterilir.
- `/log-sil id`: Yanlış logu geri alır; katılımcı setleri ve log kıvrığı geri düşülür.
- `/çal`, `/geç`, `/durdur`, `/kuyruk`, `/şimdiçalıyor`: Müzik sistemi.

General ve F9 setleri, logları ve kıvrıkları birbirinden tamamen ayrıdır. Manuel değişikliklerden sonraki log en son güncel değer üzerinden devam eder.

Discord Developer Portal > Bot bölümünde **Server Members Intent** açık olmalıdır.
