# Plan: recuperar historias desarrolladas con DeepSeek

Fecha: 16 de septiembre de 2026. Estado: **ejecución cerrada: San Pío V quedó en 86,6 s tras una corrección sin cambios; Colegio no ejecutado**.

## Objetivo y decisión

Conseguir paradas de **90–120 segundos**, con una historia comprensible y suficiente desarrollo para escucharlas durante un paseo. Mantener lo que funcionaba en los guiones anteriores y hacer que el episodio interesante aparezca pronto. La duración y el desarrollo pasan a ser condiciones de aceptación, junto con la fidelidad histórica.

La [última prueba](resultado-deepseek-entrada-limpia-20260916.md) produjo San Pío V en veinte segundos y el Colegio en cuarenta y cuatro. Cumplir cuatro reglas de redacción no bastó: el usuario consideró insuficiente la duración para una historia. Esta prueba tendrá sus propios criterios y conservará los resultados anteriores.

**Partiremos de los guiones anteriores completos como borradores de trabajo.** DeepSeek los revisará con una ficha suficiente de evidencia, conservando el contenido útil, adelantando el episodio y desarrollando lo que esté documentado. Codex prepara y revisa; DeepSeek redacta. Buscamos una versión utilizable, sin exigir un narrador excepcional.

## Qué cambia en el encargo

| Elemento | Decisión |
| --- | --- |
| Base de trabajo | Guion anterior entregado, con sus intervenciones humanas identificadas. Es un borrador, no una fuente histórica. |
| Evidencia | Recuperar contexto, acciones, cambios y consecuencias respaldadas. Eliminar el límite artificial de tres hechos. |
| Desarrollo | Explicar qué estaba ocurriendo, qué hicieron las personas o instituciones y qué cambió. No todas las historias necesitan un conflicto dramático. |
| Extensión | Apuntar a unas 260 palabras; 240–290 como referencia de preparación. Comprobar después 90–120 segundos con la voz habitual. |
| Ejemplo | Usar el guion completo del Palacio de la Generalidad de la muestra aceptada: referencia de voz y desarrollo, no fuente ni molde de cada frase. |
| Revisión | Exigir historia desarrollada y duración útil; una lista de usos extensa tampoco basta. |

La [muestra de Valencia aceptada](valencia-deepseek-practico-escucha-20260916.md) y su [guion guardado](../../backend/tmp/valencia-deepseek-practico-20260916/master.json) permiten recuperar una referencia concreta. La Generalidad tiene 220 palabras: sirve por su desarrollo, mientras que la duración solicitada se fija expresamente en el nuevo encargo. No se alarga el ejemplo para aparentar que ya cumple ese objetivo.

Reutilizaremos la [regla de fechas](regla-editorial-fechas-audioguias.md), especialmente conservar contenido y extensión al simplificar la cronología. Las fechas que ayudan se mantienen; una espera no se convierte en una lista de años. El modelo recibe una instrucción breve, sin concatenar todos los protocolos anteriores.

## Los dos casos y su preparación

| Orden | Base existente y desarrollo que buscamos | Qué falta comprobar antes de redactar |
| --- | --- | --- |
| 1. San Pío V | Recuperar la versión de 215 palabras y 84 segundos. Introducir pronto el cambio de funciones; desarrollar un cambio concreto y su relación con la finalidad original y el museo posterior. | Los pasajes guardados enumeran usos, pero no explican todas sus causas. Buscar contexto documentado de una transformación; evitar ocupar la duración con un inventario arquitectónico. |
| 2. Colegio de la Seda | Recuperar la versión de 164 palabras y unos 63 segundos. Desarrollar petición, reconocimiento y funciones concretas de la institución. | La petición y el título están respaldados, pero la ficha tiene poco desarrollo. Buscar detalles documentados del oficio, la regulación o el alcance del reconocimiento. |

Fuentes de partida: [ficha anterior de San Pío V](../../backend/tmp/valencia-ampliada-20260916/sanpio-draft.job.json), [ficha anterior del Colegio](../../backend/tmp/valencia-seda-20260916/colegio-draft.job.json) y las capturas completas ya conservadas.

