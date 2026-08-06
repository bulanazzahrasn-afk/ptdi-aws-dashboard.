let windRoseInstance = null;
let clockTimer = null;
let autoRefreshTimer = null;
const POLLING_INTERVAL = 30000;
let historyLogs = [];
let dashOffset = 0;

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

        ctx.beginPath();
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#1e293b'; 
        ctx.moveTo(centerX + Math.cos(rad290) * (radius * 0.95), centerY + Math.sin(rad290) * (radius * 0.95));
        ctx.lineTo(centerX + Math.cos(rad110) * (radius * 0.95), centerY + Math.sin(rad110) * (radius * 0.95));
        ctx.stroke();

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

        ctx.font = 'bold 10px "Inter", sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const x11 = centerX + Math.cos(rad110) * (radius * 1.08);
        const y11 = centerY + Math.sin(rad110) * (radius * 1.08);
        ctx.fillText('RWY 11', x11, y11);

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

    const forecastTabBtn = document.getElementById("forecast-tab");
    if (forecastTabBtn) {
        forecastTabBtn.addEventListener("shown.bs.tab", () => {
            setTimeout(drawDaylightCurve, 100);
        });
    }

    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");
    const contentArea = document.getElementById("contentArea");

    if (sidebarToggle && sidebar && contentArea) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            contentArea.classList.toggle("expanded");
            setTimeout(drawDaylightCurve, 300);
        });
    }

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

    const rwySelect = document.getElementById("calc-rwy-heading");
    const windDirInput = document.getElementById("calc-wind-dir");
    const windSpdInput = document.getElementById("calc-wind-spd");

    if (rwySelect && windDirInput && windSpdInput) {
        [rwySelect, windDirInput, windSpdInput].forEach(el => {
            el.addEventListener("input", calculatePopUpCrosswind);
        });
    }

    window.addEventListener("resize", drawDaylightCurve);
    startAutoRefresh();
});

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
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    startAngle: -11.25,
                    stacked: true,
                    ticks: { display: true, backdropColor: 'rgba(252, 252, 252, 0.85)', color: '#475569', font: { size: 9 } },
                    grid: { color: '#e2e8f0' },
                    angleLines: { display: true, color: '#cbd5e1' },
                    pointLabels: { display: true, centerPointLabels: true, font: { size: 11, weight: 'bold' }, color: '#0f172a' }
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

