# Plan de generación multilingüe de tours

Fecha: 2026-09-06. Estado: integración implementada y validada con Madrid; activación francesa pendiente de validación internacional y del nuevo auditor Codex.

## Objetivo y alcance

Permitir pedir un tour de cualquier destino soportado en español o francés, investigando con fuentes adecuadas al destino y reutilizando investigación y ruta entre idiomas. Ampliar los países no implica limitarse a fuentes españolas, francesas o inglesas. Otros idiomas de narración se incorporarán después de validar su escritura, auditoría y duración.

Mantener historia como temática inicial, las duraciones disponibles y Codex como autor. Mantener los resultados como borradores pendientes de revisión; este trabajo no introduce publicación automática, un panel de aprobación ni un sistema nuevo de audio.

## Hechos comprobados en el código

- `GenerationJobService.buildIdempotencyKey` combina nombre de ciudad, país, temática, idioma, duración y versión. Sirve para evitar repetir una solicitud, pero no permite compartir investigación entre idiomas ni unificar nombres alternativos de una ciudad.
- `EditorialProminenceCaptureV6` usa el mismo `options.language` para elegir las ediciones de Wikipedia y Wikivoyage. La selección de fuentes está acoplada al idioma de la solicitud.
- `prepareAuthorCanaryMaterialV8` ya entrega `route.language` al autor. También exige que `dossier.language` coincida con él: no basta con quitar el bloqueo de francés en la API.
- `CodexTourArtifact` guarda texto, paradas y un resumen de auditoría; no persiste el dossier completo como una base independiente reutilizable. También añade introducción y posibles instrucciones de traslado que necesitan localizarse.
- El transporte Codex rechaza actualmente `resume`. El proceso necesita una entrada explícita para escribir a partir de una base validada, sin repetir descubrimiento e investigación.
- `NarrativeDurationTargetsV8` utiliza 120 palabras por minuto como estimación general. No representa una duración medida ni una calibración por idioma.

## Decisiones de diseño

### 1. Separar destino, investigación y narración

- Identificar el destino mediante su identidad canónica —QID y país verificado—, conservando los nombres de presentación. No usar únicamente el texto que escribe el usuario para decidir reutilización.
- Mantener `language` de la API como idioma de narración para preservar el contrato actual. Internamente distinguir `outputLocale`, idioma de cada fuente y política de investigación.
- Resolver ciudad/país incompatibles o ambiguos antes de generar. No elegir arbitrariamente entre destinos homónimos.
- Elegir fuentes locales y oficiales según relevancia y autoridad. Las ediciones adicionales de Wikipedia/Wikivoyage son complementos según cobertura. No deducir un único idioma de investigación del país: hay países y ciudades multilingües.
- Versionar la política de fuentes y hacerla independiente del idioma del visitante. Un mismo destino y solicitud equivalente deben seleccionar la misma base tanto en español como en francés.
- Una página ausente no es una evidencia negativa. Distinguir ausencia, fallo temporal y evidencia insuficiente; mantener URL, idioma, revisión/fecha y fragmento original de cada fuente.
- Si dos fuentes discrepan, registrar la discrepancia y excluir o matizar el hecho según las reglas de evidencia existentes. No resolverla mediante traducción ni voto por número de páginas.

### 2. Persistir una base y sus versiones de idioma

Introducir `TourBlueprint` como base compartida. Su instantánea final contiene identidad del destino, temática, duración solicitada, paradas con QID y orden, coordenadas, trayectos, tiempos de recorrido, dossier por parada, pasajes originales, procedencia, conflictos y versiones de las reglas usadas. Los textos y fuentes pueden estar en distintos idiomas; la independencia consiste en que la base no depende del idioma solicitado por el visitante.

Persistir esa instantánea en PostgreSQL mediante un contrato JSON versionado y validado, con un límite de tamaño y sin credenciales ni logs privados. Los archivos temporales seguirán sirviendo para diagnóstico, pero no serán la única copia de la evidencia necesaria para reutilizar.

