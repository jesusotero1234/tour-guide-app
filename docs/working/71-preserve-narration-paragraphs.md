# Conservar párrafos de narración

## Plan decidido

1. Separar texto de lectura y frases de auditoría: añadir una opción explícita `preserveParagraphs` al asignador de frases. Conservar separadores de párrafo en `script.text`, normalizando CRLF y espacios internos; mantener exactamente el algoritmo actual de frases e identificadores. Calcular la huella sobre el texto final, no sobre una versión previa a la restauración de párrafos.
2. Activar esa opción únicamente en la narración Codex usada por la aplicación y los canarios. El comportamiento predeterminado y las reparaciones del protocolo antiguo siguen intactos. El flujo Codex no utiliza reparaciones automáticas.
3. Verificar conservación de párrafos, equivalencia de palabras/frases/IDs, huellas coherentes y exportación del estado/Markdown, incluyendo fallo de auditoría después de guardar el texto. El frontend ya separa por líneas en blanco; no requiere cambios.
4. Reprocesar sin modelos los originales del último Madrid como comprobación de regresión, sin sobrescribir artefactos ni datos históricos. Compilar el worker para los próximos canarios, sin reiniciar servicios ni generar tours.

## Alcance

No regenerar narraciones, inventar párrafos, modificar auditorías históricas, migrar la base de datos ni lanzar Madrid/Castellón/Sevilla en esta corrección. Los tours antiguos continúan iguales hasta una restauración explícita desde sus originales. No hacer commit/push sin petición.

## Criterios de aceptación

- Los párrafos del escritor llegan a `script.text` y `tour.md`.
- Mismos textos de frases, orden e IDs con y sin conservación de párrafos.
- Mismas palabras tras normalizar espacios; huella calculada sobre el contenido realmente guardado.
- Compatibilidad del comportamiento por defecto y controles de auditoría.

## Resultado

Implementado: opción explícita en `NarrativeEditorialV6.ts`, activada en `narrative-codex-live-v8.ts`; pruebas unitarias y de exportación añadidas. El worker implementó los cambios y Codex revisó los diffs y corrigió la firma de un mock de prueba.

Las cuatro suites enfocadas suman 58 pruebas aprobadas tras esa corrección. Compilación de `tsconfig.generation-worker.json` completada. Comprobación offline de los siete originales del último Madrid: se conservan 8, 10, 10, 9, 11, 11 y 8 párrafos respectivamente, sin cambiar ninguna frase, identificador ni palabra. Se verificó también la conservación en JSON y Markdown con auditoría correcta y fallida.

No se sobrescribieron tours históricos ni se realizaron llamadas de generación. No se hizo commit/push. El worker compilado queda preparado para las próximas ejecuciones.
