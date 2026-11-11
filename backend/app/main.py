from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import FRONTEND_DIST, HOST, PORT, is_frozen
from backend.app.core.migrations import run_migrations
from backend.app.routers import (
    health, auth, settings, categories, categories_ai, ai_assist, fields,
    templates, items, locations, dashboard, photos, codes, admin,
    profiles, activity, tags, bulk, reminders, attachments, audits,
    trash, search, inbox, lifecycle, contacts, moves, labels,
    exports, wall, second_copy, offline
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run SQLite schema migrations on startup
    run_migrations()
    yield

app = FastAPI(
    title="Wherezy API",
    version="2.0.0",
    description="LAN-only Wherezy Household Inventory API v2 with Profiles, Activity, Tags, Reminders, Audits, Inbox, and Moving",
    lifespan=lifespan
)

# Standard error handler for consistent API errors
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail)}}
    )

@app.middleware("http")
async def desktop_pause_middleware(request: Request, call_next):
    from starlette.responses import HTMLResponse
    from backend.app.core.runtime_state import (
        build_paused_html,
        get_pause_reason,
        is_server_paused,
    )

    if is_server_paused():
        reason = get_pause_reason()
        headers = {"Cache-Control": "no-store", "Retry-After": "5"}
        if request.url.path.startswith("/api"):
            return JSONResponse(
                status_code=503,
                headers=headers,
                content={"error": {"code": "SERVER_PAUSED", "message": reason}},
            )
        return HTMLResponse(content=build_paused_html(reason), status_code=503, headers=headers)
    return await call_next(request)


# CORS for Vite dev server proxying/testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers under /api
api_prefix = "/api"
app.include_router(health.router, prefix=api_prefix)
app.include_router(auth.router, prefix=api_prefix)
app.include_router(profiles.router, prefix=api_prefix)
app.include_router(activity.router, prefix=api_prefix)
app.include_router(tags.router, prefix=api_prefix)
app.include_router(bulk.router, prefix=api_prefix)
app.include_router(reminders.router, prefix=api_prefix)
app.include_router(attachments.router, prefix=api_prefix)
app.include_router(audits.router, prefix=api_prefix)
app.include_router(trash.router, prefix=api_prefix)
app.include_router(search.router, prefix=api_prefix)
app.include_router(inbox.router, prefix=api_prefix)
app.include_router(lifecycle.router, prefix=api_prefix)
app.include_router(contacts.router, prefix=api_prefix)
app.include_router(moves.router, prefix=api_prefix)
app.include_router(labels.router, prefix=api_prefix)
app.include_router(exports.router, prefix=api_prefix)
app.include_router(wall.router, prefix=api_prefix)
app.include_router(second_copy.router, prefix=api_prefix)
app.include_router(offline.router, prefix=api_prefix)
app.include_router(settings.router, prefix=api_prefix)
app.include_router(categories_ai.router, prefix=api_prefix)
app.include_router(ai_assist.router, prefix=api_prefix)
app.include_router(categories.router, prefix=api_prefix)
app.include_router(fields.router, prefix=api_prefix)
app.include_router(templates.router, prefix=api_prefix)
app.include_router(items.router, prefix=api_prefix)
app.include_router(locations.router, prefix=api_prefix)
app.include_router(dashboard.router, prefix=api_prefix)
app.include_router(photos.router, prefix=api_prefix)
app.include_router(codes.router, prefix=api_prefix)
app.include_router(admin.router, prefix=api_prefix)

# Mount frontend/dist if built (SPA fallback)
if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists() and (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
        dist_root = FRONTEND_DIST.resolve()
        file_path = (FRONTEND_DIST / full_path).resolve()
        if file_path.is_relative_to(dist_root) and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

if __name__ == "__main__":
    import uvicorn

    target = app if is_frozen() else "backend.app.main:app"
    uvicorn.run(target, host=HOST, port=PORT, reload=not is_frozen())
