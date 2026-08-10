import httpx
from typing import Any, Dict

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

PARAMS = {
    "latitude": -6.9006,
    "longitude": 107.5762,
    "timezone": "Asia/Jakarta",
    "forecast_days": 3,
    "current": ",".join([
        "temperature_2m",
        "relative_humidity_2m",
        "surface_pressure",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "dew_point_2m",
        "precipitation",
        "cloud_cover",
        "wind_speed_80m",
        "wind_direction_80m",
        "wind_speed_120m",
        "wind_direction_120m",
        "wind_speed_180m",
        "wind_direction_180m",
    ]),
    "hourly": ",".join([
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "cloud_cover",
        "dew_point_2m",
        "surface_pressure",
        "pressure_msl",
    ]),
    "daily": ",".join([
        "sunrise",
        "sunset",
        "temperature_2m_max",
        "temperature_2m_min",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "wind_direction_10m_dominant",
        "precipitation_sum",
    ]),
    "minutely_15": ",".join([
        "temperature_2m",
        "relative_humidity_2m",
        "surface_pressure",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "precipitation",
    ]),
}


async def fetch_metar_taf_wicc() -> Dict[str, Any]:
    """Fetch the latest forecast/observation-style weather payload for WICC.

    The source is Open-Meteo. The returned payload is deliberately kept close
    to the upstream schema so the aviation translation layer remains testable.
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
        response = await client.get(OPEN_METEO_URL, params=PARAMS)
        response.raise_for_status()
        data = response.json()

    if not isinstance(data, dict) or "current" not in data:
        raise RuntimeError("Open-Meteo returned an invalid weather payload")

    return {
        "current": data.get("current", {}),
        "hourly": data.get("hourly", {}),
        "daily_ext": data.get("daily", {}),
        "minutely_15": data.get("minutely_15", {}),
        "source": {
            "provider": "Open-Meteo",
            "latitude": PARAMS["latitude"],
            "longitude": PARAMS["longitude"],
            "timezone": PARAMS["timezone"],
        },
    }