Conservar `Tour` y `Place` como la versión narrada que consume el frontend. Añadir referencia opcional a la revisión de la base y versión de narración/auditoría; cada idioma mantiene su texto, hallazgos, duración estimada y estado de revisión. No crear otra jerarquía paralela de tours ni reestructurar todos los endpoints.

Dos identidades de reutilización:

- **Base:** destino canónico + temática + duración + restricciones que afecten al recorrido + versión de política de ruta/investigación.
- **Narración:** revisión concreta de la base + idioma de salida normalizado + versión de autor/auditoría/duración.

Las instantáneas completadas son inmutables. Actualizar evidencia genera otra revisión; las versiones anteriores siguen accesibles por su enlace, pero dejan de reutilizarse como resultado vigente cuando se invalida su base.

### 3. Reutilizar evidencia, no traducir a ciegas

Codex escribe directamente en el idioma solicitado a partir de la base. No usar la narración española como fuente de hechos ni como paso obligatorio para generar francés. Los ejemplos de estilo no aportan hechos y no deben arrastrar el idioma de salida.

Una base preparada significa que la investigación cumple su contrato, no que cualquier narración futura esté aprobada. Cada idioma pasa auditoría factual independiente contra las fuentes originales y revisión lingüística. La aprobación o los hallazgos de español no se transfieren a francés.

## Orden de implementación

| Paso | Cambios concretos | Criterio de salida |
|---|---|---|
| 1. Contratos e identidad | Separar idioma de salida y de fuentes; resolver identidad canónica del destino; definir base versionada y normalización de idiomas es/fr. | Madrid y sus alias apuntan al mismo destino; destinos homónimos de países diferentes no colisionan; francés no cambia por sí solo la investigación. |
| 2. Investigación multilingüe | Adaptar descubrimiento, prominencia, resolución de fuentes y dossier a la política de investigación. Mantener idioma real y procedencia por fuente/pasaje. | Fuentes españolas sirven para una salida francesa; un fallback conserva juntos el título, idioma y dominio correctos; una edición ausente no elimina el destino. |
| 3. Persistencia y compatibilidad | Añadir `TourBlueprint`, su repositorio y migración aditiva; vincular las nuevas versiones de `Tour`; importar bases antiguas solo cuando haya artefactos completos y verificables. | La base sobrevive al reinicio y no necesita los temporales del proceso; los tours anteriores conservan sus URLs. |
| 4. Separar preparación y escritura | Extraer del canario las fases reutilizables a módulos con contratos explícitos. Ofrecer preparación de base y escritura/auditoría desde base; la CLI sigue siendo un adaptador. | Un proceso nuevo produce francés desde una base guardada sin ejecutar de nuevo selección de candidatos, ruta ni investigación. |
| 5. Coordinar reutilización y trabajos | Buscar primero una versión válida en el idioma; después una base válida; generar solo lo que falte. Añadir reclamación de base compartida con el mismo patrón de propietario/vencimiento ya usado en trabajos. | Dos solicitudes idénticas comparten trabajo; español y francés simultáneos comparten una preparación y generan dos narraciones. |
| 6. Calidad, duración y presentación | Adaptar autor/auditor, localización de todos los textos añadidos y estimación de duración; habilitar francés en API y formulario cuando lo anterior esté listo. | No hay mensajes narrables en español dentro del tour francés; los hechos siguen respaldados; la interfaz muestra idioma, progreso y estado de revisión correctos. |
| 7. Validar y activar | Ejecutar matriz de casos, pruebas de compatibilidad y recorrido HTTP/navegador. Evaluar una muestra real de los dos idiomas antes de activar francés. | Casos acordados aprobados y diferencias conocidas documentadas. |

Archivos principales afectados: `backend/prisma/schema.prisma`, repositorios de tours/trabajos y nuevo repositorio de bases; `GenerationJobService`, `CodexTourGenerator`, `CodexTourArtifact`; módulos `LiveCityCandidatesV8`, `EditorialProminenceCaptureV6`, autoridades/dossier, duración y material del autor; adaptadores del canario; contratos API, validación, formulario, progreso y página del tour. Dividir la ejecución en cambios pequeños por responsabilidad y preservar los cambios existentes del repositorio.

