# Branching strategy

Flow: `member-N/feature-*` -> `member-N/main` -> `test/member-N` -> `test/integration` -> `live`

| Branch | Purpose |
|---|---|
| `main` | Default branch. Full working app, the shared base every branch starts from. |
| `live` | Production / released code. Only updated from `test/integration` by pull request. |
| `test/integration` | QA of all members' work together before it goes live. |
| `test/member-1` .. `test/member-3` | Testing of one member's work on its own. |
| `member-N/main` | Each member's integration branch. |
| `member-N/feature-*` | One branch per feature; branch from and merge back into `member-N/main`. |

Rules: no direct pushes to `main`, `live` or `test/integration`; use pull requests.
Never commit `backend/.env` or any API key (use `backend/.env.example`).

## Members and what they own

| Member | Components | Backend (`backend/ml/...`) | Frontend (`frontend/src/components/...`) |
|---|---|---|---|
| Member 1 | Wellbeing Indicator, Adaptive Quiz | `wellbeing_indicator`, `quiz_generation` | `WellbeingIndicator.jsx`, `AdaptiveQuiz.jsx`, `QuestionBank.jsx` |
| Member 2 | Risk Classification, Wellbeing Forecasting | `risk_classification`, `wellbeing_forecasting` | `RiskClassification.jsx`, `RiskAnalysis.jsx` |
| Member 3 | Coping Recommendation, Social Isolation | `coping_recommendation`, `social_peer_matching` | `CopingRecommendation.jsx`, `SocialIsolation.jsx` |
| Member 4 | Not assigned yet | - | - |

Research material per member is in the `Member 1`, `Member 2` and `Member 3` folders.
