# Catálogo existente: preparación para el piloto

Auditoría de lectura del 19 de septiembre de 2026. El responsable solicita incluir
los tours existentes que funcionan y mantener fuera los que otro agente genera.
No se ha detenido ningún proceso ni modificado la base local, los guiones o audios.

## Resultado comprobado

57 registros: colección de 11 ciudades con cinco idiomas y dos versiones antiguas
adicionales (Madrid y Seville). La referencia conversacional a «diez ciudades»
no coincide exactamente con el inventario; no se elimina ninguna por esa diferencia.

| Ciudad guardada | Versiones |
| --- | ---: |
| Alicante | 5 |
| Barcelona | 5 |
| Castellón de la Plana | 5 |
| Las Palmas de Gran Canaria | 5 |
| Madrid | 6 |
| Murcia | 5 |
| Málaga | 5 |
| Palma | 5 |
| Sevilla | 5 |
| Seville | 1 |
| Valencia | 5 |
| Zaragoza | 5 |

Ningún registro supera actualmente `pilot-tours.ts audit`: 56 se detienen por
`SOURCE_USE_PENDING` y uno por `INVALID_TOUR_BLUEPRINT: destination policy`.
El control del proyecto es conservador: solo permite automáticamente determinadas
URLs de Wikipedia y Wikidata; el resto requiere documentación. Esto no demuestra
que todos los demás usos sean ilícitos. Hay también dominios restringidos
expresamente por revisiones anteriores, como Catedral de Sevilla y Real Alcázar.

El inventario de capturas comprende 36 dominios. No todas las capturas son fuentes
seleccionadas del guion; hay que distinguir ambas antes de decidir la corrección.
Como el control falla antes de validar todos los audios y las revisiones humanas,
no se afirma que resolver fuentes sea el único trabajo pendiente.

## Próximo trabajo concreto

- Resolver, por blueprint compartido, permisos y uso efectivo de las fuentes
  pendientes. Conservar evidencia y atribución; si falta permiso, sustituir la
  fuente y revisar las partes afectadas, sin marcar permisos ficticios.
- Repetir validación de texto, audio, ruta y atribución sobre las versiones finales.
- Incorporar únicamente los registros y MP3 que superen los controles; el servidor
  permanece sin tours. La revisión humana del recorrido no se sustituye por una
  comprobación automática del mapa.

Resultados completos e inventario de URLs en el directorio privado local
`/home/jesusotero/.local/share/tour-guide/nomuvia/`:
`catalog-audit-20260919.jsonl` y `catalog-source-urls.json`.
No se han copiado capturas de investigación al servidor.