Primero se revisan esas capturas. Si no alcanzan, se consultan hasta tres fuentes adicionales por pieza, priorizando documentación del museo, del Colegio o de instituciones patrimoniales. Se selecciona un episodio que pueda sostener el desarrollo. Si no aparece material suficiente, se registra esa carencia antes de gastar una llamada de redacción; no se vuelve a entregar una cápsula de veinte segundos como resultado válido.

Cada dato narrable tendrá su fragmento de respaldo, URL y procedencia. Se conservarán versiones, créditos y decisión de uso según el proceso existente. Una fuente institucional ayuda a contrastar hechos, pero su carácter oficial no concede por sí solo permiso para reproducir su prosa. Se mantendrán separados instrucciones, evidencia, identidad del lugar y borrador anterior.

Precauciones concretas:

- **San Pío V:** distinguir proyecto y ejecución; no inventar continuidad entre los usos ni sus motivos; diferenciar instalación del museo y fundación de la institución. No atribuirle la historia de las obras del Prado conservadas en Serranos.
- **Colegio:** el intervalo entre solicitud y concesión no demuestra negociaciones continuadas ni negativas del rey. El título no crea desde cero el colegio o la regulación. Distinguir nombre actual, título histórico y edificio.
- **Ambas piezas:** no inventar personajes individuales, conversaciones, emociones o escenas. Los detalles visuales deben corresponder al lugar y al punto exterior de escucha.

## Encargo breve para DeepSeek

> Revisa el guion anterior para convertirlo en una historia de audioguía desarrollada de unos noventa a ciento veinte segundos, aproximadamente doscientas sesenta palabras. Conserva su contenido útil y usa exclusivamente la evidencia admitida en la ficha para corregirlo o ampliarlo; el borrador y el ejemplo no son fuentes. Sitúa el edificio y presenta el episodio en las dos primeras frases. Desarrolla qué estaba ocurriendo, qué hicieron las personas o instituciones y qué cambió, con los detalles concretos que permita la evidencia. Cada párrafo debe aportar información o una explicación útil. Mantén una voz cercana, de tú, y una cronología fácil de seguir. No inventes causas, escenas, motivos ni consecuencias. Conserva las fechas que orienten. Termina cuando la historia llegue a su resultado; puedes cerrar con su relación con el lugar, sin volver a enumerar todo. Sigue la voz del ejemplo y devuelve únicamente JSON con `id` y `text`.

Codex comprueba antes que la ficha permite cumplir el encargo. Si falta contexto, la solución está en preparar mejor el material o elegir otro episodio documentado. No se pide al redactor compensar esa carencia con imaginación.

## Ejecución prevista

### T1. Preparar material suficiente

- [x] Guardar los dos guiones anteriores, la referencia de voz, las fuentes seleccionadas y la historia elegida por pieza.
- [x] Anotar qué contenido útil se conserva y qué desarrollo nuevo tiene respaldo. Comprobar que existe algo que explicar más allá de enumerar fechas o funciones.
- [x] Fijar ambas entradas, el encargo, criterios y límites antes de la primera llamada, en `backend/tmp/deepseek-historias-desarrolladas-20260916/`.

**Salida:** fichas listas o carencia documental identificada. La ficha del Colegio puede quedar pendiente si no reúne evidencia suficiente; no se improvisará después de ver la salida de San Pío V.

### T2. Escribir y escuchar San Pío V

- [x] Pedir a DeepSeek la revisión del guion anterior. Revisar hechos y desarrollo contra la ficha.
- [x] Si el texto cumple, sintetizar con la misma voz VoxCPM2 y medir su duración real. Conservar texto, respuesta y audio asociados.
- [x] Si falla algún criterio, permitir una única corrección de DeepSeek que reúna los defectos detectados, sin proporcionar frases de sustitución. Revisar y sintetizar de nuevo cuando proceda.

**Salida:** pieza que cumple desarrollo, fidelidad y 90–120 segundos, o fallo documentado. Una reparación por pieza incluye también cualquier ajuste de duración: no abre una ronda adicional. Si San Pío V sigue fallando, se cierra la prueba y no se generan variantes del Colegio.

