# 🌤️ PTDI Aviation AWS Real-Time Dashboard

Dashboard web meteorologi untuk Bandara Husein Sastranegara (BDO/WICC) / PT. Dirgantara Indonesia, Bandung.

## Tujuan

Dashboard menyajikan kondisi cuaca, profil angin, runway wind, prakiraan per jam, daylight, cloud cover, precipitation, serta histori data dalam satu antarmuka operasional.

> **Penting:** data cuaca pada versi ini berasal dari **Open-Meteo forecast/model data**. String METAR/TAF yang ditampilkan dashboard adalah **derived/synthetic representation** untuk kebutuhan visualisasi dan pembelajaran, **bukan METAR/TAF resmi** dari stasiun meteorologi atau otoritas penerbangan.

## Fitur

- Monitoring data current dan forecast otomatis.
- Prakiraan per jam dan prakiraan beberapa hari.
- Profil angin pada 10 m, 80 m, 120 m, dan 180 m.
- Wind rose 16 sektor.
- Crosswind, headwind, dan tailwind untuk runway 11/29.
- Cloud cover, precipitation, visibility heuristic, daylight, dan thermodynamics.
- Master data dan session history dengan ekspor.
- Health endpoint `/health` untuk pemeriksaan deployment.
- Cache upstream 30 detik untuk menghindari request berulang saat dashboard melakukan polling.

## Arsitektur

```text
Open-Meteo
   ↓
app/services/metar_service.py
   ↓
app/utils/translator.py
   ↓
FastAPI /api/v1/aws-translated
   ↓
HTML + CSS + JavaScript + Chart.js
```

## Stack

- Backend: Python, FastAPI, Uvicorn, HTTPX
- Frontend: HTML5, CSS3, JavaScript ES6+, Bootstrap 5, Chart.js
- Data source: Open-Meteo
- Deployment: Vercel

## Data source

Koordinat WICC yang digunakan:

- Latitude: `-6.9006`
- Longitude: `107.5762`
- Timezone: `Asia/Jakarta`

## Menjalankan lokal

```bash
git clone https://github.com/bulanazzahrasn-afk/ptdi-aws-dashboard..git
cd ptdi-aws-dashboard.
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Buka `http://127.0.0.1:8000`.

API utama: `GET /api/v1/aws-translated`
Health check: `GET /health`
