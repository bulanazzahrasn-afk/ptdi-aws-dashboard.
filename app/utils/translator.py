from datetime import datetime
import math

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
    daily_ext = raw.get("daily_ext", {})
    min15 = raw.get("minutely_15", {})

    temp = safe_val(metar.get("temp"), 31.0)
    dewp = safe_val(metar.get("dewp"), 21.0)
    altim_hpa = safe_val(metar.get("altim"), 1010.0)
    
    rh = int(100 - (5 * (temp - dewp))) if temp and dewp else 50
    rh = max(0, min(100, rh))

    heat_index = round(temp + (0.5555 * (6.11 * math.exp(5417.7530 * (1/273.16 - 1/(273.15 + dewp))) - 10)), 1) if dewp else temp + 2

    wspd_kt = safe_val(metar.get("wspd"), 6.0)
    wdir_deg = safe_val(metar.get("wdir"), 180)
    wgst_kt = metar.get("wgst") or wspd_kt

    angle_rad = abs(wdir_deg - 110) * (math.pi / 180)
    crosswind_kt = round(abs(wspd_kt * math.sin(angle_rad)), 1)
    headwind_kt = round(wspd_kt * math.cos(angle_rad), 1)
    crosswind_pct = round((crosswind_kt / wspd_kt * 100), 0) if wspd_kt > 0 else 0

    wind_levels = {
        "surface": {"label": "33 ft (Angin Permukaan)", "speed_kt": wspd_kt, "dir_deg": wdir_deg, "dir_compass": deg_to_compass(wdir_deg)},
        "lvl_025": {"label": "250 ft (Angin Lapisan Rendah)", "speed_kt": round((upper.get("wind_speed_80m", 0) or 0) * 0.539957, 1), "dir_deg": upper.get("wind_direction_80m", wdir_deg), "dir_compass": deg_to_compass(upper.get("wind_direction_80m", wdir_deg))},
        "lvl_040": {"label": "400 ft (Terminal Winds)", "speed_kt": round((upper.get("wind_speed_120m", 0) or 0) * 0.539957, 1), "dir_deg": upper.get("wind_direction_120m", wdir_deg), "dir_compass": deg_to_compass(upper.get("wind_direction_120m", wdir_deg))},
        "lvl_060": {"label": "600 ft (Angin Ketinggian Jelajah)", "speed_kt": round((upper.get("wind_speed_180m", 0) or 0) * 0.539957, 1), "dir_deg": upper.get("wind_direction_180m", wdir_deg), "dir_compass": deg_to_compass(upper.get("wind_direction_180m", wdir_deg))},
        "gusts_kt": wgst_kt
    }

    clouds = metar.get("clouds", [])
    cloud_octa = "3-4/8 (SCT)"
    cloud_desc = "1,700 ft SCT Scattered clouds"
    
    if clouds and isinstance(clouds, list) and len(clouds) > 0:
        cover = clouds[0].get("cover", "FEW")
        base = clouds[0].get("base", 0)
        
        octa_map = {
            "SKC": "0/8 (Clear)",
            "FEW": "1-2/8 (FEW)",
            "SCT": "3-4/8 (SCT)",
            "BKN": "5-7/8 (BKN)",
            "OVC": "8/8 (OVC)"
        }
        cloud_octa = octa_map.get(cover, "3-4/8 (SCT)")
        cloud_desc = f"{base}00 ft {cover} Scattered clouds"

    sunrise_str = daily_ext.get("sunrise", ["2026-08-05T06:02"])[0].split("T")[1][:5] if daily_ext.get("sunrise") else "06:02"
    sunset_str = daily_ext.get("sunset", ["2026-08-05T17:54"])[0].split("T")[1][:5] if daily_ext.get("sunset") else "17:54"

    return {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WICC)",
            "raw_metar": metar.get("rawOb") or "METAR WICC 050600Z 18006KT 9999 FEW018 31/21 Q1010",
            "raw_taf": taf.get("rawTAF") or "TAF WICC 050000Z 0503/0524 17008KT 9999 FEW020",
            "timestamp_wib": metar.get("obsTime", "")
        },
        "thermodynamics": {
            "temp_2m": temp,
            "rh_2m": rh,
            "dew_point": dewp,
            "msl_pressure": altim_hpa,
            "surface_pressure": round(altim_hpa - 85.0, 1),
            "heat_index": heat_index,
            "kp_index": "1 (0-9)"
        },
        "runways": {
            "id": "11/29",
            "heading": "110° - 290°",
            "crosswind_kt": crosswind_kt,
            "headwind_kt": headwind_kt,
            "crosswind_pct": int(crosswind_pct)
        },
        "daylight": {
            "sunrise": sunrise_str,
            "midday": "11:58",
            "sunset": sunset_str,
            "duration": "11:52h"
        },
        "wind_profile": wind_levels,
        "clouds_precipitation": {
            "precipitation_mm": 0.0,
            "cloud_cover_octa": cloud_octa,
            "cloud_desc": cloud_desc,
            "cloud_cover_low_pct": 20
        },
        "minutely_15": min15,
        "raw_daily_payload": daily_ext
    }