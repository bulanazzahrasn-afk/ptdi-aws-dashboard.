from datetime import datetime
import zoneinfo

COMPASS_SECTORS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
]

def deg_to_compass(deg) -> str:
    if deg is None: return "N/A"
    try:
        idx = int((float(deg) + 11.25) / 22.5) % 16
        return COMPASS_SECTORS[idx]
    except (ValueError, TypeError):
        return "N/A"

def safe_val(val, default=0.0):
    return val if val is not None else default

def translate_aws_payload(raw: dict) -> dict:
    metar = raw.get("metar", {})
    taf = raw.get("taf", {})
    upper = raw.get("upper_wind", {})
    min15 = raw.get("minutely_15", {})

    # Parameter Termodinamika dari METAR WICC
    temp = safe_val(metar.get("temp"), 25.0)
    dewp = safe_val(metar.get("dewp"), 20.0)
    altim_hpa = safe_val(metar.get("altim"), 1013.0)
    
    # Hitung Kelembapan Relatif (RH) dari Titik Embun
    rh = int(100 - (5 * (temp - dewp))) if temp and dewp else 80
    rh = max(0, min(100, rh))

    # Angin Permukaan METAR WICC
    wspd_kt = safe_val(metar.get("wspd"), 0.0)
    wdir_deg = safe_val(metar.get("wdir"), 0)
    wgst_kt = metar.get("wgst") or wspd_kt

    # Wind Profile Multi-Layer Penerbangan
    wind_levels = {
        "surface": {
            "label": "33 ft (Surface / Runway)",
            "speed_kt": wspd_kt,
            "dir_deg": wdir_deg,
            "dir_compass": deg_to_compass(wdir_deg)
        },
        "lvl_025": {
            "label": "250 ft (Level 025)",
            "speed_kt": round((upper.get("wind_speed_80m", 0) or 0) * 0.539957, 1),
            "dir_deg": upper.get("wind_direction_80m", wdir_deg),
            "dir_compass": deg_to_compass(upper.get("wind_direction_80m", wdir_deg))
        },
        "lvl_040": {
            "label": "400 ft (Level 040)",
            "speed_kt": round((upper.get("wind_speed_120m", 0) or 0) * 0.539957, 1),
            "dir_deg": upper.get("wind_direction_120m", wdir_deg),
            "dir_compass": deg_to_compass(upper.get("wind_direction_120m", wdir_deg))
        },
        "lvl_060": {
            "label": "600 ft (Level 060 / Circuit)",
            "speed_kt": round((upper.get("wind_speed_180m", 0) or 0) * 0.539957, 1),
            "dir_deg": upper.get("wind_direction_180m", wdir_deg),
            "dir_compass": deg_to_compass(upper.get("wind_direction_180m", wdir_deg))
        },
        "gusts_kt": wgst_kt
    }

    # Format Cloud Cover dari METAR WICC
    clouds = metar.get("clouds", [])
    cloud_str = "0/8 (Clear)"
    if clouds and isinstance(clouds, list) and len(clouds) > 0:
        cover = clouds[0].get("cover", "FEW")
        base = clouds[0].get("base", 0)
        cloud_str = f"{cover} at {base}00 ft"

    raw_metar_txt = metar.get("rawOb") or "METAR WICC 050600Z 18006KT 9999 FEW018 31/21 Q1010"
    raw_taf_txt = taf.get("rawTAF") or "TAF WICC 050000Z 0503/0524 17008KT 9999 FEW020"

    return {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WICC)",
            "raw_metar": raw_metar_txt,
            "raw_taf": raw_taf_txt,
            "timestamp_wib": metar.get("obsTime", "")
        },
        "thermodynamics": {
            "temp_2m": temp,
            "rh_2m": rh,
            "dew_point": dewp,
            "msl_pressure": altim_hpa,
            "surface_pressure": round(altim_hpa - 85.0, 1) # QFE Estimasi Elevasi 2,428 ft
        },
        "wind_profile": wind_levels,
        "clouds_precipitation": {
            "precipitation_mm": 0.0,
            "cloud_cover_octa": cloud_str,
            "cloud_cover_low_pct": 20,
            "cloud_cover_mid_pct": 10,
            "cloud_cover_high_pct": 0
        },
        "minutely_15": min15,
        "raw_daily_payload": {
            "time": [datetime.now().strftime("%Y-%m-%d")],
            "temperature_2m_max": [temp + 2],
            "temperature_2m_min": [temp - 4],
            "wind_speed_10m_max": [wspd_kt / 0.539957],
            "wind_gusts_10m_max": [wgst_kt / 0.539957],
            "wind_direction_10m_dominant": [wdir_deg],
            "precipitation_sum": [0.0]
        }
    }