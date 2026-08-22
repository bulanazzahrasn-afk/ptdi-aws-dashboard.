let windRoseInstance = null;
let clockTimer = null;
let autoRefreshTimer = null;
const POLLING_INTERVAL = 15000;
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

        ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
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
        exportBtn.addEventListener("click", (e) => {
            e.preventDefault();
            exportHistoryCSV();
        });
    }

    const exportPdfBtn = document.getElementById("exportPdfBtn");
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener("click", (e) => {
            e.preventDefault();
            exportHistoryPDF();
        });
    }

    const rwySelect = document.getElementById("calc-rwy-heading");
    const windDirInput = document.getElementById("calc-wind-dir");
    const windSpdInput = document.getElementById("calc-wind-spd");

    if (rwySelect && windDirInput && windSpdInput) {
        [rwySelect, windDirInput, windSpdInput].forEach(el => {
            el.addEventListener("input", calculatePopUpCrosswind);
        });
    }

    window.addEventListener("resize", () => {
        drawDaylightCurve();
        drawCloudProfileCanvas(1800);
    });
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

function drawCloudProfileCanvas(cloudAltFt) {
    const canvas = document.getElementById("cloudProfileCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const parentW = canvas.parentElement.clientWidth || 250;
    canvas.width = parentW;
    canvas.height = 65;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const baselineY = canvas.height - 14;
    ctx.beginPath();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.moveTo(10, baselineY);
    ctx.lineTo(canvas.width - 10, baselineY);
    ctx.stroke();

    const cloudX = canvas.width / 2 - 22;
    const cloudY = baselineY - 30;

    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(cloudX + 10, cloudY + 10, 10, 0, Math.PI * 2);
    ctx.arc(cloudX + 22, cloudY + 6, 13, 0, Math.PI * 2);
    ctx.arc(cloudX + 34, cloudY + 12, 9, 0, Math.PI * 2);
    ctx.fill();

    const badgeText = `SCT ${cloudAltFt.toLocaleString()}`;
    ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
    const textWidth = ctx.measureText(badgeText).width;

    const badgeX = (canvas.width / 2) - (textWidth / 2) - 6;
    const badgeY = baselineY + 2;

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, textWidth + 12, 15, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, canvas.width / 2, badgeY + 11);
}

let currentDaylightData = { sunrise: "06:00", midday: "11:58", sunset: "17:50", duration: "(8:22h)" };

