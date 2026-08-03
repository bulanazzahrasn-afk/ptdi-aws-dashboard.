import httpx

# Koordinat Husein Sastranegara (BDO/WABB)
HUSEIN_LAT = -6.9006
HUSEIN_LON = 107.5762

CURRENT_PARAMS = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "apparent_temperature",
    "surface_pressure", "pressure_msl", "vapour_pressure_deficit",
    "wind_speed_10m", "wind_speed_80m", "wind_speed_120m", "wind_speed_180m",
    "wind_direction_10m", "wind_direction_80m", "wind_direction_120m", "wind_direction_180m",
    "wind_gusts_10m", "precipitation", "rain", "showers", "snowfall",
    "precipitation_probability", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "shortwave_radiation", "direct_radiation", "diffuse_radiation", "direct_normal_irradiance",
    "global_tilted_irradiance", "terrestrial_radiation", "uv_index", "uv_index_clear_sky",
    "is_day", "soil_temperature_0cm", "soil_temperature_6cm", "soil_temperature_18cm", "soil_temperature_54cm",
    "soil_moisture_0_to_1cm", "soil_moisture_1_to_3cm", "soil_moisture_3_to_9cm",
    "soil_moisture_9_to_27cm", "soil_moisture_27_to_81cm", "et0_fao_evapotranspiration"
]

HOURLY_PARAMS = [
    "temperature_2m", "relative_humidity_2m", "surface_pressure",
    "wind_speed_10m", "wind_direction_10m", "precipitation", "uv_index"
]

async def fetch_open_meteo_raw() -> dict:
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": HUSEIN_LAT,
        "longitude": HUSEIN_LON,
        "current": ",".join(CURRENT_PARAMS),
        "hourly": ",".join(HOURLY_PARAMS),
        "timezone": "Asia/Jakarta",
        "forecast_days": 1
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params, headers={"Cache-Control": "no-cache"})
        response.raise_for_status()
        return response.json()