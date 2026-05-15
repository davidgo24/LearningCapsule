# LearningCapsule v1

FastAPI backend (Gemini extraction + JSON capsules) and a Vite/React UI with Monaco for code snippets.

## Prerequisites

- Python 3.11+
- Node.js 18+ (for the frontend dev server or production build)
- A [Google AI Studio](https://aistudio.google.com/apikey) API key: set **`GEMINI_API_KEY`** on the server **or** paste **your own key** in the app (BYOK header) when extracting.

## First-time UX

- A **welcome tour** runs once per browser until **Skip tour** / **Got it**. Dismissal is stored in **`localStorage`** (`learningcapsule_onboarding_seen`).
- **Quick guide** in the header opens the tour again.

## Bring your own Gemini key (BYOK)

- **`POST /api/extract`** accepts optional **`X-Gemini-Key`**. When present, only that request uses your key (**not persisted** on the server).
- In the UI, BYOK lives in session storage for that tab until you close the tab.
- If unset, requests use **`GEMINI_API_KEY`** / `GOOGLE_API_KEY` from the server environment.

## Setup

```bash
cd learningcapsule
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set GEMINI_API_KEY

cd frontend && npm install && cd ..
```

## Run (development — recommended)

Two terminals from the repo root (`learningcapsule/`):

**Terminal A — API**

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal B — UI**

```bash
cd frontend && npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The dev server proxies `/api` to `http://127.0.0.1:8000`.

## Optional: single server (built UI)

Serve the SPA from FastAPI after building the frontend:

```bash
cd frontend && npm run build && cd ..
source .venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000/`. API docs remain at `http://127.0.0.1:8000/docs`.

## Data

Committed capsules are stored as JSON files under `capsules/` by default (or under **`CAPSULES_DIR`** if that env var is set). Filenames include date, id, and a slug derived from the title. `.gitignore` excludes `capsules/*.json` so exports stay local by default.

## Deploy on Railway (Docker)

The repo includes a root **`Dockerfile`** that builds the Vite app and runs FastAPI with the SPA mounted at `/`.

1. Push this project to **GitHub** (private repo recommended).
2. In [Railway](https://railway.app): **New Project** → **Deploy from GitHub** → select the repo.
3. Railway should detect the Dockerfile automatically (single service).
4. Under **Variables**, add:
   - **`GEMINI_API_KEY`** — recommended (shared quota); omit only if everyone will paste **`X-Gemini-Key`** from their browser  
   - **`GEMINI_MODEL`** — optional (e.g. `gemini-2.5-flash`)  
   - **`CAPSULES_DIR`** — strongly recommended on Railway: e.g. `/data/capsules`  
5. **Persistent disk:** create a **Volume**, mount it (for example) at **`/data`**, and set **`CAPSULES_DIR=/data/capsules`**. Without a volume, capsule JSON files can be **lost on redeploy**.
6. Railway injects **`PORT`**; the container listens on **`0.0.0.0`**.

Optional **`ALLOW_ORIGINS`**: comma-separated extra origins if you ever host the UI on a different domain than the API.

After deploy, open your Railway **public URL** — the UI and `/api/*` share the same origin.

### Local Docker smoke test

```bash
docker build -t learningcapsule .
docker run --rm -p 8000:8000 -e GEMINI_API_KEY=your_key -e CAPSULES_DIR=/data/capsules -v lcaps:/data learningcapsule
```

Then open `http://localhost:8000/`.

## API

| Method | Path | Description |
|--------|------|--------------|
| POST | `/api/extract` | Body: `{ "raw_text": "..." }`. Optional **`X-Gemini-Key`** header for BYOK; else uses server env key |
| POST | `/api/capsules` | Body: capsule payload → saves JSON file |
| GET | `/api/capsules` | List summaries |
| GET | `/api/capsules/{capsule_id}` | Full capsule JSON |
