let windRoseInstance = null;
let clockTimer = null;
let autoRefreshTimer = null;
const POLLING_INTERVAL = 30000; // Refetch data background tiap 30 detik
let historyLogs = [];

// ---------------------------------------------------------------------------------
// CUSTOM PLUGIN CHART.JS: OVERLAY RUNWAY 11/29 HUSEIN SASTRANEGARA (BDO/WABB)
// ---------------------------------------------------------------------------------
const runwayOverlayPlugin = {
    id: 'runwayOverlay',
    afterDraw: (chart) => {
        const { ctx, scales } = chart;
        const rScale = scales.r;
        if (!rScale) return;

        const centerX = rScale.xCenter;
        const centerY = rScale.yCenter;
        const radius = rScale.drawingArea;

        // Angle Orientasi Runway 11/29: 110 deg & 290 deg
        // Konversi derajat meteorologi ke radian koordinat Canvas (0 deg = Utara/Atas)
        const rad110 = (110 - 90) * (Math.PI / 180);
        const rad290 = (290 - 90) * (Math.PI / 180);

        ctx.save();

        // 1. Gambar Strip Runway (Garis Tebal Dark Slate)
        ctx.beginPath();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#1e293b'; 
        ctx.moveTo(centerX + Math.cos(rad290) * (radius * 0.95), centerY + Math.sin(rad290) * (radius * 0.95));
        ctx.lineTo(centerX + Math.cos(rad110) * (radius * 0.95), centerY + Math.sin(rad110) * (radius * 0.95));
        ctx.stroke();

        // 2. Gambar Garis Tengah Runway (Dash Putih)
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#ffffff';
        ctx.moveTo(centerX + Math.cos(rad290) * (radius * 0.92), centerY + Math.sin(rad290) * (radius * 0.92));
        ctx.lineTo(centerX + Math.cos(rad110) * (radius * 0.95), centerY + Math.sin(rad110) * (radius * 0.95));
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash

        // 3. Tulis Teks Label RWY 29 dan RWY 11
        ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ef4444'; // Merah tegas
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // RWY 11
        const x11 = centerX + Math.cos(rad110) * (radius * 1.08);
        const y11 = centerY + Math.sin(rad110) * (radius * 1.08);
        ctx.fillText('RWY 11', x11, y11);

        // RWY 29
        const x29 = centerX + Math.cos(rad290) * (radius * 1.08);
        const y29 = centerY + Math.sin(rad290) * (radius * 1.08);
        ctx.fillText('RWY 29', x29, y29);

        ctx.restore();
    }
};

// Registrasi plugin Runway Overlay
Chart.register(runwayOverlayPlugin);

document.addEventListener("DOMContentLoaded", () => {
    initWindRoseChart();
    startRealtimeClock();
    fetchAWSData();

    const autoSwitch = document.getElementById("autoRefreshSwitch");
    if (autoSwitch) {
        autoSwitch.addEventListener("change", (e) => {
            if (e.target.checked) startAutoRefresh();
            else stopAutoRefresh();
        });
    }

    const refreshBtn = document.getElementById("manualRefreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => fetchAWSData());
    }

    const exportBtn = document.getElementById("exportHistoryBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", exportHistoryCSV);
    }

    startAutoRefresh();
});

// ---------------------------------------------------------------------------------
// JAM DIGITAL REAL-TIME
// ---------------------------------------------------------------------------------
function startRealtimeClock() {
    updateClockDisplay();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(updateClockDisplay, 1000);
}

