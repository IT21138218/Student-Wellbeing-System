import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sklearn.exceptions import InconsistentVersionWarning

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import close_mongo_connection, connect_to_mongo

# The trained .pkl models (Lasso, XGBoost, KMeans, ...) were pickled by
# whatever scikit-learn version each teammate's notebook had installed;
# requirements.txt intentionally floats versions (see its own comment) so
# pip can find wheels for newer Python, which means the installed
# scikit-learn is rarely bit-identical to the pickling one. sklearn warns
# about that unpickle-time version drift on every model load. Each real
# model's predict() output has been individually verified correct despite
# it (see the leakage-caveat docstrings in ml/*/model.py), so this is
# silenced as confirmed-benign noise rather than a real risk.
warnings.filterwarnings("ignore", category=InconsistentVersionWarning)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Student Wellbeing API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        # Vite picks the next free port (5173, 5174, 5175, ...) whenever one
        # is already in use, so pin FRONTEND_ORIGIN in .env for a specific
        # deploy but always allow any localhost dev port too.
        allow_origin_regex=r"http://localhost:\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    @app.exception_handler(RequestValidationError)
    async def log_validation_errors(request: Request, exc: RequestValidationError):
        # Prints the exact bad payload + which fields failed, right in this
        # terminal — makes 422s from the browser diagnosable without DevTools.
        body = exc.body
        print(f"\n[422] {request.method} {request.url.path}")
        print(f"  Body received: {body}")
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"] if p != "body")
            print(f"  Field '{loc}': {err['msg']} (got: {err.get('input')!r})")
        print()
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
