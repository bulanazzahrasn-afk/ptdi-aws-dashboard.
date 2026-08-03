from datetime import datetime
import zoneinfo

# Koordinat Husein Sastranegara (BDO/WABB)
HUSEIN_LAT = -6.9006
HUSEIN_LON = 107.5762

COMPASS_SECTORS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
]

def deg_to_compass(deg) -> str:
    if deg is None:
        return "N/A"
    try:
        idx = int((float(deg) + 11.25) / 22.5) % 16
        return COMPASS_SECTORS[idx]
    except (ValueError, TypeError):
        return "N/A"

def utc_to_wib(utc_str: str) -> str:
    if not utc_str:
        return "-"
    try:
        dt = datetime.fromisoformat(str(utc_str).replace("Z", "+00:00"))
        wib_dt = dt.astimezone(zoneinfo.ZoneInfo("Asia/Jakarta"))
        return wib_dt.strftime("%Y-%m-%d %H:%M:%S WIB")
    except Exception:
        return str(utc_str)

def evaluate_uv_risk(uv_val) -> dict:
    if uv_val is None:
        return {"level": "Low", "badge": "bg-success", "desc": "Risiko minimal bagi personel lapangan."}
    try:
        val = float(uv_val)
    except (ValueError, TypeError):
        val = 0.0

    if val < 3.0:
        return {"level": "Aman (Low)", "badge": "bg-success", "desc": "Risiko minimal bagi personel lapangan."}
    elif val < 6.0:
        return {"level": "Sedang (Moderate)", "badge": "bg-warning text-dark", "desc": "Gunakan pelindung mata dan APD standar."}
    elif val < 8.0:
        return {"level": "Tinggi (High)", "badge": "bg-danger", "desc": "Perlu topi/kacamata pelindung & batas paparan luar ruangan."}
    else:
        return {"level": "Sangat Ekstrem", "badge": "bg-dark", "desc": "Bahaya paparan radiasi! Batasi aktivitas terbuka."}

def evaluate_stability_clouds(cloud_total, cloud_low, prec) -> dict:
    try:
        prec_val = float(prec) if prec is not None else 0.0
        cloud_tot_val = float(cloud_total) if cloud_total is not None else 0.0
        cloud_low_val = float(cloud_low) if cloud_low is not None else 0.0
    except (ValueError, TypeError):
        prec_val, cloud_tot_val, cloud_low_val = 0.0, 0.0, 0.0

    if prec_val > 5.0:
        return {
            "text": "Hujan lebat terdeteksi. Waspada konveksi kuat di sekitar runway.",
            "condition": "rain-heavy",
            "icon": "bi-cloud-lightning-rain-fill"
        }
    elif prec_val > 0.1:
        return {
            "text": "Presipitasi ringan - sedang. Potensi konvektif lokal di area aerodrom.",
            "condition": "rain-light",
            "icon": "bi-cloud-drizzle-fill"
        }
    elif cloud_tot_val > 80 and cloud_low_val > 50:
        return {
            "text": "Kondisi sangat berawan (Low Cloud Dominant). Atmosfer lembap.",
            "condition": "cloudy",
            "icon": "bi-clouds-fill"
        }
    elif cloud_tot_val < 20:
        return {
            "text": "Cerah / Clear Sky. Kondisi visual operasional optimal.",
            "condition": "sunny",
            "icon": "bi-sun-fill"
        }
    
    return {
        "text": "Cerah berawan hingga berawan parsial.",
        "condition": "partly-cloudy",
        "icon": "bi-cloud-sun-fill"
    }

def safe_val(val, default=0.0):
    return val if val is not None else default

