# ProctorIQ Agent Notes

## Verify Before Claiming

- For backend changes, run `cd backend && ruff check . && mypy . --strict && pytest tests/ -v`.
- For frontend changes, run `cd frontend && npm run lint && npx tsc --noEmit && npm run test`.
- Treat an item as done only after the relevant checks pass with real command output.

## Git Discipline

- Keep commits focused by logical change.
- After committing, push and verify the local and remote SHAs match:
  `git rev-parse HEAD` and `git ls-remote origin main`.
- Do not assume a local change shipped until the push and SHA check have succeeded.

## Docker Sanity

- Before calling production-readiness complete, run:
  `docker compose build`
  `docker compose up -d`
  `curl -sf http://localhost:8000/health`
  `curl -sf http://localhost:5173 > /dev/null`
  `docker compose down`
