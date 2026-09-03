# Checklist activo: Madoz Málaga

Autoridad detallada: [tasks/plan.md](./plan.md).

## Fase 1 — Layout del libro

- [ ] T1 — Contrato opcional de regiones y fingerprint.
- [ ] T2 — OCR determinista por región y orientación.
- [ ] T3 — Composición por bandas, columnas y deduplicación.

### Checkpoint A

- [ ] Pruebas enfocadas verdes.
- [ ] Smoke privado de PDF 42, 52, 70, 71 y 89–92.
- [ ] Revisión visual y de privacidad completada.

## Fase 2 — Contenido recuperable y evaluación

- [ ] T4 — Indexación opt-in de tablas.
- [ ] T5 — Referencia privada con orden medible.
- [ ] T6 — Gate OCR de 24 páginas aprobado.

### Checkpoint B

- [ ] CER ≤ 0,08 y WER ≤ 0,18.
- [ ] Error de tokens críticos ≤ 0,05.
- [ ] Boundary F1 ≥ 0,90.
- [ ] Reading-order ≥ 0,95 con al menos 30 pares.
- [ ] Cero páginas fallidas o en cuarentena.

## Fase 3 — Corpus Málaga completo disponible

- [ ] T7 — Preparar las 71 páginas con resume reproducible.
- [ ] T8 — Aprobar 20 casos de recuperación y citas.

### Checkpoint C

- [ ] 71/71 páginas disponibles preparadas.
- [ ] Tablas y narrativa recuperables por separado.
- [ ] Seis huecos expuestos sin respuestas inventadas.
- [ ] Recall@20 ≥ 0,90, MRR@20 ≥ 0,75 e integridad = 1,0.

## Fase 4 — Publicación local autorizada

- [ ] Gate humano — Derechos de uso confirmados.
- [ ] Gate humano — Cobertura parcial aceptada.
- [ ] T9 — Publicación local, reinicio, reparación y rollback.
- [ ] T10 — Runbook operativo final.

### Cierre

- [ ] Suite completa verde en Podman.
- [ ] Ningún dato privado o secreto en Git.
- [ ] Backend, frontend, Narrative y canario intactos.
- [ ] Revisión y aprobación humana antes de merge o despliegue.
