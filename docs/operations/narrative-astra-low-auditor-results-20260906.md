# Astra low por Codex como auditor — 2026-09-06

## Resultado y alcance

Se sustituyó GPT-5.4 por `gpt-6-astra`, razonamiento `low`, transporte Codex CLI autenticado con ChatGPT, para repetir la auditoría del canario de Madrid. Se completaron **6/6 paradas y 225/225 frases**, sin reintentos, reparación de JSON ni referencias inválidas. Tiempo acumulado de procesos: **492,010 s (8,2 min)**.

La sustitución está implementada como replay reutilizable en `backend/scripts/validation/narrative-astra-audit-replay-v8.ts`. **No cambia la configuración del auditor de la aplicación ni regenera el tour.** El resultado no autoriza publicación automática.

## Hallazgos revisados

| Caso | GPT-5.4 original | Astra low | Evaluación |
|---|---|---|---|
| Palacio, S013: bóvedas y visibilidad exterior | unsupported | authorized_inference | Astra analiza expresamente la composición estructural y la considera inferencia prudente; no omite la cláusula como los otros candidatos. Sigue sin aportar evidencia específica de visibilidad. |
| Alcalá, S028: «el escritor Bretón de los Herreros» | unsupported | unsupported | Detecta que la evidencia acredita la pérdida del ojo, pero no la profesión. Opus, Mini y Spark dejaron pasar este calificativo en las pruebas anteriores. |
| Cibeles, S033: cambio de función del edificio | authorized_inference | unsupported | Objeción fundada: los pasajes acreditan uso municipal desde 2007, pero no el anterior. El nombre «Palacio de Comunicaciones» no demuestra por sí solo el uso anterior. |

Hay **19 diferencias de clasificación**, de las cuales sólo dos cambian aceptación/rechazo: Palacio y Cibeles. Las otras 17 intercambian supported y authorized_inference. Astra rechaza dos frases en total: Cibeles S033 y Alcalá S028. No rechaza el redondeo de dimensiones que cuestionó la variante reforzada de DeepSeek.

GPT-5.4 no es verdad establecida. Tampoco hay que convertir una inferencia razonable en error sólo por discrepar del auditor anterior. Palacio sigue siendo una decisión de criterio: Astra lo interpreta de forma explícita, pero no cumple una exigencia de cita específica sobre visibilidad. La muestra no demuestra superioridad general. Además, el escritor del tour también fue Astra low: son ejecuciones separadas, no diversidad de modelo ni revisión plenamente independiente.

## Decisión

Astra low es un candidato más convincente que los últimos modelos ensayados para continuar estas pruebas: identifica la afirmación secundaria de Alcalá y aporta una objeción fundada nueva. Usarlo por Codex evita el cargo API adicional, pero consume cuota y en esta ejecución fue más lento que los 256,447 s registrados para GPT-5.4 en el canario original. No se declara resuelta la auditoría estricta ni aprobado el tour.

## Coste y consumo

- Gasto API adicional: **0 USD**; facturación mediante cuota ChatGPT/Codex.
- Uso reportado por Codex: **89.539 tokens de entrada**, **14.214 de salida**, de ellos **199 de razonamiento**; entrada cacheada reportada: 0.
- No se convierte ese uso a dólares ni a un porcentaje de cuota desconocido.
- El contador API conservador de comparaciones permanece en **1,504696510828 USD** sobre límite de 2 USD, incluida exposición anterior no confirmada de 0,3301206 USD.

## Validación y evidencia

El replay conserva las entradas congeladas, prompts, esquemas y eventos originales por parada. Usa el transporte existente con herramientas y búsqueda deshabilitadas, entorno filtrado, sesión efímera, sandbox read-only y timeout de 180 s por llamada. Comprueba finalización del turno, ausencia de herramientas, JSON exacto, esquema completo y parser de auditoría. Falla sin continuar si cualquier llamada no es válida.

Pasaron compilación/carga TypeScript, seis comprobaciones negativas de argumentos, dry-run sin escrituras, ejecución real y comprobación final de cobertura. Los hashes del checkpoint y revisión original coinciden antes y después. Se revisaron los cambios generados por Qwen y se corrigieron los defectos de compilación, persistencia por parada y validación de entradas antes de ejecutar. Sólo se añadió el replay y este informe; se preservaron cambios ajenos.

Artefactos: `backend/tmp/narrative-v8/madrid-astra-low-audit-20260906/`, incluidos `results.private.json`, `comparison.md` y subdirectorios por parada. Entrada congelada: `backend/tmp/narrative-v8/madrid-deepseek-none-baseline-20260906/inputs.private.json`; se reutilizan sus casos baseline, no su modelo DeepSeek ni sus resultados.

Repetición desde `backend`, eligiendo una salida nueva:

```bash
/home/jesusotero/.nvm/versions/node/v22.14.0/bin/node -r ts-node/register scripts/validation/narrative-astra-audit-replay-v8.ts --inputs=tmp/narrative-v8/madrid-deepseek-none-baseline-20260906/inputs.private.json --out-dir=tmp/narrative-v8/madrid-astra-low-audit-next
```

Sin `--execute` sólo valida. Añadirlo realiza las seis llamadas con cuota Codex. `--stop-id=Q171517`, por ejemplo, limita la repetición al Palacio.
