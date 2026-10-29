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

## Komutlar

- `/log tur set not`: Yetkili rol tarafından General/F9 ses kanalındaki üyeleri kaydeder.
- `/durum üye`: Kullanıcının toplam General/F9 setini gösterir.
- `/çal`, `/geç`, `/durdur`, `/kuyruk`, `/şimdiçalıyor`: Müzik sistemi.

Discord Developer Portal > Bot bölümünde **Server Members Intent** açık olmalıdır.
