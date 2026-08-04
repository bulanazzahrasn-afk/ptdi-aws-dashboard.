let windRoseInstance = null;
let clockTimer = null;
let autoRefreshTimer = null;
const POLLING_INTERVAL = 30000;
let historyLogs = [];
let dashOffset = 0;

// PLUGIN OVERLAY RUNWAY WITH ANIMATED CENTERLINE
const runwayOverlayPlugin = {
    id: 'runwayOverlay',
    afterDraw: (chart) => {
        const { ctx, scales } = chart;
        const rScale = scales.r;
        if (!rScale) return;

        const centerX = rScale.xCenter;
        const centerY = rScale.yCenter;
        const radius = rScale.drawingArea;

        const rad110 = (110 - 90) * (Math.PI / 180);
        const rad290 = (290 - 90) * (Math.PI / 180);

        ctx.save();

        // 1. Strip Runway
        ctx.beginPath();
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#1e293b'; 
        ctx.moveTo(centerX + Math.cos(rad290) * (radius * 0.95), centerY + Math.sin(rad290) * (radius * 0.95));
        ctx.lineTo(centerX + Math.cos(rad110) * (radius * 0.95), centerY + Math.sin(rad110) * (radius * 0.95));
        ctx.stroke();

        // 2. Garis Tengah Runway Beranimasi (Animated Moving Dashes)
        dashOffset = (dashOffset + 0.3) % 8;
        ctx.beginPath();
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 3]);
        ctx.lineDashOffset = -dashOffset;
        ctx.strokeStyle = '#38bdf8';
        ctx.moveTo(centerX + Math.cos(rad290) * (radius * 0.92), centerY + Math.sin(rad290) * (radius * 0.92));
        ctx.lineTo(centerX + Math.cos(rad110) * (radius * 0.95), centerY + Math.sin(rad110) * (radius * 0.95));
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Teks RWY 29 & RWY 11
        ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ef4444';
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

    // Event Listener Kalkulator Crosswind Pop-Up
    const rwySelect = document.getElementById("calc-rwy-heading");
    const windDirInput = document.getElementById("calc-wind-dir");
    const windSpdInput = document.getElementById("calc-wind-spd");

    if (rwySelect && windDirInput && windSpdInput) {
        [rwySelect, windDirInput, windSpdInput].forEach(el => {
            el.addEventListener("input", calculatePopUpCrosswind);
        });
    }

    startAutoRefresh();
});

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
        console.error("Gagal memuat data Open-Meteo AWS:", err);
    } finally {
        if (icon) icon.classList.remove("spin-anim");
    }
}

// safeSetText dengan Animasi Pulse halus saat nilai berganti
function safeSetText(id, value, suffix = "") {
    const el = document.getElementById(id);
    if (el) {
        const newText = (value !== null && value !== undefined) ? `${value} ${suffix}`.trim() : `-- ${suffix}`.trim();
        if (el.textContent !== newText) {
            el.textContent = newText;
            el.classList.remove("value-update-anim");
            void el.offsetWidth; // Reflow
            el.classList.add("value-update-anim");
        }
    }
}

