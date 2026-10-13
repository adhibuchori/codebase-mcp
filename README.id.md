# codebase-mcp

[English](README.md) | **Bahasa Indonesia**

Server [MCP](https://modelcontextprotocol.io) read-only yang memungkinkan **ClickUp Brain** (atau
Claude Code, Cursor, maupun klien MCP lain) mencari, membaca, dan men-debug kode dari **banyak
repository** di laptop Anda. Jawabannya ringkas dan berperingkat, dan setiap hasil berupa
`repo/path:line` yang bisa langsung dibuka berikutnya. Jalan di Mac maupun di laptop kantor Windows
yang terkunci.

```
                 ┌─ Mac:     Cloudflare Tunnel (+ Cloudflare Access) ─┐
ClickUp Brain ───┤                                                    ├──> laptop Anda 127.0.0.1:8787/mcp
                 └─ Windows: Pinggy (lewat ssh bawaan) ───────────────┘          │
                                                                                 ▼
                         index (.cache/index) ◀── indexer di background ──  semua repo di bawah ~/work
```

- **Dibuat untuk debugging microservices.** Tempel stack trace, baris log, atau URL yang gagal,
  lalu dapatkan kode di baliknya. Telusuri route HTTP, method gRPC, atau topic Kafka sampai ke
  handler dan pemanggilnya di service lain.
- **Cepat di ratusan repo.** Index trigram per repo mempersempit setiap pencarian ke file yang
  mungkin cocok, lalu ripgrep hanya membaca file itu. Hasil ukur: pencarian di 200 repo (1,8 GB)
  selesai di bawah 0,4 detik.
- **Jawaban kecil.** Setiap jawaban punya budget token (default 6.000) dan menurunkan tingkat
  detailnya alih-alih terpotong. Jawaban umumnya 100–1.500 token, sedangkan v1 bisa mengirim
  sampai 39.500 token untuk satu file.
- **Presisi.** Ranking menaruh definisi di atas, serta file test, generated, dan vendored di
  bawah. Definisi simbol berasal dari grammar tree-sitter untuk 15 bahasa.
- **Read-only sejak desainnya.** Tidak ada tool yang menulis, menghapus, atau menjalankan apa pun
  pilihan pemanggil. File `.env` dan rahasia tidak pernah ditampilkan, dicari, dibaca, maupun
  muncul di diff.

## Isi

