# Local Development

Use the project scripts instead of Compose for the current MVP stack. Compose is not the source of truth right now because the stack uses a dedicated VoxCPM pod on `:3006`.

## Start Everything

From the repo root:

```bash
./scripts/dev-up.sh
```

This starts:

- Postgres in Podman on `:5432`
- Ollama on `:11434` if `ollama` is installed and not already running
- LLM pod on `:3002`
- VoxCPM pod on `:3006`
- Backend on `:3001`
- Frontend on `:3000`

Open the URL printed by the script. On native Linux/macOS this is usually:

```text
http://localhost:3000
```

On WSL, Windows Chrome may not be able to reach WSL services through
`localhost`. In that case `dev-up.sh` prints the WSL interface URL, for example:

```text
Frontend: http://172.24.204.140:3000
Backend:  http://172.24.204.140:3001/health
```

Use the printed frontend URL in the browser.

Logs are written to `.dev-logs/`. Process IDs are tracked in `.dev-state/`.

## Stop Everything

Stop services started by `dev-up`:

```bash
./scripts/dev-down.sh
```

Stop services and Postgres:

```bash
./scripts/dev-down.sh --postgres
```

## Health Checks

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3006/healthz
```

## Notes

- First VoxCPM setup can take several minutes because it creates `.venv` and downloads model files.
- If generation fails because an Ollama model is missing, run `ollama pull gemma4:26b` or set `OLLAMA_MODEL` before `dev-up`.
- To skip Prisma migrations during startup, run `SKIP_PRISMA=1 ./scripts/dev-up.sh`.
- `dev-up.sh` cleans stale `frontend/.next` before starting Next.js to avoid stale dev chunks.
- If a managed service PID file is missing, `dev-down.sh` also checks the known ports and stops matching unmanaged processes.
