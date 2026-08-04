import httpx
from typing import Dict, Any

# Endpoint Resmi NOAA Aviation Weather Center
NOAA_METAR_URL = "https://aviationweather.gov/api/data/metar"
STATION_ICAO = "WICC"  # Bandara Husein Sastranegara, Bandung

async def fetch_noaa_metar_raw() -> Dict[str, Any]:
    params = {
        "ids": STATION_ICAO,
        "format": "json"
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(NOAA_METAR_URL, params=params)
        response.raise_for_status()
        data = response.json()
        
        if data and len(data) > 0:
            return data[0]  # Mengambil observasi METAR WICC paling baru dari NOAA
        
        raise Exception(f"Data METAR NOAA untuk stasiun {STATION_ICAO} tidak ditemukan.")