import httpx
from typing import Dict, Any

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Koordinat Bandara Husein Sastranegara (BDO/WABB) / PTDI Bandung
LATITUDE = -6.9006
LONGITUDE = 107.5762

async def fetch_open_meteo_raw() -> Dict[str, Any]:
    params = {
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "current": [
            "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
            "precipitation", "rain", "showers", "weather_code", "cloud_cover",
            "pressure_msl", "surface_pressure", "wind_speed_10m", "wind_direction_10m",
            "wind_gusts_10m", "shortwave_radiation", "direct_radiation", "diffuse_radiation",
            "direct_normal_irradiance", "global_tilted_irradiance", "terrestrial_radiation",
            "uv_index", "uv_index_clear_sky"
        ],
        "hourly": [
            "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m"
        ],
        # MINTA DATA INTERVAL 15 MENIT DARI OPEN-METEO
        "minutely_15": [
            "temperature_2m", "relative_humidity_2m", "surface_pressure", "pressure_msl",
            "wind_speed_10m", "wind_direction_10m", "uv_index", "precipitation"
        ],
        "timezone": "Asia/Jakarta"
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        return response.json()