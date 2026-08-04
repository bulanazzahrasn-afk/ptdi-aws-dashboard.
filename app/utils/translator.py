from datetime import datetime
import zoneinfo

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

def kmh_to_knots(kmh):
    if kmh is None:
        return 0.0
    return round(float(kmh) * 0.539957, 1)

def percent_to_octa(percent):
    if percent is None:
        return "0/8"
    p = float(percent)
    if p <= 0: return "0/8"
    elif p <= 18: return "1/8"
    elif p <= 31: return "2/8"
    elif p <= 43: return "3/8"
    elif p <= 56: return "4/8"
    elif p <= 68: return "5/8"
    elif p <= 81: return "6/8"
    elif p <= 93: return "7/8"
    else: return "8/8"

def utc_to_wib(utc_str: str) -> str:
    if not utc_str:
        return "-"
    try:
        dt = datetime.fromisoformat(str(utc_str).replace("Z", "+00:00"))
        wib_dt = dt.astimezone(zoneinfo.ZoneInfo("Asia/Jakarta"))
        return wib_dt.strftime("%Y-%m-%d %H:%M:%S WIB")
    except Exception:
        return str(utc_str)

def safe_val(val, default=0.0):
    return val if val is not None else default

def translate_aws_payload(raw: dict) -> dict:
    curr = raw.get("current", {})
    
    # Profil Angin dalam Knots & Ketinggian Feet
    wind_levels = {
        "33ft": {
            "speed_kt": kmh_to_knots(curr.get("wind_speed_10m")),
            "dir_deg": safe_val(curr.get("wind_direction_10m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_10m"))
        },
        "260ft": {
            "speed_kt": kmh_to_knots(curr.get("wind_speed_80m")),
            "dir_deg": safe_val(curr.get("wind_direction_80m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_80m"))
        },
        "400ft": {
            "speed_kt": kmh_to_knots(curr.get("wind_speed_120m")),
            "dir_deg": safe_val(curr.get("wind_direction_120m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_120m"))
        },
        "600ft": {
            "speed_kt": kmh_to_knots(curr.get("wind_speed_180m")),
            "dir_deg": safe_val(curr.get("wind_direction_180m")),
            "dir_compass": deg_to_compass(curr.get("wind_direction_180m"))
        },
        "gusts_kt": kmh_to_knots(curr.get("wind_gusts_10m"))
    }

    cloud_total_pct = safe_val(curr.get("cloud_cover"), 0)
    cloud_low_pct = safe_val(curr.get("cloud_cover_low"), 0)
    precip_val = safe_val(curr.get("precipitation"), 0.0)

    translated = {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WABB)",
            "runway": "RWY 11/29 (110° / 290°)",
            "latitude": raw.get("latitude", HUSEIN_LAT),
            "longitude": raw.get("longitude", HUSEIN_LON),
            "elevation_ft": 2428, # 740 meter = ~2428 ft
            "timestamp_wib": utc_to_wib(curr.get("time", "")),
            "is_day": "Siang" if curr.get("is_day") == 1 else "Malam"
        },
        "thermodynamics": {
            "temp_2m": safe_val(curr.get("temperature_2m")),
            "rh_2m": safe_val(curr.get("relative_humidity_2m")),
            "dew_point": safe_val(curr.get("dew_point_2m")),
            "msl_pressure": safe_val(curr.get("pressure_msl")),
            "surface_pressure": safe_val(curr.get("surface_pressure"))
        },
        "wind_profile": wind_levels,
        "clouds_precipitation": {
            "precipitation_mm": precip_val,
            "cloud_cover_octa": percent_to_octa(cloud_total_pct),
            "cloud_cover_pct": cloud_total_pct,
            "cloud_cover_low_pct": cloud_low_pct,
            "cloud_cover_mid_pct": safe_val(curr.get("cloud_cover_mid")),
            "cloud_cover_high_pct": safe_val(curr.get("cloud_cover_high"))
        },
        "raw_current_payload": curr,
        "raw_hourly_payload": raw.get("hourly", {}),
        "raw_daily_payload": raw.get("daily", {}),
        "minutely_15": raw.get("minutely_15", {})
    }
    return translated