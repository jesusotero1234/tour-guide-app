# Narrativa autónoma v2: calificación multiciudad

Fecha: 2026-08-10

Estado: **motor implementado; calificación live cerrada fallida; contenido no congelado**

## Alcance demostrado

V2 califica narrativas de rutas históricas en `es-ES`. El conjunto cerrado contiene París,
Madrid y Berlín, con tres escenas y cuatro hechos oficiales por escena. El motor recibe un
caso genérico y no contiene nombres ni ramas por ciudad. Un caso sintético con IDs y nombres
desconocidos prueba que una cuarta ciudad no requiere cambios de código.

V1 permanece aditivo e intacto. V2 conserva `NarrativeScriptRequestV1`, la evidencia y el
formato final de escenas, pero introduce un plan factual obligatorio y críticos sin campo de
veredicto:

```text
evidencia cerrada
  → DeepSeek: plan de claims
  → validación local
  → Gemma: grounding del plan
  → gate local
  → DeepSeek: prosa limitada al plan
  → validación local
  → Gemma: fidelidad y calidad final
  → machine_approved | rejected
```

Existe una reparación completa del plan y otra de la prosa. Los fallos de transporte, JSON o
referencias inválidas permiten un reintento de protocolo sin consumir esas reparaciones. Un
segundo fallo de contenido cierra en `rejected`; V2 no tiene estado de revisión humana.

## Límites deterministas

El código asigna IDs canónicos, evidencia de bloque, destinos de transición y conteos. Exige
orden exacto de escenas y cinco bloques, uso de todos los hechos, referencias de la misma
escena y reutilización máxima `ceil(5 / hechos)`. DeepSeek no puede proporcionar esos campos.

Cada bloque tiene 42–45 tokens separados por espacios y cada transición 22–25. El contador
Unicode V1 sigue exigiendo 220–260 palabras reales por escena. Las transiciones son solo
navegacionales.

El grounding rechaza claims sin apoyo, causalidad indebida y omisiones engañosas. El gate final
exige cero claims nuevos, deformados u omitidos, cero omisiones engañosas, todas las dimensiones
al menos 4/5, cada escena al menos 3/5 y `premiumReadiness` al menos 4/5. Un claim crítico sin
respaldo rechaza independientemente del estilo.

## Benchmark cerrado

La ejecución genera secuencialmente tres candidatos por ciudad y después aplica cuatro
mutaciones a un candidato aprobado de cada caso: causalidad inventada, atribución cruzada,
personaje falso y omisión engañosa. Solo pasa si:

- aprueba al menos 8/9 candidatos y 2/3 en cada ciudad;
- las doce mutaciones son rechazadas por razones factuales mediante informes válidos;
- Gemma está totalmente residente en GPU (`size_vram === size`);
- cada crítica tarda menos de 180 segundos.

Un fallo de transporte o JSON de una mutación no cuenta como detección. Los prompts, modelos,
parámetros y políticas quedan fijados en código y sus fingerprints forman parte del artefacto,
junto con ruta, evidencia, procedencia, plan, texto y ambos informes.

`--generate --allow-external` nunca escribe fixtures. `--freeze-approved` publica mediante dos
archivos preparados el benchmark y el candidato parisino aprobado de menor índice. El gate se
evalúa antes de cualquier escritura; un resultado insuficiente no crea ni sobrescribe archivos.

## Evidencia offline

Cada hecho conserva fragmento original, idioma, normalización española, URL, fecha de captura y
fingerprint. Durante la generación no existe acceso web. Las fuentes son:

- París: [Notre-Dame](https://www.notredamedeparis.fr/en/understand/history/),
  [Louvre](https://presse.louvre.fr/wp-content/uploads/2016/12/832675.pdf) y
  [Palais-Royal](https://www.domaine-palais-royal.fr/en/decouvrir/histoire-du-domaine-national-du-palais-royal).
- Madrid: [Palacio Real](https://www.patrimonionacional.es/visita/palacio-real-de-madrid),
  [Plaza Mayor](https://patrimonioypaisaje.madrid.es/portales/monumenta/es/Monumentos-y-Edificios-Singulares/Edificios-singulares/Plaza-Mayor/) y
  [Puerta de Alcalá](https://patrimonioypaisaje.madrid.es/portales/monumenta/es/Monumentos-y-Edificios-Singulares/Edificios-singulares/Puerta-de-Alcala/).
- Berlín: [Checkpoint Charlie](https://www.berlin.de/sen/stadtentwicklung/staedtebau/einzelprojekte/checkpoint-charlie/),
  [Reichstag](https://www.bundestag.de/besuche/architektur/reichstag/geschichte/verlauf-246958) y
  [Museumsinsel](https://www.smb.museum/en/museums-institutions/museumsinsel-berlin/about-us/profile/).

DeepSeek documenta los [tool calls estrictos](https://api-docs.deepseek.com/guides/tool_calls/).
Los schemas usan `strict: true` solo con tipos soportados; cardinalidades y referencias dinámicas
se validan en runtime. Ollama documenta [structured outputs](https://docs.ollama.com/capabilities/structured-outputs),
[`/api/chat`](https://docs.ollama.com/api/chat) y [`/api/ps`](https://docs.ollama.com/api/ps).

## Comandos

Replay offline de artefactos congelados:

```bash
cd backend
npm run quality:narrative:v2
```

Calificación live sin escritura:

```bash
OLLAMA_HOST=http://HOST_ALCANZABLE:11434 \
  npm run quality:narrative:v2 -- --generate --allow-external
```

Congelación condicionada al mismo resultado live:

```bash
OLLAMA_HOST=http://HOST_ALCANZABLE:11434 \
  npm run quality:narrative:v2 -- \
  --generate --allow-external --freeze-approved
```

Los dos últimos comandos requieren `DEEPSEEK_API_KEY` en el entorno o `.env` ignorado. Hasta que
una calificación live pase, no deben existir `approved-benchmark.json` ni el artefacto V2 de París,
y no corresponde crear el commit de contenido.

## Resultado de la calificación cerrada

La única tanda live se ejecutó el 10 de agosto de 2026 con los fingerprints bloqueados. Falló con
0/9 candidatos aprobados y, por tanto, 0/12 mutaciones factualmente detectadas: sin candidato
aprobado no existe una base válida que mutar. París falló en grounding; Madrid combinó fallos de
grounding y reutilización de evidencia; Berlín combinó reutilización de evidencia y conteos de
prosa. La residencia GPU y el límite de 180 segundos sí pasaron.

La ejecución no escribió fixtures. No existen el benchmark aprobado ni el candidato V2 de París,
y no se crea el commit `content: freeze machine-approved Paris narration`. Los prompts, parámetros,
políticas y casos no se ajustan después de observar este resultado. Cualquier iteración futura
requiere una nueva calificación cerrada y un holdout aún no utilizado.
