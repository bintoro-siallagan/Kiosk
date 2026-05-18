# 🍽️ Bites & Co. — Backend Server

Express.js REST API + WebSocket server untuk Bites & Co. Kiosk.

## Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/health` | Cek status server |
| GET | `/api/orders` | Semua pesanan |
| GET | `/api/orders?status=waiting` | Filter per status |
| GET | `/api/orders/:id` | Detail pesanan |
| POST | `/api/orders` | Buat pesanan baru |
| PATCH | `/api/orders/:id/status` | Update status pesanan |
| DELETE | `/api/orders/:id` | Batalkan pesanan |
| GET | `/api/menu` | Semua menu |
| GET | `/api/menu/available` | Menu yang tersedia |
| PATCH | `/api/menu/:id` | Update harga/status menu |
| GET | `/api/stats` | Statistik hari ini |

## WebSocket Events

| Event | Arah | Deskripsi |
|-------|------|-----------|
| `init` | Server → Client | Data awal saat connect |
| `order:new` | Server → Client | Pesanan baru masuk |
| `order:updated` | Server → Client | Status pesanan berubah |
| `menu:updated` | Server → Client | Menu diupdate |

## Cara Jalankan

```bash
cd server
npm install
npm run dev    # development (auto-restart)
# atau
npm start      # production
```

Server berjalan di: `http://localhost:3001`
