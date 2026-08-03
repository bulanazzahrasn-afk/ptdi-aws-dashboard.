from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import logging

from app.services.open_meteo import fetch_open_meteo_raw
from app.services.translator import translate_aws_data

app = FastAPI(title="PTDI AWS Dashboard", version="1.0.0")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/v1/aws-translated")
async def get_aws_translated_data():
    try:
        raw_data = await fetch_open_meteo_raw()
        translated = translate_aws_data(raw_data)
        
        # Meneruskan minutely_15 ke response JSON untuk history 15-menit
        translated["minutely_15"] = raw_data.get("minutely_15", {})
        
        return translated
    except Exception as e:
        logging.error(f"Error fetching AWS data: {e}")
        raise HTTPException(status_code=500, detail=str(e))