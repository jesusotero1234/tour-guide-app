# Resultado del goal narrativo — 5 de septiembre de 2026

## Veredicto

**No se alcanzó el objetivo completo.** El pipeline conserva mejor el trabajo, trata con más sentido las pequeñas diferencias de longitud y puede detectar/corregir una contradicción real de la fuente. Pero no demostró generación one-shot de calidad suficiente, el relato sigue repetitivo y el último canario se detuvo por el límite de gasto antes de terminar las verificaciones.

No vendería estos borradores automáticamente. Sí usaría el sistema como herramienta de preparación para un piloto **con edición factual y narrativa humana antes de publicarlo**. No considero que aumentar llamadas o cambiar todo a un modelo caro haya resuelto el producto.

El commit previo solicitado existe: `ef55a94` — `chore(narrative): checkpoint staged V8 pipeline before quality goal`. Los cambios posteriores están en el worktree; los archivos de infraestructura/RAG de otro trabajo no se han incluido en las modificaciones de este goal.

## Tour disponible

[Tour recuperado de Madrid, siete guiones](../../backend/tmp/narrative-v8/madrid-v8-goal-final-20260905-1/tour-recovered.md).

Es una **vista provisional**, no una ejecución aprobada. Incluye la reparación verificada y aceptada de Plaza Mayor. En Palacio Real conserva la versión anterior: el candidato nuevo quedó pendiente de verificación. No se modificaron los checkpoints para simular éxito ni se sustituyeron datos por conocimiento no documentado.

- Solicitud: 120 minutos; siete paradas.
- Ruta: aproximadamente 116 minutos estructurales, incluyendo estancias planificadas; 66 minutos de caminata calculada sobre grafo peatonal.
- Texto recuperado: 4033 palabras, unos 33,6 minutos de voz a 120 palabras/minuto.
- No son tiempos medidos de TTS ni de recorrido en campo. Las estancias planificadas no equivalen íntegramente a audio.
- Leí los siete borradores y la corrección aceptada. Se conservan abundantes introducciones abstractas, recapitulaciones y repeticiones de cifras/hechos.

## Comparación observada

Los siguientes runs reutilizan investigación y comienzan desde arco o su continuación editorial. Las escrituras nuevas varían: esta tabla no es un A/B determinista de texto idéntico. Los ensayos de auditor sobre texto congelado sí permiten aislar ese cambio.

| Run | Llamadas ejecutadas | Reparaciones propuestas / aceptadas | Coste del run | Tiempo | Resultado |
| --- | ---: | ---: | ---: | --- | --- |
| `madrid-v8-sentence-local-final-20260905-2`, referencia inicial | 28: 22 Mini + 6 Qwen | 6 / 0 | 0,30319365 USD | 6 min 34 s | `draft_review_required`; primera verificación 1/7 |
| `madrid-v8-goal-material-20260905-1`, calibración Mini | 22: 20 Mini + 2 Qwen | 2 / 1 | 0,28052430 USD | 5 min 1 s | Primera verificación 6/7, pero la fecha errónea no se detectaba |
| `madrid-v8-goal-verified-20260905-1`, auditor Full | 24: 9 Mini + 11 Full + 4 Qwen | 4 / 0 | 1,04984925 USD | 9 min 22 s | Primera verificación 3/7; detección mejor, selección de parches problemática |
| `madrid-v8-goal-final-20260905-1`, selección y reparación corregidas | 19: 9 Mini + 8 Full + 2 Qwen | 2 iniciadas: 1 aceptada, 1 pendiente | 0,78803625 USD | 6 min 36 s de comando | Interrumpido por presupuesto; primera verificación 1/7; scorecard final no ejecutado |

El último run **no es más barato como tour terminado**: está incompleto. Su única parada aprobada de primera fue Oriente. La fecha contradictoria de Plaza Mayor se eliminó con Qwen, se volvió a verificar con Full y el parche se aceptó en el canario real.

## Qué mejoró realmente

