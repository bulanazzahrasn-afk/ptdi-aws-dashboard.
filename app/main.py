from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import logging

from app.services.noaa_metar import fetch_noaa_metar_raw
from app.utils.translator import translate_aws_payload

app = FastAPI(title="PTDI Aviation AWS Dashboard (NOAA WICC)", version="1.0.0")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/v1/aws-translated")
async def get_aws_translated_data():
    try:
        raw_data = await fetch_noaa_metar_raw()
        return translate_aws_payload(raw_data)
    except Exception as e:
        logging.error(f"Error fetching NOAA WICC METAR data: {e}")
        raise HTTPException(status_code=500, detail=str(e))