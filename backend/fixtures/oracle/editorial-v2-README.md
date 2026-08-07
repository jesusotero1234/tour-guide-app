# Editorial route evaluation v2

`editorial-v2-manifest.json` is the only supported index for this evaluation. Its default loader exposes only the nine `calibration` cases; Valencia is a separately authorized `holdout`.

The workbench never sends an oracle, deterministic tier, `firstVisitScore`, coordinates, or a computed route to the curator. Live mode records the model, prompt fingerprint, exact projected input, and validated response under `fixtures/editorial-briefs/`. Snapshot mode refuses artifacts whose input no longer matches the frozen candidates.

Calibration workflow (with Ollama and `llm-pod` running):

```bash
npm run quality:route:v2 -- --all --mode live
npm run quality:route:v2 -- --all --mode snapshot --freeze
```

The second command freezes only if every calibration gate passes and all snapshots use one model and prompt. After that, execute Valencia once:

```bash
npm run quality:route:v2 -- --allow-holdout --case valencia-history-es-120 --mode live
```

The holdout command is rejected until all calibration results pass. Its brief and evaluation are retained even when the route gate fails, and a second live holdout run is refused. None of these commands generates narration or publishes a tour.
