# Codebase MCP (read-only)

[English](README.md) | **Bahasa Indonesia**

MCP server kecil agar **ClickUp Brain** (atau klien MCP lain) bisa membaca codebase yang ada di laptop Anda, baik Mac maupun Windows.

```
                 ┌─ Mac:     Cloudflare Tunnel (+ Cloudflare Access) ─┐
ClickUp Brain ───┤                                                    ├──> laptop Anda (127.0.0.1:8787/mcp) ──> folder repo
                 └─ Windows: Pinggy (lewat ssh bawaan) ───────────────┘
```

- **Mac** memakai [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/). Dengan named tunnel dan Cloudflare Access, request tanpa token yang benar sudah ditolak di Cloudflare sebelum sampai ke laptop Anda.
- **Windows** memakai [Pinggy](https://pinggy.io) lewat `ssh` bawaan Windows 10/11, untuk laptop yang tidak boleh install software.

## Tool yang tersedia

| Tool | Fungsi |
|---|---|
| `list_repos` | Daftar repo yang diizinkan |
| `project_tree` | Struktur folder (mengabaikan node_modules, .git, build, dll.) |
| `read_file` | Baca file dengan nomor baris, bisa per rentang baris |
| `search_code` | Cari teks/regex di seluruh repo, bisa difilter glob (`*.java`) |
| `find_files` | Cari file berdasarkan nama atau glob (`*Controller.java`) |
| `git_info` | Branch, status, dan commit terakhir (opsional per file) |

## Pengaman bawaan

- **Read-only**: tidak ada tool untuk menulis, menghapus, atau menjalankan perintah bebas (git hanya `log`/`status`/`rev-parse`).
- Hanya folder yang terdaftar di `REPOS` yang bisa dibaca. Upaya `../`, path absolut, dan symlink ke luar repo ditolak.
- **File env tidak pernah terekspos**, dalam bentuk apa pun: `.env`, `.env.local`, `.env.example`, `.env-prod`, `.envrc`, `prod.env`, `app.env.bak`, dan sejenisnya. File ini tidak muncul di daftar folder maupun hasil pencarian, dan permintaan membacanya ditolak. Trik Windows yang membuka file yang sama (`.env.`, `.env::$DATA`) juga diblokir. Aturannya ada di `security.js` dan diuji dengan `bun test`.
- File sensitif lain selalu diblokir: `*.pem`, `*.key`, `*.jks`, `id_rsa`, `.npmrc`, nama berisi `secret`/`credentials`, `application-prod.yml`, isi folder `.git`. Tambahkan pola lain lewat `EXTRA_BLOCKED`.
- Wajib API key (header `X-API-Key` atau `Authorization: Bearer`), dibandingkan secara timing-safe.
- Server hanya mendengarkan di `127.0.0.1`; satu-satunya jalan masuk adalah tunnel.
- Rate limit 120 request/menit per IP klien. Setiap panggilan tool dicatat di terminal.

> Kode Anda melewati penyedia tunnel (Cloudflare atau Pinggy) sebelum sampai ke ClickUp. Kalau ini laptop atau kode milik kantor, tanyakan dulu ke tim IT/security.

## Setup

### 1. Pasang prasyarat

Project ini memakai [Bun](https://bun.sh) untuk memasang dependensi dan menjalankan server.

**Mac**: Bun dan cloudflared
```bash
brew install oven-sh/bun/bun cloudflared
```

**Windows**: Bun dan ssh. Cek di PowerShell:
```powershell
bun --version
ssh -V
```
- Bun belum ada: pasang dengan `powershell -c "irm bun.sh/install.ps1 | iex"`. Kalau laptop Anda tidak mengizinkan install Bun, pakai Node.js 18+ sebagai gantinya (lihat [Tanpa Bun](#tanpa-bun)).
- ssh belum ada: aktifkan **OpenSSH Client** di *Settings → System → Optional features* (mungkin butuh hak admin).

### 2. Pasang dependensi dan buat API key

```bash
cd codebase-mcp
bun install
bun run gen-key      # salin hasilnya
```

### 3. Buat file `.env`

Salin `.env.example` menjadi `.env`, lalu isi:

```env
MCP_API_KEY=<hasil gen-key>
REPOS=core-api=/Users/namaanda/kerja/core-api;web=/Users/namaanda/kerja/web-app
```

Di Windows, tulis path dengan garis miring biasa: `REPOS=core-api=C:/Users/namaanda/kerja/core-api`.

### 4. Jalankan

Ada dua cara menjalankannya.

#### Opsi A: buka tunnel hanya saat dibutuhkan (disarankan)

Biarkan server berjalan secara lokal, dan buka tunnel hanya selama ClickUp perlu akses:

```bash
# Terminal 1: server (hanya bisa diakses dari laptop ini)
bun start

# Terminal 2: buka tunnel saat dibutuhkan
bun tunnel
```

- Tekan **Ctrl+C** di terminal 2 untuk menutup tunnel. Akses ClickUp langsung terputus, sementara server tetap berjalan secara lokal sampai terminal 1 dihentikan.
- `bun tunnel` memilih penyedia secara otomatis: Cloudflare di Mac, Pinggy di Windows. Untuk menggantinya, isi `TUNNEL=cloudflared` atau `TUNNEL=pinggy` di `.env`.
- Perintah ini menolak berjalan kalau server belum menyala.

#### Opsi B: semuanya sekaligus

- **Mac**: `chmod +x start-mac.sh && ./start-mac.sh`. Ctrl+C mematikan tunnel sekaligus server.
- **Windows**: klik dua kali `start-windows.bat` (atau jalankan `.\start-windows.bat` di PowerShell). Server berjalan di jendela terpisah bernama "Codebase MCP" yang menampilkan log. Tutup kedua jendela untuk berhenti.

#### Yang ditampilkan tunnel

- **Mac (Cloudflare)**: kalau `CF_TUNNEL_TOKEN` kosong, Anda mendapat **quick tunnel**: URL acak `https://xxxx.trycloudflare.com` yang berganti setiap restart. Cocok untuk tes, tapi tidak bisa dilindungi Cloudflare Access. Untuk pemakaian sungguhan, siapkan [named tunnel dengan Cloudflare Access](#setup-aman-di-mac-named-tunnel--cloudflare-access), lalu isi token-nya di `CF_TUNNEL_TOKEN`.
- **Windows (Pinggy)**: saat pertama kali, ssh mungkin meminta Anda memercayai host Pinggy. Ketik `yes`. Kalau diminta password, **cukup tekan Enter**. Pinggy lalu menampilkan URL seperti `https://abcd-12-34-56-78.run.pinggy-free.link`.
- **URL MCP Anda = URL tunnel + `/mcp`.**

Cek dari terminal lain. Perintah ini memanggil URL tunnel seperti yang akan dilakukan ClickUp: cek kesehatan, API key, daftar tool, dan key salah yang harus ditolak.
```bash
bun run check https://<url-tunnel-anda>
```
Untuk URL tetap, isi `PUBLIC_URL` di `.env`, lalu cukup jalankan `bun run check`.

### 5. Hubungkan ke ClickUp

Jalankan `bun run check` dulu. Kalau lolos, ClickUp akan berhasil dengan URL, key, dan header yang sama.

Buka ClickUp di **browser** (bukan aplikasi desktop) → **Settings → App Center → MCP Servers** → tambah server baru. Form *Connect an MCP Server* akan terbuka. Isi seperti ini:

| Kolom | Isi |
|---|---|
| **Name** | Nama yang mudah dikenali, mis. `Work Codebase MCP` |
| **URL** | URL tunnel + `/mcp`, mis. `https://work-codebase-mcp.domainanda.com/mcp`. Pakai `/mcp`, bukan `/sse`. |
| **Description** | `Read-only access to my local codebase: browse folders, read files, search code, and view git history.` |
| **Authentication Method** | `Authorization header` |
| **Authorization Header**, kotak kiri | `Authorization` (biarkan bawaannya) |
| **Authorization Header**, kotak kanan | `Bearer ` lalu nilai `MCP_API_KEY` dari `.env`, mis. `Bearer 3f9a…c21d`. Pertahankan spasi setelah `Bearer`, dan jangan ada spasi di akhir. |

**Custom Headers** tergantung jenis tunnel. Pakai **Add header** untuk tiap baris, dan hapus baris yang tidak dipakai dengan ikon tempat sampah:

| Tunnel | Header name | Header value |
|---|---|---|
| Cloudflare named tunnel + Access | `CF-Access-Client-Id` | nilai `CF_ACCESS_CLIENT_ID` di `.env` |
| | `CF-Access-Client-Secret` | nilai `CF_ACCESS_CLIENT_SECRET` di `.env` |
| Cloudflare quick tunnel | tidak ada | |
| Pinggy versi gratis | `X-Pinggy-No-Screen` | `1` (mencegah halaman screening browser Pinggy) |

Klik **Next**. ClickUp akan tersambung ke server dan menampilkan 6 tool. Lalu coba di ClickUp Brain: *"Pakai codebase MCP, tampilkan struktur repo core-api lalu jelaskan alur login."*

Kalau **Next** gagal:

| Yang muncul | Kemungkinan penyebab | Solusi |
|---|---|---|
| Tidak bisa terhubung, atau timeout | Server atau tunnel belum jalan | Jalankan `bun start` dan `bun tunnel`, lalu `bun run check` |
| `401 Unauthorized` | API key tidak cocok | Cek awalan `Bearer `, dan pastikan key sama dengan `MCP_API_KEY` tanpa spasi tambahan |
| `403`, atau halaman login Cloudflare | Header Access tidak ada atau salah | Cek kedua header `CF-Access-Client-*` beserta nilainya |
| `405` atau `404` | URL tidak diakhiri `/mcp` | Tambahkan `/mcp` di akhir URL |
| "Connected to the server, but couldn't validate the connection" | ClickUp sampai ke URL, tapi handshake MCP gagal | Restart `bun start` supaya kode server terbaru yang berjalan, klik **Next** lagi, lalu baca kode status di log server (lihat di bawah) |
| Pesan yang sama, dan **tidak ada** baris baru di log server | **Bot Fight Mode** Cloudflare menantang server ClickUp. Di *Security → Events* domain Anda akan terlihat *Managed Challenge* oleh *Bot fight mode*. | Matikan Bot Fight Mode untuk domain itu (*Security → Settings*). Di paket Free, fitur ini tidak bisa dikecualikan untuk satu hostname saja. Hostname MCP tetap dilindungi Access dan API key. |
| `bun run check` lolos, tapi ClickUp gagal | Salah ketik di form | Bandingkan lagi setiap kolom dengan isi `.env` |

Setiap request tercatat di terminal server beserta hasilnya, mis. `POST /mcp initialize → 200` atau `POST /mcp initialize → 401`. Kalau tidak ada yang muncul saat Anda klik **Next**, berarti request tidak sampai ke laptop: cek tunnel dan header Cloudflare Access.

## Setup aman di Mac: named tunnel + Cloudflare Access

Dengan setup ini Anda mendapat **URL tetap** (mis. `https://work-codebase-mcp.domainanda.com`) dan kunci kedua di depan laptop: Cloudflare menolak request yang tidak membawa service token Anda, sehingga request itu tidak pernah sampai ke server. Pengecekan API key tetap berlaku di atasnya.

Dibutuhkan akun Cloudflare gratis dan domain yang DNS-nya dikelola Cloudflare. **Bot Fight Mode di domain itu harus dimatikan** (*Security → Settings*): fitur ini menantang server ClickUp, yang tidak bisa menyelesaikan challenge browser, dan di paket Free tidak bisa dimatikan untuk satu hostname saja. Kalau situs lain di domain itu membutuhkannya, pakai domain terpisah untuk tunnel. Nama menu di dashboard Zero Trust kadang berubah; langkah di bawah menjelaskan apa yang perlu dicari.

1. **Buat tunnel**
   Di [dashboard Zero Trust](https://one.dash.cloudflare.com) → *Networks → Tunnels* → *Create a tunnel* → pilih **Cloudflared** → beri nama `work-codebase-mcp`. Di langkah instalasi, salin token panjang setelah `--token` (perintah install-nya tidak perlu dijalankan).
2. **Arahkan hostname ke server**
   Di tab *Public Hostname* (atau *Published application routes*) milik tunnel itu, tambahkan:
   - Subdomain `work-codebase-mcp`, domain `domainanda.com`
   - Service type **HTTP**, URL `127.0.0.1:8787`
3. **Buat service token**
   *Access → Service Auth → Service Tokens* → *Create Service Token*. Salin **Client ID** dan **Client Secret**. Secret hanya ditampilkan sekali.
4. **Lindungi hostname dengan Access**
   *Access → Applications* → *Add an application* → **Self-hosted** → domain `work-codebase-mcp.domainanda.com`. Tambahkan policy dengan action **Service Auth** yang menyertakan service token dari langkah 3.
5. **Isi nilainya di `.env`**
   ```env
   CF_TUNNEL_TOKEN=<token dari langkah 1>
   PUBLIC_URL=https://work-codebase-mcp.domainanda.com
   CF_ACCESS_CLIENT_ID=<client id dari langkah 3>
   CF_ACCESS_CLIENT_SECRET=<client secret dari langkah 3>
   ```
   Hanya `CF_TUNNEL_TOKEN` yang dipakai untuk menjalankan tunnel. Tiga lainnya untuk `bun run check`; server tidak pernah membacanya.
   Lalu jalankan `bun tunnel` (atau `./start-mac.sh`) seperti biasa.
6. **Tes**
   ```bash
   bun run check
   ```
   Kalau service token diisi, perintah ini juga memastikan Cloudflare memblokir request tanpa token.
7. **Di ClickUp**, pakai URL `https://work-codebase-mcp.domainanda.com/mcp`, header `Authorization: Bearer <API key>`, dan dua custom header `CF-Access-Client-Id` serta `CF-Access-Client-Secret` dengan nilai yang sama seperti di `.env`.

## URL gratis vs. tetap di Windows (Pinggy)

Tunnel Pinggy gratis mendapat **URL acak** dan **dibatasi waktu**. Saat tunnel tertutup, `bun tunnel` akan meminta Anda menekan Enter untuk menyambung ulang. URL barunya berbeda, jadi harus diperbarui di ClickUp.

Untuk URL tetap tanpa batas waktu, gunakan **Pinggy Pro** (berbayar): ambil access token di dashboard Pinggy, pasangkan persistent subdomain ke token itu, lalu isi di `.env` sebagai `PINGGY_TOKEN=<token Anda>`.

## Tanpa Bun

Di laptop yang tidak bisa install Bun (misalnya laptop kantor yang dikunci), pakai Node.js 18+ dan npm sebagai gantinya. Kodenya berjalan sama di keduanya:

```bash
npm install
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # pengganti: bun run gen-key
node server.js                                                             # pengganti: bun start
node tunnel.js                                                             # pengganti: bun tunnel
```

`start-windows.bat` otomatis beralih ke Node kalau Bun tidak ditemukan.

## Tips

- Laptop harus menyala, tidak tidur, dan tunnel aktif. Di Mac, `bun tunnel` menjaga laptop tetap menyala dengan `caffeinate` selama tunnel terbuka. Di Windows, atur Power Options agar tidak sleep saat dicolok.
- Jalankan `git pull` secara rutin agar AI membaca kode terbaru.
- Ganti API key (`bun run gen-key`) jika key pernah terbagikan, lalu perbarui di ClickUp. Lakukan hal yang sama untuk service token Cloudflare.
- Menutup tunnel (Ctrl+C di `bun tunnel`) langsung memutus akses ClickUp. Server saja hanya bisa diakses dari laptop Anda.
