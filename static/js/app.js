let chartInstance = null;
let windRoseInstance = null;
let autoRefreshTimer = null;
const POLLING_INTERVAL = 30000; // Auto-refresh data tiap 30 detik

let historyLogs = [];

document.addEventListener("DOMContentLoaded", () => {
    initChart();
    initWindRoseChart();
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

    const clearBtn = document.getElementById("clearHistoryBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            historyLogs = [];
            renderHistoryTable();
        });
    }

    const exportBtn = document.getElementById("exportHistoryBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", exportHistoryCSV);
    }

    startAutoRefresh();
});

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(fetchAWSData, POLLING_INTERVAL);
    updateLiveIndicator(true);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    updateLiveIndicator(false);
}

function updateLiveIndicator(isLive) {
    const dot = document.getElementById("live-dot");
    const text = document.getElementById("live-text");
    if (dot && text) {
        dot.className = isLive ? "dot-pulse bg-success" : "dot-pulse bg-secondary";
        text.textContent = isLive ? "LIVE" : "PAUSED";
    }
}

async function fetchAWSData() {
    const icon = document.getElementById("refreshIcon");
    if (icon) icon.classList.add("spin-anim");

    try {
        const response = await fetch(`/api/v1/aws-translated?_t=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        const data = await response.json();
        
        const now = new Date();
        const fullDateStr = now.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });

        const lastUpdate = document.getElementById("last-update");
        if (lastUpdate) {
            lastUpdate.textContent = `${fullDateStr} - ${timeStr} WIB`;
        }

        renderDashboard(data);

    } catch (err) {
        console.error("Gagal mengambil/render data AWS:", err);
    } finally {
        if (icon) icon.classList.remove("spin-anim");
    }
}

function safeSetText(id, value, suffix = "") {
    const el = document.getElementById(id);
    if (el) {
        if (value !== null && value !== undefined) {
            el.textContent = `${value} ${suffix}`.trim();
        } else {
            el.textContent = `-- ${suffix}`.trim();
        }
    }
}

function renderDashboard(data) {
    if (!data) return;

    const t = data.thermodynamics || {};
    const w = data.wind_profile || {};
    const c = data.clouds_precipitation || {};
    const r = data.radiation_uv || {};
    const s = data.soil_evapotranspiration || {};

    if (c.stability_status) {
        const alertText = typeof c.stability_status === 'object' ? c.stability_status.text : c.stability_status;
        safeSetText("stability-alert-text", alertText);

        const iconEl = document.getElementById("stability-alert-icon");
        if (iconEl && c.stability_status.icon) {
            iconEl.className = `bi ${c.stability_status.icon} text-primary fs-5`;
        }

        const cond = c.stability_status.condition || 'partly-cloudy';
        renderWeatherAnimation(cond);
    }

    safeSetText("m-temp", t.temp_2m, "°C");
    safeSetText("m-app-temp", t.apparent_temp, "°C");
    safeSetText("m-rh", t.rh_2m, "%");
    safeSetText("m-dew", t.dew_point, "°C");
    safeSetText("m-press", t.msl_pressure, "hPa");
    safeSetText("m-surf-press", t.surface_pressure, "hPa");
    
    const barRh = document.getElementById("bar-rh");
    if (barRh && t.rh_2m !== undefined) {
        barRh.style.width = `${t.rh_2m}%`;
    }

    if (w["10m"]) {
        safeSetText("m-wind-10m", w["10m"].speed, "km/h");
        safeSetText("m-wind-dir-10m", `${w["10m"].dir_deg}° (${w["10m"].dir_compass})`);
        
        const mainArrow = document.getElementById("wind-arrow-10m");
        if (mainArrow && w["10m"].dir_deg !== undefined) {
            mainArrow.style.transform = `rotate(${w["10m"].dir_deg}deg)`;
        }
    }

    safeSetText("m-precip", c.precipitation, "mm");
    safeSetText("m-precip-prob", c.precip_prob, "%");
    safeSetText("m-cloud-total", c.cloud_cover_total, "%");
    safeSetText("m-cloud-breakdown", `${c.cloud_cover_low || 0} / ${c.cloud_cover_mid || 0} / ${c.cloud_cover_high || 0} %`);

    const uvB = document.getElementById("uv-badge");
    if (uvB && r.uv_evaluation) {
        uvB.className = `badge fs-6 px-3 py-2 rounded-pill ${r.uv_evaluation.badge || 'bg-secondary'}`;
        uvB.textContent = `${r.uv_index || 0} (${r.uv_evaluation.level || 'Low'})`;
    }
    safeSetText("uv-desc", r.uv_evaluation ? r.uv_evaluation.desc : "");

    safeSetText("m-rad-sw", r.shortwave_rad, "W/m²");
    safeSetText("m-rad-dni", r.dni, "W/m²");
    safeSetText("m-is-day", data.metadata ? data.metadata.is_day : "-");

    ["10", "80", "120", "180"].forEach(lvl => {
        const key = `${lvl}m`;
        if (w[key]) {
            safeSetText(`w${lvl}-spd`, w[key].speed, "km/h");
            safeSetText(`w${lvl}-deg`, w[key].dir_deg, "°");
            safeSetText(`w${lvl}-dir`, w[key].dir_compass);
            
            const arrow = document.getElementById(`w${lvl}-arrow`);
            if (arrow && w[key].dir_deg !== undefined) {
                arrow.style.transform = `rotate(${w[key].dir_deg}deg)`;
            }
        }
    });
    safeSetText("wgust-spd", w.gusts_10m, "km/h");

    safeSetText("r-sw", r.shortwave_rad, "W/m²");
    safeSetText("r-dir", r.direct_rad, "W/m²");
    safeSetText("r-diff", r.diffuse_rad, "W/m²");
    safeSetText("r-dni", r.dni, "W/m²");
    safeSetText("r-gti", r.gti, "W/m²");
    safeSetText("r-ter", r.terrestrial_rad, "W/m²");
    safeSetText("r-uv-clear", r.uv_index_clear_sky);

    updateProgressBar("pb-cloud-low", "val-cloud-low", c.cloud_cover_low);
    updateProgressBar("pb-cloud-mid", "val-cloud-mid", c.cloud_cover_mid);
    updateProgressBar("pb-cloud-high", "val-cloud-high", c.cloud_cover_high);
    updateProgressBar("pb-cloud-total", "val-cloud-total", c.cloud_cover_total);

    safeSetText("st-0", s.temp_0cm, "°C");
    safeSetText("st-6", s.temp_6cm, "°C");
    safeSetText("st-18", s.temp_18cm, "°C");
    safeSetText("st-54", s.temp_54cm, "°C");

    safeSetText("sm-0-1", s.moisture_0_1cm, "m³/m³");
    safeSetText("sm-1-3", s.moisture_1_3cm, "m³/m³");
    safeSetText("sm-3-9", s.moisture_3_9cm, "m³/m³");
    safeSetText("sm-9-27", s.moisture_9_27cm, "m³/m³");
    safeSetText("sm-27-81", s.moisture_27_81cm, "m³/m³");
    safeSetText("et0-fao", s.et0_fao, "mm");

    if (data.raw_hourly_payload && data.raw_hourly_payload.time) {
        updateChart(data.raw_hourly_payload);
        updateWindRoseChart(data.raw_hourly_payload);
        renderHourlyForecast(data.raw_hourly_payload);
    }

    // Panggil logika History Log 15 Menitan
    const minutelyData = data.raw_minutely_15_payload || (data.raw_current_payload ? data.raw_current_payload.minutely_15 : null);
    if (minutelyData) {
        renderDaily15MinHistory(minutelyData);
    }

    renderMasterTable(data.raw_current_payload, data);
}

function renderHourlyForecast(hourly) {
    const container = document.getElementById("hourly-forecast-container");
    if (!container || !hourly.time) return;

    const times = hourly.time;
    const temps = hourly.temperature_2m || [];
    const rhs = hourly.relative_humidity_2m || [];
    const windSpds = hourly.wind_speed_10m || [];
    const windDirs = hourly.wind_direction_10m || [];

    container.innerHTML = "";

    times.forEach((t, i) => {
        const timeStr = t.includes("T") ? t.split("T")[1].substring(0, 5) : t;
        const temp = temps[i] !== undefined ? `${temps[i]}°` : '--';
        const rh = rhs[i] !== undefined ? `${rhs[i]}%` : '--';
        const windSpd = windSpds[i] !== undefined ? `${windSpds[i]}` : '--';
        const windDir = windDirs[i] !== undefined ? degToCompassShort(windDirs[i]) : '';

        let iconClass = "bi-cloud-sun-fill text-warning";
        const hourNum = parseInt(timeStr.split(":")[0]);
        if (hourNum < 6 || hourNum > 18) {
            iconClass = "bi-moon-stars-fill text-info";
        }

        const card = document.createElement("div");
        card.className = "hourly-card text-center";
        card.innerHTML = `
            <div class="hour-time font-mono">${timeStr}</div>
            <div class="my-1.5"><i class="bi ${iconClass} fs-4"></i></div>
            <div class="hour-temp font-mono">${temp}</div>
            <div class="hour-rh font-mono mt-1"><i class="bi bi-droplet"></i> ${rh}</div>
            <div class="hour-wind font-mono mt-0.5"><i class="bi bi-wind"></i> ${windSpd} <small>${windDir}</small></div>
        `;
        container.appendChild(card);
    });
}

function degToCompassShort(deg) {
    if (deg === null || deg === undefined) return "";
    const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return sectors[Math.floor(((parseFloat(deg) + 22.5) % 360) / 45)];
}

function renderWeatherAnimation(condition) {
    const container = document.getElementById("weather-anim-container");
    if (!container) return;

    container.innerHTML = "";

    if (condition === "sunny") {
        container.innerHTML = `<div class="sun-element"></div>`;
    } 
    else if (condition === "cloudy" || condition === "partly-cloudy") {
        container.innerHTML = `
            <div class="cloud-element cloud-element-1"></div>
            <div class="cloud-element cloud-element-2"></div>
        `;
    } 
    else if (condition === "rain-light" || condition === "rain-heavy") {
        const dropCount = condition === "rain-heavy" ? 15 : 7;
        for (let i = 0; i < dropCount; i++) {
            const drop = document.createElement("div");
            drop.className = "rain-drop";
            drop.style.left = `${Math.random() * 100}%`;
            drop.style.animationDelay = `${Math.random() * 0.8}s`;
            container.appendChild(drop);
        }
    }
}

function updateProgressBar(barId, valId, val) {
    const bar = document.getElementById(barId);
    const text = document.getElementById(valId);
    const value = val || 0;
    
    if (bar) bar.style.width = `${value}%`;
    if (text) text.textContent = `${value}%`;
}

function initChart() {
    const canvas = document.getElementById("trendChart");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const gradientTemp = ctx.createLinearGradient(0, 0, 0, 300);
    gradientTemp.addColorStop(0, 'rgba(37, 99, 235, 0.35)');
    gradientTemp.addColorStop(1, 'rgba(37, 99, 235, 0.0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Suhu 2m (°C)',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: gradientTemp,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'Kelembapan (%)',
                    data: [],
                    borderColor: '#0891b2',
                    borderDash: [4, 4],
                    tension: 0.35,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: { grid: { display: false } },
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Suhu (°C)' } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Kelembapan (%)' } }
            }
        }
    });
}

function updateChart(hourly) {
    if (!chartInstance || !hourly.time) return;
    const times = hourly.time.map(t => t.includes("T") ? t.split("T")[1] : t);
    chartInstance.data.labels = times;
    chartInstance.data.datasets[0].data = hourly.temperature_2m || [];
    chartInstance.data.datasets[1].data = hourly.relative_humidity_2m || [];
    chartInstance.update();
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
                {
                    label: '< 5 km/h (Calm)',
                    data: Array(16).fill(0),
                    backgroundColor: 'rgba(6, 182, 212, 0.75)',
                    borderColor: '#ffffff',
                    borderWidth: 1
                },
                {
                    label: '5 - 15 km/h (Light)',
                    data: Array(16).fill(0),
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderColor: '#ffffff',
                    borderWidth: 1
                },
                {
                    label: '15 - 25 km/h (Moderate)',
                    data: Array(16).fill(0),
                    backgroundColor: 'rgba(245, 158, 11, 0.75)',
                    borderColor: '#ffffff',
                    borderWidth: 1
                },
                {
                    label: '> 25 km/h (Strong)',
                    data: Array(16).fill(0),
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    borderColor: '#ffffff',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return `Sektor Arah: ${context[0].label}`;
                        },
                        label: function(context) {
                            return ` ${context.dataset.label}: ${context.raw} Jam`;
                        }
                    }
                }
            },
            scales: {
                r: {
                    stacked: true,
                    ticks: {
                        display: true,
                        backdropColor: 'rgba(255, 255, 255, 0.8)',
                        font: { size: 9, family: 'JetBrains Mono' }
                    },
                    grid: { color: '#e2e8f0' },
                    angleLines: { display: true, color: '#cbd5e1' },
                    pointLabels: {
                        display: true,
                        font: {
                            size: 11,
                            weight: 'bold',
                            family: 'Plus Jakarta Sans'
                        },
                        color: '#0f172a'
                    }
                }
            }
        }
    });
}

function updateWindRoseChart(hourly) {
    if (!windRoseInstance || !hourly.wind_direction_10m || !hourly.wind_speed_10m) return;

    const dirs = hourly.wind_direction_10m;
    const speeds = hourly.wind_speed_10m;

    const catCalm = Array(16).fill(0);
    const catLight = Array(16).fill(0);
    const catMod = Array(16).fill(0);
    const catStrong = Array(16).fill(0);

    dirs.forEach((deg, i) => {
        if (deg !== null && deg !== undefined && speeds[i] !== null && speeds[i] !== undefined) {
            const idx = Math.floor((parseFloat(deg) + 11.25) / 22.5) % 16;
            const spd = parseFloat(speeds[i]) || 0.0;

            if (spd < 5.0) {
                catCalm[idx] += 1;
            } else if (spd < 15.0) {
                catLight[idx] += 1;
            } else if (spd <= 25.0) {
                catMod[idx] += 1;
            } else {
                catStrong[idx] += 1;
            }
        }
    });

    windRoseInstance.data.datasets[0].data = catCalm;
    windRoseInstance.data.datasets[1].data = catLight;
    windRoseInstance.data.datasets[2].data = catMod;
    windRoseInstance.data.datasets[3].data = catStrong;
    
    windRoseInstance.update();
}

// -------------------------------------------------------------------------
// HISTORY LOG OTOMATIS: INTERVAL 15 MENIT DARI JAM 00:00 HINGGA SEKARANG
// -------------------------------------------------------------------------

function renderDaily15MinHistory(minutely) {
    if (!minutely || !minutely.time) return;

    const times = minutely.time;
    const temps = minutely.temperature_2m || [];
    const rhs = minutely.relative_humidity_2m || [];
    const pressures = minutely.msl_pressure || [];
    const windSpeeds = minutely.wind_speed_10m || [];
    const windDirs = minutely.wind_direction_10m || [];
    const uvs = minutely.uv_index || [];
    const precips = minutely.precipitation || [];

    const now = new Date();
    const currentTimestamp = now.getTime();
    
    const todayStr = now.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    });

    let fullDayLogs = [];

    times.forEach((t, i) => {
        // Parse format ISO waktu Open-Meteo (contoh: "2026-08-03T08:15")
        const itemDate = new Date(t);
        const timeStr = t.includes("T") ? t.split("T")[1].substring(0, 5) : t;

        // Ambil hanya data dari jam 00:00 WIB hari ini hingga menit berjalan saat ini
        if (itemDate.getTime() <= currentTimestamp && itemDate.getDate() === now.getDate()) {
            const windDirDeg = windDirs[i] !== undefined ? windDirs[i] : '--';
            const windCompass = degToCompassShort(windDirDeg);
            const precipVal = precips[i] !== undefined ? precips[i] : 0;

            fullDayLogs.push({
                time: `${todayStr}, ${timeStr} WIB`,
                temp: temps[i] !== undefined ? `${temps[i]} °C` : '--',
                rh: rhs[i] !== undefined ? `${rhs[i]} %` : '--',
                press: pressures[i] !== undefined ? `${pressures[i]} hPa` : '--',
                windSpd: windSpeeds[i] !== undefined ? `${windSpeeds[i]} km/h` : '--',
                windDir: `${windDirDeg}° (${windCompass})`,
                uv: uvs[i] !== undefined ? uvs[i] : '--',
                status: precipVal > 0 ? `Hujan (${precipVal} mm)` : 'Cerah / Berawan'
            });
        }
    });

    // Urutkan dari interval 15 menit terbaru ke 00:00 WIB
    historyLogs = fullDayLogs.reverse();
    renderHistoryTable();
}

function renderHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    if (!tbody) return;

    if (historyLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Memuat data riwayat 15-menit dari 00:00 WIB...</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    historyLogs.forEach((log) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="fw-bold text-primary">${log.time}</td>
            <td>${log.temp}</td>
            <td>${log.rh}</td>
            <td>${log.press}</td>
            <td>${log.windSpd}</td>
            <td>${log.windDir}</td>
            <td><span class="badge bg-secondary font-mono">${log.uv}</span></td>
            <td class="text-secondary small">${log.status}</td>
        `;
        tbody.appendChild(tr);
    });
}

