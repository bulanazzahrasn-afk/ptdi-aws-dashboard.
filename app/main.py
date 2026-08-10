from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import logging

from app.services.metar_service import fetch_metar_taf_wicc
from app.utils.translator import translate_aws_payload

logger = logging.getLogger(__name__)

app = FastAPI(
    title="PTDI Aviation AWS Dashboard (WICC)",
    version="1.1.0",
    description="Aviation weather dashboard for Husein Sastranegara / PTDI.",
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.get("/", include_in_schema=False)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "service": "ptdi-aws-dashboard", "version": app.version}


@app.get("/api/v1/aws-translated", tags=["weather"])
async def get_aws_translated_data():
    try:
        raw_data = await fetch_metar_taf_wicc()
        return translate_aws_payload(raw_data)
    except Exception as exc:
        logger.exception("Weather data request failed")
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve current weather data from the upstream provider.",
        ) from exc
