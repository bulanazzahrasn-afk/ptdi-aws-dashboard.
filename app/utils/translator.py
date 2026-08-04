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

def cover_to_octa(cover_code: str) -> str:
    if not cover_code:
        return "0/8"
    c = str(cover_code).upper()
    if c in ["SKC", "CLR", "NSC"]:
        return "0/8 (Clear)"
    elif c == "FEW":
        return "1-2/8 (Few)"
    elif c == "SCT":
        return "3-4/8 (Scattered)"
    elif c == "BKN":
        return "5-7/8 (Broken)"
    elif c == "OVC":
        return "8/8 (Overcast)"
    return f"{c}"

def translate_aws_payload(raw: dict) -> dict:
    # Safe extraction keys
    report_time = raw.get("reportTime") or raw.get("receiptTime") or raw.get("obsTime")
    wib_str = "-"
    if report_time:
        try:
            dt = datetime.fromisoformat(str(report_time).replace("Z", "+00:00"))
            wib_str = dt.astimezone(zoneinfo.ZoneInfo("Asia/Jakarta")).strftime("%Y-%m-%d %H:%M:%S WIB")
        except Exception:
            wib_str = str(report_time)

    # Param WICC METAR NOAA
    wind_spd_kt = raw.get("wspd") if raw.get("wspd") is not None else raw.get("wdir_spd", 0)
    wind_dir_deg = raw.get("wdir") if raw.get("wdir") is not None else 0
    wind_gust_kt = raw.get("wgst") if raw.get("wgst") is not None else wind_spd_kt
    
    temp_c = raw.get("temp", "--")
    dew_c = raw.get("dewp", "--")
    altim_hpa = raw.get("altim", 1013)
    visib = raw.get("visib", "10+")

    # Calculate RH
    rh_calc = "--"
    if isinstance(temp_c, (int, float)) and isinstance(dew_c, (int, float)):
        rh_calc = round(100 - (5 * (temp_c - dew_c)))

    # Cloud Layer
    clouds = raw.get("clouds", [])
    primary_cover = clouds[0].get("cover", "CLR") if (isinstance(clouds, list) and len(clouds) > 0) else "CLR"
    cloud_octa = cover_to_octa(primary_cover)

    raw_metar_str = raw.get("rawOb") or raw.get("rawMetar") or f"METAR WICC {wind_dir_deg:03d}{wind_spd_kt:02d}KT"

    translated = {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WICC)",
            "runway": "RWY 11/29 (110° / 290°)",
            "latitude": -6.9006,
            "longitude": 107.5762,
            "elevation_ft": 2428,
            "timestamp_wib": wib_str,
            "raw_metar": raw_metar_str
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
                "speed_kt": wind_spd_kt,
                "dir_deg": wind_dir_deg,
                "dir_compass": deg_to_compass(wind_dir_deg)
            },
            "gusts_kt": wind_gust_kt
        },
        "clouds_precipitation": {
            "precipitation_mm": 0.0,
            "cloud_cover_octa": cloud_octa,
            "visibility": visib
        },
        "raw_metar_payload": raw
    }
    return translated