- [Tools](#tools)
- [Seberapa cepat dan seberapa kecil](#seberapa-cepat-dan-seberapa-kecil)
- [Mulai cepat](#mulai-cepat)
- [Konfigurasi](#konfigurasi)
- [Hubungkan ke ClickUp](#hubungkan-ke-clickup)
- [Setup aman di Mac: named tunnel + Cloudflare Access](#setup-aman-di-mac-named-tunnel--cloudflare-access)
- [Windows: Pinggy, dan menjalankan tanpa Bun](#windows-pinggy-dan-menjalankan-tanpa-bun)
- [Pakai dari Claude Code atau Cursor (stdio)](#pakai-dari-claude-code-atau-cursor-stdio)
- [Bahasa dan framework yang didukung](#bahasa-dan-framework-yang-didukung)
- [Model keamanan](#model-keamanan)
- [Perintah](#perintah)
- [Troubleshooting](#troubleshooting)
- [Pengembangan](#pengembangan)
- [Versioning](#versioning)

## Tools

Ada sembilan tool, semuanya read-only. Jawaban berupa teks biasa. Setiap lokasi ditulis sebagai
`repo/path:line`, dan `read_code` menerima bentuk yang sama, jadi hasilnya bisa langsung dibuka.

| Tool            | Gunakan untuk                                                                                                                                                        | Contoh input                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `list_repos`    | Melihat semua service: bahasa, framework, endpoint, topic, commit terakhir, status index. Filter berdasarkan nama, grup, atau bahasa.                                | `{"query": "order"}`                                                    |
| `repo_overview` | Memetakan satu repo: file build, entrypoint, endpoint, topic, dan folder beserta jumlah filenya.                                                                     | `{"repo": "orders", "path": "src/main"}`                                |
| `search_code`   | Mencari teks di semua repo sekaligus, berperingkat dan dikelompokkan per file, lengkap dengan fungsi yang melingkupinya. Mode: `literal` (default), `word`, `regex`. | `{"query": "Order already cancelled"}`                                  |
| `find_files`    | Mencari file berdasarkan nama atau path secara fuzzy ("ordctl" menemukan `OrderController.java`).                                                                    | `{"query": "order controller"}`                                         |
| `read_code`     | Membaca satu fungsi (`#Class.method`), satu baris (`:120`), rentang (`:120-180`), file kecil, atau outline file besar.                                               | `{"ref": "orders/src/…/OrderService.java#cancel"}`                      |
| `find_symbol`   | Lompat ke definisi berdasarkan nama (exact, lalu prefix, lalu substring), atau daftar semua referensinya.                                                            | `{"name": "OrderService"}`                                              |
| `triage_error`  | Tempel stack trace, baris log, pesan error, atau URL; dapatkan kode di baliknya.                                                                                     | `{"text": "java.lang.IllegalStateException: …"}`                        |
| `find_endpoint` | Menelusuri request: route HTTP ke handler dan pemanggilnya, method gRPC ke proto dan implementasinya, topic ke producer dan consumer.                                | `{"query": "POST /api/orders/42/cancel"}`                               |
| `git_history`   | Commit terbaru, kapan sebuah string muncul (pickaxe), blame, dan diff satu commit.                                                                                   | `{"repo": "orders", "action": "pickaxe", "query": "already cancelled"}` |

Sesi debugging di ClickUp Brain biasanya seperti ini:

```text
Anda:    Pelanggan mendapat "refund failed for payment p-77: refund payment p-77: payment already refunded". Kenapa?
Brain →  triage_error {"text": "refund failed for payment p-77: refund payment p-77: payment already refunded"}
         #1 payments-go/internal/payment/handler.go:26 · in Refund   (pemanggilan log)
         #2 payments-go/internal/payment/service.go:9               (tempat error didefinisikan)
         #3 payments-go/internal/payment/service.go:21 · in Refund  (tempat error dibungkus)
Brain →  find_endpoint {"query": "POST /api/payments/77/refund"}
         Served by:  payments-go/main.go:16  POST /api/payments/:id/refund  (gin, handler)
         Called by:  orders-java/…/PaymentClient.java:9  POST /api/payments/{id}/refund  (feign, caller)
Brain →  git_history {"repo": "payments-go", "action": "pickaxe", "query": "payment already refunded"}
```

Apa yang dikembalikan setiap tool, beserta semua argumennya: [docs/tools.md](docs/tools.md).

## Seberapa cepat dan seberapa kecil

Diukur di MacBook (Apple silicon) dengan Bun 1.3.12. Tabel lengkap dan cara mengulanginya ada di
[docs/benchmarks.md](docs/benchmarks.md).

| Korpus                      | Source | Index  | Build index | `search_code` p95 | `find_symbol` p95 | Token per jawaban |
| --------------------------- | ------ | ------ | ----------- | ----------------- | ----------------- | ----------------- |
| 4 repo microservices publik | 36 MB  | 8 MB   | 1,1 s       | 34 ms             | 1 ms              | 80–1.500          |
| Sama, ×50 (200 repo)        | 1,8 GB | 379 MB | 33 s        | 372 ms            | 56 ms             | 300–2.400         |

Eval menjalankan 20 tugas debugging lewat tool sungguhan. 100% menemukan lokasi yang benar dalam
peringkat yang diharapkan, 85% di peringkat 1, dengan rata-rata 131 token per jawaban. Sebagai
pembanding, v1 butuh 4,4 detik per pencarian di 27.000 file, dan satu `read_file` memakan sekitar
39.500 token.

## Mulai cepat

### 1. Prasyarat

|         | Mac                                                           | Windows                                                                                                      |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Runtime | [Bun](https://bun.sh) 1.3.12+: `brew install oven-sh/bun/bun` | Bun (`powershell -c "irm bun.sh/install.ps1 \| iex"`), atau **Node.js 22.18+** jika Bun tidak boleh diinstal |
| Tunnel  | `brew install cloudflared`                                    | `ssh` bawaan Windows 10/11 (_Settings → System → Optional features → OpenSSH Client_)                        |
| git     | Ikut dengan Xcode tools                                       | Git for Windows                                                                                              |

ripgrep, SQLite, dan grammar tree-sitter ikut terpasang lewat `bun install`. Tidak ada yang perlu
di-compile.

### 2. Instal dan setup

```bash
cd codebase-mcp
bun install
bun run setup            # menanyakan folder yang berisi repo Anda, misalnya ~/work
```

`setup` mencari semua repository git di bawah folder itu dan menulis `codebase.config.json`. Ia
juga membuat `.env` dengan `MCP_API_KEY` yang kuat. Key-nya tidak pernah dicetak: buka `.env` saat
Anda perlu menempelkannya ke ClickUp. Untuk menjalankan setup tanpa pertanyaan:

```bash
bun run setup --root ~/work --root D:/code --yes
```

### 3. Jalankan

```bash
# Terminal 1: server, hanya bisa diakses dari laptop ini. Indexing berjalan di background.
bun start

# Terminal 2: buka tunnel hanya saat ClickUp butuh akses. Ctrl+C untuk menutupnya.
bun tunnel
```

- Server sudah bisa menjawab sejak detik pertama. Selama index sebuah repo belum siap, pencarian
  di repo itu membaca file secara langsung. Hasilnya lebih lambat, tetapi tetap lengkap.
- `bun tunnel` memilih Cloudflare di Mac dan Pinggy di Windows. Atur `TUNNEL=cloudflared` atau
  `TUNNEL=pinggy` di `.env` untuk memilih sendiri. Perintah ini menolak jalan selama server mati.
- **URL MCP Anda adalah URL tunnel ditambah `/mcp`.**

Lalu cek semuanya:

```bash
bun run doctor                          # runtime, key, config, repo, ripgrep, git, SQLite, grammar, server, tunnel
bun run check https://<url-tunnel-anda> # memanggil URL publik seperti yang akan dilakukan ClickUp
```

Atau jalankan keduanya sekaligus: `./start-mac.sh` di Mac, atau `start-windows.bat` di Windows.
Keduanya menjalankan setup lebih dulu kalau konfigurasi belum ada.

## Konfigurasi

Ada dua file, keduanya lokal di mesin dan masuk gitignore:

- **`codebase.config.json`**: repo mana yang dilayani, plus batas-batasnya. `bun run setup` yang
  menulisnya. [`codebase.config.example.json`](codebase.config.example.json) menunjukkan semua
  field, dan `codebase.config.schema.json` memberi autocomplete di editor Anda.
- **`.env`**: hanya rahasia dan pengaturan mesin. Lihat [`.env.example`](.env.example).

```jsonc
{
  "$schema": "./codebase.config.schema.json",
  // Semua repo git sampai 3 level di bawah ~/work. Folder pertama di bawahnya menjadi grup.
  "roots": [{ "path": "~/work", "maxDepth": 3, "exclude": ["archive/**"] }],
  // Repo tunggal di lokasi lain.
  "repos": [{ "name": "legacy-billing", "path": "D:/code/legacy-billing", "group": "payments" }],
  "exclude": ["**/*.min.js"], // tidak pernah dicari atau di-index (di atas .gitignore)
  "blocked": ["\\.sql$"], // nama file tambahan yang tidak boleh dibaca
  "logging": { "loggerNames": ["AuditLog"] }, // logger internal, agar triage_error mengenali pemanggilan log
  "limits": {
    "maxResponseTokens": 6000,
    "maxFileBytes": 1048576,
    "searchTimeoutMs": 20000,
    "maxReadLines": 200,
  },
  "index": { "enabled": true, "dir": ".cache/index", "refreshSeconds": 30, "rescanMinutes": 10 },
}
```

| Variabel `.env`                                                | Default                  | Arti                                                                                          |
| -------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `MCP_API_KEY`                                                  | tidak ada                | Wajib, minimal 24 karakter. `bun run setup` membuatnya; `bun run gen-key` mencetak yang baru. |
| `PORT`, `HOST`                                                 | `8787`, `127.0.0.1`      | Tempat server mendengarkan. Tunnel adalah satu-satunya jalan masuk.                           |
| `CODEBASE_CONFIG`                                              | `./codebase.config.json` | File config lain.                                                                             |
| `REPOS`                                                        | tidak ada                | Format v1 `nama=path;nama=path`, hanya dipakai kalau file config tidak ada.                   |
| `EXTRA_BLOCKED`                                                | tidak ada                | Regex tambahan untuk nama file yang tidak boleh dibaca, dipisah koma.                         |
| `RG_PATH`, `CODEBASE_NO_RIPGREP`                               | ripgrep bawaan           | Binary ripgrep lain, atau `1` untuk memaksa scanner JavaScript.                               |
| `LOG_LEVEL`                                                    | `info`                   | `debug`, `info`, `warn`, atau `error`.                                                        |
| `TUNNEL`, `CF_TUNNEL_TOKEN`, `PINGGY_TOKEN`                    | sesuai platform          | Pengaturan tunnel untuk `bun tunnel`.                                                         |
| `PUBLIC_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | tidak ada                | Hanya dipakai oleh `bun run check`.                                                           |

**Index** disimpan di `.cache/index/`, satu file SQLite per repo, ukurannya sekitar seperlima dari
source. Folder ini boleh dihapus kapan saja dan akan dibangun ulang. Setiap 30 detik server
memeriksa `HEAD` dan git index setiap repo dengan beberapa panggilan `stat`, lalu hanya meng-index
ulang file yang berubah. Rescan penuh untuk perubahan yang belum terlihat oleh git berjalan setiap
10 menit. Hasil pencarian selalu dibaca dari file di disk, jadi index yang basi paling buruk hanya
membuat hasil terlewat, tidak pernah menampilkan baris yang salah.

## Hubungkan ke ClickUp

Jalankan `bun run check` lebih dulu. Kalau lolos, ClickUp akan jalan dengan URL, key, dan header
yang sama.

Buka ClickUp di **browser** (bukan aplikasi desktop) → **Settings → App Center → MCP Servers** →
tambahkan server baru. Form _Connect an MCP Server_ akan terbuka. Isi seperti ini:

| Field                                 | Isi dengan                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                              | Nama yang mudah Anda kenali, misalnya `Work Codebase MCP`                                                                                                  |
| **URL**                               | URL tunnel + `/mcp`, misalnya `https://work-codebase-mcp.yourdomain.com/mcp`. Gunakan `/mcp`, bukan `/sse`.                                                |
| **Description**                       | `Read-only access to my local repositories: search code, read functions, triage stack traces and logs, follow endpoints across services, and git history.` |
| **Authentication Method**             | `Authorization header`                                                                                                                                     |
| **Authorization Header**, kotak kiri  | `Authorization` (biarkan default)                                                                                                                          |
| **Authorization Header**, kotak kanan | `Bearer ` diikuti nilai `MCP_API_KEY` di `.env`, misalnya `Bearer 3f9a…c21d`. Pertahankan spasi setelah `Bearer` dan jangan tambahkan spasi di akhir.      |

**Custom Headers** tergantung tunnel-nya. Gunakan **Add header** untuk setiap baris, dan hapus
baris yang tidak perlu dengan ikon tempat sampah:

| Tunnel                           | Nama header               | Nilai header                                         |
| -------------------------------- | ------------------------- | ---------------------------------------------------- |
| Cloudflare named tunnel + Access | `CF-Access-Client-Id`     | nilai `CF_ACCESS_CLIENT_ID` di `.env`                |
|                                  | `CF-Access-Client-Secret` | nilai `CF_ACCESS_CLIENT_SECRET` di `.env`            |
| Cloudflare quick tunnel          | tidak ada                 |                                                      |
| Pinggy free tunnel               | `X-Pinggy-No-Screen`      | `1` (mencegah halaman screening browser dari Pinggy) |

Klik **Next**. ClickUp akan terhubung dan menampilkan 9 tool. Lalu coba di ClickUp Brain: _"Pakai
codebase MCP. Ini stack trace dari production: … Kode mana yang melemparnya, dan apa yang berubah
di sana belakangan ini?"_

Kalau **Next** gagal:

| Yang terlihat                                                   | Kemungkinan penyebab                                                                                                                           | Perbaikan                                                                                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tidak bisa terhubung, atau timeout                              | Server atau tunnel tidak jalan                                                                                                                 | Jalankan `bun start` dan `bun tunnel`, lalu `bun run check`                                                                                                                            |
| `401 Unauthorized`                                              | API key tidak cocok                                                                                                                            | Cek awalan `Bearer `, dan pastikan key sama dengan `MCP_API_KEY` tanpa spasi tambahan                                                                                                  |
| `403`, atau halaman login Cloudflare                            | Header Access hilang atau salah                                                                                                                | Cek kedua header `CF-Access-Client-*` dan nilainya                                                                                                                                     |
| `405` atau `404`                                                | URL tidak diakhiri `/mcp`                                                                                                                      | Tambahkan `/mcp` di akhir URL                                                                                                                                                          |
| "Connected to the server, but couldn't validate the connection" | ClickUp mencapai URL tetapi handshake MCP gagal                                                                                                | Restart `bun start`, klik **Next** lagi, dan baca status code di log server (lihat di bawah)                                                                                           |
| Pesan yang sama, dan **tidak ada apa pun** di log server        | **Bot Fight Mode** Cloudflare menantang server ClickUp. Di _Security → Events_ domain Anda terlihat _Managed Challenge_ oleh _Bot fight mode_. | Matikan Bot Fight Mode untuk domain tersebut (_Security → Settings_). Di paket Free, fitur ini tidak bisa dikecualikan per hostname. Access dan API key tetap melindungi hostname MCP. |
| `bun run check` lolos, tetapi ClickUp gagal                     | Salah ketik di form                                                                                                                            | Bandingkan lagi setiap field dengan `.env`                                                                                                                                             |

Setiap request muncul di terminal server beserta apa yang diminta ClickUp dan hasilnya, misalnya
`POST /mcp 200 rpc=tools/call tool=search_code ms=84`, atau `rpc=initialize protocol=… client=…`
saat terhubung. Kalau tidak ada yang muncul saat Anda klik **Next**, request itu tidak pernah
sampai ke laptop Anda: cek tunnel dan header Cloudflare Access.

## Setup aman di Mac: named tunnel + Cloudflare Access

Setup ini memberi Anda **URL tetap** (misalnya `https://work-codebase-mcp.yourdomain.com`) dan
kunci kedua di depan laptop Anda: Cloudflare menolak request tanpa service token Anda, sehingga
request itu tidak pernah sampai ke server. Pemeriksaan API key tetap berlaku di atasnya.

Anda butuh akun Cloudflare gratis dan domain yang DNS-nya dikelola Cloudflare. **Bot Fight Mode
harus mati di domain itu** (_Security → Settings_): fitur ini menantang server ClickUp, yang tidak
bisa menyelesaikan challenge browser, dan di paket Free tidak bisa dimatikan per hostname. Kalau
situs lain di domain itu membutuhkannya, pakai domain terpisah untuk tunnel. Nama menu di dashboard
Zero Trust kadang berubah; langkah di bawah menjelaskan apa yang perlu dicari.

1. **Buat tunnel.** Di [dashboard Zero Trust](https://one.dash.cloudflare.com) → _Networks →
   Tunnels_ → _Create a tunnel_ → tipe **Cloudflared** → beri nama `work-codebase-mcp`. Di langkah
   instalasi, salin token panjang setelah `--token`. Perintah instalasinya tidak perlu dijalankan.
2. **Arahkan hostname ke server Anda.** Di tab _Public Hostname_ (atau _Published application
   routes_) milik tunnel, tambahkan subdomain `work-codebase-mcp`, domain `yourdomain.com`, tipe
   service **HTTP**, URL `127.0.0.1:8787`.
3. **Buat service token.** _Access → Service Auth → Service Tokens_ → _Create Service Token_.
   Salin **Client ID** dan **Client Secret**. Secret-nya hanya ditampilkan sekali.
4. **Lindungi hostname dengan Access.** _Access → Applications_ → _Add an application_ →
   **Self-hosted** → domain `work-codebase-mcp.yourdomain.com`. Tambahkan policy dengan action
   **Service Auth** yang memuat service token dari langkah 3.
5. **Masukkan nilainya ke `.env`:**

   ```env
   CF_TUNNEL_TOKEN=<token dari langkah 1>
   PUBLIC_URL=https://work-codebase-mcp.yourdomain.com
   CF_ACCESS_CLIENT_ID=<client id dari langkah 3>
   CF_ACCESS_CLIENT_SECRET=<client secret dari langkah 3>
   ```

   Hanya `CF_TUNNEL_TOKEN` yang dipakai untuk menjalankan tunnel. Token ini diberikan ke
   cloudflared lewat environment, bukan lewat command line, jadi tidak muncul di daftar proses
   maupun log. Tiga nilai lainnya untuk `bun run check`; server tidak pernah membacanya.

6. **Uji:** `bun run check`. Dengan service token terpasang, perintah ini juga memastikan
   Cloudflare memblokir request tanpa token.
7. **Di ClickUp**, gunakan URL `https://work-codebase-mcp.yourdomain.com/mcp`, header
   `Authorization: Bearer <API key>`, dan dua custom header `CF-Access-Client-Id` dan
   `CF-Access-Client-Secret` dengan nilai dari `.env`.

## Windows: Pinggy, dan menjalankan tanpa Bun

**Pinggy** berjalan di atas client `ssh` bawaan Windows, untuk mesin yang tidak mengizinkan
instalasi software. Pertama kali, ssh mungkin meminta Anda memercayai host Pinggy: ketik `yes`.
Kalau ia meminta password, cukup tekan Enter. Pinggy lalu menampilkan URL seperti
`https://abcd-12-34-56-78.run.pinggy-free.link`.

Tunnel Pinggy gratis mendapat **URL acak** dan **dibatasi waktu**. Saat tunnel tertutup,
`bun tunnel` meminta Anda menekan Enter untuk menyambung ulang, dan URL baru harus diperbarui di
ClickUp. Untuk URL tetap tanpa batas waktu, pakai **Pinggy Pro**: masukkan access token Anda ke
`.env` sebagai `PINGGY_TOKEN`.

**Tanpa Bun.** Node.js 22.18 ke atas bisa menjalankan TypeScript secara langsung, jadi kode yang
sama jalan di laptop yang hanya mengizinkan Node. `start-windows.bat` otomatis beralih ke Node
kalau Bun tidak ditemukan. Secara manual:

```powershell
npm install --omit=dev --ignore-scripts
node --disable-warning=ExperimentalWarning scripts/setup/setup.ts
node --disable-warning=ExperimentalWarning src/index.ts start
node --disable-warning=ExperimentalWarning scripts/tunnel/tunnel.ts
```

`--ignore-scripts` berarti tidak ada yang diunduh atau di-build selama instalasi. Kalau laptop
memblokir `rg.exe` bawaan, pencarian beralih ke scanner JavaScript; `bun run doctor` (atau
`node … scripts/doctor/doctor.ts`) memberi tahu engine mana yang dipakai.

## Pakai dari Claude Code atau Cursor (stdio)

Server yang sama juga berbicara MCP lewat stdin dan stdout, tanpa HTTP, key, maupun tunnel:

```bash
claude mcp add codebase -- bun /path/to/codebase-mcp/src/index.ts stdio
```

Untuk Cursor atau klien lain, perintahnya `bun` dengan argumen
`["/path/to/codebase-mcp/src/index.ts", "stdio"]`.

## Bahasa dan framework yang didukung

| Tier               | Bahasa                                                  | Yang Anda dapatkan                                                                                          |
| ------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1                  | Java, Kotlin, Go, TypeScript dan JavaScript, Python, C# | Simbol tree-sitter, stack trace, statement log, serta ekstraksi HTTP, gRPC, dan topic untuk framework utama |
| 2                  | PHP, Ruby, Rust, Scala, C, C++, Elixir                  | Simbol tree-sitter, plus stack trace dan route untuk PHP, Ruby, dan Elixir                                  |
| 3                  | Swift, Dart, dan file teks lain apa pun                 | Pencarian, plus simbol dari pola baris                                                                      |
| Kontrak dan config | `.proto`, YAML, JSON, SQL, Dockerfile, Makefile, …      | Pencarian; service gRPC dari `.proto`; tabel SQL                                                            |

| Jenis          | Framework yang dikenali                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler HTTP   | Spring MVC dan WebFlux, JAX-RS, Ktor, gin, echo, chi, gorilla/mux, net/http, ASP.NET (controller dan minimal API), Express, Koa, Fastify, Hono, NestJS, FastAPI, Flask, Django, Laravel, Symfony, Rails, Sinatra, Phoenix |
| Pemanggil HTTP | Feign, RestTemplate, WebClient, Retrofit, Go `net/http`, `HttpClient`/Refit, axios, fetch, got, requests, httpx, aiohttp                                                                                                  |
| Messaging      | Kafka (Spring, kafka-go, sarama, confluent, kafkajs, kafka-python, aiokafka), RabbitMQ, MassTransit                                                                                                                       |
| gRPC           | Service dan method di `.proto`, beserta implementasi dan stub-nya                                                                                                                                                         |

Satu bahasa adalah satu folder di bawah `src/languages/`. Menambah bahasa tidak perlu mengubah
core; lihat [CONTRIBUTING.md](CONTRIBUTING.md).

## Model keamanan

- **Read-only.** Tidak ada tool yang menulis, menghapus, atau menjalankan apa pun pilihan
  pemanggil. Program yang dijalankan hanya `git`, dengan subcommand read-only yang sudah tetap, dan
  ripgrep. Keduanya menerima array argumen, tidak pernah lewat shell, dan environment tanpa rahasia.
- **Path dikurung.** Path absolut, `../`, dan symlink yang keluar dari repo ditolak, baik sebelum
  maupun sesudah path aslinya di-resolve. `.git/` tidak bisa dibaca.
- **Rahasia tetap tersembunyi.** Yang berikut tidak pernah ditampilkan, di-index, dicari, dibaca,
  maupun muncul di diff:
  - semua varian `.env` (`.env`, `.env.local`, `.env.example`, `prod.env`, `.envrc`, `.env.`,
    `.env::$DATA`);
  - key dan sertifikat (`*.pem`, `*.key`, `*.jks`, `id_rsa`, …);
  - `.npmrc`;
  - nama yang mengandung `secret` atau `credentials`;
  - `application-prod.yml`;
  - apa pun yang Anda tambahkan di `blocked` atau `EXTRA_BLOCKED`.

  Selain itu, setiap jawaban dibersihkan dari nilai yang mirip token (API key, JWT, private key,
  `password=…`, kredensial di URL) sebelum dikirim.

- **git di-hardening** (mengikuti CVE di server MCP git referensi):
  - Revision dan tanggal divalidasi, dan `--end-of-options` serta `--literal-pathspecs` dipakai.
  - Config git sistem dan global diabaikan, begitu juga fsmonitor, pager, prompt, external diff,
    dan textconv.
- **Auth sebelum tools.** `/mcp` memeriksa, berurutan, ukuran body (1 MB), rate limit (120 request
  per menit per klien), dan API key yang dibandingkan dalam waktu konstan.
- **Hanya lokal.** Server mendengarkan di `127.0.0.1`; tunnel adalah satu-satunya jalan masuk.
  Tutup tunnel, dan akses ClickUp langsung berakhir.

> Kode Anda melewati penyedia tunnel (Cloudflare atau Pinggy) dalam perjalanannya ke ClickUp. Kalau
> ini laptop kantor atau kode perusahaan, tanyakan dulu ke tim IT atau security Anda.

Melaporkan kerentanan: [SECURITY.md](SECURITY.md).

## Perintah

| Perintah                                     | Fungsi                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `bun run setup`                              | Setup pertama: cari repo, tulis `codebase.config.json`, buat API key              |
| `bun start`                                  | Jalankan server HTTP dan indexer di background                                    |
| `bun tunnel`                                 | Buka tunnel (Cloudflare di Mac, Pinggy di Windows)                                |
| `bun run check [url]`                        | Panggil URL publik seperti yang akan dilakukan ClickUp                            |
| `bun run doctor`                             | Cek runtime, key, config, repo, ripgrep, git, SQLite, grammar, server, dan tunnel |
| `bun run index`                              | Bangun atau perbarui index setiap repo, lalu keluar                               |
| `bun run stdio`                              | Layani MCP lewat stdin dan stdout, untuk klien lokal                              |
| `bun run gen-key`                            | Cetak API key acak yang baru                                                      |
| `bun run eval`                               | Jalankan skenario debugging dan laporkan hit rate, token, dan latensi             |
| `bun run bench -- --corpus <dir> --copies N` | Benchmark skala: index dan query N salinan repo di `<dir>`                        |

## Troubleshooting

| Gejala                                                    | Perbaikan                                                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_API_KEY is missing or shorter than 24 characters`    | Jalankan `bun run setup`, atau masukkan output `bun run gen-key` ke `.env`                                                                                                               |
| `No repos configured`                                     | Jalankan `bun run setup`, atau cek `roots` di `codebase.config.json`. `bun run doctor` menampilkan apa yang ditemukan.                                                                   |
| Sebuah repo menampilkan `not indexed` atau `indexing 40%` | Repo itu masih di-index. Pencarian sudah jalan, hanya lebih lambat. `bun run index` membangun semuanya sekaligus.                                                                        |
| Hasil terlihat usang                                      | Commit atau simpan file-nya; server menangkap perubahan dalam 30 detik, atau 10 menit untuk perubahan yang belum terlihat oleh git. Menghapus `.cache/index/` membangun ulang dari awal. |
| `Search: JavaScript scanner` di banner saat start         | ripgrep tidak bisa jalan di mesin ini. Pencarian tetap jalan, lebih lambat. `bun run doctor` menjelaskan alasannya.                                                                      |
| `Grammars: missing` di doctor                             | Jalankan `bun run grammars:sync`                                                                                                                                                         |
| Windows: `'node' is not recognized` atau syntax error     | Instal Node.js 22.18 ke atas, atau Bun                                                                                                                                                   |

## Pengembangan

```text
src/
  core/        logika murni: ranking, budget, perencanaan query, parsing stack dan log, pencocokan route, keamanan
  ports/       interface yang dibutuhkan engine
  adapters/    I/O: file system, ripgrep, index SQLite, tree-sitter, git, runtime (Bun atau Node)
  languages/   satu folder per bahasa: ekstensi, grammar, pola simbol, route, parser stack
  indexer/     indexer di background: inventory, shard per repo, worker thread, freshness
  engine/      layanan aplikasi: query planner, simbol, katalog, stack trace, sumber log, endpoint
  tools/       sembilan tool MCP: <name>.tool.ts → <domain>.service.ts → <domain>.format.ts
  http/        middleware Hono dan transport MCP
scripts/       setup, tunnel, doctor, check, eval, bench, grammar, quality gate
tests/fixtures/repos/   enam mini service (Java, Go, Node, Python, .NET, proto) untuk test dan eval
```

Arsitektur, alur request, dan alasan di baliknya ada di
[docs/architecture.md](docs/architecture.md). Aturan yang diikuti asisten di repo ini ada di
[AGENTS.md](AGENTS.md).

Quality gate berjalan di setiap commit (husky) dan setiap pull request (CI di macOS, Windows, dan
Ubuntu):

```bash
bun run fl                 # format (oxfmt) + lint (oxlint, type-aware)
bun run type-check         # TypeScript 7, strict
bun run test:coverage      # 600+ test, 100% baris dan fungsi per file
bash scripts/check/gates.sh  # semua di atas plus gaya komentar, dead code, bentuk folder, rahasia, …
```

- File maksimal 200 baris dan fungsi maksimal 40 baris.
- Komentar memakai `/** */` atau `/* */`, tidak pernah `//`.
- Tidak ada `any`, dan antar-layer hanya boleh import satu arah, yang dijaga oleh lint.

Lihat [CONTRIBUTING.md](CONTRIBUTING.md).

## Versioning

[Semantic Versioning](https://semver.org). Versi di `package.json` adalah versi yang dilaporkan
server ke klien. Perubahan dicatat di [CHANGELOG.md](CHANGELOG.md), dan setiap rilis diberi tag
`vX.Y.Z` beserta GitHub Release; prosesnya ada di [RELEASING.md](RELEASING.md).

## Tips

- Laptop harus menyala, tidak tidur, dan menjalankan tunnel. Di Mac, `bun tunnel` menjaga laptop
  tetap terjaga dengan `caffeinate` selama tunnel terbuka. Di Windows, atur Power Options agar
  laptop tidak tidur saat dicolok.
- Jalankan `git pull` di repo Anda secara rutin agar asisten membaca kode terbaru. Index akan
  menyesuaikan sendiri.
- Kalau API key pernah dibagikan, ganti (masukkan `bun run gen-key` yang baru ke `.env`), lalu
  perbarui di ClickUp. Lakukan hal yang sama untuk service token Cloudflare.