### T3. Comprobar el Colegio con el mismo método

**No ejecutada por la condición prevista:** San Pío V no llegó a 90 segundos tras agotar sus dos llamadas. La segunda ficha permanece preparada, sin solicitudes de generación.

- [ ] Si San Pío V cumple y la segunda ficha está preparada, ejecutar el Colegio con el mismo encargo y su borrador original.
- [ ] Aplicar la misma revisión y comprobación de audio; una sola corrección si hace falta.

**Salida:** resultado por pieza, distinguiendo primer intento y corrección. No cambiar el encargo de la segunda pieza para acomodarlo a lo aprendido de la primera.

### T4. Entregar una comparación útil

- [x] Reutilizar fotos, créditos y audios para comparar la versión anterior, la cápsula demasiado breve y la nueva historia cuando cumpla.
- [x] Entregar informe con duración real, llamadas, coste registrado, trabajo editorial y textos intactos. Los intentos fallidos se conservan identificados, sin presentarlos como versiones aceptadas.
- [ ] Recoger la valoración real del usuario: si tiene suficiente desarrollo y si alguna parte se hace pesada. Hasta recibirla, indicar «audio entregado; aceptación del usuario pendiente».

La revisión técnica incluye correspondencia entre respuesta, guion mostrado y texto enviado a voz, reproducción, fotos y créditos. No equivale a una valoración auditiva del usuario.

## Cuándo cuenta como suficiente

1. **Tiene historia:** se reconocen situación inicial, acción o cambio y resultado. El episodio aparece en las dos primeras frases; la apertura no anticipa toda su resolución.
2. **Tiene desarrollo:** cada párrafo añade un hecho o explica su significado de forma respaldada. La revisión señala esos aportes; frases ornamentales, paráfrasis repetidas o una lista de usos no acreditan desarrollo.
3. **Tiene duración útil:** el audio está entre 90 y 120 segundos con la voz y configuración habituales. Las palabras solo orientan la preparación; no se añaden silencios ni se cambia la velocidad para alcanzar el rango.
4. **Es fiel y comprensible:** hechos y relaciones respaldados en la ficha, cronología clara y ubicación correcta. Ninguna frase se justifica solo porque ya apareciera en el borrador anterior.
5. **Avanza sin reiterar:** se conserva el contenido útil, las fechas ayudan y el final no vuelve a contar el episodio entero.

Cumplir el rango sin desarrollo no pasa. Cumplir la fidelidad con un resumen demasiado corto tampoco pasa. Un estilo sencillo sí puede pasar. La aceptación del usuario se registra por separado y no se inventa para cerrar el informe.

## Límites y alcance de lo que demostraría

- Hasta **cuatro solicitudes físicas de generación, dos por pieza**, incluidos errores y correcciones; exposición máxima de API de **1 USD**, con el control existente y sin reintentos ocultos. Consultar disponibilidad y tarifas al ejecutar.
- Mantener inicialmente `deepseek-flash`, razonamiento adicional desactivado, temperatura cero y salida `{id,text}`. Registrar el identificador devuelto; no probar otros modelos o modos en esta ejecución.
- Cero retoques humanos en las nuevas respuestas evaluadas. El borrador de partida sí contiene intervenciones humanas de entregas anteriores, y Codex prepara la evidencia y revisa: la autoría se declara como revisión de DeepSeek sobre una base asistida.
- Reutilizar ejecutor, voz y comparación local. No modificar el narrador de producción ni sustituir los tours completos.
- Un resultado satisfactorio demostraría que DeepSeek puede **revisar y desarrollar estas piezas con material suficiente**. Para nuevas paradas sin borrador previo, quedaría por comprobar la redacción desde la ficha con este mismo objetivo de desarrollo.

Ejecución cerrada tras dos llamadas y un audio nuevo de San Pío V. La corrección devolvió el mismo texto. El intento y las versiones anteriores están disponibles en el [informe y comparación](resultado-deepseek-historias-con-desarrollo-20260916.md); la valoración del usuario queda pendiente. No se autoriza retrospectivamente otro criterio de duración ni se amplía el límite de llamadas.
