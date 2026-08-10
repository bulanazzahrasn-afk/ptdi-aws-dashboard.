from datetime import datetime, timezone
import math

COMPASS_SECTORS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
]

KTS_PER_MS = 1.943844492
RUNWAY_11_HEADING = 110.0


def deg_to_compass(deg) -> str:
    if deg is None:
        return "N/A"
    try:
        return COMPASS_SECTORS[int((float(deg) + 11.25) / 22.5) % 16]
    except (ValueError, TypeError):
        return "N/A"


def safe_val(val, default=0.0):
    return default if val is None else val


def ms_to_kt(value) -> float:
    return round(float(safe_val(value, 0.0)) * KTS_PER_MS, 1)


def _cloud_group(cloud_cover_pct: float):
    if cloud_cover_pct <= 10:
        return "0/8 (SKC)", "SKC"
    if cloud_cover_pct <= 25:
        return "1-2/8 (FEW)", "FEW018"
    if cloud_cover_pct <= 50:
        return "3-4/8 (SCT)", "SCT018"
    if cloud_cover_pct <= 87:
        return "5-7/8 (BKN)", "BKN018"
    return "8/8 (OVC)", "OVC018"


def _visibility(precip: float, rh: float, spread: float):
    if precip > 0.5:
        return "4000", "4 km", "RA "
    if rh > 90 and spread <= 2:
        return "2000", "2 km", "FG "
    if rh > 75 or (spread >= 5 and spread is not None):
        return "4000", "4 km", "HZ "
    if rh > 65:
        return "7000", "7 km", ""
    return "9999", "10 km", ""


def _runway_wind(wind_speed_kt: float, wind_direction_deg: float, runway_heading: float = RUNWAY_11_HEADING):
    """Return signed headwind/tailwind and crosswind components for a runway."""
    delta = math.radians((wind_direction_deg - runway_heading) % 360)
    longitudinal = wind_speed_kt * math.cos(delta)
    crosswind = abs(wind_speed_kt * math.sin(delta))
    return round(max(longitudinal, 0.0), 1), round(max(-longitudinal, 0.0), 1), round(crosswind, 1)


