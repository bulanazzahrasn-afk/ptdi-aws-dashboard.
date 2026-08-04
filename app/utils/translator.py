from datetime import datetime
import zoneinfo

COMPASS_SECTORS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
]

def deg_to_compass(deg) -> str:
    if deg is None or deg == "VRB":
        return "VRB"
    try:
        idx = int((float(deg) + 11.25) / 22.5) % 16
        return COMPASS_SECTORS[idx]
    except (ValueError, TypeError):
        return "N/A"

def translate_aws_payload(raw: dict) -> dict:
    wib_str = "-"
    report_time = raw.get("reportTime")
    if report_time:
        try:
            dt = datetime.fromisoformat(str(report_time).replace("Z", "+00:00"))
            wib_str = dt.astimezone(zoneinfo.ZoneInfo("Asia/Jakarta")).strftime("%Y-%m-%d %H:%M:%S WIB")
        except Exception:
            wib_str = str(report_time)

    temp_c = raw.get("temp", 0)
    dew_c = raw.get("dewp", 0)
    altim_hpa = raw.get("altim", 1013)
    wind_spd = raw.get("wspd", 0)
    wind_dir = raw.get("wdir", 0)
    wind_gust = raw.get("wgst", wind_spd)

    rh_calc = "--"
    if isinstance(temp_c, (int, float)) and isinstance(dew_c, (int, float)):
        rh_calc = max(0, min(100, round(100 - (5 * (temp_c - dew_c)))))

    source_label = raw.get("_source", "NOAA WICC")
    raw_metar_str = raw.get("rawOb") or f"METAR WICC {wind_dir:03d}{wind_spd:02d}KT"

    translated = {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WICC)",
            "runway": "RWY 11/29 (110° / 290°)",
            "latitude": -6.9006,
            "longitude": 107.5762,
            "elevation_ft": 2428,
            "timestamp_wib": wib_str,
            "raw_metar": f"[{source_label}] {raw_metar_str}"
        },
        "thermodynamics": {
            "temp_2m": temp_c,
            "rh_2m": rh_calc,
            "dew_point": dew_c,
            "msl_pressure": altim_hpa,
            "surface_pressure": round(altim_hpa - 85.5, 1) if isinstance(altim_hpa, (int, float)) else "--"
        },
        "wind_profile": {
            "33ft": {
                "speed_kt": wind_spd,
                "dir_deg": wind_dir,
                "dir_compass": deg_to_compass(wind_dir)
            },
            "gusts_kt": wind_gust
        },
        "clouds_precipitation": {
            "precipitation_mm": 0.0,
            "cloud_cover_octa": "1-2/8 (FEW)",
            "visibility": raw.get("visib", "10+")
        }
    }
    return translated