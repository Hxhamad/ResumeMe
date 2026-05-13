# ResumeMe

ResumeMe is a local AI-assisted resume builder with backend-only MiniMax calls, deterministic ATS feedback, evidence-safe suggestions, and an accept/reject workflow for resume rewrites.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`.

3. Start the development app:

```bash
npm run dev
```

The backend listens on `PORT` and the Vite frontend proxies API calls to it.

## Scripts

- `npm run dev` starts the Express backend and Vite frontend.
- `npm run build` compiles the backend and builds the frontend.
- `npm run typecheck` runs TypeScript checks.
- `npm test` runs the safety and formatter tests.
- `npm start` serves the built production app.

## Safety Rules

ResumeMe must never fabricate candidate facts. If evidence is missing, suggestions and generated output should either omit the unsupported claim or tell the user what to add.