1. **Duración:** separación entre objetivo estrecho de escritura y margen de entrega. Cada audio mantiene objetivo propio; la suma narrada y la ruta siguen evaluándose. El plan peatonal usa un servicio ya existente, sin introducir transporte propio para rellenar minutos.
2. **Reparaciones:** no se descarta una corrección factual válida solo por una diferencia menor dentro del margen local. Las frases protegidas siguen sin poder reescribirse. Una objeción descubierta en texto no editado permanece abierta, pero ya no obliga a perder el arreglo del objetivo.
3. **Factualidad:** Full detectó en el texto real una cronología imposible que Mini aprobaba. La instrucción de reparación ahora distingue resolver el defecto de meramente reformular la frase. Se probó gratis en Madrid y dos casos de Málaga.
4. **Transporte del scorecard:** se eliminó evidencia duplicada del paquete, conservando todos los pasajes y frases. Un paquete real bajó a 120606 caracteres y el juez pudo ejecutarse en un run anterior.
5. **Conservación del resultado:** además del checkpoint, se guarda una vista Markdown provisional cuando ya existen todos los guiones. Nunca presenta un candidato de reparación pendiente como una corrección verificada. El fallo original conserva su código de salida y diagnóstico.

No se eliminaron controles de citas, identidad, cobertura, integridad del texto o gasto. No se añadieron reglas particulares de Madrid/Málaga al código de producción.

## Por qué siguen apareciendo llamadas y defectos

El esquema habitual ya no es un bucle ilimitado de escritor/fitter: hay una escritura por parada, verificación compacta y hasta una edición por parada. En el último run: un arquitecto + siete escritores + siete verificadores iniciales + un global + dos reparadores + una reverificación = 19 solicitudes ejecutadas. La siguiente se rechazó antes de HTTP.

Los problemas pendientes están distribuidos:

- **Fuente y curación:** una cita puede ser fiel y, aun así, contener un error. El 10/10 de exactitud que dio un juez anterior no lo detectó. Las capturas de páginas no equivalen a evidencia útil; las búsquedas locales devolvieron resultados irrelevantes incluso con ciudad/dominio explícitos.
- **Contrato del arco y transiciones:** algunas transiciones mencionan hechos de la parada siguiente que no están admitidos en su paquete de evidencia. El auditor tiene motivo para objetarlos aunque el dato exista en otro dossier del recorrido. No basta con pedir al modelo «escribe mejor».
- **Reverificación completa:** volver a juzgar todo el texto después de una corrección local permite descubrir problemas, pero también cambia criterios sobre frases intactas. Esto aumenta coste y revisiones pendientes. Se corrigió la selección del parche, no se ha demostrado aún una reverificación selectiva segura.
- **Narración:** seis funciones narrativas repetidas y una selección limitada de hechos favorecen recapitulaciones y párrafos sobre memoria/poder/espacio. Más palabras no implican más inmersión.
- **Juicio final:** algunas objeciones del scorecard fueron sustituciones cosméticas, mientras pasaba por alto un dato material. No lo trataría como certificación independiente de calidad comercial.

## Modelos: configuración actual y evidencia

Perfil `qwen38_hybrid`:

| Función | Modelo |
| --- | --- |
| Planner y reparación local | Qwen local |
| Curación ordinaria, arquitectura y escritura | GPT-5.4 Mini, razonamiento low |
| Curación compleja configurada | GPT-5.4, medium |
| Verificación factual compacta | GPT-5.4, medium, máximo 8000 tokens |
| Revisión global/scorecard | GPT-5.4 Mini, high |

No se recomienda interpretar Full como configuración comercial óptima demostrada. Se mantiene porque fue el único de esos ensayos que detectó la contradicción real; su incremento de coste y rechazos quedó medido.

- Mini low con prompt de consistencia: pasó controles sintéticos, pero no detectó el caso real.
- Mini medium: tampoco lo detectó; 0,018585 USD.
- Mini high: 8000 tokens consumidos en razonamiento, sin respuesta utilizable; 0,0403695 USD. No se aumentó el límite para forzarlo.
- Full medium: detectó el caso real y pasó 29/29 controles; una verificación congelada costó 0,07818 USD. Eso no significa que todas sus objeciones sean materialmente importantes.
- Escritura conjunta de tres paradas: ahorró dos llamadas, pero acortó el texto, mantuvo repeticiones y saltó una parada en la transición. Rechazada.
- Gemini 2.5 Pro como escritor, ensayo anterior: no resolvió longitud/soporte en los dos casos; no promovido. No extrapolar ese resultado a todos los usos de Gemini.

## Fuera de Madrid y RAG

