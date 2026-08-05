let clockTimer = null;
let autoRefreshTimer = null;
const POLLING_INTERVAL = 30000;
let historyLogs = [];

let currentWindDir = 180;
let currentWindSpd = 6.0;
let currentCrosswind = 5.6;

document.addEventListener("DOMContentLoaded", () => {
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
            setTimeout(() => {
                drawDaylightCurve();
                drawAviationCompass(currentWindDir);
                drawSpeedometer(currentWindSpd);
            }, 300);
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

    window.addEventListener("resize", () => {
        drawDaylightCurve();
        drawAviationCompass(currentWindDir);
        drawSpeedometer(currentWindSpd);
    });

    startAutoRefresh();
});

// FUNGSI 1: RENDER AVIATION COMPASS DIAL (KIRI)
function drawAviationCompass(windDirDeg) {
    const canvas = document.getElementById("compassCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const parentWidth = canvas.parentElement.clientWidth || 280;
    
    canvas.width = parentWidth;
    canvas.height = 280;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 25;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Outer Ring Marks (Tick Marks 360 Deg)
    ctx.save();
    ctx.translate(cx, cy);

    for (let deg = 0; deg < 360; deg += 5) {
        const rad = (deg - 90) * (Math.PI / 180);
        const isMajor = deg % 30 === 0;
        const tickLength = isMajor ? 10 : 5;

        const x1 = Math.cos(rad) * (radius - tickLength);
        const y1 = Math.sin(rad) * (radius - tickLength);
        const x2 = Math.cos(rad) * radius;
        const y2 = Math.sin(rad) * radius;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isMajor ? 1.8 : 1;
        ctx.stroke();

        // Direction / Heading Labels
        if (isMajor) {
            let label = (deg / 10).toString();
            if (deg === 0) label = "N";
            else if (deg === 90) label = "E";
            else if (deg === 180) label = "S";
            else if (deg === 270) label = "W";
            else if (deg < 100) label = "0" + label;

            const textX = Math.cos(rad) * (radius - 22);
            const textY = Math.sin(rad) * (radius - 22);

            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, textX, textY);
        }
    }
    ctx.restore();

    // 2. Runway 11/29 Strip Overlay (Angle 110 Deg)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((110 - 90) * (Math.PI / 180));

    const rwyLength = radius * 1.3;
    const rwyWidth = 22;

    // Black Runway Surface
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-rwyLength / 2, -rwyWidth / 2, rwyLength, rwyWidth);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-rwyLength / 2, -rwyWidth / 2, rwyLength, rwyWidth);

    // Centerline Dashes
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.moveTo(-rwyLength / 2 + 15, 0);
    ctx.lineTo(rwyLength / 2 - 15, 0);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Runway Labels 11 & 29
    ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText('11', -rwyLength / 2 + 10, 0);
    ctx.fillText('29', rwyLength / 2 - 10, 0);

    ctx.restore();

    // 3. Dynamic Wind Arrow (Panah Arah Angin)
    ctx.save();
    ctx.translate(cx, cy);
    const windRad = (windDirDeg - 90) * (Math.PI / 180);

    const arrowX = Math.cos(windRad) * (radius + 12);
    const arrowY = Math.sin(windRad) * (radius + 12);

    ctx.translate(arrowX, arrowY);
    ctx.rotate(windRad + Math.PI / 2);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-7, -14);
    ctx.lineTo(7, -14);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b'; // Amber Gold Arrow
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
}