function updateClockDisplay() {
    const now = new Date();
    const fullDateStr = now.toLocaleDateString('id-ID', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('id-ID', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    const lastUpdate = document.getElementById("last-update");
    if (lastUpdate) {
        lastUpdate.textContent = `${fullDateStr} - ${timeStr} WIB`;
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(fetchAWSData, POLLING_INTERVAL);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
}

async function fetchAWSData() {
    const icon = document.getElementById("refreshIcon");
    if (icon) icon.classList.add("spin-anim");

    try {
        const response = await fetch(`/api/v1/aws-translated?_t=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        const data = await response.json();
        renderDashboard(data);

    } catch (err) {
        console.error("Gagal memuat data AWS:", err);
    } finally {
        if (icon) icon.classList.remove("spin-anim");
    }
}

function safeSetText(id, value, suffix = "") {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = (value !== null && value !== undefined) ? `${value} ${suffix}`.trim() : `-- ${suffix}`.trim();
    }
}

function renderDashboard(data) {
    if (!data) return;

    const t = data.thermodynamics || {};
    const w = data.wind_profile || {};
    const c = data.clouds_precipitation || {};

    // 1. Ringkasan Utama
    safeSetText("m-temp", t.temp_2m, "°C");
    safeSetText("m-dew", t.dew_point, "°C");
    safeSetText("m-rh", t.rh_2m, "%");
    safeSetText("m-press", t.msl_pressure, "hPa");
    safeSetText("m-surf-press", t.surface_pressure, "hPa");
    safeSetText("m-cloud-octa", c.cloud_cover_octa);
    safeSetText("m-cloud-pcts", `${c.cloud_cover_low_pct || 0}% / ${c.cloud_cover_mid_pct || 0}% / ${c.cloud_cover_high_pct || 0}%`);

    const barRh = document.getElementById("bar-rh");
    if (barRh && t.rh_2m !== undefined) barRh.style.width = `${t.rh_2m}%`;

    // 2. Profil Angin Vertikal (Knots & Feet)
    ["33ft", "260ft", "400ft", "600ft"].forEach(lvl => {
        if (w[lvl]) {
            safeSetText(`w${lvl.replace('ft','')}-spd`, w[lvl].speed_kt, "kt");
            safeSetText(`w${lvl.replace('ft','')}-dir`, `${w[lvl].dir_deg}° (${w[lvl].dir_compass})`);
            
            const arrow = document.getElementById(`w${lvl.replace('ft','')}-arrow`);
            if (arrow && w[lvl].dir_deg !== undefined) {
                arrow.style.transform = `rotate(${w[lvl].dir_deg}deg)`;
            }
        }
    });
    safeSetText("wgust-spd", w.gusts_kt, "kt");

    // 3. Render Wind Rose Hari Ini
    const minData = data.minutely_15 || data.raw_minutely_15_payload || data.raw_hourly_payload;
    if (minData) {
        updateWindRoseChart(minData);
        renderDaily00to24History(minData);
    }

    // 4. Render Prakiraan 2 Hari
    if (data.raw_daily_payload) {
        render2DayForecast(data.raw_daily_payload);
    }

    // 5. Render Master Table Penerbangan
    renderFlightPrepTable(data);
}

// ---------------------------------------------------------------------------------
// INITIALIZE WIND ROSE CHART DENGAN LABEL DILUAR LINGKARAN
// ---------------------------------------------------------------------------------
function initWindRoseChart() {
    const canvas = document.getElementById("windRoseChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const sectors = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

    windRoseInstance = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: sectors,
            datasets: [
                { label: 'Calm (<3 kt)', data: Array(16).fill(0), backgroundColor: 'rgba(6, 182, 212, 0.75)', borderColor: '#ffffff', borderWidth: 1 },
                { label: 'Light (3-10 kt)', data: Array(16).fill(0), backgroundColor: 'rgba(16, 185, 129, 0.75)', borderColor: '#ffffff', borderWidth: 1 },
                { label: 'Moderate (11-20 kt)', data: Array(16).fill(0), backgroundColor: 'rgba(245, 158, 11, 0.75)', borderColor: '#ffffff', borderWidth: 1 },
                { label: 'Strong (>20 kt)', data: Array(16).fill(0), backgroundColor: 'rgba(239, 68, 68, 0.75)', borderColor: '#ffffff', borderWidth: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 15 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (ctx) => `Sektor Arah: ${ctx[0].label}`,
                        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} Sampel`
                    }
                }
            },
            scales: {
                r: {
                    stacked: true,
                    ticks: {
                        display: true,
                        backdropColor: 'rgba(255, 255, 255, 0.85)',
                        font: { size: 9, family: 'JetBrains Mono' }
                    },
                    grid: { color: '#e2e8f0' },
                    angleLines: { display: true, color: '#cbd5e1' },
                    pointLabels: {
                        display: true,
                        centerPointLabels: true,
                        font: { size: 11, weight: 'bold', family: 'Plus Jakarta Sans' },
                        color: '#1e293b'
                    }
                }
            }
        }
    });
}

