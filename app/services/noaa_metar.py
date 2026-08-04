import httpx
from typing import Dict, Any

# Endpoint Resmi NOAA Aviation Weather Center
NOAA_METAR_URL = "https://aviationweather.gov/api/data/metar"
STATION_ICAO = "WICC"

async def fetch_noaa_metar_raw() -> Dict[str, Any]:
    params = {
        "ids": STATION_ICAO,
        "format": "json"
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    async with httpx.AsyncClient(timeout=15.0, headers=headers, follow_redirects=True) as client:
        response = await client.get(NOAA_METAR_URL, params=params)
        response.raise_for_status()
        data = response.json()
        
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        elif isinstance(data, dict):
            return data
            
        raise Exception(f"Format respon METAR NOAA untuk {STATION_ICAO} tidak sesuai.")