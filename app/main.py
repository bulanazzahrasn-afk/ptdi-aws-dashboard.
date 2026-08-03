from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from app.services.open_meteo import fetch_open_meteo_raw
from app.utils.translator import translate_aws_payload

app = FastAPI(
    title="PTDI AWS Master Data Translator & Dashboard",
    version="1.0.0"
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/")
async def render_dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/v1/aws-translated")
async def get_translated_aws_data():
    try:
        raw_data = await fetch_open_meteo_raw()
        translated_data = translate_aws_payload(raw_data)
        
        return JSONResponse(
            content=translated_data,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache"
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Gagal mengambil data Open-Meteo: {str(e)}"}
        )