import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from sqlalchemy import text

from .. import aws
from ..config import get_settings
from ..db import get_engine, init_db
from ..logging_setup import setup_logging
from . import routes_auth, routes_comparisons, routes_races, routes_standings

setup_logging("api")
log = logging.getLogger("pitwall.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="PitWall API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(routes_auth.router)
app.include_router(routes_races.router)
app.include_router(routes_comparisons.router)
app.include_router(routes_standings.router)


@app.middleware("http")
async def access_log(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    log.info("%s %s %s %.0fms", request.method, request.url.path, response.status_code, ms)
    return response


@app.get("/api/health")
def health():
    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}


if get_settings().serve_reports_locally:

    @app.get("/reports/{key:path}", include_in_schema=False)
    def local_report(key: str):
        try:
            obj = aws.s3().get_object(Bucket=get_settings().s3_bucket, Key=f"reports/{key}")
        except aws.s3().exceptions.NoSuchKey:
            raise HTTPException(404)
        headers = {"Content-Encoding": obj["ContentEncoding"]} if obj.get("ContentEncoding") else {}
        return Response(obj["Body"].read(), media_type=obj["ContentType"], headers=headers)