## Reglas para casos especiales

| Situación | Comportamiento decidido |
|---|---|
| Tour inexistente pedido en francés | Crear base, escribir francés y auditar; entregar borrador con su estado explícito. |
| Existe español con base completa vigente | Compartir la base; generar únicamente la versión francesa y su auditoría. |
| Existe español, pero solo se conserva el texto | No inventar el dossier ni considerar el texto evidencia. Recuperar artefactos verificables o investigar de nuevo. |
| Existe francés vigente | Devolverlo conservando su estado real: borrador o publicado. |
| Otro país | Resolver destino y fuentes adecuadas a ese lugar; conservar el idioma de narración solicitado. |
| Otra duración o temática | Buscar una base compatible; no usar automáticamente la ruta anterior. La reutilización granular de dossiers entre bases se deja para una mejora posterior. |
| Dos solicitudes simultáneas | Una preparación por base y una generación por versión lingüística, con restricciones de unicidad y escrituras condicionadas en PostgreSQL. |
| Base retirada, caducada o incompatible | Preparar una nueva revisión antes de entregar un resultado como vigente; no borrar los tours históricos. |
| Fuentes insuficientes o contradictorias | Resultado explícito de insuficiencia o revisión según los controles existentes; no inventar hechos ni cambiar silenciosamente de idioma. |
| Idioma todavía no soportado | Rechazar antes de iniciar generación externa y mostrar alternativas disponibles. |

## Vigencia, errores y gasto

- Guardar fecha de captura, versión de contrato y estado de validez. Incorporar `revalidateAfter` configurable; usar inicialmente 30 días para la base histórica como política conservadora revisable, no como garantía de actualidad. Una retirada conocida invalida de inmediato. Horarios, precios y condiciones de acceso no se consideran vigentes por este plazo: requieren comprobación específica si van a afirmarse.
- Validar la base antes de escribir y antes de reutilizar el resultado. Comprobar que la revisión no se ha invalidado durante la generación.
- Si falla francés después de preparar la base, conservar la base y reintentar solo esa narración. La pérdida de propiedad cancela el proceso; un proceso vencido no puede sobrescribir el resultado.
- Separar el presupuesto de preparación del de narración y registrar consumo por intento/fase. La solicitud debe tener un límite total persistido para las llamadas API y un máximo de intentos: no reiniciar indefinidamente con un presupuesto nuevo. El consumo de Codex por suscripción se registra por separado cuando esté disponible y no se presenta como gasto API medido.
- El progreso refleja trabajo real: preparación de base, base reutilizada, escritura y auditoría. No mantener al usuario esperando indefinidamente por una base fallida o retirada.

## Idioma y duración

La versión francesa incluye narraciones, introducción, nombres de presentación cuando proceda e instrucciones de traslado. Las identidades canónicas permanecen estables; conservar los nombres locales útiles para orientarse. Auditar matices, fechas, nombres propios y afirmaciones temporales contra los fragmentos originales, además de detectar idioma incorrecto y mezcla accidental.

Mantener el presupuesto de tiempo por parada y ajustar la extensión narrada al idioma. Sacar la velocidad de habla a una configuración versionada por idioma; 120 palabras/minuto solo puede conservarse como estimación provisional, claramente identificada, hasta calibrarla. Medir el audio real cuando exista; este plan no añade generación de audio. La adaptación de longitud no puede introducir hechos para rellenar tiempo ni modificar silenciosamente la ruta.

## Validación y entrega

Pruebas offline con proveedores simulados: las filas de casos anteriores, fuentes mezcladas, ausencia y fallo temporal de Wikivoyage, conflictos, fechas inciertas, francés incorrecto, duraciones fuera de rango, revisión invalidada durante escritura y tours antiguos sin base. Comprobar llamadas efectuadas: reutilizar francés no llama al autor; crear francés desde una base no llama a investigación/routing.

