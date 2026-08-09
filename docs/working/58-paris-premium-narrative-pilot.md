# Piloto narrativo autónomo de París

Fecha: 2026-08-09

Estado: **gate autónomo implementado; artefacto de contenido pendiente de congelar**

## Alcance

Este piloto produce un artefacto de texto offline e independiente del narrador de producción. Usa la ruta exacta del fixture v7 de París y genera únicamente Notre-Dame, Louvre y Palais-Royal.

No modifica la ruta, API HTTP, frontend, orquestador de producción, TTS, ASR, QA de audio ni publicación web. Tampoco convierte la ruta v7 en `verified`.

El flujo es:

```text
ruta y evidencia fija
  → DeepSeek V4 Flash (tres escenas juntas, no-thinking)
  → validadores deterministas
  → Gemma 4 12B local (una crítica conjunta)
  → una regeneración opcional de las tres escenas
  → machine_approved o rejected
```

No existe revisión humana dentro de este piloto. `premiumReadiness` es una señal automática de calidad editorial, no una afirmación de que una persona pagaría 9,99 €. La disposición real a pagar se medirá con usuarios, conversión, abandono y reembolsos.

## Evidencia cerrada

Cada escena recibe cuatro hechos con propietario canónico, URL, fecha de captura y fingerprint. Ni DeepSeek ni Gemma pueden completar huecos con conocimiento propio.

- Notre-Dame: crecimiento medieval, riesgo de demolición, movilización asociada a Victor Hugo e incendio de 2019 con reapertura en 2024. Fuente: [historia oficial de Notre-Dame](https://www.notredamedeparis.fr/en/understand/history/).
- Louvre: fortaleza de Philippe Auguste, residencia real, proyecto renacentista de François I y apertura pública durante la Revolución. Fuente: [dossier histórico oficial del Louvre](https://presse.louvre.fr/wp-content/uploads/2016/12/832675.pdf).
- Palais-Royal: residencia de Richelieu, galerías comerciales, foro anti-Versalles y llamada de Camille Desmoulins del 12 de julio de 1789. Fuente: [historia oficial del Palais-Royal](https://www.domaine-palais-royal.fr/en/decouvrir/histoire-du-domaine-national-du-palais-royal).

El request, las escenas y la evidencia mantienen sus contratos v1. Los contratos nuevos son:

- `NarrativeCriticRequestV1`: request original, scripts y copia comprobada de la evidencia permitida.
- `NarrativeCriticReportV1`: veredicto, claims no sustentados, omisiones engañosas, puntuaciones, `premiumReadiness` e instrucciones de reparación.
- `AutonomousNarrativePilotArtifactV1`: hasta dos intentos completos, estado final, fallo estructurado y fingerprints por componente.

## Gate autónomo

Los validadores deterministas fijan orden y vecinos de la ruta, español, cinco bloques, 220–260 palabras reales por escena, instrucciones visuales, variedad de aperturas, transiciones, evidencia, nombres, fechas, números y vocabulario de acontecimientos permitido. El esquema estricto añade rangos de caracteres para estabilizar el conteo sin sustituirlo.

Gemma aprueba únicamente cuando:

- no hay claims sin evidencia ni omisiones engañosas;
- curiosidad, tensión humana, utilidad visual, naturalidad y progresión alcanzan 4/5;
- cada escena alcanza 3/5;
- `premiumReadiness` alcanza 4/5.

Un hecho crítico sin respaldo rechaza el candidato aunque las puntuaciones estilísticas sean altas. Si el primer candidato falla semánticamente o Gemma lo rechaza, DeepSeek recibe el candidato anterior, los conteos reales de las tres escenas y las instrucciones de reparación, y regenera las tres una sola vez. Un segundo fallo cierra en `rejected`.

Los fallos persistentes de transporte, JSON, Ollama o Gemma también cierran en `rejected`. Un artefacto rechazado nunca puede congelarse como contenido aprobado.

## Modelos y reproducibilidad

- Generador: `deepseek-v4-flash`, `temperature: 0`, no-thinking, máximo 8K tokens y tool call estricto en el endpoint beta. DeepSeek documenta [V4 Flash y sus interfaces](https://api-docs.deepseek.com/updates) y los [tipos de JSON Schema admitidos por strict tool calls](https://api-docs.deepseek.com/guides/tool_calls).
- Crítico: `gemma4:12b` en Ollama, Q4, `temperature: 0`, seed `42`, contexto 16K, máximo 4K tokens y `think: false`. Ollama documenta [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [`/api/chat`](https://docs.ollama.com/api/chat) y la [inspección de modelos cargados](https://docs.ollama.com/api/ps).

El preflight exige el modelo exacto, cuantización Q4 y digest SHA-256 reportado por Ollama. El artefacto separa fingerprints de ruta, evidencia, texto, prompts, modelos, parámetros y crítica.

## Prerrequisitos

1. Instalar `gemma4:12b` en Ollama de Windows.
2. Exportar en WSL `OLLAMA_HOST` con una dirección alcanzable. La IP no está hardcodeada en el repositorio.
3. Proporcionar `DEEPSEEK_API_KEY` mediante el entorno o el `.env` local ignorado por git. La clave no se versiona.

## Comandos

Replay offline, sin red:

```bash
cd backend
npm run quality:narrative:paris:v1
```

Generación y crítica live sin modificar fixtures:

```bash
OLLAMA_HOST=http://HOST_ALCANZABLE:11434 \
  npm run quality:narrative:paris:v1 -- --generate --allow-external
```

Congelación atómica, permitida solo si el resultado de esa misma ejecución es `machine_approved`:

```bash
OLLAMA_HOST=http://HOST_ALCANZABLE:11434 \
  npm run quality:narrative:paris:v1 -- \
  --generate --allow-external --freeze-approved
```

Smoke live del crítico sobre el artefacto congelado: un control válido y mutaciones de causalidad inventada, atribución cruzada, personaje falso y omisión engañosa:

```bash
OLLAMA_HOST=http://HOST_ALCANZABLE:11434 \
  npm run quality:narrative:paris:v1:critic-smoke -- --allow-external
```

## Fuera de esta fase

La fase termina en la CLI reproducible y el artefacto de texto. Audio, publicación web y telemetría comercial quedan para fases posteriores. Gemma 4 12B podrá reutilizarse entonces para entradas de audio, pero esa integración no forma parte de este cambio.
