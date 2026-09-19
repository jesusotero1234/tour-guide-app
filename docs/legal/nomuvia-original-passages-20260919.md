# Pasajes originales y sustitución de audio

Petición del responsable: reemplazar los pasajes retirados por redacción nueva y
generar sus audios. Alcance: siete párrafos nuevos en cinco idiomas, insertados en
35 descripciones de parada de 30 tours. No se reescribe íntegramente cada tour ni
se declara resuelta la revisión de todas sus fuentes.

## Criterio editorial

Se cambia el planteamiento de los pasajes: observación del lugar, relación entre
puerto y defensa, función de una puerta urbana, lectura crítica de un objeto de
museo, escala temporal de la construcción, escucha de campanas y funcionamiento
cotidiano de un mercado. Las instrucciones imaginativas se expresan como tales;
no se inventan episodios históricos ni se atribuyen intenciones a personajes.

Los pocos datos históricos añadidos se contrastaron en fuentes identificadas:

- San Carlos y protección marítima de Portopí:
  https://www.spain.info/es/lugares-interes/castillo-san-carlos/
- Quart como puerta del recinto medieval:
  https://es.wikipedia.org/wiki/Torres_de_Quart
- Incendio del Alcázar en 1734 y residencia de Carlos III en 1764:
  https://www.museodelprado.es/aprende/enciclopedia/voz/palacio-nuevo/ddee2186-4405-4d99-bac4-7d702cda6c33
- Apertura del Mercado Central en 1928:
  https://www.mercadocentralvalencia.es/Mercado/HistoriaMercado

Se emplean hechos, no extractos de esas páginas. La comparación automática de los
siete pasajes españoles con las capturas históricas arroja coincidencias máximas
de entre tres y cinco palabras consecutivas. Es una comprobación editorial, no
un criterio jurídico de originalidad ni una garantía de ausencia de infracción.
Los nuevos pasajes tienen versiones en es/en/fr/de/it revisadas conjuntamente.

## Integración

Textos aplicados mediante transacción y comparación de versión previa. Se conserva
el resto del contenido, las fuentes históricas y los archivos de audio antiguos.
Las fotos se mantienen sobre sus párrafos originales y se recalculan índices y
hashes al insertar el nuevo párrafo. Ninguna se reasigna a un tema distinto.

Directorio privado de respaldo, textos y ejecución:
`/home/jesusotero/.local/share/tour-guide/nomuvia/original-passages-20260919/`.
`pasajes-nuevos.md` permite leer los 35 pasajes. `audio-manifest.json` contiene los
textos completos que deben narrarse, con sus hashes e identidad de voz.

## Audio

El responsable ha liberado la GPU retirando Qwen. La generación usa VoxCPM2 y las
voces configuradas por idioma. Se preparan cinco lotes de siete paradas. Los
audios se vinculan a los hashes de las narraciones completas, conservando avisos
de voz artificial e introducción donde corresponda según el servicio existente.

Cada lote valida integridad del archivo, revisión del modelo, decodificación,
duración positiva y señal no vacía antes de insertar las nuevas versiones. Los
audios previos permanecen como respaldo, sin falsear sus hashes ni sobrescribirlos.
El estado de ejecución se conserva en `audio-state.json`; la mera preparación de
este documento no acredita que todos los lotes hayan terminado.

### Resultado final

Los cinco lotes terminaron correctamente: 35 archivos nuevos insertados y
seleccionables por el servicio de audio para los textos actuales. Se verificaron
los hashes de texto y archivo, identidad del modelo, decodificación, señal y
duración. No se realizó escucha humana íntegra de las 35 narraciones.
Las 403 descripciones ajenas a este alcance permanecen intactas; las asociaciones
de imágenes siguen siendo coherentes. Los audios anteriores no se eliminaron.

`completion.json` registra los IDs de los 35 audios, rutas y hashes finales.
`audio-state.json` consta como `completed`. Son cambios del catálogo local;
no se ha importado el contenido en Hetzner ni abierto el acceso público.