Probar concurrencia y vencimiento con PostgreSQL real además de dobles de prueba. Comprobar contratos HTTP y recorrido de navegador para seleccionar francés, seguir trabajo, recuperarse de un fallo y abrir el resultado. Estas pruebas locales pueden hacerse sin generar contenido de pago.

Muestra real antes de activar: una base de Madrid con narración española y francesa, repetición francesa para comprobar reutilización y un destino de otro país con fuentes de otro idioma. Revisar naturalidad del francés, fidelidad y duración. Esta validación necesita ejecutar proveedores y registrar gasto; no se ha realizado al crear este plan.

Finalización: migración compatible, pruebas enfocadas y compilación correctas, evidencia de reutilización sin llamadas duplicadas, revisión del diff y muestra real evaluada. Activar francés únicamente después de satisfacer esos criterios. No eliminar la restricción actual como primer cambio.

## Ejecución y evidencia

- Migración `20260906153000_multilingual_tour_blueprints` aplicada en PostgreSQL local. Las pruebas de concurrencia usan un esquema temporal aislado y lo eliminan al terminar.
- El formulario consulta `/tours/generation-capabilities`; francés depende de `TOUR_FRENCH_ENABLED=true`. El idioma de narración se normaliza y los identificadores internos enviados por el cliente se descartan.
- `MultilingualTourGenerator` coordina preparación y narración. `TourBlueprint` conserva evidencia completa, ruta, geometría y revisión. Reutilizar una base no ejecuta investigación; reutilizar una narración vigente no ejecuta al autor.
- La instantánea se almacena como cadena JSON dentro de JSONB para preservar el orden requerido por las huellas existentes. PostgreSQL reordena las claves de objetos JSONB: almacenar un objeto directamente invalidaba las huellas al recuperarlo. La prueba real detectó y cubre este caso.
- La resolución verifica clasificación de ciudad/municipio además de nombre y país. Usa idiomas de la ciudad y administraciones actuales, excluye relaciones históricas y declaraciones lingüísticas limitadas a otra región, y conserva títulos y ediciones reales de Wikimedia. Wikivoyage sin enlace disponible queda como ausencia, no como señal negativa.
- La escritura francesa recibe los pasajes originales y su idioma. La auditoría exige revisión lingüística separada de los hallazgos factuales. Se conservan ambos resultados en el borrador. La duración oral se muestra explícitamente como provisional, sin audio medido.
- Los trabajos y bases reservan gasto y conservan consumo entre intentos, con un máximo de dos intentos. Un fallo previo a inferencia tiene coste cero; exposición desconocida conserva la reserva. La narración no puede alterar la ruta preparada.
- Pruebas aprobadas: contratos y fuentes; trabajo y reutilización; cinco escenarios con PostgreSQL real; contratos HTTP con activación deshabilitada/habilitada; navegador con selección francesa, recuperación de consulta temporal, apertura del borrador y cese de consultas ante fallo definitivo; compatibilidad de orquestación/controladores. Backend y frontend pasan sus comprobaciones de TypeScript.

Configuración inicial: `TOUR_GENERATION_SPEND_LIMIT_USD=2` por solicitud, preparación limitada al 75 % del saldo inicial, `TOUR_BLUEPRINT_TTL_DAYS=30`. Codex usa la sesión ChatGPT disponible en el entorno del worker; su consumo de suscripción no se presenta como coste API. El despliegue necesita Node 22, Codex autenticado, documentos del autor (`NARRATIVE_AUTHOR_ASSET_ROOT`), PostgreSQL y los proveedores de investigación/auditoría configurados.

Los primeros intentos de Madrid detectaron selección de entidades no urbanas y lenguas de relaciones territoriales históricas; terminaron sin gasto API antes de la muestra corregida. La política vigente es `destination-evidence-3`. Las búsquedas V8 también eliminan el vocabulario español fijo cuando investigan en otro idioma: términos localizados para es/fr/it/en/de/pt/ja, inglés como respaldo y nombres locales conservados.

