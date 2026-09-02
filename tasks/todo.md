# V6 restante: checklist

## Infraestructura

- [ ] Firecrawl `v2.8.0` arranca exclusivamente en `127.0.0.1:3007`.
- [ ] Search, Markdown, PDF, SSRF y redirecciones pasan el smoke sin LLM.
- [ ] `down` conserva volúmenes y los secretos permanecen ignorados.

## Proveedores y contratos

- [ ] `deepseek_control` conserva el baseline y sigue predeterminado.
- [ ] `balanced_openrouter` fija todos los modelos, endpoints y parámetros.
- [ ] JSON Schema local, metadata y preflight fallan cerrados.

## Pipeline

- [ ] Curación normal devuelve indicadores y GPT-5.4 escala una sola vez.
- [ ] Semáforos aplican los límites por fase y perfil.
- [ ] Reauditorías usan llamadas nuevas; telemetría privada cubre coste/tokens/routing.

## Benchmark y gates

- [ ] Snapshot privado separa captura única de repeticiones offline.
- [ ] Presupuesto conjunto de 2 USD se reserva antes de cada llamada.
- [ ] Tres repeticiones calculan p50/p95, fingerprints y tasas de retry/schema.
- [ ] Gate A y mutaciones pasan para ambos perfiles.
- [ ] Gate B pasa tras spot-check humano.
- [ ] Madrid integrado y Toledo quedan como máximo en revisión humana.

## Entrega

- [ ] Builds backend/frontend y suites focalizadas pasan.
- [ ] Revisión de corrección, seguridad, rendimiento y secretos completada.
- [ ] Cinco commits atómicos usan staging explícito.
- [ ] Informe final recomienda activar o rechazar el candidato según resultados.

## Incremento actual: Qwen base audit y reparación final

- [x] Probar y conectar la auditoría base al proveedor de `qwen38_hybrid`.
- [x] Probar el error nuevo detectado tras la primera reparación global.
- [x] Implementar una reparación final única, limitada por presupuesto y
  re-auditada.
- [x] Pasar pruebas focalizadas y build del backend.
- [x] Revisar el diff del incremento sin incorporar cambios ajenos.
