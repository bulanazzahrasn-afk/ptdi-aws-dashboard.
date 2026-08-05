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
    drawDaylightCurve();
    startRealtimeClock();
    fetchAWSData();

    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");
    const contentArea = document.getElementById("contentArea");

    if (sidebarToggle && sidebar && contentArea) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
            contentArea.classList.toggle("expanded");
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

    startAutoRefresh();
});

function drawDaylightCurve() {
    const canvas = document.getElementById("daylightCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.parentElement.clientWidth || 600;
    canvas.height = 120;

    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2 + 10;

    ctx.clearRect(0, 0, w, h);

    // Baseline
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(10, midY);
    ctx.lineTo(w - 10, midY);
    ctx.stroke();

    // Sun Curve (Sine Wave)
    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    for (let x = 10; x <= w - 10; x++) {
        const rad = ((x - 10) / (w - 20)) * Math.PI * 2;
        const y = midY - Math.sin(rad - Math.PI / 2) * 45;
        if (x === 10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Sun Icon at peak
    const sunX = w / 2 + 30;
    const sunY = midY - 42;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
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
    safeSetText("m-cloud-pcts", c.cloud_cover_octa);

    // UPDATE TAB CUACA HARI INI
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
        renderDaily00to24History(minData);
    }

    renderFlightPrepTable(data);
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
                    stacked: true,
                    ticks: { display: true, backdropColor: 'rgba(255, 255, 255, 0.85)', font: { size: 9 } },
                    grid: { color: '#e2e8f0' },
                    angleLines: { display: true, color: '#cbd5e1' },
                    pointLabels: { display: true, centerPointLabels: true, font: { size: 11, weight: 'bold' }, color: '#1e293b' }
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