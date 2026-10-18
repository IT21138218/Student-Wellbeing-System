# Student Wellbeing

An AI-assisted student wellbeing platform: risk classification, adaptive
quizzes, coping recommendations, social isolation detection, and
wellbeing forecasting, backed by trained ML models behind a real API.

## Architecture

```
Student Wellbeing/
├── frontend/                  React + Vite dashboard (UI only — no business logic)
│   └── src/api/                fetch wrappers, one file per backend domain
│
├── backend/                   FastAPI service — the only thing the frontend talks to
│   ├── app/
│   │   ├── main.py              app factory, CORS, startup/shutdown
│   │   ├── core/                config, MongoDB connection
│   │   ├── api/v1/routes/       one router per domain (risk, quiz, students, ...)
│   │   ├── models/               Pydantic request/response schemas + Beanie documents
│   │   └── services/             business logic: calls ml/, applies rules, persists
│   │
│   ├── ml/                    ML lives here, NOT inside app/ — trainable & swappable
│   │   ├── risk_classification/  features.py, train.py, model.py, artifacts/*.joblib
│   │   ├── quiz_generation/      difficulty/Bloom mapping + question generator
│   │   ├── social_isolation/     TODO — same 3-file pattern
│   │   ├── coping_recommendation/TODO — same 3-file pattern
│   │   └── forecasting/          TODO — same 3-file pattern
│   │
│   ├── data/                  raw/processed datasets (gitignored, keep out of git)
│   └── tests/
│
└── docker-compose.yml         mongo + backend + frontend, one command to run all three
```

### Why this shape

- **`ml/` is separate from `app/`.** Training code (pandas, scikit-learn,
  SMOTE) never gets imported by the API at request time — routes only
  import `ml/<domain>/model.py`'s `predict()`, which loads a pre-trained
  `.joblib` artifact. Retraining a model means running one script and
  swapping a file; it never touches the API code.
- **Every ML domain follows the same 3-file pattern**: `features.py`
  (engineering), `train.py` (fit + evaluate + export), `model.py`
  (load artifact + `predict()`). Copy `ml/risk_classification/` as the
  template for `social_isolation/`, `coping_recommendation/`, and
  `forecasting/`.
- **Routes stay thin.** `app/api/v1/routes/risk.py` just calls
  `app/services/risk_service.py`, which calls the model and persists
  the result — validation, error handling, and business rules (like
  turning a risk label into a narrative + recommendations) live in the
  service, not the route.
- **The frontend never imports business logic.** `frontend/src/api/`
  holds one small file per backend domain that just does `fetch` calls
  typed to match the backend's Pydantic schemas.

### Live vertical slice: Risk Classification

This one is wired end-to-end as the reference implementation:

`RiskClassification.jsx` → `frontend/src/api/risk.js` → `POST /api/v1/risk/classify`
→ `app/services/risk_service.py` → `ml/risk_classification/model.py` (loads
`artifacts/model.joblib`) → response persisted to MongoDB (`risk_assessments`)
→ JSON back to the UI.

Everything else (`quiz`, `students`) has a working route + schema but a
placeholder model/generator; `social_isolation`, `coping_recommendation`,
and `forecasting` have TODO stubs describing the recommended approach —
see the docstring at the top of each `ml/<domain>/model.py`.

## Running it

### Option A — Docker Compose (recommended, one command)

```bash
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend + docs: http://localhost:8000/docs
- MongoDB: localhost:27017

### Option B — run each piece manually

```bash
# 1. MongoDB (skip if you already have one running)
docker run -d -p 27017:27017 --name mongo mongo:7

# 2. Backend
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
# If PowerShell says "Program 'python.exe' failed to run: The system cannot
# find the path specified", the Windows Store's python.exe alias is broken —
# use the launcher instead: `py -m venv .venv`
pip install -r requirements.txt
cp .env.example .env
python -m ml.risk_classification.train            # trains + exports the model artifact
uvicorn app.main:app --reload                       # http://localhost:8000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                                         # http://localhost:5173
```

**Important:** the `/risk/classify` endpoint returns HTTP 503 until you've
run `python -m ml.risk_classification.train` at least once — that's what
produces `backend/ml/risk_classification/artifacts/model.joblib`.

## Extending to a new ML-backed feature

1. `backend/ml/<domain>/features.py` — define the input schema + any
   engineered features.
2. `backend/ml/<domain>/train.py` — load/prepare data, train, evaluate,
   `joblib.dump(...)` to `artifacts/`.
3. `backend/ml/<domain>/model.py` — `predict(features: dict) -> dict`,
   loading the artifact once via `@lru_cache`.
4. `backend/app/models/<domain>.py` — Pydantic request/response schemas
   + a Beanie `Document` if you need to persist results.
5. `backend/app/services/<domain>_service.py` — calls `predict()`,
   applies business rules, persists.
6. `backend/app/api/v1/routes/<domain>.py` — thin route, register it in
   `app/api/v1/router.py`.
7. `frontend/src/api/<domain>.js` — one `fetch` wrapper.
8. Replace the mock in the matching component (e.g. `setTimeout` +
   hardcoded JSON) with the real API call, following the pattern in
   `RiskClassification.jsx`.

## Tests

```bash
cd backend
pytest
```
