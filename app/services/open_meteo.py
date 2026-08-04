import httpx
from typing import Dict, Any

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Koordinat Bandara Husein Sastranegara (BDO/WICC), Bandung
LATITUDE = -6.9006
LONGITUDE = 107.5762

async def fetch_open_meteo_raw() -> Dict[str, Any]:
    params = {
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        # DATA REAL-TIME SAAT INI
        "current": [
            "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
            "precipitation", "rain", "showers", "weather_code", "cloud_cover",
            "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
            "pressure_msl", "surface_pressure", "wind_speed_10m", "wind_direction_10m",
            "wind_gusts_10m", "dew_point_2m"
        ],
        # DATA PRAKIRAAN PER JAM (HOURLY FORECAST)
        "hourly": [
            "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m",
            "pressure_msl", "precipitation", "cloud_cover"
        ],
        # DATA OBS LOG 15-MENITAN
        "minutely_15": [
            "temperature_2m", "relative_humidity_2m", "surface_pressure", "pressure_msl",
            "wind_speed_10m", "wind_direction_10m", "precipitation"
        ],
        # DATA PRAKIRAAN HARIAN 2 HARI (HARI INI & BESOK)
        "daily": [
            "weather_code", "temperature_2m_max", "temperature_2m_min",
            "precipitation_sum", "wind_speed_10m_max", "wind_gusts_10m_max",
            "wind_direction_10m_dominant"
        ],
        "forecast_days": 2,
        "timezone": "Asia/Jakarta"
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        return response.json()