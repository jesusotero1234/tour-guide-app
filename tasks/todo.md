# Checklist activo: Madoz tomo XI completo

Autoridad detallada: [tasks/plan.md](./plan.md).

## Fase 0 — Inventario físico

- [x] T0 — Inventariar las 783 páginas y auditar el OCR incrustado.

### Checkpoint inicial

- [x] 783 filas físicas y hash reproducible.
- [x] Páginas sin OCR, duplicados, saltos y huecos resumidos.
- [x] Cero publicación y cero material privado en Git.

## Fase 1 — Camino híbrido

- [x] T1 — Añadir contrato y fingerprint `embedded_first`.
- [x] T2 — Reconstruir líneas incrustadas con cajas y orden.
- [x] T3 — Aplicar gate, contraste y fallback por página.

### Checkpoint A

- [x] Páginas ordinarias reutilizan OCR incrustado.
- [x] Páginas ausentes/dudosas activan PP-OCR.
- [x] Manifiestos `ocr` conservan su comportamiento.
- [x] Pruebas enfocadas verdes.

## Fase 2 — Canonización y calidad

- [ ] T4 — Resolver la secuencia canónica del tomo.
- [ ] T5 — Resolver layouts y tablas excepcionales.
- [ ] T6 — Aprobar una muestra estratificada de al menos 48 páginas.

### Checkpoint B

- [ ] Cero filas `pending_review`.
- [ ] Cero duplicados o huecos sin explicación.
- [ ] CER ≤ 0,08; WER ≤ 0,18; tokens críticos ≤ 0,05.
- [ ] Boundary F1 ≥ 0,90 y orden ≥ 0,95 con al menos 60 pares.

## Fase 3 — Corpus completo preparado

- [ ] T7 — Preparar todas las filas canónicas con reanudación reproducible.
- [ ] T8 — Aprobar al menos 40 casos de recuperación y citas.

### Checkpoint C

- [ ] Todas las filas incluidas se preparan sin fallos.
- [ ] Prosa y tablas son recuperables por separado.
- [ ] Recall@20 ≥ 0,90, MRR@20 ≥ 0,75 e integridad = 1,0.
- [ ] Preguntas fuera del tomo producen abstención explícita.

## Fase 4 — Publicación local autorizada

- [ ] Gate humano — Derechos de uso confirmados.
- [ ] Gate humano — Cobertura final aceptada.
- [ ] T9 — Publicación local, reinicio, reparación y rollback.
- [ ] T10 — Runbook operativo final.

### Cierre

- [ ] Suite completa verde en Podman.
- [ ] Ningún dato privado o secreto en Git.
- [ ] Backend, frontend, Narrative y canario intactos.
- [ ] Revisión humana antes de merge o despliegue.