def translate_aws_payload(raw: dict) -> dict:
    current = raw.get("current", {})
    hourly = raw.get("hourly", {})
    daily_ext = raw.get("daily_ext", {})
    min15 = raw.get("minutely_15", {})
    source = raw.get("source", {})

    temp = float(safe_val(current.get("temperature_2m"), 0.0))
    dewp = float(safe_val(current.get("dew_point_2m"), 0.0))
    altim_hpa = float(safe_val(current.get("pressure_msl"), 0.0))
    surf_press = float(safe_val(current.get("surface_pressure"), 0.0))
    rh = float(safe_val(current.get("relative_humidity_2m"), 0.0))
    precip = float(safe_val(current.get("precipitation"), 0.0))
    cloud_cover_pct = float(safe_val(current.get("cloud_cover"), 0.0))

    hourly_times = hourly.get("time", [])
    hourly_clouds = hourly.get("cloud_cover", [])
    current_time = current.get("time")
    if current_time and hourly_times and hourly_clouds:
        try:
            idx = hourly_times.index(current_time[:13] + ":00")
            if idx < len(hourly_clouds) and hourly_clouds[idx] is not None:
                cloud_cover_pct = float(hourly_clouds[idx])
        except (ValueError, TypeError):
            pass

    spread = max(temp - dewp, 0.0)
    heat_index = round(temp + (0.5555 * (6.11 * math.exp(5417.7530 * (1 / 273.16 - 1 / (273.15 + dewp))) - 10)), 1) if dewp > 0 else temp

    wspd_kt = ms_to_kt(current.get("wind_speed_10m"))
    wdir_deg = int(round(float(safe_val(current.get("wind_direction_10m"), 0)))) % 360
    wgst_kt = ms_to_kt(current.get("wind_gusts_10m"))

    headwind_kt, tailwind_kt, crosswind_kt = _runway_wind(wspd_kt, wdir_deg)
    crosswind_pct = round((crosswind_kt / wspd_kt) * 100) if wspd_kt else 0

    wind_levels = {
        "surface": {
            "label": "33 ft (Angin Permukaan)",
            "speed_kt": wspd_kt,
            "dir_deg": wdir_deg,
            "dir_compass": deg_to_compass(wdir_deg),
        },
        "lvl_025": {
            "label": "250 ft (Angin Lapisan Rendah)",
            "speed_kt": ms_to_kt(current.get("wind_speed_80m")),
            "dir_deg": int(safe_val(current.get("wind_direction_80m"), wdir_deg)),
            "dir_compass": deg_to_compass(current.get("wind_direction_80m", wdir_deg)),
        },
        "lvl_040": {
            "label": "400 ft (Terminal Winds)",
            "speed_kt": ms_to_kt(current.get("wind_speed_120m")),
            "dir_deg": int(safe_val(current.get("wind_direction_120m"), wdir_deg)),
            "dir_compass": deg_to_compass(current.get("wind_direction_120m", wdir_deg)),
        },
        "lvl_060": {
            "label": "600 ft (Angin Ketinggian Rendah)",
            "speed_kt": ms_to_kt(current.get("wind_speed_180m")),
            "dir_deg": int(safe_val(current.get("wind_direction_180m"), wdir_deg)),
            "dir_compass": deg_to_compass(current.get("wind_direction_180m", wdir_deg)),
        },
        "gusts_kt": wgst_kt,
    }

    vis_code, vis_km_str, weather_qualifier = _visibility(precip, rh, spread)
    cloud_octa, metar_cloud = _cloud_group(cloud_cover_pct)

    now_utc = datetime.now(timezone.utc)
    timestamp = current.get("time") or now_utc.isoformat()
    day_z = now_utc.strftime("%d")
    hour_z = now_utc.strftime("%H")
    min_z = "30" if now_utc.minute >= 30 else "00"
    wind_str = f"{wdir_deg:03d}{int(wspd_kt):02d}KT"
    if wgst_kt > wspd_kt + 5:
        wind_str = f"{wdir_deg:03d}{int(wspd_kt):02d}G{int(wgst_kt):02d}KT"

    qnh_str = f"Q{int(round(altim_hpa))}" if altim_hpa else "Q////"
    temp_dew_str = f"{int(round(temp)):02d}/{int(round(dewp)):02d}"

    # These are derived/synthetic strings, not official observations.
    synth_metar = (
        f"METAR-LIKE WICC {day_z}{hour_z}{min_z}Z {wind_str} {vis_code} "
        f"{weather_qualifier}{metar_cloud} {temp_dew_str} {qnh_str}"
    )
    synth_taf = (
        f"TAF-LIKE WICC {day_z}{hour_z}00Z "
        f"{day_z}{hour_z}/{int(day_z) + 1:02d}{hour_z} {wind_str} {vis_code} "
        f"{weather_qualifier}{metar_cloud}"
    )

    sunrise_values = daily_ext.get("sunrise") or []
    sunset_values = daily_ext.get("sunset") or []
    sunrise_str = sunrise_values[0].split("T", 1)[1][:5] if sunrise_values else "--:--"
    sunset_str = sunset_values[0].split("T", 1)[1][:5] if sunset_values else "--:--"

    return {
        "metadata": {
            "location": "Bandara Husein Sastranegara (BDO/WICC)",
            "data_source": source.get("provider", "Open-Meteo"),
            "source_type": "forecast_model_data",
            "report_status": "DERIVED / SYNTHETIC — NOT OFFICIAL METAR/TAF",
            "raw_metar": synth_metar,
            "raw_taf": synth_taf,
            "timestamp_wib": timestamp,
        },
        "thermodynamics": {
            "temp_2m": round(temp, 1),
            "rh_2m": round(rh, 1),
            "dew_point": round(dewp, 1),
            "msl_pressure": round(altim_hpa, 1),
            "surface_pressure": round(surf_press, 1),
            "heat_index": heat_index,
            "visibility_km": vis_km_str,
        },
        "runways": {
            "id": "11/29",
            "heading": "110° / 290°",
            "crosswind_kt": crosswind_kt,
            "headwind_kt": headwind_kt,
            "tailwind_kt": tailwind_kt,
            "crosswind_pct": int(crosswind_pct),
        },
        "daylight": {
            "sunrise": sunrise_str,
            "midday": "--:--",
            "sunset": sunset_str,
            "duration": "--",
        },
        "wind_profile": wind_levels,
        "clouds_precipitation": {
            "precipitation_mm": precip,
            "cloud_cover_octa": cloud_octa,
            "cloud_cover_pct": round(cloud_cover_pct, 1),
        },
        "minutely_15": min15,
        "raw_daily_payload": daily_ext,
    }
