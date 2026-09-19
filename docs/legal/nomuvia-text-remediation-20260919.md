# Corrección de los pasajes señalados

Aplicada a la base local el 19 de septiembre de 2026 por petición expresa del
responsable. Alcance: siete paradas en español, inglés, francés, alemán e italiano;
35 descripciones pertenecientes a 30 tours (Valencia tiene dos paradas afectadas).

Se retiran los párrafos identificados en `nomuvia-content-review-20260919.md`:
Fuerte de San Carlos, iglesia San Francisco de Asís, Torres de Quart, MARQ,
Palacio Real de Madrid, El Fadrí y Mercado Central de Valencia. Se ajusta el cierre
de San Francisco y la referencia posterior de Quart para evitar referencias a
contenido retirado. No se sustituyen por simples cambios de sinónimos.

Se conservan las fuentes y blueprints históricos: no se modifica su procedencia
ni se finge una nueva investigación. Esto corrige los pasajes seleccionados, no
certifica toda la narración ni resuelve los permisos pendientes de otras fuentes.

Las imágenes se mantienen asociadas a los párrafos no modificados, actualizando
su índice, hash y `sourceText`. Ninguna imagen estaba vinculada a los párrafos
eliminados o reescritos; no se eliminó ninguna referencia de imagen.

La escritura se realizó en una transacción serializable, comprobando descripción
y fecha de modificación originales para abortar ante cambios simultáneos. Los
trabajos de generación de texto de estos tours estaban completados. Se detectó
un marcador histórico de audio de Alicante alemán del 12 de septiembre: su
progreso indicaba render terminado, sin proceso asociado. Ese marcador no se
modificó. No se detuvo ni reinició ningún proceso.

## Audios pendientes

**Actualización posterior:** este apartado describe el estado inmediatamente
después de la retirada inicial. Los 35 pasajes se sustituyeron por textos nuevos
y sus 35 audios se regeneraron posteriormente. Véase
`nomuvia-original-passages-20260919.md`. No siguen pendientes de generación;
sí de revisión y despliegue.

No se generó ni se eliminó audio. Los 35 textos requieren narración nueva y
revisión antes de publicación. El servicio de audio vincula los archivos al hash
del texto, por lo que los correspondientes a versiones anteriores no deben
presentarse como audio vigente del texto editado. No se alteraron hashes de los
audios antiguos para simular que corresponden al texto nuevo.

Respaldo y entrega privada:
`/home/jesusotero/.local/share/tour-guide/nomuvia/text-revision-20260919/`:

- `before.json`: estado previo de los tours inventariados.
- `plan.json`: texto anterior, texto final y metadatos por parada.
- `textos-revisados.md`: narraciones resultantes para revisión.
- `applied.json`: registro de aplicación.
- `audio-regeneration.json`: IDs y hashes para regenerar solo los afectados.

Validación: 35 textos finales coinciden con el plan; vinculaciones de imágenes
coherentes; IDs de audio conservados; resto de descripciones inventariadas sin
cambios. No se ha desplegado contenido ni abierto el catálogo en Hetzner.
