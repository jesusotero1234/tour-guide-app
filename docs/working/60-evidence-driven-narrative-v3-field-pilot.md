# Narrativa V3 orientada a evidencia y piloto de demanda

Fecha: 2026-08-10

Estado: **motor implementado; calificación live cerrada fallida; contenido no congelado; demanda no demostrada**

## Qué resuelve V3

V2 rechazó correctamente textos inseguros, pero impuso una geometría de generación frágil:
reutilización artificial de hechos, cuotas exactas por bloque y campos de evaluación contradictorios.
Que 0/9 textos pasaran no demostró que nadie quiera un tour; demostró que aquel contrato no producía
un candidato evaluable con estabilidad.

V3 conserva V1 y V2 sin reescribirlos y añade este flujo:

```text
fuentes offline → compilador de evidencia → plan de 3–6 claims por escena
  → crítico factual de solo hallazgos → prosa → crítico final de solo hallazgos
  → machine_approved | rejected
```

El compilador exige evidencia observable, histórica y humana. Conserva fragmento original,
normalización española, idioma, URL, revisión o fingerprint de captura y fingerprint del hecho.
Los casos de París, Madrid y Berlín pasan por un único cargador; el motor no contiene ramas ni
nombres de ciudades. Si faltan roles, la escena no queda lista y debe sustituirse.

Los cinco bloques siguen existiendo, pero pueden no contener claims factuales. Cada hecho seleccionado
se asigna una vez, el modelo nunca decide IDs, evidencia, transición ni conteo y la única cuota textual
es 220–260 palabras Unicode por escena. La transición es navegacional y determinista.

Gemma devuelve hallazgos y puntuaciones, no `verdict`, `repairInstructions` ni
`premiumReadiness`. El código calcula el gate y las reparaciones. Hay una reparación de plan y una
de prosa; un segundo fallo rechaza. Los errores de protocolo del crítico permiten un reintento aparte.

## Calificación técnica cerrada

La prueba ejecuta secuencialmente tres candidatos por ciudad y un control de mutaciones independiente
por ciudad. Exige:

- al menos 8/9 candidatos y 2/3 por ciudad;
- 12/12 mutaciones rechazadas por razones factuales con informes válidos;
- crítico completamente residente en GPU;
- cada crítica por debajo de 180 segundos.

Los controles independientes evitan el defecto de V2: aunque una ciudad tenga 0/3 candidatos, sus
mutaciones no se marcan como transporte ni como detección ficticia. Si el control limpio no se aprueba,
se registran como `not_run` y la calificación falla.

Sin llamadas externas, este comando valida y muestra los tres inputs:

```bash
cd backend
npm run quality:narrative:v3
```

La tanda live no escribe fixtures:

```bash
OLLAMA_HOST=http://HOST_ALCANZABLE:11434 \
  npm run quality:narrative:v3 -- --generate --allow-external
```

Solo la misma tanda, si pasa todos los gates, puede escribir atómicamente el benchmark y el candidato
de Madrid de menor índice:

```bash
OLLAMA_HOST=http://HOST_ALCANZABLE:11434 \
  npm run quality:narrative:v3 -- \
  --generate --allow-external --freeze-approved
```

Requiere `DEEPSEEK_API_KEY` y `OLLAMA_HOST`. Puede fijarse otro escritor mediante
`NARRATIVE_WRITER_PROVIDER` y `NARRATIVE_WRITER_MODEL`, conservando esa procedencia en el artefacto.
Un resultado insuficiente no crea ni sobrescribe contenido aprobado.

## Lo que significa “la gente pagaría”

`machine_approved` solo significa que el candidato superó controles automáticos de fidelidad y
calidad. No demuestra interés, disfrute ni demanda. V3 genera un manifiesto de piloto en estado
`prepared`; jamás inventa participantes ni aprobación humana.

El piloto de Madrid requiere checkout real antes de empezar. Tras completar la ruta gratuita, se ofrece
una siguiente ruta histórica real por 9,99 EUR. El gate pre-registrado exige al menos 15 participantes
que completen la experiencia, 80 % de finalización entre quienes empiezan, tres compras netas de
reembolsos, media de experiencia 4/5 y cero quejas factuales críticas. Solo se guardan agregados; no
se almacenan nombres ni credenciales de pago en estos artefactos.

Por tanto, la secuencia honesta es:

1. pasar la calificación live cerrada;
2. congelar un único candidato de Madrid sin cambiar prompts después de verlo;
3. integrar el checkout y ejecutar el piloto presencial;
4. evaluar compras reales contra el gate pre-registrado;
5. decidir producto. Una buena encuesta sin compras no sustituye el cuarto paso.

## Resultado de la calificación cerrada

La tanda cerrada del 10 de agosto de 2026 se ejecutó con los fingerprints bloqueados y no pasó:
0/9 candidatos, 0/3 controles independientes y, en consecuencia, 0/12 mutaciones ejecutadas.
Las mutaciones figuran como `not_run`, no como detecciones ni como fallos de transporte.

Los siete candidatos que alcanzaron la generación del plan fallaron la validación local porque el
escritor asignó un mismo `factId` a más de un claim, tanto en el primer intento como después de la
única reparación permitida. Los dos candidatos restantes y los tres controles fallaron el preflight
cuando Gemma dejó de aparecer en `/api/ps`; por ello el gate agregado también registró
`critic_not_fully_gpu`. El límite de 180 segundos no se infringió, pero ninguna crítica de contenido
llegó a ejecutarse porque ningún plan superó la validación local.

No se creó ni sobrescribió ningún fixture V3, no existe candidato de Madrid congelado y no corresponde
crear el commit de contenido. Tampoco se ajustaron prompts, políticas o casos tras observar el resultado.
Una siguiente iteración debe tratar la asignación repetida como un problema de arquitectura general,
usar una calificación nueva y reservar un holdout aún no utilizado; no puede parchearse una ciudad.

## Diagnóstico y seguridad

Los fallos generan un resumen por etapa con estado, latencia, modelo y fingerprints. No incluye prompts
ni `rawOutput`; redacta patrones de tokens, bearer y API keys. Los artefactos congelados registran ruta,
fuentes, plan, texto, cuatro prompts, modelos, parámetros, políticas y ambas críticas para replay.
