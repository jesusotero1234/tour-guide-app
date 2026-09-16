# Plan: tours temáticos con fuentes y usos documentados

Fecha: 16 de septiembre de 2026.
Estado: propuesta de producto y arquitectura; ensayo de leyendas ejecutado y nuevo experimento de historia narrativa en curso.

## Objetivo

Descubrir experiencias propias de cada ciudad y producirlas a partir de historias localizables, con respaldo editorial y una base de uso documentada.

Dirección elegida por el usuario el 16/09/2026: **historia real contada con ritmo narrativo**, organizada por una época o transformación de la ciudad. El primer concepto de esta dirección es **Madrid de los Austrias: cómo se construye una capital**. El ensayo anterior de misterio y leyendas se conserva como antecedente metodológico sobre fuentes; sus resultados no validan este concepto.

El experimento actual se define y documenta en [Madrid de los Austrias](experimento-madrid-austrias-20260916.md). Mantiene la revisión de fuentes y usos, y añade cinco episodios históricos, conexión entre paradas y una comprobación de recorrido cuando el servicio existente responda. No requiere crear otro motor ni cambiar de modelo para validar la propuesta editorial.

La primera decisión es si existe material suficiente y utilizable. La implementación de nuevos temas, la generación completa y la publicación vendrán después de esa comprobación. Este plan no cambia el comportamiento de la aplicación.

## Punto de partida comprobado

- `backend/src/services/poi/SourceUsePolicy.ts` clasifica usos como `permitted`, `restricted` o `pending`, principalmente por dominio. Reconoce determinados recursos Wikipedia/Wikidata y restringe dos dominios institucionales. En piloto desactiva la captura web genérica.
- `backend/src/services/SourceCredits.ts` guarda créditos y vuelve a comprobar fuentes del blueprint al admitirlas al piloto.
- `TourBlueprint.ts` conserva investigación, manifiesto de evidencia, arco y geometría, pero valida `theme === 'history'`.
- El generador tiene restricciones de historia; descubrir nuevos temas requiere cambiar selección e investigación, además de admitir otra etiqueta.
- La preparación con DeepSeek y la redacción/auditoría con Astra ya están descritas en [la integración existente](../operations/narrative-deepseek-astra-generation-20260910.md).

El registro actual es una base útil, pero el permiso de un dominio no demuestra el de todas sus piezas, imágenes o materiales de terceros.

## Decisiones de producto

1. Cada concepto tiene identidad, intención narrativa y revisión propias: una ciudad puede tener varios tours de misterio.
2. El tema guía la búsqueda de historias y emplazamientos antes de ordenar las paradas.
3. Cada afirmación se identifica como hecho, leyenda atribuida, interpretación o cuestión disputada. La existencia de un relato no demuestra que sus sucesos ocurrieran.
4. Una candidatura necesita material suficiente, usos resueltos y un recorrido viable. Una puntuación editorial alta no compensa derechos pendientes.
5. Generar y revisar una investigación reutilizable por concepto; reutilizarla en idiomas y formatos cuando las condiciones lo permitan.

## Registro mínimo de fuentes

Por pieza concreta, conservar:

- URL canónica, título, autor/editor y tipo de material; fecha de consulta y versión identificable cuando exista.
- Afirmaciones que respalda y límites de ese respaldo; relación con otras fuentes para reconocer copias o dependencia.
- Base de uso: licencia, dominio público comprobado, permiso o supuesto legal revisado; enlace a sus condiciones y ámbito de aplicación.
- Decisión separada para captura/conservación, procesamiento externo con IA, adaptación, publicación del texto y audio. Las imágenes y grabaciones se revisan como piezas distintas.
- Obligaciones: atribución, indicación de cambios, licencia de la adaptación, límites de conservación u otras condiciones efectivas.
- Estado por uso, motivo, responsable de revisión y fecha de revisión. Ausencia de licencia no equivale por sí sola a ilegalidad: queda pendiente el uso cuya base no se haya resuelto.

El modelo puede proponer metadatos y detectar cuestiones. La admisión se apoya en documentos y reglas revisadas, y los casos ambiguos necesitan revisión humana o jurídica según la cuestión.