function exportHistoryCSV() {
    if (historyLogs.length === 0) {
        alert("Belum ada data riwayat untuk di-export!");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Waktu Fetch,Suhu (C),Kelembapan (%),Tekanan (hPa),Kecepatan Angin (km/h),Arah Angin,Indeks UV,Status\n";

    historyLogs.forEach(log => {
        const row = `"${log.time}","${log.temp}","${log.rh}","${log.press}","${log.windSpd}","${log.windDir}","${log.uv}","${log.status}"`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AWS_PTDI_History_15Min_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderMasterTable(rawCurrent, fullData) {
    const tbody = document.getElementById("master-table-body");
    if (!tbody || !rawCurrent) return;

    tbody.innerHTML = "";
    for (const [key, val] of Object.entries(rawCurrent)) {
        let interpretation = "Direct Sensor Reading";
        
        if (key.includes("wind_direction") && fullData.wind_profile && fullData.wind_profile["10m"]) {
            interpretation = `Arah Muka: ${fullData.wind_profile["10m"].dir_compass}`;
        } else if (key === "time" && fullData.metadata) {
            interpretation = `Lokal WIB: ${fullData.metadata.timestamp_wib}`;
        } else if (key === "uv_index" && fullData.radiation_uv && fullData.radiation_uv.uv_evaluation) {
            interpretation = `Status Evaluasi: ${fullData.radiation_uv.uv_evaluation.level}`;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="fw-semibold font-mono text-primary">${key}</td>
            <td><code class="px-2 py-1 bg-light text-dark rounded border">${val}</code></td>
            <td class="text-secondary">${getUnitByKey(key)}</td>
            <td class="fw-medium">${interpretation}</td>
        `;
        tbody.appendChild(tr);
    }
}

function getUnitByKey(key) {
    if (key.includes("temp") || key.includes("dew")) return "°C";
    if (key.includes("humidity") || key.includes("probability") || key.includes("cloud")) return "%";
    if (key.includes("pressure")) return "hPa";
    if (key.includes("speed") || key.includes("gusts")) return "km/h";
    if (key.includes("direction")) return "derajat (°)";
    if (key.includes("radiation") || key.includes("irradiance")) return "W/m²";
    if (key.includes("precipitation") || key.includes("rain") || key.includes("showers") || key.includes("et0")) return "mm";
    if (key.includes("moisture")) return "m³/m³";
    return "-";
}