## Resultado de las muestras reales

Estas muestras utilizaron Codex como autor y el auditor OpenRouter anterior al cambio concurrente de auditor descrito abajo.

| Solicitud | Resultado | Gasto API USD |
|---|---|---:|
| Madrid, francés, 120 min | Borrador de siete paradas, investigación y auditorías completas | 0,86663920 |
| Madrid, español, 120 min | Borrador de siete paradas desde la misma base; sin repetir investigación | 0,66289500 |
| Repetición Madrid `fr-FR`, 120 min | Mismo trabajo y tour francés; cero tours o intentos adicionales | 0 adicional |
| Roma, francés, 60 min | Rechazo de ruta por duración inviable | 0,03474900 |
| Roma, francés, 120 min | Ruta preparada; investigación interrumpida al no obtener fuentes verificables para Piazza Navona | 0,06332925 |
| **Total** | Consumo de suscripción Codex no incluido como gasto API | **1,62761245** |

Base Madrid: `d7adfb0e-91ea-44c4-9529-2d876caa382a`. Tour francés: `f2f8fc6c-b487-46b1-880b-fbb73445f2c3`. Tour español: `d9d76a07-0d05-43f5-84b5-dbc4c83c3df9`. Ambos permanecen en `review`; ninguno fue publicado. Estimación: 33 minutos de narración y 119 minutos de recorrido guiado; las dos narraciones cumplieron la tolerancia de extensión. Todos los controles de idioma y naturalidad devolvieron verdadero.

La auditoría francesa conservó cuatro observaciones factuales: dos de cronología y dos falsos positivos sobre traducciones fieles de títulos españoles. La española conservó dos observaciones. El auditor francés también incluyó comentarios positivos en sus observaciones lingüísticas; se precisó el contrato para solicitar únicamente problemas accionables. Estos hallazgos se conservan para revisión, no se borran ni se convierten en aprobación.

La comprobación HTTP real detectó que `GET /tours/:id` rechazaba el borrador terminado con 404. Se corrigió para entregar `review` con resumen de auditoría conservando su estado; los borradores ordinarios y archivados permanecen fuera de esa excepción. El endpoint real ya devuelve el tour francés con sus siete paradas y cuatro observaciones. El catálogo publicado y la navegación de tours publicados mantienen sus restricciones.

Roma sí resolvió identidad `Q220`, fuentes `it/en` y títulos italianos `Roma`. En 120 minutos la investigación del Pantheon obtuvo fuentes italianas y oficiales suficientes; Piazza Navona quedó sin una segunda fuente admitida, con fallos de adquisición y resultados de búsqueda irrelevantes. No se sustituyó esa falta por contenido inventado. Se corrigieron los términos españoles fijos detectados en las consultas y se verificó el cambio offline; no se completó una narración internacional real.

## Cambio concurrente de auditor y límite de entrega

Otra tarea del usuario sustituyó el auditor final por Astra low vía Codex mientras terminaban estas muestras. Se coordinó la propiedad de los archivos compartidos. La nueva entrada de narración desde base ya no exige OpenRouter para auditar; la preparación conserva sus proveedores. La compilación conjunta y las pruebas del contrato multilingüe pasan, pero las muestras anteriores **no validan en vivo ese nuevo auditor**.

`MULTILINGUAL_TOUR_PIPELINE` pasa a `codex-blueprint-app-2-astra-audit-…`: los borradores anteriores conservan sus enlaces, pero no se reutilizan como narraciones de la nueva política de auditoría. La base sigue siendo reutilizable. El cambio evita atribuir una auditoría Astra a resultados auditados antes con OpenRouter.

`TOUR_FRENCH_ENABLED` queda desactivado. Para completar la activación falta comprobar traducciones y naturalidad con el nuevo auditor y terminar una muestra internacional con fuentes suficientes. No se modificaron los controles de evidencia para forzar la aceptación de Roma. No se hizo commit, push ni despliegue; se preservaron los cambios concurrentes del repositorio.
