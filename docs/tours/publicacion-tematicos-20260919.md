# Publicación de la colección temática

Fecha: 19 de septiembre de 2026. Autorización explícita del responsable: «los subimos?», referida a los once tours temáticos.

## Resultado

Se añadieron once tours en español al catálogo público de Nomuvia. Se conservan los 55 anteriores: total 66, con 22 en español y once en cada uno de los otros cuatro idiomas. No se han generado traducciones de esta colección ni publicado los tours independientes de Sicilia.

- 58 paradas, 58 audios de paradas y once introducciones.
- Las diez despedidas se conservaron al final del audio y texto de la última parada; Madrid no tenía despedida independiente.
- Se generó una sola frase de aviso de voz sintética y se antepuso a las once bienvenidas. Los capítulos existentes no se regeneraron.
- Los 79 capítulos originales se verificaron contra sus hashes, registros de procedencia y texto, aceptando únicamente las sustituciones de pronunciación del preset verificado.
- Se reutilizaron 37 fotografías del catálogo con identidad de lugar y créditos existentes. Las otras 21 paradas no tienen fotografía; no se inventaron imágenes ni atribuciones.
- Rutas peatonales guardadas para los once tours. Se reutilizó el recorrido documentado de Madrid y se calcularon los otros diez. Las coordenadas que faltaban se contrastaron con Wikidata, OpenStreetMap y fuentes municipales; no equivalen a una inspección presencial.
- La parada del Stanbrook corresponde al entorno público del puerto de Alicante junto a la oficina de turismo, no a unas coordenadas del barco ni a una ubicación certificada de su busto.

## Cambios y comprobaciones

`catalogTitle` permite identificar los nuevos tours por su título. El título se incluye en la huella de publicación, por lo que cambiarlo invalida la autorización del contenido anterior. Su ausencia conserva las huellas de los tours existentes.

TypeScript correcto; dos suites de publicación/API, 14 pruebas correctas. Validación real en Hetzner: 66 tours admitidos y 483 audios de paradas disponibles. Navegador público: 22 tours españoles, once ingleses conservados, títulos y textos nuevos coincidentes, once rutas 200, 22 peticiones parciales de audio 206, reproducción real con avance de tiempo y búsqueda móvil con ambos tours de Barcelona.

La publicación conserva la modalidad `owner-authorized`, controles manuales en false y fuentes pendientes en su estado real. No se afirma escucha humana completa ni revisión jurídica adicional. No se modificaron los controles de seguridad ni la configuración de acceso público.

## Despliegue y recuperación

Release: `/srv/tour-guide/releases/20260919-thematic`. Se recompiló y reinició solamente el backend; el frontend existente ya admitía títulos. Importación transaccional exclusivamente de nuevos IDs, con comprobación de que existían exactamente 55 tours antes de importar y sin sobrescribirlos.

Antes de importar se guardaron el dump de la base de 55 tours y el enlace anterior en `/root/nomuvia-before-thematic-20260919`. Los originales, transformaciones con procedencia y paquete de exportación se conservan en el PC. Evidencia privada: `/home/jesusotero/.local/share/tour-guide/nomuvia/thematic-launch-20260919/`, incluidos `plan.json`, `catalog.json`, `routes.json` y las consultas de coordenadas.

## Enlaces publicados

- [Murcia: la ciudad que hubo que rehacer](https://nomuvia.com/tours/1a0982ad-a9e4-5c8e-a59e-4669c50a8f27)
- [Málaga: recuperar una ciudad escondida](https://nomuvia.com/tours/5e6f2dde-cc9d-5828-a61d-4e86cbbeb40a)
- [Castellón: mercados, campanas y decisiones de la villa](https://nomuvia.com/tours/875b2849-be3b-5718-a515-5e7bfda2ebdf)
- [Valencia: edificios que cambiaron de oficio](https://nomuvia.com/tours/3ecde97d-cafd-5f66-bcd8-c479a5de8733)
- [Madrid de los Austrias: una villa se convierte en corte](https://nomuvia.com/tours/bdfc7fda-3643-5a06-ae6a-23a09489fc1e)
- [Caesaraugusta: vivir en una ciudad romana](https://nomuvia.com/tours/bd9d17b5-9a58-5de4-8586-5b3d655d65da)
- [Barcelona y el mar: oficios, comercio y galeras](https://nomuvia.com/tours/43a1a6af-c6a5-59f1-920c-e6ee63f97283)
- [Sevilla, puerto de Indias: aprender a navegar y organizar el comercio](https://nomuvia.com/tours/3012a558-4840-5eaf-a0ba-bbe9823b5693)
- [Palma de reyes y mercaderes](https://nomuvia.com/tours/80d2b65f-f6e1-52b8-8fa0-0c245bb931e2)
- [Las Palmas bajo ataque: murallas, castillos y reconstrucción](https://nomuvia.com/tours/7d234182-304b-5e97-adac-2f1e8e29d557)
- [Alicante, 1938–1939: la ciudad y la última salida](https://nomuvia.com/tours/7118b026-d7ba-5f5f-b08a-f4ea5b1779c2)

## Mejora de lectura tras publicación

Release `20260919-thematic-paragraphs`: los bloques largos de los tours temáticos
se presentan en párrafos, separando por límites de oración. Se conservan los
saltos existentes y todas las palabras. Es un cambio de presentación: no modifica
la base, los hashes de publicación ni los audios. Verificación de equivalencia
sobre 69 textos; compilación de producción correcta. Prueba pública móvil en
Murcia: cuatro párrafos en la primera parada, palabras idénticas, sin desbordamiento
horizontal y reproducción de audio correcta. Los tours de otras colecciones
conservan su formato. Release anterior registrada en
`/root/nomuvia-before-paragraphs-20260919` para revertir el frontend.
