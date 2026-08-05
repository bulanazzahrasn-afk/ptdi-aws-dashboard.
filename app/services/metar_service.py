import httpx
from typing import Dict, Any

NOAA_METAR_URL = "https://aviationweather.gov/api/data/metar?ids=WICC&format=json"
NOAA_TAF_URL = "https://aviationweather.gov/api/data/taf?ids=WICC&format=json"
OPEN_METEO_DAILY_EXT = "https://api.open-meteo.com/v1/forecast?latitude=-6.9006&longitude=107.5762&current=wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m,wind_speed_180m,wind_direction_180m&daily=sunrise,sunset&minutely_15=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,precipitation&forecast_days=1&timezone=Asia%2FJakarta"

async def fetch_metar_taf_wicc() -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        metar_res = await client.get(NOAA_METAR_URL)
        metar_data = metar_res.json() if metar_res.status_code == 200 and metar_res.json() else [{}]

        taf_res = await client.get(NOAA_TAF_URL)
        taf_data = taf_res.json() if taf_res.status_code == 200 and taf_res.json() else [{}]

        upper_res = await client.get(OPEN_METEO_DAILY_EXT)
        upper_data = upper_res.json() if upper_res.status_code == 200 else {}

        return {
            "metar": metar_data[0] if isinstance(metar_data, list) and len(metar_data) > 0 else {},
            "taf": taf_data[0] if isinstance(taf_data, list) and len(taf_data) > 0 else {},
            "upper_wind": upper_data.get("current", {}),
            "daily_sun": upper_data.get("daily", {}),
            "minutely_15": upper_data.get("minutely_15", {})
        }