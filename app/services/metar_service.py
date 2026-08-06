import httpx
from typing import Dict, Any

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast?latitude=-6.9006&longitude=107.5762&current=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,precipitation,cloud_cover&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,cloud_cover&current=wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m,wind_speed_180m,wind_direction_180m&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_sum&minutely_15=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,precipitation&forecast_days=2&timezone=Asia%2FJakarta"

async def fetch_metar_taf_wicc() -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(OPEN_METEO_URL)
        data = res.json() if res.status_code == 200 else {}

        return {
            "current": data.get("current", {}),
            "hourly": data.get("hourly", {}),
            "daily_ext": data.get("daily", {}),
            "minutely_15": data.get("minutely_15", {})
        }