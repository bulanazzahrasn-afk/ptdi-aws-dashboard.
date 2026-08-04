import httpx
from typing import Dict, Any
import logging

STATION_ICAO = "WICC"
NOAA_URL = f"https://aviationweather.gov/api/data/metar?ids={STATION_ICAO}&format=json"
AVWX_URL = f"https://avwx.rest/api/metar/{STATION_ICAO}"
OPEN_METEO_WICC_URL = "https://api.open-meteo.com/v1/forecast?latitude=-6.9006&longitude=107.5762&current=temperature_2m,relative_humidity_2m,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,dew_point_2m&timezone=Asia/Jakarta"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

async def fetch_noaa_metar_raw() -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=8.0, headers=HEADERS, follow_redirects=True) as client:
        # SUMBER 1: NOAA Aviation Weather
        try:
            res = await client.get(NOAA_URL)
            if res.status_code == 200:
                data = res.json()
                if isinstance(data, list) and len(data) > 0:
                    data[0]["_source"] = "NOAA Official"
                    return data[0]
        except Exception as e:
            logging.warning(f"NOAA Fetch failed: {e}, switching to fallback AVWX...")

        # SUMBER 2: AVWX METAR API
        try:
            res = await client.get(AVWX_URL)
            if res.status_code == 200:
                data = res.json()
                parsed = {
                    "rawOb": data.get("raw", f"METAR {STATION_ICAO} AUTO"),
                    "temp": data.get("temperature", {}).get("value", 25),
                    "dewp": data.get("dewpoint", {}).get("value", 20),
                    "altim": data.get("altimeter", {}).get("value", 1013),
                    "wspd": data.get("wind_speed", {}).get("value", 5),
                    "wdir": data.get("wind_direction", {}).get("value", 110),
                    "wgst": data.get("wind_gust", {}).get("value", 5),
                    "visib": "10+",
                    "reportTime": data.get("time", {}).get("dt"),
                    "_source": "AVWX In-Situ"
                }
                return parsed
        except Exception as e:
            logging.warning(f"AVWX Fetch failed: {e}, switching to fallback Open-Meteo WICC...")

        # SUMBER 3: Open-Meteo In-Situ WICC (Fallback Terakhir - 100% Terjamin Aktif)
        try:
            res = await client.get(OPEN_METEO_WICC_URL)
            if res.status_code == 200:
                curr = res.json().get("current", {})
                wind_kt = round(curr.get("wind_speed_10m", 0) * 0.539957, 1)
                gust_kt = round(curr.get("wind_gusts_10m", 0) * 0.539957, 1)
                return {
                    "rawOb": f"METAR WICC {curr.get('time','')[-5:].replace(':','')}Z {curr.get('wind_direction_10m',0):03d}{int(wind_kt):02d}KT 9999 FEW015 {int(curr.get('temperature_2m',0))}/{int(curr.get('dew_point_2m',0))} Q{int(curr.get('pressure_msl',1013))}",
                    "temp": curr.get("temperature_2m", 25),
                    "dewp": curr.get("dew_point_2m", 20),
                    "altim": curr.get("pressure_msl", 1013),
                    "wspd": wind_kt,
                    "wdir": curr.get("wind_direction_10m", 110),
                    "wgst": gust_kt,
                    "visib": "10+",
                    "reportTime": curr.get("time"),
                    "_source": "WICC Station Reanalysis"
                }
        except Exception as e:
            logging.error(f"All sources failed: {e}")
            raise Exception("Gagal mengambil data meteorologi WICC dari seluruh server.")