function updateWindRoseChart(payload) {
    if (!windRoseInstance || !payload.wind_direction_10m || !payload.wind_speed_10m) return;

    const dirs = payload.wind_direction_10m;
    const speeds = payload.wind_speed_10m;

    const catCalm = Array(16).fill(0);
    const catLight = Array(16).fill(0);
    const catMod = Array(16).fill(0);
    const catStrong = Array(16).fill(0);

    dirs.forEach((deg, i) => {
        if (deg !== null && deg !== undefined && speeds[i] !== null && speeds[i] !== undefined) {
            const idx = Math.floor((parseFloat(deg) + 11.25) / 22.5) % 16;
            const spdKt = parseFloat(speeds[i]) * 0.539957;

            if (spdKt < 3.0) catCalm[idx] += 1;
            else if (spdKt <= 10.0) catLight[idx] += 1;
            else if (spdKt <= 20.0) catMod[idx] += 1;
            else catStrong[idx] += 1;
        }
    });

    windRoseInstance.data.datasets[0].data = catCalm;
    windRoseInstance.data.datasets[1].data = catLight;
    windRoseInstance.data.datasets[2].data = catMod;
    windRoseInstance.data.datasets[3].data = catStrong;
    windRoseInstance.update();
}

// ---------------------------------------------------------------------------------
// PRAKIRAAN 2 HARI
// ---------------------------------------------------------------------------------
function render2DayForecast(daily) {
    const container = document.getElementById("daily-forecast-cards");
    if (!container || !daily.time) return;

    container.innerHTML = "";
    const dates = daily.time.slice(0, 2);

    dates.forEach((dStr, i) => {
        const dateObj = new Date(dStr);
        const title = i === 0 ? "Hari Ini (Today)" : "Besok (Tomorrow)";
        const formattedDate = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        
        const tempMax = daily.temperature_2m_max[i] !== undefined ? `${daily.temperature_2m_max[i]} °C` : '--';
        const tempMin = daily.temperature_2m_min[i] !== undefined ? `${daily.temperature_2m_min[i]} °C` : '--';
        const windMaxKt = daily.wind_speed_10m_max[i] !== undefined ? (daily.wind_speed_10m_max[i] * 0.539957).toFixed(1) : '--';
        const gustsMaxKt = daily.wind_gusts_10m_max[i] !== undefined ? (daily.wind_gusts_10m_max[i] * 0.539957).toFixed(1) : '--';
        const precipSum = daily.precipitation_sum[i] !== undefined ? `${daily.precipitation_sum[i]} mm` : '0 mm';

        const card = document.createElement("div");
        card.className = "col-md-6";
        card.innerHTML = `
            <div class="card shadow-sm border-0 border-top border-primary border-4">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h5 class="fw-bold text-primary mb-0">${title}</h5>
                        <span class="badge bg-light text-dark font-mono">${formattedDate}</span>
                    </div>
                    <hr>
                    <div class="row g-3">
                        <div class="col-6">
                            <div class="small text-muted">Rentang Suhu</div>
                            <div class="fw-bold fs-5">${tempMin} - ${tempMax}</div>
                        </div>
                        <div class="col-6">
                            <div class="small text-muted">Akumulasi Presipitasi</div>
                            <div class="fw-bold fs-5 text-info">${precipSum}</div>
                        </div>
                        <div class="col-6">
                            <div class="small text-muted">Angin Maksimum</div>
                            <div class="fw-bold text-dark">${windMaxKt} kt</div>
                        </div>
                        <div class="col-6">
                            <div class="small text-muted">Hembusan (Gust) Maks</div>
                            <div class="fw-bold text-danger">${gustsMaxKt} kt</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// ---------------------------------------------------------------------------------
// MASTER TABLE FLIGHT PREPARATION
// ---------------------------------------------------------------------------------
function renderFlightPrepTable(data) {
    const tbody = document.getElementById("flight-prep-table-body");
    if (!tbody) return;

    const t = data.thermodynamics || {};
    const w = data.wind_profile || {};
    const c = data.clouds_precipitation || {};

    const flightParams = [
        { name: "Altimeter Setting (QNH)", val: t.msl_pressure, unit: "hPa", desc: "Tekanan Muka Laut Standar Penerbangan" },
        { name: "Station Pressure (QFE)", val: t.surface_pressure, unit: "hPa", desc: "Tekanan Muka Stasiun Aerodrom" },
        { name: "Suhu Udara (OAT 2m)", val: t.temp_2m, unit: "°C", desc: "Suhu Luar untuk Kalkulasi Performa Takeoff" },
        { name: "Dew Point Temperature", val: t.dew_point, unit: "°C", desc: "Penentu Spread Titik Embun & Kondisi Kabut" },
        { name: "Surface Wind (33 ft)", val: w["33ft"] ? `${w["33ft"].speed_kt} kt / ${w["33ft"].dir_deg}° (${w["33ft"].dir_compass})` : '--', unit: "Knots / Deg", desc: "Angin Permukaan Runway Husein (11/29)" },
        { name: "Maximum Wind Gust", val: w.gusts_kt, unit: "Knots", desc: "Potensi Kecepatan Hembusan Maksimum" },
        { name: "Total Cloud Cover", val: c.cloud_cover_octa, unit: "Okta", desc: "Jumlah Tutupan Awan Aerodrom" },
        { name: "Precipitation Rate", val: c.precipitation_mm, unit: "mm", desc: "Intensitas Curah Hujan Aerodrom" }
    ];

    tbody.innerHTML = "";
    flightParams.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="fw-bold text-primary">${p.name}</td>
            <td><code class="px-2 py-1 bg-light text-dark rounded border fw-bold">${p.val !== undefined ? p.val : '--'}</code></td>
            <td class="text-secondary">${p.unit}</td>
            <td class="small text-muted">${p.desc}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------------------------------
// HISTORY LOG 15-MENITAN
// ---------------------------------------------------------------------------------
function renderDaily00to24History(payload) {
    if (!payload || !payload.time) return;

    const times = payload.time;
    const temps = payload.temperature_2m || [];
    const rhs = payload.relative_humidity_2m || [];
    const pressures = payload.msl_pressure || payload.surface_pressure || [];
    const windSpeeds = payload.wind_speed_10m || [];
    const windDirs = payload.wind_direction_10m || [];
    const precips = payload.precipitation || [];

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const todayStr = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

    let logs = [];
    times.forEach((t, i) => {
        const timeStr = t.includes("T") ? t.split("T")[1].substring(0, 5) : t;
        const [h, m] = timeStr.split(":").map(Number);

        if (h < currentHour || (h === currentHour && m <= currentMin)) {
            const spdKt = windSpeeds[i] !== undefined ? (windSpeeds[i] * 0.539957).toFixed(1) : '--';
            const dirDeg = windDirs[i] !== undefined ? windDirs[i] : '--';
            const precipVal = precips[i] || 0;

            logs.push({
                time: `${todayStr}, ${timeStr} WIB`,
                temp: temps[i] !== undefined ? `${temps[i]} °C` : '--',
                rh: rhs[i] !== undefined ? `${rhs[i]} %` : '--',
                press: pressures[i] !== undefined ? `${pressures[i]} hPa` : '--',
                windSpd: `${spdKt} kt`,
                windDir: `${dirDeg}°`,
                precip: precipVal > 0 ? `Hujan (${precipVal} mm)` : 'Cerah / Berawan'
            });
        }
    });

    historyLogs = logs.reverse();
    renderHistoryTable();
}

function renderHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    if (!tbody) return;

    if (historyLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Memuat riwayat 15m...</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    historyLogs.forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="fw-bold text-primary">${log.time}</td>
            <td>${log.temp}</td>
            <td>${log.rh}</td>
            <td>${log.press}</td>
            <td>${log.windSpd}</td>
            <td>${log.windDir}</td>
            <td class="small text-secondary">${log.precip}</td>
        `;
        tbody.appendChild(tr);
    });
}

function exportHistoryCSV() {
    if (historyLogs.length === 0) return;
    let csv = "Waktu,Suhu (C),RH (%),QNH (hPa),Angin (kt),Arah,Status\n";
    historyLogs.forEach(l => {
        csv += `"${l.time}","${l.temp}","${l.rh}","${l.press}","${l.windSpd}","${l.windDir}","${l.precip}"\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = `Aviation_AWS_BDO_15m_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}