// FUNGSI 2: RENDER ANALOG SPEEDOMETER KNOTS (KANAN)
function drawSpeedometer(windSpeedKt) {
    const canvas = document.getElementById("speedometerCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const parentWidth = canvas.parentElement.clientWidth || 200;

    canvas.width = parentWidth;
    canvas.height = 200;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 10;
    const radius = Math.min(cx, cy) - 20;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale 0 to 30 Knots
    const minAngle = -140 * (Math.PI / 180);
    const maxAngle = 40 * (Math.PI / 180);

    // Dial Ticks
    for (let spd = 0; spd <= 30; spd += 5) {
        const pct = spd / 30;
        const angle = minAngle + pct * (maxAngle - minAngle);

        const x1 = cx + Math.cos(angle) * (radius - 8);
        const y1 = cy + Math.sin(angle) * (radius - 8);
        const x2 = cx + Math.cos(angle) * radius;
        const y2 = cy + Math.sin(angle) * radius;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const textX = cx + Math.cos(angle) * (radius - 20);
        const textY = cy + Math.sin(angle) * (radius - 20);

        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(spd.toString(), textX, textY);
    }

    // Unit Label "kt"
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText("kt", cx, cy - radius / 2);

    // Needle Jarum Penunjuk
    const clampedSpeed = Math.min(Math.max(windSpeedKt, 0), 30);
    const needlePct = clampedSpeed / 30;
    const needleAngle = minAngle + needlePct * (maxAngle - minAngle);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle);

    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(radius - 12, 0);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

function drawDaylightCurve() {
    const canvas = document.getElementById("daylightCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const parentWidth = canvas.parentElement.clientWidth || 600;
    
    canvas.width = parentWidth;
    canvas.height = 140;

    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2 + 15;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(20, midY);
    ctx.lineTo(w - 20, midY);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    for (let x = 20; x <= w - 20; x++) {
        const rad = ((x - 20) / (w - 40)) * Math.PI * 2;
        const y = midY - Math.sin(rad - Math.PI / 2) * 48;
        if (x === 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const sunX = w / 2;
    const sunY = midY - 48;

    ctx.beginPath();
    ctx.arc(sunX, sunY, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * (Math.PI / 180);
        const rayStartX = sunX + Math.cos(angle) * 14;
        const rayStartY = sunY + Math.sin(angle) * 14;
        const rayEndX = sunX + Math.cos(angle) * 19;
        const rayEndY = sunY + Math.sin(angle) * 19;

        ctx.beginPath();
        ctx.moveTo(rayStartX, rayStartY);
        ctx.lineTo(rayEndX, rayEndY);
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
    safeSetText("m-cloud-pcts", c.cloud_desc || c.cloud_cover_octa);

    safeSetText("sun-sunrise-val", dl.sunrise);
    safeSetText("sun-midday-val", dl.midday);
    safeSetText("sun-sunset-val", `${dl.sunset} (${dl.duration})`);

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
        currentWindDir = w.surface.dir_deg || 180;
        currentWindSpd = w.surface.speed_kt || 6.0;
        currentCrosswind = r.crosswind_kt || 5.6;

        safeSetText("compass-status-text", `<i class="bi bi-arrow-right me-1"></i>Crosswind: ${currentCrosswind} kt`);

        // Render Canvas Dials
        drawAviationCompass(currentWindDir);
        drawSpeedometer(currentWindSpd);

        const windDirInput = document.getElementById("calc-wind-dir");
        const windSpdInput = document.getElementById("calc-wind-spd");
        if (windDirInput && windSpdInput) {
            windDirInput.value = currentWindDir;
            windSpdInput.value = currentWindSpd;
            calculatePopUpCrosswind();
        }
    }

    const minData = data.minutely_15;
    if (minData) {
        renderDaily00to24History(minData);
    }

    renderFlightPrepTable(data);
    drawDaylightCurve();
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
    const todayISO = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const labelDate = now.toLocaleDateString('id-ID', { 
        timeZone: 'Asia/Jakarta', 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short' 
    });

    const currentHHMM = now.toLocaleTimeString('id-ID', { 
        timeZone: 'Asia/Jakarta', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    }).replace('.', ':');

    let logsMap = new Map();

    times.forEach((isoStr, i) => {
        if (!isoStr) return;

        const parts = isoStr.split("T");
        if (parts.length < 2) return;

        const datePart = parts[0];
        const timePart = parts[1].substring(0, 5);

        if (datePart === todayISO && timePart <= currentHHMM) {
            const spdKt = windSpeeds[i] !== undefined ? (windSpeeds[i] * 0.539957).toFixed(1) : '--';
            const dirDeg = windDirs[i] !== undefined ? windDirs[i] : '--';
            const precipVal = precips[i] || 0;

            logsMap.set(timePart, {
                timeKey: timePart,
                time: `${labelDate}, ${timePart} WIB`,
                temp: temps[i] !== undefined ? `${temps[i]} °C` : '--',
                rh: rhs[i] !== undefined ? `${rhs[i]} %` : '--',
                press: pressures[i] !== undefined ? `${pressures[i]} hPa` : '--',
                windSpd: `${spdKt} kt`,
                windDir: `${dirDeg}°`,
                precip: precipVal > 0 ? `Hujan (${precipVal} mm)` : 'Cerah / Berawan'
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
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Memuat riwayat real-time...</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    historyLogs.forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ps-4 fw-bold text-primary font-mono">${log.time}</td>
            <td class="font-mono">${log.temp}</td>
            <td class="font-mono">${log.rh}</td>
            <td class="font-mono">${log.press}</td>
            <td class="font-mono">${log.windSpd}</td>
            <td class="font-mono">${log.windDir}</td>
            <td class="pe-4 small text-secondary">${log.precip}</td>
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
    link.download = `Aviation_AWS_BDO_METAR_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}