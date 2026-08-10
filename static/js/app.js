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
    canvas.height = 150;

    const w = canvas.width;
    const h = canvas.height;
    const horizonY = 25; 

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
        clockEl.innerHTML = `WIB <span class="text-success fw-bold">${wibStr}</span> / UTC <span class="text-info fw-bold">${utcStr}</span>`;
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

function safeSetText(id, value, suffix = "") {
    const el = document.getElementById(id);
    if (el) {
        const newText = (value !== null && value !== undefined) ? `${value} ${suffix}`.trim() : `-- ${suffix}`.trim();
        if (el.textContent !== newText) {
            el.textContent = newText;
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
    const day = String(nowUTC.getUTCDate()).padStart(2, '0');
    const hour = String(nowUTC.getUTCHours()).padStart(2, '0');
    const minute = nowUTC.getUTCMinutes();
    
    let currentMinSlot = minute >= 30 ? "30" : "00";
    let prevMinSlot = minute >= 30 ? "00" : "30";
    let prevHourNum = minute >= 30 ? Number(hour) : Number(hour) - 1;
    let prevDay = day;

    if (prevHourNum < 0) {
        prevHourNum += 24;
        prevDay = String(Number(day) - 1).padStart(2, '0');
    }
    let prevHourStr = String(prevHourNum).padStart(2, '0');

    const windDir = w.surface ? String(Math.round(w.surface.dir_deg)).padStart(3, '0') : "120";
    const windSpd = w.surface ? String(Math.round(w.surface.speed_kt)).padStart(2, '0') : "05";
    const windStr = `${windDir}${windSpd}KT`;

    const visKm = parseFloat(t.visibility_km || 10);
    const visMeters = visKm >= 10 ? "9999" : String(Math.round(visKm * 1000)).padStart(4, '0');

    const tempVal = Math.round(t.temp_2m || 26);
    const dewVal = Math.round(t.dew_point || 23);
    const tempDewStr = `${String(tempVal).padStart(2, '0')}/${String(dewVal).padStart(2, '0')}`;

    const qnhVal = Math.round(t.msl_pressure || 1018);
    const qnhStr = `Q${qnhVal}`;

    let wxStr = "";
    const rh = t.rh_2m || 75;
    if (visKm < 6.0) wxStr = "HZ ";
    else if (c.precipitation_mm > 0.5) wxStr = "RA ";

    // Standar ICAO & BMKG: Okta Tutupan Awan + Ketinggian (Contoh: SCT018, FEW018) - TANPA PECAHAN
    const cloudOcta = c.cloud_cover_octa || "SCT";
    const cloudBaseFt = (c.cloud_base_ft !== undefined && c.cloud_base_ft !== null) ? c.cloud_base_ft : 1800;
    const cloudCode = `${cloudOcta}${String(Math.round(cloudBaseFt / 100)).padStart(3, '0')}`;

    let currentMetarTime = `${hour}${currentMinSlot}`;
    let prevMetarTime = `${prevHourStr}${prevMinSlot}`;

    // FORMAT METAR SESUAI STANDAR ICAO/BMKG (BERSIH TANPA PECAHAN)
    let metarLatest = `SAID40 WICC ${day}${currentMetarTime}\nMETAR WICC ${day}${currentMetarTime}Z ${windStr} ${visMeters} ${wxStr}${cloudCode} ${tempDewStr} ${qnhStr} NOSIG=`;
    let metarPrev = `SAID40 WICC ${prevDay}${prevMetarTime}\nMETAR WICC ${prevDay}${prevMetarTime}Z ${windStr} ${visMeters} ${wxStr}${cloudCode} ${tempDewStr} ${qnhStr} NOSIG=`;

    const combinedMetar = `${metarLatest}\n\n${metarPrev}`;
    
    // FORMAT TAF SESUAI STANDAR ICAO/BMKG (BERSIH TANPA PECAHAN)
    let nextDayNum = String(Number(day) + 1).padStart(2, '0');
    let tafPeriod = `${day}${hour}/${nextDayNum}${hour}`;
    let changeHour1 = String((Number(hour) + 2) % 24).padStart(2, '0');
    let changeHour2 = String((Number(hour) + 4) % 24).padStart(2, '0');
    let changeHour3 = String((Number(hour) + 10) % 24).padStart(2, '0');
    let changeHour4 = String((Number(hour) + 12) % 24).padStart(2, '0');

    const tafHeader = `FTID40 WICC ${day}${hour}00`;
    const tafString = `${tafHeader}\nTAF WICC ${day}${hour}00Z ${tafPeriod} ${windStr} ${visMeters} ${wxStr}${cloudCode} BECMG ${day}${changeHour1}/${day}${changeHour2} 13012KT 8000 FEW018 BECMG ${day}${changeHour3}/${day}${changeHour4} 29007KT 6000=`;

    safeSetText("raw-metar-text", combinedMetar);
    safeSetText("raw-taf-text", tafString);

    safeSetText("m-temp", t.temp_2m, "°C");
    safeSetText("m-dew", t.dew_point, "°C");
    safeSetText("m-rh", t.rh_2m, "%");
    safeSetText("m-press", t.msl_pressure, "hPa");
    safeSetText("m-surf-press", t.surface_pressure, "hPa");

    const dateLabelStr = nowUTC.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).toUpperCase();
    safeSetText("current-forecast-date-label", dateLabelStr);
    safeSetText("fc-temp", t.temp_2m, "°C");
    safeSetText("fc-vis", t.visibility_km ? `${t.visibility_km} km` : "10 km");
    safeSetText("fc-wind-spd", w.surface ? `${w.surface.speed_kt} kt` : "-- kt");
    safeSetText("fc-wind-dir", w.surface ? `${w.surface.dir_deg}° (${w.surface.dir_compass})` : "--°");
    safeSetText("fc-press", t.msl_pressure, "hPa");

    const minData = data.minutely_15;
    if (minData) {
        renderHourlyForecast24h(minData);
    }

    if (data.raw_daily_payload) {
        render3DaysForecast(data.raw_daily_payload);
    }
}

function renderHourlyForecast24h(minData) {
    const container = document.getElementById("hourly-forecast-scroll");
    const titleEl = document.getElementById("hourly-forecast-title");
    if (!container || !minData.time) return;

    container.innerHTML = "";
    const times = minData.time;
    const temps = minData.temperature_2m || [];
    const windSpeeds = minData.wind_speed_10m || [];
    const windDirs = minData.wind_direction_10m || [];
    const now = new Date();
    const todayISO = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    times.forEach((isoStr, i) => {
        if (!isoStr || !isoStr.startsWith(todayISO)) return;

        const timePartWIB = isoStr.split("T")[1].substring(0, 5);
        const tempVal = temps[i] !== undefined ? Math.round(temps[i]) : '--';
        const windSpdKt = windSpeeds[i] !== undefined ? Math.round(windSpeeds[i] * 0.539957) : 0;
        const windDirDeg = windDirs[i] !== undefined ? Math.round(windDirs[i]) : 0;
        const compass = degToCompassShort(windDirDeg);

        const card = document.createElement("div");
        card.className = "p-3 bg-light border rounded-3 text-center flex-shrink-0 shadow-sm";
        card.style.minWidth = "110px";
        card.innerHTML = `
            <div class="small fw-bold font-mono text-secondary mb-1">${timePartWIB}</div>
            <div class="my-1"><i class="bi bi-cloud-haze2-fill text-secondary fs-4"></i></div>
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
    if (!container || !daily.time) return;

    container.innerHTML = "";
    for (let i = 1; i <= 3 && i < daily.time.length; i++) {
        const dateObj = new Date(daily.time[i]);
        let dayLabel = i === 1 ? "Besok" : (i === 2 ? "Lusa" : dateObj.toLocaleDateString('id-ID', { weekday: 'long' }));
        const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        const tempMax = daily.temperature_2m_max[i] !== undefined ? `${daily.temperature_2m_max[i]}°C` : '--';
        const tempMin = daily.temperature_2m_min[i] !== undefined ? `${daily.temperature_2m_min[i]}°C` : '--';
        const windMaxKmh = daily.wind_speed_10m_max[i] || 0;
        const windMaxKt = (windMaxKmh * 0.539957).toFixed(1);
        const precipSum = daily.precipitation_sum[i] !== undefined ? daily.precipitation_sum[i] : 0;

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