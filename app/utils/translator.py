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
    current = raw.get("current", {})
    daily_ext = raw.get("daily_ext", {})
    min15 = raw.get("minutely_15", {})

    temp = safe_val(current.get("temperature_2m"), 31.0)
    dewp = safe_val(current.get("dew_point_2m"), 21.0)
    altim_hpa = safe_val(current.get("pressure_msl"), 1010.0)
    surf_press = safe_val(current.get("surface_pressure"), 925.0)
    rh = safe_val(current.get("relative_humidity_2m"), 50)
    precip = safe_val(current.get("precipitation"), 0.0)
    cloud_cover_pct = safe_val(current.get("cloud_cover"), 30.0)

    heat_index = round(temp + (0.5555 * (6.11 * math.exp(5417.7530 * (1/273.16 - 1/(273.15 + dewp))) - 10)), 1) if dewp else temp + 2

    wspd_ms = safe_val(current.get("wind_speed_10m"), 3.0)
    wspd_kt = round(wspd_ms * 0.539957, 1) if wspd_ms > 10 else round(wspd_ms, 1)
    wdir_deg = int(safe_val(current.get("wind_direction_10m"), 180))
    wgst_ms = safe_val(current.get("wind_gusts_10m"), wspd_ms * 1.3)
    wgst_kt = round(wgst_ms * 0.539957, 1) if wgst_ms > 10 else round(wgst_ms, 1)

    angle_rad = abs(wdir_deg - 110) * (math.pi / 180)
    crosswind_kt = round(abs(wspd_kt * math.sin(angle_rad)), 1)
    headwind_kt = round(wspd_kt * math.cos(angle_rad), 1)
    crosswind_pct = round((crosswind_kt / wspd_kt * 100), 0) if wspd_kt > 0 else 0

    wind_levels = {
        "surface": {"label": "33 ft (Angin Permukaan)", "speed_kt": wspd_kt, "dir_deg": wdir_deg, "dir_compass": deg_to_compass(wdir_deg)},
        "lvl_025": {"label": "250 ft (Angin Lapisan Rendah)", "speed_kt": round(safe_val(current.get("wind_speed_80m"), wspd_ms) * 0.539957, 1), "dir_deg": current.get("wind_direction_80m", wdir_deg), "dir_compass": deg_to_compass(current.get("wind_direction_80m", wdir_deg))},
        "lvl_040": {"label": "400 ft (Terminal Winds)", "speed_kt": round(safe_val(current.get("wind_speed_120m"), wspd_ms) * 0.539957, 1), "dir_deg": current.get("wind_direction_120m", wdir_deg), "dir_compass": deg_to_compass(current.get("wind_direction_120m", wdir_deg))},
        "lvl_060": {"label": "600 ft (Angin Ketinggian Jelajah)", "speed_kt": round(safe_val(current.get("wind_speed_180m"), wspd_ms) * 0.539957, 1), "dir_deg": current.get("wind_direction_180m", wdir_deg), "dir_compass": deg_to_compass(current.get("wind_direction_180m", wdir_deg))},
        "gusts_kt": wgst_kt
    }

    # VISIBILITAS & CUACA DINAMIS BERDASARKAN PARAMETER AKTUAL
    vis_code = "9999"
    vis_km_str = "10 km"
    weather_qualifier = ""
    
    if precip > 0.5:
        vis_code = "4000"
        vis_km_str = "4 km"
        weather_qualifier = "RA "
    elif rh > 88:
        vis_code = "3000"
        vis_km_str = "3 km"
        weather_qualifier = "FG "
    elif rh > 78:
        vis_code = "6000"
        vis_km_str = "6 km"
        weather_qualifier = "HZ "

    if cloud_cover_pct <= 10:
        cloud_octa = "0/8 (SKC)"
        metar_cloud = "SKC"
    elif cloud_cover_pct <= 25:
        cloud_octa = "1-2/8 (FEW)"
        metar_cloud = "FEW018"
    elif cloud_cover_pct <= 50:
        cloud_octa = "3-4/8 (SCT)"
        metar_cloud = "SCT018"
    elif cloud_cover_pct <= 87:
        cloud_octa = "5-7/8 (BKN)"
        metar_cloud = "BKN018"
    else:
        cloud_octa = "8/8 (OVC)"
        metar_cloud = "OVC018"

    now_utc = datetime.utcnow()
    day_z = now_utc.strftime("%d")
    hour_z = now_utc.strftime("%H")
    min_z = "30" if int(now_utc.strftime("%M")) >= 30 else "00"
    
    wind_str = f"{str(wdir_deg).zfill(3)}{str(int(wspd_kt)).zfill(2)}KT"
    qnh_str = f"Q{int(altim_hpa)}"
    temp_dew_str = f"{int(temp):02d}/{int(dewp):02d}"

    synth_metar = f"SAID40 WICC {day_z}{hour_z}{min_z}\nMETAR WICC {day_z}{hour_z}{min_z}Z {wind_str} {vis_code} {weather_qualifier}{metar_cloud} {temp_dew_str} {qnh_str} NOSIG="
    synth_taf = f"FTID40 WICC {day_z}{hour_z}00\nTAF WICC {day_z}{hour_z}00Z {(int(day_z)):02d}{(int(hour_z)):02d}/{(int(day_z)+1):02d}{(int(hour_z)):02d} {wind_str} {vis_code} {weather_qualifier}{metar_cloud} BECMG 0602/0604 08012KT 8000 FEW020="

    sunrise_str = daily_ext.get("sunrise", ["2026-08-06T06:02"])[0].split("T")[1][:5] if daily_ext.get("sunrise") else "06:02"
    sunset_str = daily_ext.get("sunset", ["2026-08-06T17:54"])[0].split("T")[1][:5] if daily_ext.get("sunset") else "17:54"

    return {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WICC)",
            "raw_metar": synth_metar,
            "raw_taf": synth_taf,
            "timestamp_wib": current.get("time", "")
        },
        "thermodynamics": {
            "temp_2m": temp,
            "rh_2m": rh,
            "dew_point": dewp,
            "msl_pressure": altim_hpa,
            "surface_pressure": surf_press,
            "heat_index": heat_index,
            "kp_index": "1 (0-9)",
            "visibility_km": vis_km_str
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
            "precipitation_mm": precip,
            "cloud_cover_octa": cloud_octa,
            "cloud_cover_pct": cloud_cover_pct
        },
        "minutely_15": min15,
        "raw_daily_payload": daily_ext
    }