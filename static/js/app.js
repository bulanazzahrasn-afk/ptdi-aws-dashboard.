let windRoseInstance = null;
let clockTimer = null;
let autoRefreshTimer = null;
const POLLING_INTERVAL = 30000;
let historyLogs = [];

// PLUGIN CUSTOM CHART.JS: OVERLAY RUNWAY 11/29 HUSEIN SASTRANEGARA (WICC)
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

        // Strip Runway
        ctx.beginPath();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#1e293b'; 
        ctx.moveTo(centerX + Math.cos(rad290) * (radius * 0.95), centerY + Math.sin(rad290) * (radius * 0.95));
        ctx.lineTo(centerX + Math.cos(rad110) * (radius * 0.95), centerY + Math.sin(rad110) * (radius * 0.95));
        ctx.stroke();

        // Garis Tengah Dash Putih
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#ffffff';
        ctx.moveTo(centerX + Math.cos(rad290) * (radius * 0.92), centerY + Math.sin(rad290) * (radius * 0.92));
        ctx.lineTo(centerX + Math.cos(rad110) * (radius * 0.95), centerY + Math.sin(rad110) * (radius * 0.95));
        ctx.stroke();
        ctx.setLineDash([]);

        // Teks RWY 29 & RWY 11
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
        console.error("Gagal memuat data NOAA WICC METAR:", err);
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

    const meta = data.metadata || {};
    const t = data.thermodynamics || {};
    const w = data.wind_profile || {};
    const c = data.clouds_precipitation || {};

    // Raw METAR Banner
    safeSetText("raw-metar-text", meta.raw_metar || "N/A");

    // Ringkasan Utama
    safeSetText("m-temp", t.temp_2m, "°C");
    safeSetText("m-dew", t.dew_point, "°C");
    safeSetText("m-rh", t.rh_2m, "%");
    safeSetText("m-press", t.msl_pressure, "hPa");
    safeSetText("m-surf-press", t.surface_pressure, "hPa");
    safeSetText("m-cloud-octa", c.cloud_cover_octa);
    safeSetText("m-visib", c.visibility, "SM");

    const barRh = document.getElementById("bar-rh");
    if (barRh && t.rh_2m !== undefined && t.rh_2m !== "--") barRh.style.width = `${t.rh_2m}%`;

    // Profil Angin
    if (w["33ft"]) {
        safeSetText("w33-spd", w["33ft"].speed_kt, "kt");
        safeSetText("w33-dir", `${w["33ft"].dir_deg}° (${w["33ft"].dir_compass})`);
        
        const arrow = document.getElementById("w33-arrow");
        if (arrow && w["33ft"].dir_deg !== undefined) {
            arrow.style.transform = `rotate(${w["33ft"].dir_deg}deg)`;
        }
    }
    safeSetText("wgust-spd", w.gusts_kt, "kt");

    // Update Wind Rose
    if (w["33ft"]) {
        updateWindRoseSingleObs(w["33ft"].dir_deg, w["33ft"].speed_kt);
    }

    // Update History & Master Table
    pushToHistoryLog(meta.timestamp_wib, t.temp_2m, t.rh_2m, t.msl_pressure, w["33ft"], c.cloud_cover_octa);
    renderFlightPrepTable(data);
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

function updateWindRoseSingleObs(deg, spdKt) {
    if (!windRoseInstance || deg === undefined || deg === "VRB") return;

    const catCalm = Array(16).fill(0);
    const catLight = Array(16).fill(0);
    const catMod = Array(16).fill(0);
    const catStrong = Array(16).fill(0);

    const idx = Math.floor((parseFloat(deg) + 11.25) / 22.5) % 16;
    const speed = parseFloat(spdKt);

    if (speed < 3.0) catCalm[idx] = 1;
    else if (speed <= 10.0) catLight[idx] = 1;
    else if (speed <= 20.0) catMod[idx] = 1;
    else catStrong[idx] = 1;

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
        { name: "Altimeter Setting (QNH)", val: t.msl_pressure, unit: "hPa", desc: "Tekanan Muka Laut Standar WICC" },
        { name: "Station Pressure (QFE)", val: t.surface_pressure, unit: "hPa", desc: "Tekanan Muka Stasiun Aerodrom" },
        { name: "Suhu Udara (OAT 2m)", val: t.temp_2m, unit: "°C", desc: "Suhu Luar untuk Kalkulasi Performa Takeoff" },
        { name: "Dew Point Temperature", val: t.dew_point, unit: "°C", desc: "Spread Titik Embun Stasiun" },
        { name: "Surface Wind (33 ft)", val: w["33ft"] ? `${w["33ft"].speed_kt} kt / ${w["33ft"].dir_deg}° (${w["33ft"].dir_compass})` : '--', unit: "Knots / Deg", desc: "Angin Permukaan Runway Husein (11/29)" },
        { name: "Maximum Wind Gust", val: w.gusts_kt, unit: "Knots", desc: "Hembusan Angin Maksimum" },
        { name: "Total Cloud Cover", val: c.cloud_cover_octa, unit: "Okta", desc: "Tutupan Awan Aerodrom" },
        { name: "Visibility Range", val: c.visibility, unit: "Statute Miles", desc: "Jarak Pandang Mendatar" }
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

function pushToHistoryLog(timeStr, temp, rh, press, windObj, cloudStr) {
    if (!timeStr || historyLogs.some(l => l.time === timeStr)) return;

    historyLogs.unshift({
        time: timeStr,
        temp: `${temp} °C`,
        rh: `${rh} %`,
        press: `${press} hPa`,
        windSpd: windObj ? `${windObj.speed_kt} kt` : '--',
        windDir: windObj ? `${windObj.dir_deg}°` : '--',
        cloud: cloudStr
    });

    renderHistoryTable();
}

function renderHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    if (!tbody) return;

    if (historyLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Memuat riwayat METAR...</td></tr>';
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
            <td><span class="badge bg-secondary font-mono">${log.cloud}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function exportHistoryCSV() {
    if (historyLogs.length === 0) return;
    let csv = "Waktu,Suhu (C),RH (%),QNH (hPa),Angin (kt),Arah,Awan\n";
    historyLogs.forEach(l => {
        csv += `"${l.time}","${l.temp}","${l.rh}","${l.press}","${l.windSpd}","${l.windDir}","${l.cloud}"\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = `Aviation_AWS_WICC_NOAA_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}