# Canario narrativo de ruta con Astra low

## Decisión y alcance

Ejecutar una prueba aislada de la narración de Madrid sobre el checkpoint `madrid-v8-staged-20260905-015959`: siete paradas, 4.086 palabras objetivo y petición original de 120 minutos. No es una nueva investigación ni una validación de navegación/TTS. No cambiar producción, RAG, modelos por defecto, ruta ni objetivos para conseguir un aprobado.

El usuario autorizó ejecutar la propuesta con techo de $3 para esta prueba. Mantener el gasto histórico contabilizado de $9,780625152 y limitar el nuevo total a $12,780625152; no sumar además el remanente de otra prueba ni liberar exposiciones anteriores.

## Implementación mínima

1. Adaptador puro y genérico que transforma un checkpoint en encargos de autor y entradas de auditoría por parada. Reutilizar los criterios generales del encargo probado, los pasajes literales guardados y el constructor de auditoría existente. Sin nombres ni IDs de Madrid codificados en la lógica.
2. Compartir con escritor y auditor la identidad de parada, orden, anterior/siguiente y condición de reproducción presencial exterior. Esto no autoriza giros, acceso, visibilidad interior ni hechos históricos nuevos. Mantener la auditoría factual actual y sus hallazgos.
3. Usar la referencia de voz como estilo, nunca como fuente; omitirla en la parada de la propia referencia para evitar que copie una respuesta conocida. Compartir aperturas/cierres anteriores solo para variar la voz, no como evidencia.
4. Coordinador secuencial que reutiliza el piloto existente: Astra low, proveedor OpenAI a través de OpenRouter, excepción de no-ZDR solo experimental; GPT-5.4 medium como auditor. Una escritura y una auditoría por parada, sin reparaciones automáticas.
5. Preservar cada respuesta y presupuesto. Una auditoría fallida o con objeciones no borra una narración completa. Un fallo de escritor o imposibilidad de reservar gasto detiene nuevas llamadas y deja explícita la entrega parcial. Nunca reintentar a escondidas.
6. Exportar tour Markdown, resultados por parada, fuentes, hallazgos y duración estimada agregada. Comparar palabras con los objetivos existentes mediante la función de tolerancia vigente. No presentar 120 minutos como tiempo TTS medido.

## Validación y revisión

Tests con una ciudad y nombres ficticios distintos de Madrid: orden y aislamiento de fuentes, contexto compartido, referencia excluida en su propia parada, entrada incompleta rechazada antes de red, presupuesto acumulativo y conservación de resultados parciales. Revisar diff y ejecutar dry-run sin inferencia antes del canario.

Al final, Codex leerá las siete narraciones y los hallazgos para valorar fidelidad, inmersión, repetición, transiciones y longitud. Entregar originales sin corregirlos de forma encubierta; distinguir ejecución completada, bandas de duración y aprobación editorial. No se promete cero observaciones ni publicación automática.
