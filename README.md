# 🌤️ Bandara Husein Sastranegara / PTDI - AWS Real-Time Dashboard

Dashboard kontrol meteorologi *real-time* berbasis web untuk Stasiun Meteorologi Bandara Husein Sastranegara (BDO/WABB) / PT. Dirgantara Indonesia, Bandung.

---

## 🚀 Fitur Utama

- **Monitoring Live Real-Time:** Update data otomatis setiap 30 detik untuk parameter suhu, kelembapan, tekanan udara, dan presipitasi.
- **Prakiraan per Jam (BMKG Style):** Slider kartu horizontal untuk prediksi cuaca 24 jam ke depan (suhu, kelembapan, kecepatan & arah angin).
- **Profil Angin Bertingkat & Wind Rose:** 
  - Pemantauan angin vertikal di ketinggian 10m, 80m, 120m, dan 180m beserta panah rotasi kompas dinamis ($0^\circ - 360^\circ$).
  - Diagram *Wind Rose* 16 sektor mata angin dengan pengelompokan kecepatan (*Calm, Light, Moderate, Strong*).
- **Banner Cuaca Dinamis:** Efek latar belakang animasi CSS yang berubah otomatis mengikuti kondisi cuaca riil (*sunny, cloudy, rain*).
- **Master Data Table & Session History Log:** Audit transparansi data mentah vs terjemahan serta pencatatan riwayat sesi yang dapat diekspor ke format **CSV**.

---

## 🛠️ Stack Teknologi

- **Backend:** Python, FastAPI, Uvicorn, HTTPX
- **Frontend:** HTML5, CSS3, JavaScript (ES6+), Bootstrap 5, Chart.js
- **Data Source:** Open-Meteo API (Koordinat Presisi BDO: `-6.9006, 107.5762`)

---

## 💻 Cara Menjalankan Secara Lokal

1. **Clone repository ini:**
   ```bash
   git clone [https://github.com/bulanazzahrasn-afk/ptdi-aws-dashboard.git](https://github.com/bulanazzahrasn-afk/ptdi-aws-dashboard.git)
   cd ptdi-aws-dashboard
