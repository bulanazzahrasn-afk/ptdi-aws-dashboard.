import httpx
from typing import Dict, Any

# Endpoint Resmi NOAA Aviation Weather Center untuk METAR In-Situ Observation
NOAA_METAR_URL = "https://aviationweather.gov/api/data/metar"
STATION_ICAO = "WICC"  # Kode ICAO Resmi Bandara Husein Sastranegara, Bandung

async def fetch_open_meteo_raw() -> Dict[str, Any]:
    params = {
        "ids": STATION_ICAO,
        "format": "json"
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(NOAA_METAR_URL, params=params)
        response.raise_for_status()
        data = response.json()
        
        if data and len(data) > 0:
            return data[0]  # Mengembalikan objek observasi METAR terbaru WICC
        
        raise Exception(f"Data METAR untuk stasiun {STATION_ICAO} tidak ditemukan.")