- Málaga tuvo un canario real anterior de siete paradas: 45 llamadas, 0,4393683 USD, 9 min 51 s, `review_required`. No incluía todas las correcciones finales.
- Con el planificador peatonal nuevo, las sondas en vivo seleccionaron nueve paradas y unos 125 minutos; Madrid mantuvo siete y 116 minutos. Es selección genérica, no una lista especial por ciudad.
- Dos reparaciones locales congeladas de Málaga se reprodujeron con la instrucción nueva, sin coste: teatro romano y transición hacia La Malagueta. Se revisaron los textos resultantes.
- Las pruebas de evidencia limitada y de RAG existentes se verificaron durante el goal. El RAG sigue siendo opcional (`--rag=on/off`) y no se modificó su infraestructura.
- **No hay un canario completo de nueve paradas de Málaga con el código final, ni un nuevo A/B pagado RAG on/off que demuestre mejora de calidad.** No atribuir al RAG una mejora que no se midió.

## Presupuesto y límite real

| Concepto | USD |
| --- | ---: |
| Presupuesto nuevo autorizado | 5,00000000 |
| Coste nuevo reportado | 4,19761030 |
| Exposición conservadora previa no verificada | 0,27130200 |
| Total contabilizado | 4,46891230 |
| Saldo conservador | 0,53108770 |

Histórico al activar: 3,00263705 USD. Acumulado vigente para reanudar: **7,471549350000001**. Techo global invariable: **8,00263705**.

El último run costó 0,78803625 USD y no dejó exposición adicional ni reservas activas. El saldo no cubrió la reserva máxima de la siguiente verificación Full. No se debitó una solicitud que no se envió, no se reseteó el contador y no se pedirá ampliación. Las pruebas pagadas quedan detenidas.

## Recomendación de producto y siguiente decisión

No reescribiría todo ni buscaría otro modelo al azar. Conservaría los arreglos de integridad, duración y recuperación. Antes de otra campaña pagada, cerraría **un contrato de contenido coherente entre evidencia, arco, escritor y auditor**, especialmente las transiciones. El escritor no debe recibir una transición factual que su propio paquete no puede respaldar.

Para inmersión, haría un piloto editorial humano de un recorrido: elegir episodios concretos de fuentes fiables, quitar recapitulaciones y escuchar el audio caminando. Eso permite distinguir un fallo de modelo de un briefing pobre. El RAG solo merece entrar donde aporte hechos relevantes admitidos; no como volumen extra de contexto.

Una reverificación limitada a cambios y contexto afectado, conservando hallazgos anteriores, es una opción razonable para medir después; **no está implementada ni validada en este cierre**. No debe convertirse en una vía para ignorar contradicciones o aprobar texto no revisado.

No se cumple todavía la promesa «seis de siete paradas buenas a la primera». El coste de aproximadamente un dólar por generación reutilizable no es por sí solo el problema comercial. Lo son la calidad final no demostrada y la necesidad de revisar resultados que un LLM etiquetó como buenos.

## Auditoría de finalización

| Requisito | Evidencia / estado |
| --- | --- |
| Commit previo seguro | Hecho, `ef55a94` |
| Sin hardcodes de ciudades en producción / trabajo ajeno preservado | Cambios acotados revisados; selección y pruebas multicidad |
| Preservar RAG y gasto | Hecho; sin cambios de servicio; límite aplicado antes del HTTP |
| Tours completos y recuperables | Siete textos recuperados; guardado provisional nuevo probado. No equivale a revisión completa |
| Duración coherente | Estimación peatonal y voz indicadas; falta comprobación TTS/campo, diferida por el usuario |
| Factualidad y buena inmersión | Incompleto: una corrección material verificada, otras pendientes y texto repetitivo |
| One-shot orientativo | No logrado |
| Otra ciudad / evidencia escasa | Pruebas y replays presentes; falta canario multicidad final del conjunto |
| Canario final del código entregado | Ejecutado e interrumpido por límite; conservación Markdown añadida después, probada sin solicitudes pagadas |
| Tour e informe | Entregados con limitaciones explícitas |

El goal no debe marcarse completado. Detener experimentos pagados no convierte los resultados parciales en éxito.

Detalle cronológico, decisiones y replays: [registro del goal](narrative-goal-20260905.md).
