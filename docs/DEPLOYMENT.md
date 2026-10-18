# Deployment: MongoDB Atlas + Render (API) + Vercel (frontend)

Order matters: database -> API -> frontend -> link them together.

## 1. MongoDB Atlas (already set up)
- Network Access -> Add IP Address -> `0.0.0.0/0` (the host's IP changes).
- Connect -> Drivers -> copy the `mongodb+srv://...` string; keep it for step 2.

## 2. Backend on Render
1. render.com -> sign in with GitHub -> New -> Blueprint -> select this repo, branch `main`.
2. Render reads `render.yaml`. Fill in the three prompted values:
   - `MONGO_URI`: the Atlas string
   - `GEMINI_API_KEY`: your (new) key
   - `FRONTEND_ORIGIN`: leave a placeholder for now, set it in step 4
3. Deploy. When live, open `https://<service>.onrender.com/health` -> `{"status":"ok"}`.
   API docs: `https://<service>.onrender.com/docs`.
4. If the deploy fails with out-of-memory, change `plan: free` to `plan: starter`.

## 3. Frontend on Vercel
1. vercel.com -> sign in with GitHub -> Add New Project -> import this repo.
2. Root Directory: `frontend`. Framework: Vite (auto).
3. Environment Variable: `VITE_API_URL` = `https://<service>.onrender.com/api/v1`
4. Deploy -> note the URL, e.g. `https://student-wellbeing.vercel.app`.

## 4. Link them
- Render -> the service -> Environment -> set `FRONTEND_ORIGIN` to the exact Vercel URL
  (no trailing slash) -> save (it redeploys).

## 5. First admin
Public sign-up cannot create admins. From `backend/` with the production `.env` values:
`python scripts/create_admin.py you@example.com "Your Name" 'StrongPassword1'`

## Notes
- The free Render plan sleeps after ~15 minutes idle; the first request then takes ~30-60 s.
- Every push to `main` redeploys both sites automatically.
- Never commit `.env`; set secrets only in the Render/Vercel dashboards.