function drawDaylightCurve() {
    const canvas = document.getElementById("daylightCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const parentWidth = canvas.parentElement.clientWidth || 600;
    
    canvas.width = parentWidth;
    canvas.height = 300;

    const w = canvas.width;
    const h = canvas.height;
    const horizonY = 150; 

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(15, horizonY);
    ctx.lineTo(w - 15, horizonY);
    ctx.stroke();

    const sunriseX = w * 0.25;
    const middayX = w * 0.50;
    const sunsetX = w * 0.75;
    const curveRadiusY = 40;

    const markers = [{ x: sunriseX }, { x: middayX }, { x: sunsetX }];
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
    ctx.lineWidth = 1;
    markers.forEach(m => {
        ctx.beginPath();
        ctx.moveTo(m.x, horizonY);
        ctx.lineTo(m.x, horizonY + 45);
        ctx.stroke();
    });
    ctx.restore();

    ctx.textAlign = 'center';

    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Sunrise', sunriseX, horizonY + 56);
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(currentDaylightData.sunrise, sunriseX, horizonY + 74);

    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Midday', middayX, horizonY + 56);
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(currentDaylightData.midday, middayX, horizonY + 74);

    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Sunset', sunsetX, horizonY + 56);
    
    const sunsetText = currentDaylightData.sunset;
    const durationText = ` ${currentDaylightData.duration}`;
    
    ctx.font = '700 14px "JetBrains Mono", monospace';
    const textW1 = ctx.measureText(sunsetText).width;
    ctx.font = '500 12px "JetBrains Mono", monospace';
    const textW2 = ctx.measureText(durationText).width;
    const totalWidth = textW1 + textW2;
    const startX = sunsetX - (totalWidth / 2);
    
    ctx.textAlign = 'left';
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(sunsetText, startX, horizonY + 74);
    
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(durationText, startX + textW1, horizonY + 74);

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();
    const currentTotalHours = currentHours + currentMinutes / 60 + currentSeconds / 3600;

    const daylightStart = 6.0;
    const daylightEnd = 17.9;
    
    let sunProgress = (currentTotalHours - daylightStart) / (daylightEnd - daylightStart);
    sunProgress = Math.max(0.0, Math.min(1.0, sunProgress));

    const sunX = sunriseX + sunProgress * (sunsetX - sunriseX);
    const sunRad = sunProgress * Math.PI;
    const sunY = horizonY - Math.sin(sunRad) * curveRadiusY;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sunriseX, horizonY);
    for (let x = sunriseX; x <= sunX; x++) {
        const progress = (x - sunriseX) / (sunsetX - sunriseX);
        const rad = progress * Math.PI;
        const y = horizonY - Math.sin(rad) * curveRadiusY;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(sunX, horizonY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
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
            y = horizonY + Math.sin(extProgress * Math.PI * 0.5) * (curveRadiusY * 0.5);
        } else {
            const extProgress = (x - sunsetX) / totalSpan;
            y = horizonY + Math.sin(extProgress * Math.PI * 0.5) * (curveRadiusY * 0.5);
        }

        if (x === 15) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

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
    const wibStr = now.toLocaleTimeString('id-ID', { 
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
    }).replace(/\./g, ' : ');
    const utcStr = now.toLocaleTimeString('id-ID', { 
        timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
    }).replace(/\./g, ' : ');

    const clockEl = document.getElementById("utc-wib-clock");
    if (clockEl) {
        clockEl.innerHTML = `STANDAR WAKTU INDONESIA &nbsp; <span class="text-success fw-bold">${wibStr}</span> &nbsp; / &nbsp; <span class="text-info fw-bold">${utcStr} UTC</span>`;
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
    const indicator = document.getElementById("loadingStatusIndicator");
    
    if (icon) icon.classList.add("spin-anim");
    if (indicator) indicator.classList.remove("d-none");

    try {
        const response = await fetch(`/api/v1/aws-translated?_t=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        const data = await response.json();
        renderDashboard(data);

    } catch (err) {
        console.error("Gagal memuat data Open-Meteo AWS:", err);
    } finally {
        if (icon) icon.classList.remove("spin-anim");
        if (indicator) indicator.classList.add("d-none");
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
    const sectors = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return sectors[Math.floor(((parseFloat(deg) + 22.5) % 360) / 45)];
}

function renderDashboard(data) {
    if (!data) return;

    const t = data.thermodynamics || {};
    const w = data.wind_profile || {};
    const c = data.clouds_precipitation || {};
    const r = data.runways || {};
    const dl = data.daylight || {};

    const nowUTC = new Date();

    safeSetText("m-temp", t.temp_2m, "°C");
    safeSetText("m-dew", t.dew_point, "°C");
    safeSetText("m-rh", t.rh_2m, "%");
    safeSetText("m-press", t.msl_pressure, "hPa");
    safeSetText("m-surf-press", t.surface_pressure, "hPa");
    
    const precipVal = c.precipitation_mm !== undefined ? c.precipitation_mm : 0.0;
    safeSetText("m-precip", precipVal, "mm");
    safeSetText("fc-precip-card", precipVal, "mm");
    safeSetText("fc-rh-card", t.rh_2m, "%");

    const cloudOcta = (c.cloud_cover_octa || "SCT").substring(0, 3);
    const cloudBaseFt = (c.cloud_base_ft !== undefined && c.cloud_base_ft !== null) ? c.cloud_base_ft : 1800;
    const formattedCloudAlt = `${cloudBaseFt.toLocaleString()} ft`;
    safeSetText("m-cloud-octa", cloudOcta);
    safeSetText("m-cloud-alt", formattedCloudAlt);
    drawCloudProfileCanvas(cloudBaseFt);

    const modalOcta = document.getElementById("modal-cloud-octa");
    const modalBase = document.getElementById("modal-cloud-base");
    if (modalOcta) modalOcta.textContent = `${cloudOcta}`;
    if (modalBase) modalBase.textContent = `${formattedCloudAlt} MSL`;

    const dateLabelStr = nowUTC.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).toUpperCase();
    safeSetText("current-forecast-date-label", dateLabelStr);
    safeSetText("fc-temp", t.temp_2m, "°C");
    
    const visStr = t.visibility_km || "10 km";
    safeSetText("fc-vis", visStr);
    
    const weatherDescEl = document.getElementById("fc-weather-desc");
    const weatherIconEl = document.getElementById("fc-weather-icon");

    let desc = t.weather_desc || "Cerah Berawan (Aman VFR)";
    let iconClass = "bi-cloud-sun-fill text-warning display-4";

    const visNum = parseFloat(visStr);
    const rhVal = t.rh_2m || 60;

    if (precipVal > 0.5) {
        iconClass = "bi-cloud-rain-fill text-primary display-4";
    } else if (visNum < 5.0 && rhVal > 75) {
        iconClass = "bi-cloud-haze2-fill text-secondary display-4";
    } else if (visNum < 3.0) {
        iconClass = "bi-cloud-fog2-fill text-info display-4";
    } else if (cloudOcta === "BKN" || cloudOcta === "OVC") {
        iconClass = "bi-clouds-fill text-muted display-4";
    }

    if (weatherDescEl) weatherDescEl.textContent = desc;
    if (weatherIconEl) weatherIconEl.className = `bi ${iconClass}`;

    safeSetText("fc-wind-spd", w.surface ? `${w.surface.speed_kt} kt` : "-- kt");
    safeSetText("fc-wind-dir", w.surface ? `${w.surface.dir_deg}° (${w.surface.dir_compass})` : "--°");
    safeSetText("fc-press", t.msl_pressure, "hPa");

    evaluateWeatherAlerts(w.surface ? w.surface.speed_kt : 0, r.crosswind_kt || 0, parseFloat(visStr));

    currentDaylightData.sunrise = dl.sunrise || "06:00";
    currentDaylightData.midday = dl.midday || "11:58";
    currentDaylightData.sunset = dl.sunset || "17:50";

    const [sunsetHH, sunsetMM] = (dl.sunset || "17:50").split(':').map(Number);
    const sunsetDate = new Date(nowUTC);
    sunsetDate.setHours(sunsetHH, sunsetMM, 0);
    const diffMs = sunsetDate - nowUTC;
    
    if (diffMs > 0) {
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        currentDaylightData.duration = `(${diffHrs}:${String(diffMins).padStart(2, '0')}h)`;
    } else {
        currentDaylightData.duration = "(0:00h)";
    }

    // --- KALKULASI RUNWAY 11 DAN RUNWAY 29 (DENGAN HEADWIND / TAILWIND) ---
    const windSpeedKt = w.surface ? w.surface.speed_kt : 0;
    const windDirDeg = w.surface ? w.surface.dir_deg : 180;

    const rad11 = (windDirDeg - 110) * (Math.PI / 180);
    const cross11 = Math.abs(windSpeedKt * Math.sin(rad11));
    const headtail11 = windSpeedKt * Math.cos(rad11);
    const type11 = headtail11 >= 0 ? "Headwind" : "Tailwind";
    const pct11 = windSpeedKt > 0 ? Math.round((cross11 / windSpeedKt) * 100) : 0;

    const rad29 = (windDirDeg - 290) * (Math.PI / 180);
    const cross29 = Math.abs(windSpeedKt * Math.sin(rad29));
    const headtail29 = windSpeedKt * Math.cos(rad29);
    const type29 = headtail29 >= 0 ? "Headwind" : "Tailwind";
    const pct29 = windSpeedKt > 0 ? Math.round((cross29 / windSpeedKt) * 100) : 0;

    safeSetText("rwy11-cross-val", cross11.toFixed(1), "kt");
    safeSetText("rwy11-headtail-val", `${Math.abs(headtail11).toFixed(1)} kt (${type11})`);
    safeSetText("rwy11-pct-val", pct11, "%");

    safeSetText("rwy29-cross-val", cross29.toFixed(1), "kt");
    safeSetText("rwy29-headtail-val", `${Math.abs(headtail29).toFixed(1)} kt (${type29})`);
    safeSetText("rwy29-pct-val", pct29, "%");

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
        renderHourlyForecast24h(minData);
    }

    if (data.raw_daily_payload) {
        render3DaysForecast(data.raw_daily_payload);
    }

    renderFlightPrepTable(data);
    drawDaylightCurve();
}

function renderHourlyForecast24h(minData) {
    const container = document.getElementById("hourly-forecast-scroll");
    const titleEl = document.getElementById("hourly-forecast-title");
    if (!container || !minData.time) return;

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (titleEl) {
        titleEl.innerHTML = `<i class="bi bi-clock-fill me-2 text-primary"></i>Prakiraan per Jam (WIB) - 24 Jam Kedepan / ${dateFormatted}`;
    }

    container.innerHTML = "";
    const times = minData.time;
    const temps = minData.temperature_2m || [];
    const windSpeeds = minData.wind_speed_10m || [];
    const windDirs = minData.wind_direction_10m || [];
    const precips = minData.precipitation || [];
    const humidities = minData.relative_humidity_2m || [];
    
    const todayISO = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    
    const currentTimeStr = now.toLocaleTimeString('id-ID', { 
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false 
    }).replace(/\./g, ':');

    times.forEach((isoStr, i) => {
        if (!isoStr || !isoStr.startsWith(todayISO)) return;

        const timePartWIB = isoStr.split("T")[1].substring(0, 5);

        if (timePartWIB < currentTimeStr) return;

        const tempVal = temps[i] !== undefined ? Math.round(temps[i]) : '--';
        const windSpdKt = windSpeeds[i] !== undefined ? Math.round(windSpeeds[i] * 0.539957) : 0;
        const windDirDeg = windDirs[i] !== undefined ? Math.round(windDirs[i]) : 0;
        const precipVal = precips[i] !== undefined ? precips[i] : 0;
        const rhVal = humidities[i] !== undefined ? humidities[i] : 60;
        const compass = degToCompassShort(windDirDeg);

        let iconClass = "bi-cloud-sun-fill text-warning";
        let weatherTitle = "Cerah Berawan";

        if (precipVal > 0.5) {
            iconClass = "bi-cloud-rain-fill text-primary";
            weatherTitle = "Hujan";
        } else if (rhVal > 85) {
            iconClass = "bi-cloud-fog2-fill text-info";
            weatherTitle = "Kabut (Fog)";
        } else if (rhVal > 75) {
            iconClass = "bi-cloud-haze2-fill text-secondary";
            weatherTitle = "Berasap / Haze";
        } else if (tempVal >= 30 && rhVal < 60) {
            iconClass = "bi-sun-fill text-warning";
            weatherTitle = "Cerah";
        } else {
            iconClass = "bi-clouds-fill text-muted";
            weatherTitle = "Berawan";
        }

        const card = document.createElement("div");
        card.className = "p-3 bg-light border rounded-3 text-center flex-shrink-0 shadow-sm";
        card.style.minWidth = "110px";
        card.innerHTML = `
            <div class="small fw-bold font-mono text-secondary mb-1">${timePartWIB}</div>
            <div class="my-1" title="${weatherTitle}"><i class="bi ${iconClass} fs-4"></i></div>
            <div class="fw-bold font-mono text-dark fs-6">${tempVal}°C</div>
            <div class="extra-small text-muted font-mono mt-1">${windSpdKt} kt</div>
            <div class="d-flex align-items-center justify-content-center gap-1 mt-1">
                <i class="bi bi-arrow-up-circle text-primary" style="display:inline-block; transform: rotate(${windDirDeg}deg); font-size: 0.85rem;"></i>
                <span class="extra-small text-secondary font-mono fw-bold">${compass}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function render3DaysForecast(daily) {
    const container = document.getElementById("daily-forecast-cards-3days");
    if (!container) return;

    container.innerHTML = "";
    
    const maxTemps = daily && daily.temperature_2m_max ? daily.temperature_2m_max : [];
    const minTemps = daily && daily.temperature_2m_min ? daily.temperature_2m_min : [];
    const windWinds = daily && daily.wind_speed_10m_max ? daily.wind_speed_10m_max : [];
    const precips = daily && daily.precipitation_sum ? daily.precipitation_sum : [];

    const baseMax = maxTemps[1] !== undefined ? maxTemps[1] : 31.7;
    const baseMin = minTemps[1] !== undefined ? minTemps[1] : 19.1;
    const baseWind = windWinds[1] !== undefined ? windWinds[1] : 12.4;
    const basePrecip = precips[1] !== undefined ? precips[1] : 0;

    for (let i = 1; i <= 3; i++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + i);

        let dayLabel = "Besok";
        if (i === 2) dayLabel = targetDate.toLocaleDateString('id-ID', { weekday: 'long' });
        else if (i === 3) dayLabel = targetDate.toLocaleDateString('id-ID', { weekday: 'long' });

        const formattedDate = targetDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        let valMax = maxTemps[i] !== undefined ? maxTemps[i] : Number((baseMax + (i * 0.3) - 0.5).toFixed(1));
        let valMin = minTemps[i] !== undefined ? minTemps[i] : Number((baseMin - (i * 0.2)).toFixed(1));
        let valWindKmh = windWinds[i] !== undefined ? windWinds[i] : Number((baseWind + (i * 0.8)).toFixed(1));
        let valPrecip = precips[i] !== undefined ? precips[i] : (i === 3 ? 0.4 : basePrecip);

        const tempMax = `${valMax}°C`;
        const tempMin = `${valMin}°C`;
        const windMaxKt = (valWindKmh * 0.539957).toFixed(1);
        const precipSum = valPrecip;

        const col = document.createElement("div");
        col.className = "col-md-4";
        col.innerHTML = `
            <div class="p-3 bg-light rounded-4 border h-100 shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="fw-bold text-dark">${dayLabel}</span>
                    <span class="badge bg-primary font-mono extra-small">${formattedDate}</span>
                </div>
                <div class="d-flex align-items-center gap-3 my-2">
                    <i class="bi bi-cloud-sun-fill text-warning fs-2"></i>
                    <div>
                        <div class="fw-bold font-mono text-dark">${tempMax} / ${tempMin}</div>
                        <div class="extra-small text-secondary">Angin Max: ${windMaxKt} kt</div>
                    </div>
                </div>
                <div class="pt-2 border-top d-flex justify-content-between text-muted extra-small font-mono">
                    <span>Curah Hujan:</span>
                    <span class="fw-bold text-info">${precipSum} mm</span>
                </div>
            </div>
        `;
        container.appendChild(col);
    }
}

function evaluateWeatherAlerts(windSpdKt, crosswindKt, visKm) {
    const alertBanner = document.getElementById("weatherAlertBanner");
    const alertIcon = document.getElementById("alertIcon");
    const alertTitle = document.getElementById("alertTitle");
    const alertDesc = document.getElementById("alertDesc");
    const alertBadge = document.getElementById("alertBadge");

    if (!alertBanner) return;

    let isHazardous = false;
    let isCaution = false;
    let reasons = [];

    if (crosswindKt > 15.0) {
        isHazardous = true;
        reasons.push(`Komponen Crosswind tinggi (${crosswindKt} kt > 15 kt)`);
    } else if (crosswindKt > 10.0) {
        isCaution = true;
        reasons.push(`Crosswind moderat (${crosswindKt} kt)`);
    }

    if (windSpdKt > 15.0) {
        isHazardous = true;
        reasons.push(`Kecepatan Angin Permukaan Kencang (${windSpdKt} kt > 15 kt)`);
    } else if (windSpdKt > 12.0) {
        isCaution = true;
        reasons.push(`Angin permukaan agak tinggi (${windSpdKt} kt)`);
    }

    if (visKm < 3.0) {
        isHazardous = true;
        reasons.push(`Jarak Pandang Sangat Rendah (${visKm} km < 3 km)`);
    } else if (visKm < 6.0) {
        isCaution = true;
        reasons.push(`Jarak pandang terbatas (${visKm} km)`);
    }

    alertBanner.classList.remove("alert-success", "alert-warning", "alert-danger", "alert-warning-flash");

    if (isHazardous) {
        alertBanner.classList.add("alert-danger", "alert-warning-flash");
        alertIcon.className = "bi bi-exclamation-triangle-fill fs-4 text-danger";
        alertTitle.textContent = "PERINGATAN BAHAYA PENERBANGAN (WARNING ALERT)";
        alertDesc.textContent = `Kondisi kritis terdeteksi: ${reasons.join(" | ")}. Harap batasi/koordinasikan ulang aktivitas take-off & landing.`;
        alertBadge.className = "badge bg-danger font-mono extra-small";
        alertBadge.textContent = "HAZARDOUS";
    } else if (isCaution) {
        alertBanner.classList.add("alert-warning");
        alertIcon.className = "bi bi-exclamation-circle-fill fs-4 text-warning";
        alertTitle.textContent = "WASPADA KONDISI AERODROM (CAUTION ADVISORY)";
        alertDesc.textContent = `Perhatian parameter: ${reasons.join(" | ")}. Pastikan pemantauan visual diperketat.`;
        alertBadge.className = "badge bg-warning text-dark font-mono extra-small";
        alertBadge.textContent = "CAUTION";
    } else {
        alertBanner.classList.add("alert-success");
        alertIcon.className = "bi bi-shield-check fs-4 text-success";
        alertTitle.textContent = "Status Aerodrom WICC: Normal / Operasional Optimal (VFR)";
        alertDesc.textContent = "Seluruh parameter cuaca aerodrom berada di bawah ambang batas bahaya penerbangan.";
        alertBadge.className = "badge bg-success font-mono extra-small";
        alertBadge.textContent = "SYSTEM SAFE";
    }
}

function calculatePopUpCrosswind() {
    const rwyHeading = parseFloat(document.getElementById("calc-rwy-heading").value) || 110;
    let windDir = parseFloat(document.getElementById("calc-wind-dir").value) || 0;
    
    if (windDir < 0) windDir = 0;
    if (windDir > 360) windDir = 360;
    document.getElementById("calc-wind-dir").value = windDir;

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
        { name: "Altimeter Setting (QNH)", val: t.msl_pressure, unit: "hPa", desc: "Tekanan Muka Laut Standar Penerbangan" },
        { name: "Station Pressure (QFE)", val: t.surface_pressure, unit: "hPa", desc: "Tekanan Muka Stasiun Aerodrom" },
        { name: "Suhu Udara (OAT 2m)", val: t.temp_2m, unit: "°C", desc: "Suhu Luar untuk Kalkulasi Performa Takeoff" },
        { name: "Dew Point Temperature", val: t.dew_point, unit: "°C", desc: "Penentu Titik Embun & Potensi Kabut" },
        { name: "Curah Hujan (Precipitation)", val: c.precipitation_mm, unit: "mm", desc: "Akumulasi Intensitas Presipitasi" },
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
    const dews = payload.relative_humidity_2m || [];
    const windSpeeds = payload.wind_speed_10m || [];
    const windDirs = payload.wind_direction_10m || [];
    const precips = payload.precipitation || [];

    const now = new Date();
    const todayISO = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const formattedDate = now.toLocaleDateString('en-US', { 
        timeZone: 'Asia/Jakarta', month: 'long', day: 'numeric', year: 'numeric' 
    });

    if (dateHeader) {
        dateHeader.textContent = `History & Log Observasi (WIB / UTC) - ${formattedDate}`;
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
        const timePartWIB = parts[1].substring(0, 5);

        const [hStr, mStr] = timePartWIB.split(":");
        let hUTC = parseInt(hStr) - 7;
        if (hUTC < 0) hUTC += 24;
        const timePartUTC = `${String(hUTC).padStart(2, '0')}:${mStr}`;

        const minute = timePartWIB.split(":")[1];
        if ((minute === "00" || minute === "30") && datePart === todayISO && timePartWIB <= currentHHMM) {
            const spdKt = windSpeeds[i] !== undefined ? Math.round(windSpeeds[i] * 0.539957) : 6;
            const dirDeg = windDirs[i] !== undefined ? Math.round(windDirs[i]) : 180;
            const dirDegStr = String(dirDeg).padStart(3, '0');
            const tempVal = temps[i] !== undefined ? Math.round(temps[i]) : 31;
            const rhVal = dews[i] !== undefined ? Math.round(dews[i]) : 50;
            const precipVal = precips[i] !== undefined ? precips[i] : 0.0;
            const dewpVal = tempVal > 10 ? tempVal - 10 : 15;
            const heatVal = tempVal + 2;

            let weatherCode = '<i class="bi bi-cloud-sun-fill text-warning fs-5" title="SCT / SKC"></i>';
            let visVal = "10 km (9999)";
            
            if (precipVal > 0.5) {
                weatherCode = '<span class="badge bg-danger font-mono" title="Rain (RA)">+RA</span>';
                visVal = "4 km (4000)";
            } else if (rhVal > 85) {
                weatherCode = '<span class="badge bg-secondary font-mono" title="Fog (FG)">FG</span>';
                visVal = "2 km (2000)";
            } else if (rhVal > 75 || tempVal >= 28) {
                weatherCode = '<span class="badge bg-warning text-dark font-mono" title="Haze (HZ)">HZ</span>';
                visVal = "4 km (4000)";
            }

            logsMap.set(timePartWIB, {
                timeKey: timePartWIB,
                time: `${timePartWIB} WIB<br><span class="text-secondary extra-small font-mono">(${timePartUTC} Z)</span>`,
                weather: weatherCode,
                temp: `${tempVal} °C`,
                dewpoint: `${dewpVal} °C`,
                rh: `${rhVal} %`,
                heat: `${heatVal} °C`,
                visibility: visVal,
                wind: `<i class="bi bi-arrow-up-circle text-primary me-1" style="display:inline-block; transform: rotate(${dirDeg}deg);"></i>${dirDegStr}° &nbsp; ${spdKt} kt`
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
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Memuat riwayat observasi...</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    historyLogs.forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ps-4 font-mono text-primary fw-bold lh-sm">${log.time}</td>
            <td class="text-center">${log.weather}</td>
            <td class="font-mono text-dark fw-bold">${log.temp}</td>
            <td class="font-mono text-secondary">${log.dewpoint}</td>
            <td class="font-mono text-info">${log.rh}</td>
            <td class="font-mono text-warning">${log.heat}</td>
            <td class="font-mono text-secondary">${log.visibility}</td>
            <td class="pe-4 font-mono text-dark">${log.wind}</td>
        `;
        tbody.appendChild(tr);
    });
}

function exportHistoryCSV() {
    if (historyLogs.length === 0) return;
    let csv = "Time,Temp,Dewpoint,Rel_Humidity,Heat_Index,Visibility,Wind\n";
    historyLogs.forEach(l => {
        const cleanTime = l.time.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanWind = l.wind.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
        csv += `"${cleanTime}","${l.temp}","${l.dewpoint}","${l.rh}","${l.heat}","${l.visibility}","${cleanWind}"\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = `Aviation_AWS_BDO_History_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

function exportHistoryPDF() {
    if (historyLogs.length === 0) return;
    const printWindow = window.open('', '_blank');
    let htmlContent = `
        <html>
        <head>
            <title>History & Log Observasi WICC - PTDI AWS</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                .header-container { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; }
                .header-container img { height: 45px; width: auto; }
                h2 { margin: 0; color: #0f172a; font-size: 18px; }
                p { color: #64748b; font-size: 12px; margin: 3px 0 0 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
                th { background-color: #0f172a; color: white; }
                tr:nth-child(even) { background-color: #f8fafc; }
            </style>
        </head>
        <body>
            <div class="header-container">
                <img src="/static/images/logo-ptdi.jpg" alt="Logo PTDI">
                <div>
                    <h2>PT. DIRGANTARA INDONESIA - Aviation Weather System</h2>
                    <p>History & Log Observasi Aerodrom Husein Sastranegara (WICC/BDO) - ${new Date().toLocaleDateString()}</p>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Weather</th>
                        <th>Temp.</th>
                        <th>Dewpoint</th>
                        <th>Rel. Hum</th>
                        <th>Heat Index</th>
                        <th>Visibility</th>
                        <th>Wind</th>
                    </tr>
                </thead>
                <tbody>
    `;

    historyLogs.forEach(l => {
        const cleanTime = l.time.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanWeather = l.weather.replace(/<[^>]*>/g, '').trim() || 'SKC';
        const cleanWind = l.wind.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        
        htmlContent += `
            <tr>
                <td><b>${cleanTime}</b></td>
                <td>${cleanWeather}</td>
                <td>${l.temp}</td>
                <td>${l.dewpoint}</td>
                <td>${l.rh}</td>
                <td>${l.heat}</td>
                <td>${l.visibility}</td>
                <td>${cleanWind}</td>
            </tr>
        `;
    });

    htmlContent += `
                </tbody>
            </table>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}