function drawDaylightCurve() {
    const canvas = document.getElementById("daylightCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const parentWidth = canvas.parentElement.clientWidth || 600;
    
    canvas.width = parentWidth;
    canvas.height = 150;

    const w = canvas.width;
    const h = canvas.height;
    const horizonY = h / 2 + 10;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(15, horizonY);
    ctx.lineTo(w - 15, horizonY);
    ctx.stroke();

    const sunriseX = w * 0.25;
    const middayX = w * 0.50;
    const sunsetX = w * 0.75;
    const curveRadiusY = 55;

    const markers = [{ x: sunriseX }, { x: middayX }, { x: sunsetX }];

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.4)';
    ctx.lineWidth = 1;
    markers.forEach(m => {
        ctx.beginPath();
        ctx.moveTo(m.x, horizonY);
        ctx.lineTo(m.x, horizonY + 35);
        ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(middayX, horizonY);
    for (let x = middayX; x <= sunsetX; x++) {
        const progress = (x - sunriseX) / (sunsetX - sunriseX);
        const rad = progress * Math.PI;
        const y = horizonY - Math.sin(rad) * curveRadiusY;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(sunsetX, horizonY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.5;
    
    for (let x = 15; x <= w - 15; x++) {
        const totalSpan = sunsetX - sunriseX;
        const normalizedProgress = (x - sunriseX) / totalSpan;
        const rad = normalizedProgress * Math.PI;

        let y;
        if (x >= sunriseX && x <= sunsetX) {
            y = horizonY - Math.sin(rad) * curveRadiusY;
        } else if (x < sunriseX) {
            const extProgress = (sunriseX - x) / totalSpan;
            y = horizonY + Math.sin(extProgress * Math.PI * 0.5) * (curveRadiusY * 0.6);
        } else {
            const extProgress = (x - sunsetX) / totalSpan;
            y = horizonY + Math.sin(extProgress * Math.PI * 0.5) * (curveRadiusY * 0.6);
        }

        if (x === 15) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    let sunProgress = (currentHour - 6.0) / 11.83; 
    sunProgress = Math.max(0.0, Math.min(1.0, sunProgress));

    const sunX = sunriseX + sunProgress * (sunsetX - sunriseX);
    const sunRad = sunProgress * Math.PI;
    const sunY = horizonY - Math.sin(sunRad) * curveRadiusY;

    ctx.beginPath();
    ctx.arc(sunX, sunY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * (Math.PI / 180);
        const rx1 = sunX + Math.cos(angle) * 11;
        const ry1 = sunY + Math.sin(angle) * 11;
        const rx2 = sunX + Math.cos(angle) * 15;
        const ry2 = sunY + Math.sin(angle) * 15;

        ctx.beginPath();
        ctx.moveTo(rx1, ry1);
        ctx.lineTo(rx2, ry2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

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
        console.error("Gagal memuat data METAR WICC AWS:", err);
    } finally {
        if (icon) icon.classList.remove("spin-anim");
    }
}

function safeSetText(id, value, suffix = "") {
    const el = document.getElementById(id);
    if (el) {
        const newText = (value !== null && value !== undefined) ? `${value} ${suffix}`.trim() : `-- ${suffix}`.trim();
        if (el.textContent !== newText) {
            el.textContent = newText;
            el.classList.remove("value-update-anim");
            void el.offsetWidth;
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
    const r = data.runways || {};
    const dl = data.daylight || {};

    if (data.metadata) {
        safeSetText("raw-metar-text", data.metadata.raw_metar);
        safeSetText("raw-taf-text", data.metadata.raw_taf);
    }

    safeSetText("m-temp", t.temp_2m, "°C");
    safeSetText("m-dew", t.dew_point, "°C");
    safeSetText("m-rh", t.rh_2m, "%");
    safeSetText("m-press", t.msl_pressure, "hPa");
    safeSetText("m-surf-press", t.surface_pressure, "hPa");
    
    safeSetText("m-cloud-octa", c.cloud_cover_octa);

    safeSetText("sun-sunrise-val", dl.sunrise);
    safeSetText("sun-midday-val", dl.midday);
    safeSetText("sun-sunset-val", `${dl.sunset} (2:48h)`);

    safeSetText("rwy-cross-val", `${r.crosswind_kt} kt`);
    safeSetText("rwy-head-val", `${r.headwind_kt} kt`);
    safeSetText("rwy-pct-val", `${r.crosswind_pct} %`);

    safeSetText("tbl-temp-val", `${t.temp_2m} °C`);
    safeSetText("tbl-dew-val", `${t.dew_point} °C`);
    safeSetText("tbl-rh-val", `${t.rh_2m} %`);
    safeSetText("tbl-heat-val", `${t.heat_index} °C`);
    safeSetText("tbl-kp-val", t.kp_index);

    const barRh = document.getElementById("bar-rh");
    if (barRh && t.rh_2m !== undefined) barRh.style.width = `${t.rh_2m}%`;

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

    if (w.surface) {
        const windDirInput = document.getElementById("calc-wind-dir");
        const windSpdInput = document.getElementById("calc-wind-spd");
        if (windDirInput && windSpdInput) {
            windDirInput.value = w.surface.dir_deg;
            windSpdInput.value = w.surface.speed_kt;
            calculatePopUpCrosswind();
        }
    }

    const minData = data.minutely_15;
    if (minData) {
        updateWindRoseChart(minData);
        renderDaily00to24History(minData, data);
    }

    if (data.raw_daily_payload) {
        render2DayForecast(data.raw_daily_payload, data);
    }

    renderFlightPrepTable(data);
    drawDaylightCurve();
}

function render2DayForecast(daily, fullData) {
    const container = document.getElementById("daily-forecast-cards");
    if (!container || !daily.time) return;

    container.innerHTML = "";
    const dates = daily.time.slice(0, 2);

    dates.forEach((dStr, i) => {
        const dateObj = new Date(dStr);
        const dayLabel = i === 0 ? "Hari Ini" : "Esok Hari";
        const badgeText = i === 0 ? "OBSERVED REAL-TIME" : "FORECAST";
        
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
            <div class="card card-luxury shadow-sm rounded-4 overflow-hidden h-100">
                <div class="card-header bg-dark text-white p-4 border-bottom d-flex justify-content-between align-items-center">
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="badge ${categoryBadge} px-3 py-1 font-mono fs-6">${flightCategory}</span>
                            <span class="badge bg-info bg-opacity-25 text-info border border-info border-opacity-25 px-2 py-1 font-mono extra-small">${badgeText}</span>
                        </div>
                        <h4 class="fw-bold mb-0">${dayLabel}</h4>
                        <div class="small text-secondary font-mono mt-1">${formattedDate}</div>
                    </div>
                    <div class="text-end">
                        <i class="bi ${weatherIcon} display-4"></i>
                    </div>
                </div>

                <div class="card-body p-4">
                    <div class="d-flex align-items-baseline gap-3 mb-3">
                        <div class="display-5 fw-bold text-dark font-mono">${tempMax}</div>
                        <div class="fs-5 text-secondary font-mono">/ ${tempMin}</div>
                        <div class="ms-auto text-end text-secondary small fw-medium">${weatherText}</div>
                    </div>

                    <hr class="border-secondary border-opacity-25 my-3">

                    <div class="row g-3">
                        <div class="col-6">
                            <div class="p-3 sub-card-dark">
                                <div class="sub-card-label mb-1"><i class="bi bi-wind me-1 text-primary"></i>MAX WIND</div>
                                <div class="fs-5 sub-card-value">${windMaxKt} kt</div>
                                <div class="sub-card-desc font-mono">${domDirDeg}° (${domDirCompass})</div>
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="p-3 sub-card-dark">
                                <div class="sub-card-label mb-1"><i class="bi bi-arrow-up-right-circle me-1 text-danger"></i>MAX GUST</div>
                                <div class="fs-5 sub-card-value text-danger">${gustsMaxKt} kt</div>
                                <div class="sub-card-desc">Peak Surface Gust</div>
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="p-3 sub-card-dark">
                                <div class="sub-card-label mb-1"><i class="bi bi-compass me-1 text-warning"></i>EST. CROSSWIND</div>
                                <div class="fs-5 sub-card-value text-warning">${crosswindKt} kt</div>
                                <div class="sub-card-desc">Runway Component</div>
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="p-3 sub-card-dark">
                                <div class="sub-card-label mb-1"><i class="bi bi-droplet-half me-1 text-info"></i>PRECIPITATION</div>
                                <div class="fs-5 sub-card-value text-info">${precipSum} mm</div>
                                <div class="sub-card-desc">Total Harian</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

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

function renderFlightPrepTable(data) {
    const tbody = document.getElementById("flight-prep-table-body");
    if (!tbody) return;

    const t = data.thermodynamics || {};
    const w = data.wind_profile || {};
    const c = data.clouds_precipitation || {};

    const flightParams = [
        { name: "Raw METAR WICC", val: data.metadata ? data.metadata.raw_metar : '--', unit: "ICAO Standard", desc: "Observasi Mentah Cuaca Penerbangan WICC" },
        { name: "Raw TAF WICC", val: data.metadata ? data.metadata.raw_taf : '--', unit: "ICAO Standard", desc: "Prakiraan Mentah Aerodrom WICC" },
        { name: "Altimeter Setting (QNH)", val: t.msl_pressure, unit: "hPa", desc: "Tekanan Muka Laut Standar Penerbangan" },
        { name: "Station Pressure (QFE)", val: t.surface_pressure, unit: "hPa", desc: "Tekanan Muka Stasiun Aerodrom" },
        { name: "Suhu Udara (OAT 2m)", val: t.temp_2m, unit: "°C", desc: "Suhu Luar untuk Kalkulasi Performa Takeoff" },
        { name: "Dew Point Temperature", val: t.dew_point, unit: "°C", desc: "Penentu Spread Titik Embun & Kondisi Kabut" },
        { name: "Heat Index", val: t.heat_index, unit: "°C", desc: "Indeks Sensasi Suhu Terasa" },
        { name: "Surface Wind (33 ft)", val: w.surface ? `${w.surface.speed_kt} kt / ${w.surface.dir_deg}° (${w.surface.dir_compass})` : '--', unit: "Knots / Deg", desc: "Angin Permukaan Runway Husein (11/29)" },
        { name: "Total Cloud Cover", val: c.cloud_cover_octa, unit: "METAR Code", desc: "Tutupan & Tinggi Dasar Awan" }
    ];

    tbody.innerHTML = "";
    flightParams.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ps-4 fw-bold text-primary">${p.name}</td>
            <td><code class="px-2 py-1 bg-light text-dark rounded border fw-bold font-mono">${p.val !== undefined ? p.val : '--'}</code></td>
            <td class="text-secondary">${p.unit}</td>
            <td class="pe-4 small text-muted">${p.desc}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDaily00to24History(payload, fullData) {
    const tbody = document.getElementById("history-table-body");
    const dateHeader = document.getElementById("history-date-header");
    if (!tbody || !payload || !payload.time) return;

    const times = payload.time;
    const temps = payload.temperature_2m || [];
    const windSpeeds = payload.wind_speed_10m || [];
    const windDirs = payload.wind_direction_10m || [];

    const now = new Date();
    const todayISO = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const formattedDate = now.toLocaleDateString('en-US', { 
        timeZone: 'Asia/Jakarta', month: 'long', day: 'numeric', year: 'numeric' 
    });

    if (dateHeader) {
        dateHeader.textContent = `History - ${formattedDate}`;
    }

    const currentHHMM = now.toLocaleTimeString('id-ID', { 
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false 
    }).replace('.', ':');

    let logsMap = new Map();

    times.forEach((isoStr, i) => {
        if (!isoStr) return;

        const parts = isoStr.split("T");
        if (parts.length < 2) return;

        const datePart = parts[0];
        const timePart = parts[1].substring(0, 5);

        const minute = timePart.split(":")[1];
        if ((minute === "00" || minute === "30") && datePart === todayISO && timePart <= currentHHMM) {
            const spdKt = windSpeeds[i] !== undefined ? Math.round(windSpeeds[i] * 0.539957) : 6;
            const dirDeg = windDirs[i] !== undefined ? String(Math.round(windDirs[i])).padStart(3, '0') : "180";
            const tempVal = temps[i] !== undefined ? Math.round(temps[i]) : 31;

            // REVISI: Tampilan visibility ringkas & padat tanpa berlebihan
            logsMap.set(timePart, {
                timeKey: timePart,
                time: timePart,
                weather: '<i class="bi bi-cloud-sun-fill text-warning fs-5"></i>',
                temp: `${tempVal} °C`,
                visibility: '10 km',
                wind: `<i class="bi bi-arrow-down-right text-primary me-1"></i>${dirDeg}° &nbsp; ${spdKt} kt`
            });
        }
    });

    historyLogs = Array.from(logsMap.values()).sort((a, b) => b.timeKey.localeCompare(a.timeKey));
    renderHistoryTable();
}

function renderHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    if (!tbody) return;

    if (historyLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Memuat riwayat METAR WICC...</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    historyLogs.forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ps-4 font-mono text-primary fw-bold">${log.time}</td>
            <td class="text-center">${log.weather}</td>
            <td class="font-mono text-dark fw-bold">${log.temp}</td>
            <td class="font-mono text-secondary">${log.visibility}</td>
            <td class="pe-4 font-mono text-dark">${log.wind}</td>
        `;
        tbody.appendChild(tr);
    });
}

function exportHistoryCSV() {
    if (historyLogs.length === 0) return;
    let csv = "Time,Temp,Visibility,Wind\n";
    historyLogs.forEach(l => {
        const cleanWind = l.wind.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
        csv += `"${l.time}","${l.temp}","${l.visibility}","${cleanWind}"\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = `Aviation_AWS_BDO_History_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}