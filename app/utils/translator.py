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
    return "0/8"

def translate_aws_payload(raw: dict) -> dict:
    # Waktu Observasi METAR ke WIB
    wib_str = "-"
    report_time = raw.get("reportTime")
    if report_time:
        try:
            dt = datetime.fromisoformat(report_time.replace("Z", "+00:00"))
            wib_str = dt.astimezone(zoneinfo.ZoneInfo("Asia/Jakarta")).strftime("%Y-%m-%d %H:%M:%S WIB")
        except Exception:
            wib_str = str(report_time)

    # Param WICC METAR
    wind_spd_kt = raw.get("wspd", 0)
    wind_dir_deg = raw.get("wdir", 0)
    wind_gust_kt = raw.get("wgst", wind_spd_kt)
    temp_c = raw.get("temp", 0)
    dew_c = raw.get("dewp", 0)
    altim_hpa = raw.get("altim", 1013)  # QNH dalam hPa
    visib = raw.get("visib", "10+")

    # Kalkulasi Kelembapan Relatif (RH) dari Temp & Dew Point
    rh_calc = 100 - (5 * (temp_c - dew_c)) if temp_c and dew_c else "--"

    # Cloud Layer
    clouds = raw.get("clouds", [])
    primary_cover = clouds[0].get("cover", "CLR") if clouds else "CLR"
    cloud_octa = cover_to_octa(primary_cover)

    translated = {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WICC)",
            "runway": "RWY 11/29 (110° / 290°)",
            "latitude": -6.9006,
            "longitude": 107.5762,
            "elevation_ft": 2428,
            "timestamp_wib": wib_str,
            "raw_metar": raw.get("rawOb", "")
        },
        "thermodynamics": {
            "temp_2m": temp_c,
            "rh_2m": rh_calc,
            "dew_point": dew_c,
            "msl_pressure": altim_hpa,
            "surface_pressure": round(altim_hpa - 85.5, 1)  # Estimasi QFE dari elevasi BDO
        },
        "wind_profile": {
            "33ft": {
                "speed_kt": wind_spd_kt,
                "dir_deg": wind_dir_deg,
                "dir_compass": deg_to_compass(wind_dir_deg)
            },
            "260ft": {"speed_kt": wind_spd_kt, "dir_deg": wind_dir_deg, "dir_compass": deg_to_compass(wind_dir_deg)},
            "400ft": {"speed_kt": wind_spd_kt, "dir_deg": wind_dir_deg, "dir_compass": deg_to_compass(wind_dir_deg)},
            "600ft": {"speed_kt": wind_spd_kt, "dir_deg": wind_dir_deg, "dir_compass": deg_to_compass(wind_dir_deg)},
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