function degToCompassShort(deg) {
    if (deg === null || deg === undefined) return "";
    const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return sectors[Math.floor(((parseFloat(deg) + 22.5) % 360) / 45)];
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

    // 2. Profil Angin Vertikal Penerbangan
    const levels = [
        { key: "surface", spdId: "w33-spd", dirId: "w33-dir", arrowId: "w33-arrow" },
        { key: "lvl_025", spdId: "w250-spd", dirId: "w250-dir", arrowId: "w250-arrow" },
        { key: "lvl_040", spdId: "w400-spd", dirId: "w400-dir", arrowId: "w400-arrow" },
        { key: "lvl_060", spdId: "w600-spd", dirId: "w600-dir", arrowId: "w600-arrow" }
    ];

    levels.forEach(lvl => {
        const item = w[lvl.key];
        if (item) {
            safeSetText(lvl.spdId, item.speed_kt, "kt");
            safeSetText(lvl.dirId, `${item.dir_deg}° (${item.dir_compass})`);
            
            const arrow = document.getElementById(lvl.arrowId);
            if (arrow && item.dir_deg !== undefined) {
                arrow.style.transform = `rotate(${item.dir_deg}deg)`;
            }
        }
    });

    safeSetText("wgust-spd", w.gusts_kt, "kt");

    // Otomatis Isikan Angin Saat Ini ke Kalkulator Pop-Up
    if (w.surface) {
        const windDirInput = document.getElementById("calc-wind-dir");
        const windSpdInput = document.getElementById("calc-wind-spd");
        if (windDirInput && windSpdInput) {
            windDirInput.value = w.surface.dir_deg;
            windSpdInput.value = w.surface.speed_kt;
            calculatePopUpCrosswind();
        }
    }

    // 3. Render Wind Rose & History Log
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

// LOGIKA KALKULATOR CROSSWIND POP-UP
function calculatePopUpCrosswind() {
    const rwyHeading = parseFloat(document.getElementById("calc-rwy-heading").value) || 110;
    const windDir = parseFloat(document.getElementById("calc-wind-dir").value) || 0;
    const windSpd = parseFloat(document.getElementById("calc-wind-spd").value) || 0;

    const angleRad = (windDir - rwyHeading) * (Math.PI / 180);
    const crosswind = Math.abs(windSpd * Math.sin(angleRad));
    const headtail = windSpd * Math.cos(angleRad);

    const outCross = document.getElementById("calc-out-cross");
    const outHeadTail = document.getElementById("calc-out-headtail");
    const threatBadge = document.getElementById("calc-threat-badge");
    const threatDesc = document.getElementById("calc-threat-desc");

    if (outCross) outCross.textContent = `${crosswind.toFixed(1)} kt`;
    if (outHeadTail) {
        const type = headtail >= 0 ? "Headwind" : "Tailwind";
        outHeadTail.textContent = `${Math.abs(headtail).toFixed(1)} kt (${type})`;
    }

    // Penilaian Bahaya Limit Angin Samping
    if (threatBadge && threatDesc) {
        if (crosswind > 20.0) {
            threatBadge.className = "badge bg-danger px-3 py-1 font-mono fs-6";
            threatBadge.textContent = "HAZARDOUS";
            threatDesc.textContent = "BAHAYA: Komponen crosswind melebihi limit maksimum operasional (20 Knots).";
        } else if (crosswind > 12.0) {
            threatBadge.className = "badge bg-warning text-dark px-3 py-1 font-mono fs-6";
            threatBadge.textContent = "CAUTION";
            threatDesc.textContent = "WASPADA: Komponen crosswind cukup tinggi (12-20 Knots).";
        } else {
            threatBadge.className = "badge bg-success px-3 py-1 font-mono fs-6";
            threatBadge.textContent = "SAFE";
            threatDesc.textContent = "AMAN: Komponen angin samping di bawah limitasi penerbangan normal.";
        }
    }
}

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
                legend: { display: false }
            },
            scales: {
                r: {
                    stacked: true,
                    ticks: { display: true, backdropColor: 'rgba(255, 255, 255, 0.85)', font: { size: 9 } },
                    grid: { color: '#e2e8f0' },
                    angleLines: { display: true, color: '#cbd5e1' },
                    pointLabels: {
                        display: true,
                        centerPointLabels: true,
                        font: { size: 11, weight: 'bold' },
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

function render2DayForecast(daily) {
    const container = document.getElementById("daily-forecast-cards");
    if (!container || !daily.time) return;

    container.innerHTML = "";
    const dates = daily.time.slice(0, 2);

    dates.forEach((dStr, i) => {
        const dateObj = new Date(dStr);
        const dayLabel = i === 0 ? "Hari Ini (Today)" : "Besok (Tomorrow)";
        const formattedDate = dateObj.toLocaleDateString('id-ID', { 
            weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' 
        });

        const tempMax = daily.temperature_2m_max[i] !== undefined ? `${daily.temperature_2m_max[i]}°C` : '--';
        const tempMin = daily.temperature_2m_min[i] !== undefined ? `${daily.temperature_2m_min[i]}°C` : '--';
        
        const windMaxKmh = daily.wind_speed_10m_max[i] || 0;
        const windMaxKt = (windMaxKmh * 0.539957).toFixed(1);
        
        const gustsMaxKmh = daily.wind_gusts_10m_max[i] || 0;
        const gustsMaxKt = (gustsMaxKmh * 0.539957).toFixed(1);
        
        const domDirDeg = daily.wind_direction_10m_dominant ? daily.wind_direction_10m_dominant[i] : 0;
        const domDirCompass = degToCompassShort(domDirDeg);
        const precipSum = daily.precipitation_sum[i] !== undefined ? daily.precipitation_sum[i] : 0;

        let flightCategory = "VFR";
        let categoryBadge = "bg-success";
        let weatherIcon = "bi-sun-fill text-warning";
        let weatherText = "Kondisi visual operasional optimal.";

        if (precipSum > 10.0) {
            flightCategory = "IFR / Severe";
            categoryBadge = "bg-danger";
            weatherIcon = "bi-cloud-lightning-rain-fill text-danger";
            weatherText = "Potensi presipitasi lebat & jarak pandang terbatas.";
        } else if (precipSum > 1.0 || windMaxKt > 15.0) {
            flightCategory = "MVFR";
            categoryBadge = "bg-warning text-dark";
            weatherIcon = "bi-cloud-rain-heavy-fill text-info";
            weatherText = "Waspada presipitasi lokal / angin kencang.";
        } else if (windMaxKt <= 10.0) {
            weatherIcon = "bi-cloud-sun-fill text-warning";
        }

        const angleDiff = Math.abs(domDirDeg - 110) * (Math.PI / 180);
        const crosswindKt = Math.abs(windMaxKt * Math.sin(angleDiff)).toFixed(1);

        const card = document.createElement("div");
        card.className = "col-md-6";
        card.innerHTML = `
            <div class="card shadow-sm border-0 rounded-4 overflow-hidden h-100">
                <div class="card-header bg-dark text-white p-4 border-0 d-flex justify-content-between align-items-center">
                    <div>
                        <span class="badge ${categoryBadge} px-3 py-1 mb-2 font-mono fs-6">${flightCategory}</span>
                        <h4 class="fw-bold mb-0">${dayLabel}</h4>
                        <div class="small text-secondary font-mono">${formattedDate}</div>
                    </div>
                    <div class="text-end">
                        <i class="bi ${weatherIcon} display-4"></i>
                    </div>
                </div>

                <div class="card-body p-4 bg-white">
                    <div class="d-flex align-items-baseline gap-3 mb-3">
                        <div class="display-5 fw-bold text-dark">${tempMax}</div>
                        <div class="fs-5 text-secondary">/ ${tempMin}</div>
                        <div class="ms-auto text-end text-muted small fw-medium">${weatherText}</div>
                    </div>

                    <hr class="my-3">

                    <div class="row g-3">
                        <div class="col-6">
                            <div class="p-3 bg-light rounded-3">
                                <div class="text-secondary small fw-bold mb-1">
                                    <i class="bi bi-wind me-1 text-primary"></i>MAX WIND & DIRECTION
                                </div>
                                <div class="fw-bold fs-5 text-dark">${windMaxKt} kt</div>
                                <div class="small text-muted">${domDirDeg}° (${domDirCompass})</div>
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="p-3 bg-light rounded-3">
                                <div class="text-secondary small fw-bold mb-1">
                                    <i class="bi bi-arrow-up-right-circle me-1 text-danger"></i>MAX GUST
                                </div>
                                <div class="fw-bold fs-5 text-danger">${gustsMaxKt} kt</div>
                                <div class="small text-muted">Peak Surface Gust</div>
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="p-3 bg-light rounded-3">
                                <div class="text-secondary small fw-bold mb-1">
                                    <i class="bi bi-compass me-1 text-warning"></i>EST. CROSSWIND (RWY 11/29)
                                </div>
                                <div class="fw-bold fs-5 text-warning">${crosswindKt} kt</div>
                                <div class="small text-muted">Komponen Angin Samping</div>
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="p-3 bg-light rounded-3">
                                <div class="text-secondary small fw-bold mb-1">
                                    <i class="bi bi-droplet-half me-1 text-info"></i>PRECIPITATION SUM
                                </div>
                                <div class="fw-bold fs-5 text-info">${precipSum} mm</div>
                                <div class="small text-muted">Akumulasi Hujan Harian</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card-footer bg-light p-3 text-center border-0">
                    <small class="text-muted"><i class="bi bi-airplane me-1"></i>Husein Sastranegara Aerodrome Flight Operational Forecast</small>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

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
        { name: "Surface Wind (33 ft)", val: w.surface ? `${w.surface.speed_kt} kt / ${w.surface.dir_deg}° (${w.surface.dir_compass})` : '--', unit: "Knots / Deg", desc: "Angin Permukaan Runway Husein (11/29)" },
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

// LOGIKA PRESISI HISTORY LOG 15m DARI TEPAT 00:00 WIB HINGGA JAM TERKINI
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

    // Buat objek Date khusus untuk batas awal jam 00:00:00 WIB hari ini
    const startOfTodayWIB = new Date(now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }) + "T00:00:00+07:00");

    let logsMap = new Map();

    times.forEach((isoTimeStr, i) => {
        if (!isoTimeStr) return;

        // Parse waktu dari Open-Meteo sebagai objek Date UTC
        const dt = new Date(isoTimeStr.includes("Z") ? isoTimeStr : isoTimeStr + ":00Z");

        // BISA/FILTER: Hanya ambil data yang berada dalam rentang [00:00 WIB Hari Ini, Sampai Jam Terkini]
        if (dt >= startOfTodayWIB && dt <= now) {
            const wibDateStr = dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            const wibTimeStr = dt.toLocaleTimeString('id-ID', { 
                timeZone: 'Asia/Jakarta', 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false 
            }).replace('.', ':');

            const labelDate = dt.toLocaleDateString('id-ID', { 
                timeZone: 'Asia/Jakarta', 
                weekday: 'short', 
                day: 'numeric', 
                month: 'short' 
            });

            const spdKt = windSpeeds[i] !== undefined ? (windSpeeds[i] * 0.539957).toFixed(1) : '--';
            const dirDeg = windDirs[i] !== undefined ? windDirs[i] : '--';
            const precipVal = precips[i] || 0;

            const key = `${wibDateStr} ${wibTimeStr}`;
            logsMap.set(key, {
                rawTime: dt.getTime(),
                time: `${labelDate}, ${wibTimeStr} WIB`,
                temp: temps[i] !== undefined ? `${temps[i]} °C` : '--',
                rh: rhs[i] !== undefined ? `${rhs[i]} %` : '--',
                press: pressures[i] !== undefined ? `${pressures[i]} hPa` : '--',
                windSpd: `${spdKt} kt`,
                windDir: `${dirDeg}°`,
                precip: precipVal > 0 ? `Hujan (${precipVal} mm)` : 'Cerah / Berawan'
            });
        }
    });

    // Urutkan dari waktu paling baru di paling atas sampai jam 00:00 WIB di paling bawah
    historyLogs = Array.from(logsMap.values()).sort((a, b) => b.rawTime - a.rawTime);
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