## Flujo propuesto

1. **Descubrimiento:** reunir referencias y proponer conceptos locales. Identificar una referencia en un buscador no autoriza almacenar su contenido o adaptarlo.
2. **Revisión de usos:** resolver los usos necesarios antes de capturas extensas, incorporación al corpus o envío de textos de terceros al proveedor de IA. Consultar avisos/licencias y registrar dudas sin reproducir páginas completas en documentación.
3. **Investigación:** extraer hechos y relatos atribuidos de material admitido; conservar procedencia de cada afirmación. Priorizar fuentes cercanas al objeto y comprobar independencia.
4. **Selección:** valorar interés, material disponible, variedad, relación con un lugar observable y proximidad. Buscar alternativas para historias insuficientes.
5. **Redacción y auditoría:** producir guion propio o adaptación licenciada, según el material utilizado. Comprobar respaldo, atribuciones y semejanzas materiales; una paráfrasis o un porcentaje de similitud no certifican ausencia de infracción.
6. **Recorrido:** verificar coordenadas, acceso, distancias y duración con los servicios existentes y revisión del paseo. Una dirección no valida una ruta peatonal.
7. **Publicación:** vincular guion, traducciones, audio y créditos a la revisión aprobada. Identificar qué piezas sustituir si cambia una fuente o se descubre un problema.

## Fases y criterios de avance

| Fase | Entregable | Condición para avanzar |
| --- | --- | --- |
| A. Ensayo documental | Tres leyendas; matriz de fuentes, usos y afirmaciones | Al menos dos historias con núcleo defendible y una vía concreta de uso resuelta o condicionada a obligaciones explícitas |
| B. Piloto de contenido | Fichas admitidas, propuesta de paradas y muestras breves | Revisión factual y de derechos de cada pieza; ningún relato presentado con más certeza que sus fuentes |
| C. Integración mínima | Concepto/tema en selección, investigación, identidad del blueprint y admisión de fuentes | No mezclar conceptos en caché; conservar bloqueos existentes; fallar de forma explicable ante usos pendientes |
| D. Tour de prueba | Recorrido comprobado, guion completo, audio y créditos | Validación de duración y paseo; revisión editorial y de usos; publicación autorizada en su momento |

El ensayo A no certifica B–D. Tres casos tampoco prueban que un catálogo entero pueda automatizarse.

## Estrategia de validación

- Investigación documental: revisión de enlaces, correspondencia afirmación/fuente y claridad de límites. No requiere tests de aplicación.
- Integración futura: pruebas significativas de admisión por uso, identidad de conceptos, conservación de atribuciones y exclusión de capturas no admitidas.
- Medir separadamente cobertura editorial, cobertura de permisos, tiempo, intervenciones de revisión y costes reales de servicios cuando se ejecuten. No inventar porcentajes de riesgo ni extrapolar coste de una ficha al tour completo.

## Primera ejecución

El alcance y las reglas previas están en [el protocolo del experimento](experimento-madrid-leyendas-protocolo-20260916.md). Los hallazgos están en [su informe de resultados](experimento-madrid-leyendas-resultados-20260916.md).

Resultado de la fase A: tres relatos identificados, tres muestras breves con vía CC BY-SA y dos casos recomendados para desarrollar primero. Se detectaron contradicciones y condiciones NC/ND en fuentes institucionales. No se validaron todavía originales antiguos como base directa, integración, recorrido ni publicación.

## Referencias de la decisión

- [Revisión previa del proyecto](../legal/prototype-safety-and-attribution-review-20260908.md).
- [Plan previo de fuentes y créditos](../legal/prototype-compliance-implementation-plan-20260908.md).
- [OMPI: derecho de autor](https://www.wipo.int/es/web/copyright/faq-copyright).
- [LPI española](https://www.boe.es/buscar/act.php?id=BOE-A-1996-8930).
- [Minería de textos y datos, artículo 67](https://www.boe.es/eli/es/rdl/2021/11/02/24/con#art67).

Las referencias jurídicas orientan el diseño; este documento no constituye un dictamen sobre todos los usos futuros.
