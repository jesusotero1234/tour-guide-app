# Revisión concreta de imágenes y textos

19 de septiembre de 2026. Lectura del catálogo previamente inventariado: 57 tours,
13 blueprints. No incluye los nuevos trabajos en generación. Sin escrituras en la
base de datos ni cambios de audios, aprobaciones o política de publicación.

## Imágenes: contraste realizado

Las 448 referencias corresponden a **111 imágenes distintas**. Se consultaron sus
111 fichas por ID mediante la API oficial de Wikimedia Commons, en tres lotes con
`maxlag=5`. En todas coinciden autor, nombre de licencia y URL de licencia con los
datos almacenados; no se encontraron restricciones en el campo `Restrictions` ni
discrepancias en la atribución adicional cuando está presente. La normalización
elimina marcado HTML, espacios redundantes y variantes de URL del mismo texto legal.

Inventario de resultados: `nomuvia-image-review-20260919.csv`. Evidencia cruda y
comparación en el directorio privado local de Nomuvia: `commons-license-check-*.json`
e `image-license-comparison.json`.

Esto cierra el contraste de metadatos, no una certificación de derechos de todas
las imágenes: no se ha inspeccionado visualmente cada fotografía ni cada historial
de discusión/borrado. Tampoco demuestra derechos de imagen de personas o permisos
adicionales sobre obras representadas. Se mantienen créditos y licencias por foto;
no se justifica sustituir las 111 fotografías por una alarma genérica.

## Textos: incidencias localizadas

Comparación de las 13 versiones españolas contra las capturas seleccionadas de
fuentes externas a Wikipedia. Se calcula la mayor secuencia consecutiva de palabras
normalizadas compartida con un párrafo del tour. No es un umbral jurídico ni una
prueba de infracción; las coincidencias pueden ser hechos, nombres o expresión
protegida. Tampoco detecta traducciones o paráfrasis. Sirve para priorizar revisión
editorial. No se exportan fragmentos de terceros en el informe.

| Ciudad | Parada | Párrafo | Mayor secuencia | Acción |
| --- | --- | --- | --- | --- |
| Palma | Fuerte de San Carlos | 2 | 52 palabras | Resolver condiciones de la fuente y revisar redacción |
| Las Palmas | Iglesia San Francisco de Asís | 6 | 48 palabras | Identificar derechos de la publicación archivada; Wayback no concede licencia |
| Valencia | Torres de Quart | 3 | 47 palabras | Comprobar régimen de reutilización del documento GVA concreto |
| Alicante | Museo Arqueológico | 4 | 34 palabras | Revisar la reutilización de la redacción de MARQ |
| Madrid | Palacio Real | 5 | 31 palabras | Aplicar condiciones de Patrimonio Nacional al uso concreto |
| Castellón | El Fadrí | 4 | 27 palabras | Revisar licencia de la guía PDF de MUCC |
| Valencia | Mercado Central | 3 | 21 palabras | Prioridad: expresión cercana a artículo con licencia ND |

El CSV `nomuvia-source-overlap-20260919.csv` incluye todas las fuentes analizadas,
URLs, IDs de versión y localización. El número de párrafo cuenta bloques separados
por línea en blanco en la descripción almacenada al revisar; no es un identificador
estable después de editar el texto.

### Valencia: artículo de EGA

La ficha oficial indexada del artículo de Francisco Hidalgo Delgado, «De lo
proyectado a lo construido. El Mercado Central de Valencia», identifica licencia
CC BY-NC-ND 4.0; las condiciones de envíos de la revista la corroboran. La consulta
directa dio errores, pero el buscador devolvió el contenido de la ficha oficial.
[Ficha](https://www.polipapers.upv.es/index.php/EGA/article/view/1363),
[condiciones](https://www.polipapers.upv.es/index.php/EGA/about/submissions).

La captura usada es el PDF `article/download/1363/1386`. El tercer párrafo español
reproduce de forma cercana su explicación del cambio de frontón y materiales.
No se considera resuelto por la gratuidad: ND no permite distribuir adaptaciones
amparándose únicamente en esa licencia. [Condiciones de la licencia](https://creativecommons.org/licenses/by-nc-nd/4.0/).

Propuesta concreta: retirar de la versión de publicación ese párrafo y cualquier
pasaje equivalente dependiente de la misma expresión en los otros idiomas, o
documentar permiso suficiente. Antes de generar audio nuevo, revisar cada texto
resultante y su coherencia. No basta cambiar sinónimos ni borrar la referencia.
Los hechos históricos pueden reconstruirse con investigación independiente y
redacción propia; no se concluye que todo el Mercado Central esté restringido.
No se ha aplicado esta propuesta a los tours ni se ha contactado con el titular.

### BOE: distinguir el documento del dominio

Se ha consultado el RD 599/2023, BOE-A-2023-16637: el texto normativo declara BIC los
edificios de la Plaza de España e incluye su descripción. El artículo 13 LPI excluye
las disposiciones legales y reglamentarias de su objeto de protección. Documentar
este fundamento para el texto de esta disposición; no extenderlo a logotipos,
material de terceros o cualquier otra publicación del BOE. No se ha modificado
la lista de fuentes permitidas del programa.
[Disposición](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-16637),
[artículo 13 LPI](https://www.boe.es/buscar/act.php?id=BOE-A-1996-8930#a13).

## Siguiente trabajo definido

1. Resolver permisos/redacción de los párrafos concretos identificados, conservando
   las capturas históricas como evidencia privada; no falsear procedencia.
2. Revisar equivalentes en los cinco idiomas antes de regenerar solo los audios
   afectados. Mantener intactos los trabajos simultáneos.
3. Validar atribución y condiciones del texto derivado de Wikipedia, además de las
   imágenes ya contrastadas. Una bibliografía por sí sola no sustituye condiciones
   de licencia aplicables a adaptaciones.
4. Completar revisión humana y de rutas para las versiones destinadas al público.

No hay aprobación global del catálogo ni diagnóstico global de infracción. El
control automático SOURCE_USE_PENDING sigue siendo más conservador que esta
revisión por uso; no se desactiva para ocultar los pendientes.