def translate_aws_payload(raw: dict) -> dict:
    curr = raw.get("current", {})
    
    wind_levels = {
        "10m": {
            "speed": safe_val(curr.get("wind_speed_10m")),
            "dir_deg": safe_val(curr.get("wind_direction_10m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_10m"))
        },
        "80m": {
            "speed": safe_val(curr.get("wind_speed_80m")),
            "dir_deg": safe_val(curr.get("wind_direction_80m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_80m"))
        },
        "120m": {
            "speed": safe_val(curr.get("wind_speed_120m")),
            "dir_deg": safe_val(curr.get("wind_direction_120m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_120m"))
        },
        "180m": {
            "speed": safe_val(curr.get("wind_speed_180m")),
            "dir_deg": safe_val(curr.get("wind_direction_180m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_180m"))
        },
        "gusts_10m": safe_val(curr.get("wind_gusts_10m"))
    }

    time_utc = curr.get("time", "")
    time_wib = utc_to_wib(time_utc)

    uv_val = safe_val(curr.get("uv_index"), 0.0)
    uv_eval = evaluate_uv_risk(uv_val)
    cloud_total = safe_val(curr.get("cloud_cover"), 0)
    cloud_low = safe_val(curr.get("cloud_cover_low"), 0)
    precip_val = safe_val(curr.get("precipitation"), 0.0)
    stability_status = evaluate_stability_clouds(cloud_total, cloud_low, precip_val)

    translated = {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WABB), Bandung",
            "latitude": raw.get("latitude", HUSEIN_LAT),
            "longitude": raw.get("longitude", HUSEIN_LON),
            "elevation": raw.get("elevation", 740),
            "timestamp_utc": time_utc,
            "timestamp_wib": time_wib,
            "is_day": "Siang" if curr.get("is_day") == 1 else "Malam"
        },
        "thermodynamics": {
            "temp_2m": safe_val(curr.get("temperature_2m")),
            "rh_2m": safe_val(curr.get("relative_humidity_2m")),
            "dew_point": safe_val(curr.get("dew_point_2m")),
            "apparent_temp": safe_val(curr.get("apparent_temperature")),
            "surface_pressure": safe_val(curr.get("surface_pressure")),
            "msl_pressure": safe_val(curr.get("pressure_msl")),
            "vpd": safe_val(curr.get("vapour_pressure_deficit"))
        },
        "wind_profile": wind_levels,
        "clouds_precipitation": {
            "precipitation": precip_val,
            "rain": safe_val(curr.get("rain")),
            "showers": safe_val(curr.get("showers")),
            "snowfall": safe_val(curr.get("snowfall")),
            "precip_prob": safe_val(curr.get("precipitation_probability")),
            "cloud_cover_total": cloud_total,
            "cloud_cover_low": cloud_low,
            "cloud_cover_mid": safe_val(curr.get("cloud_cover_mid")),
            "cloud_cover_high": safe_val(curr.get("cloud_cover_high")),
            "stability_status": stability_status
        },
        "radiation_uv": {
            "shortwave_rad": safe_val(curr.get("shortwave_radiation")),
            "direct_rad": safe_val(curr.get("direct_radiation")),
            "diffuse_rad": safe_val(curr.get("diffuse_radiation")),
            "dni": safe_val(curr.get("direct_normal_irradiance")),
            "gti": safe_val(curr.get("global_tilted_irradiance")),
            "terrestrial_rad": safe_val(curr.get("terrestrial_radiation")),
            "uv_index": uv_val,
            "uv_index_clear_sky": safe_val(curr.get("uv_index_clear_sky")),
            "uv_evaluation": uv_eval
        },
        "soil_evapotranspiration": {
            "temp_0cm": safe_val(curr.get("soil_temperature_0cm")),
            "temp_6cm": safe_val(curr.get("soil_temperature_6cm")),
            "temp_18cm": safe_val(curr.get("soil_temperature_18cm")),
            "temp_54cm": safe_val(curr.get("soil_temperature_54cm")),
            "moisture_0_1cm": safe_val(curr.get("soil_moisture_0_to_1cm")),
            "moisture_1_3cm": safe_val(curr.get("soil_moisture_1_to_3cm")),
            "moisture_3_9cm": safe_val(curr.get("soil_moisture_3_to_9cm")),
            "moisture_9_27cm": safe_val(curr.get("soil_moisture_9_to_27cm")),
            "moisture_27_81cm": safe_val(curr.get("soil_moisture_27_to_81cm")),
            "et0_fao": safe_val(curr.get("et0_fao_evapotranspiration"))
        },
        "raw_current_payload": curr,
        "raw_hourly_payload": raw.get("hourly", {})
    }
    return translated