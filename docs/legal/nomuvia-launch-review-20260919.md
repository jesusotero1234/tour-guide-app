# Nomuvia: revisión para abrir una prueba gratuita

Fecha: 19 de septiembre de 2026. Revisión técnica y documental, no dictamen jurídico
ni autorización de apertura. El responsable confirma que no cobrará por ahora y
que quiere probar la aplicación. Declara que creó el logo con ChatGPT y que aceptó
las condiciones de Hetzner. Posteriormente, el 19 de septiembre de 2026, confirma
que añadió las categorías al formulario específico del DPA y aceptó el acuerdo.
Formalización confirmada por el responsable; no se ha inspeccionado la copia final.
El responsable confirma gestión como particular residente en España, sin empresa
ni actividad de autónomo asociada. El catálogo permanece cerrado y no se modifican las
bases, audios ni procesos de generación de otros trabajos.

## Conclusión operativa

No hay una prohibición general de abrir una audioguía gratuita. Tampoco «beta»,
la gratuidad o una contraseña son exenciones generales. Para Nomuvia faltan
cerrar la información de privacidad, verificar contratos y evaluar el uso efectivo
de determinadas fuentes. No se recomienda retirar los controles para hacer pasar
el catálogo existente. Los resultados automáticos no equivalen a decisiones jurídicas.

## Evidencia actual del catálogo

Consulta de solo lectura, transacción RepeatableRead, limitada a los 57 registros
ya inventariados para no incorporar trabajos nuevos:

- 13 blueprints: 11 ciudades en cinco idiomas y dos versiones antiguas adicionales.
- 133 entradas de fuentes seleccionadas (118 URLs distintas) y 19 entradas de
  capturas no seleccionadas, sobre 36 dominios. Las repeticiones por parada cuentan.
- 98 entradas seleccionadas de Wikipedia: todas conservan referencia de revisión.
- 448 referencias de imágenes con los campos de autor, atribución, licencia,
  enlace de licencia, fuente, cambios y texto alternativo completos. No son
  necesariamente 448 imágenes únicas ni una validación de titularidad/licencia.
- 55 tours conservan geometría peatonal. Ninguno tiene aprobación del piloto
  registrada. No se ha realizado una escucha humana o paseo de los 57 registros.

Evidencia privada: `legal-catalog-evidence.json` en el directorio privado local de
Nomuvia. Matriz de dominios: `nomuvia-source-review-20260919.csv` en esta carpeta.

### Derechos: separar hechos, expresión y capturas

`assertBlueprintSources` exige permiso documentado para **todas** las capturas,
incluso las no seleccionadas. `sourceUse` permite automáticamente solo determinadas
URLs de Wikipedia y Wikidata. Por tanto, SOURCE_USE_PENDING no demuestra que el
texto final infrinja derechos, ni que haya que pedir permiso para mencionar un
hecho histórico. Sí exige revisar captura, posible adaptación, imágenes y
condiciones concretas antes de declarar el material reutilizable.

No se borran capturas ni se cambian firmas para sortear ese control. Una futura
mejora debe distinguir evidencia seleccionada, captura descartada y permiso para
cada uso; requerirá evidencia documentada y pruebas, no una lista blanca genérica.

Casos revisados con fuentes primarias:

- **Wikipedia:** su reutilización requiere atender atribución, licencia y cambios
  cuando se adapta expresión protegida. Conservar revisión y autores/historial.
  No extender automáticamente la licencia del texto a imágenes de terceros.
  [Condiciones Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use).
- **BOE:** las condiciones generales permiten usos comerciales y no comerciales,
  incluida adaptación, con atribución, fecha cuando exista y distinción de cambios;
  excluyen determinados materiales. La URL histórica del catálogo es una disposición
  publicada en el diario oficial; revisar su contenido y posibles anexos de terceros.
  No aplicar una licencia genérica a todo boe.es. Candidato a documentar por URL,
  no cambiado a permitido en el código. [Reutilización BOE](https://www.boe.es/informacion/aviso_legal/index.php).
- **Patrimonio Nacional:** el aviso condiciona reproducción a citar origen o solicitar
  autorización; no identifica una licencia abierta general. Revisar alcance del uso
  de la página del Palacio Real. No se concluye prohibición total de consultar hechos.
  [Aviso](https://www.patrimonionacional.es/aviso-legal).
- **Catedral de Sevilla:** el apartado 6 reserva derechos y exige consentimiento
  escrito para scraping/entrenamiento. Fuente seleccionada de la versión antigua
  Seville y otras capturas. No volver a capturar ni publicar adaptaciones sin resolver
  ese uso. Las condiciones actuales no prueban por sí solas las de la fecha histórica.
  [Aviso](https://www.catedraldesevilla.es/aviso-legal/).
- **Real Alcázar:** reserva reproducción, transformación y comunicación pública a
  autorización expresa. Aparece seleccionado en la versión antigua Seville.
  [Aviso](https://alcazarsevilla.org/avisolegal-protecciondatos/).
- **UPV/EGA:** la página del artículo y las condiciones no pudieron consultarse con
  éxito en esta revisión. No se presume una licencia por pertenecer a una universidad.
- **Prensa, museos y otros portales:** aparecen fuentes seleccionadas pendientes;
  la matriz no inventa permisos. Toolforge y Wayback tampoco otorgan por sí mismos
  derechos sobre la información de terceros que muestran.

Siguiente revisión de contenido: agrupar por los 13 blueprints, comprobar uso real
y licencia de cada fuente seleccionada, aislar incidencias de capturas descartadas,
y contrastar las imágenes con sus fichas. Sustituir material solo donde haga falta;
no regenerar por defecto cinco idiomas por un indicador automático.

## Privacidad y contratos

| Tratamiento | Configuración comprobada | Acción pendiente |
| --- | --- | --- |
| Entrega y protección del sitio | Hetzner nbg1-dc3; TLS; app sin privilegios; base solo lectura; acceso privado; DPA aceptado según confirmación del responsable | Conservar copia del DPA y completar información al usuario |
| Idioma y progreso | Cookie de idioma un año; progreso y avisos en localStorage hasta borrado | Mantener información clara y borrado selectivo |
| Preferencia estadística | 180 días; rechazo no bloquea tours | Distinguir aviso informativo de consentimiento para futuros usos |
| Analítica | Umami no instalado/configurado en producción | No anunciar recogida efectiva de estadísticas; revisar antes de activarlo |
| Fotos y mapas | Solicitudes del navegador a Wikimedia y OSM | Informar destinatarios/datos; revisar condiciones y transferencias |
| GPS | Uso en memoria del navegador, sin guardar recorrido en la app | Mantener acción explícita, revocación y no prometer que mostrar mapas no transmite información geográfica indirecta |
| Contacto | Correo secundario Gmail facilitado por el responsable | Verificar condiciones de la cuenta, roles y transferencias; no asumir contrato Workspace para Gmail personal |
| Registros | App: rotación diaria, siete copias, maxage siete días; PostgreSQL sin log de consultas ni conexiones ordinarias | Fijar conservación de registros de sistema y excepciones por incidencias |

Caddy no activa access logs, pero esto no significa ausencia de datos de conexión:
existen registros de errores y de administración. `journald` no tiene un límite
temporal explícito y reenvía a syslog; no se puede anunciar «todo se borra en siete
días». La propuesta de 90 días para correos resueltos es aún una propuesta, no una
regla aceptada ni automatizada. Tampoco se ha contratado backup externo.

El aviso debe cubrir identidad suficiente, finalidades, bases, destinatarios,
transferencias, conservación y derechos. Una app sin cuentas puede tratar datos
personales técnicos. No se presupone excepción doméstica al abrirla al público.
[RGPD, artículos 5, 6, 13, 28 y 32](https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32016R0679).

Hetzner permite comprobar y formalizar el DPA en
[la cuenta del cliente](https://accounts.hetzner.com/account/dpa). Categorías que
encajan con lo observado: visitantes/probadores y administradores; IP y metadatos
técnicos de conexión, identificador de invitación y datos operativos de seguridad.
Añadir otras categorías solo si realmente se almacenan en Hetzner. El correo en
Gmail no debe presentarse como almacenado en el servidor por defecto.
[Guía oficial](https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/).

Cloudflare actúa actualmente como registrador y DNS, no como proxy del tráfico
HTTP. No copiar la descripción de un despliegue con CDN ni la política del resolver
1.1.1.1 como si fuera la del DNS autoritativo contratado. Sus roles varían según
el tratamiento. [Privacidad Cloudflare](https://www.cloudflare.com/privacypolicy/).
Google mantiene mecanismos de transferencia, pero hay que comprobar su aplicación
a la cuenta/servicio real, no declarar firmado un contrato inexistente.
[Transferencias Google](https://policies.google.com/privacy/frameworks).

### Bases jurídicas y cookies

Propuesta a documentar, no consentimiento general por pulsar Entendido: interés
legítimo para medidas proporcionadas de seguridad, con ponderación; determinar la
base para entrega de la prueba y atención de solicitudes según la relación real.
Analítica futura: consentimiento previo y revocable conforme a la implementación
prevista. No forzar consentimiento para operaciones necesarias.

La cookie del idioma elegido y ciertas funciones solicitadas pueden estar exentas
del consentimiento del art. 22.2; evaluar finalidad por finalidad, también en
localStorage. El banner es informativo cuando no hay analítica, y no acredita
cumplimiento general. [Guía AEPD](https://www.aepd.es/guias/guia-cookies.pdf).

## Identidad, aviso legal y condiciones de la prueba

La ausencia actual de cobros está confirmada. No prueba por sí sola que no exista
actividad económica indirecta o promoción de un negocio. La aplicación del art. 10
LSSI depende del contexto. No se exige automáticamente constituir sociedad para
probar una web ni se recopila/publica DNI o domicilio personal sin determinar la
obligación y finalidad. Si aplica LSSI, completar los datos que exige; si no,
seguir identificando suficientemente al responsable cuando aplique RGPD.
[LSSI, art. 10 y anexo](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758).

El borrador privado conserva «Jesús Otero» por indicación del responsable; no se
certifica su suficiencia jurídica. Se confirma gestión como particular en España.
El aviso final debe quedar disponible y coherente en los cinco idiomas. El código
local admite ahora `translations` con los seis campos operativos por idioma;
la identidad y el correo siguen siendo comunes. Si falta una traducción completa,
muestra el original español con aviso explícito y atributo de idioma correcto.
Queda completar los textos definitivos y desplegarlos; no equivale a haber
traducido o publicado un aviso todavía incompleto.

Condiciones razonables para la prueba: gratuita, cambios/retiradas posibles,
audioguía informativa, contenidos con IA sujetos a revisión, instrucciones de
seguridad y canal de incidencias. Evitar renuncias generales a responsabilidad y
no prometer itinerarios accesibles/seguros en tiempo real. No se ofrece guía
presencial habilitado ni se anuncian autorizaciones turísticas inexistentes.
Reevaluar si se añaden acompañamiento, entradas, venta o recomendaciones pagadas.

## Voz, IA y marca

**VoxCPM2:** la ficha oficial declara Apache-2.0 y uso comercial. Esto aclara licencia
del modelo, no derechos de todos los textos o voces. Se conserva la declaración
«solo VOXCPM2» y evidencia técnica de referencia sintética, sin afirmar una
trazabilidad histórica que no existe. No es necesario regenerar automáticamente
por faltar la fecha original. [Ficha del modelo](https://huggingface.co/openbmb/VoxCPM2).

**Transparencia:** el código incorpora aviso audible de IA en cinco idiomas,
etiquetas visibles y procedencia. No se han escuchado todos los MP3 para asegurar
que cada versión contiene el aviso. Los hashes/metadatos no equivalen por sí solos
a marcado robusto e interoperable. La app pública prevista reproduce material
preparado; no ofrece interacción con un generador. Hay que evaluar separadamente
el rol en la generación, la posible actividad profesional, el texto de interés
público y si hay representación engañosa de personas reales; voz sintética no
significa automáticamente deepfake.
[FAQ vigente de la Comisión](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act).
La ficha del Service Desk advierte de modificaciones no incorporadas: no se usa
su texto sin actualizar para certificar fechas o una exención. Este punto requiere
contrastar el texto vigente y el rol concreto antes de afirmar conformidad.

**Logo:** el responsable declara generación con ChatGPT. Sus condiciones atribuyen
al usuario los derechos que OpenAI pueda ceder sobre la salida, con límites legales,
y advierten de salidas similares. Esto no garantiza exclusividad, registrabilidad
ni ausencia de conflicto con otra marca. Conservar la imagen y declaración de
origen; no se ha verificado disponibilidad registral en OEPM/EUIPO.
[Condiciones europeas OpenAI](https://openai.com/policies/eu-terms-of-use/).

## Mapas e imágenes: actualización del informe de mayo

OSM no impone una prohibición general de uso comercial de sus teselas estándar.
Exige atribución visible, URL correcta, Referer, caché normal y no descarga masiva;
no ofrece SLA y puede retirar acceso. Leaflet usa la URL HTTPS correcta y muestra
atribución; Referrer-Policy permite enviar el origen. No se ha visto predescarga
masiva en el componente. No se ha hecho prueba real de carga del catálogo público.
[Política OSM](https://operations.osmfoundation.org/policies/tiles/).

El informe antiguo sobre falta de atribución de imágenes ya no describe el estado
actual: hay representación de créditos por imagen y campos completos en las 448
referencias. Queda contrastar las fichas originales, licencias particulares y
posibles derechos adicionales. No se declara la colección licenciada solo porque
los metadatos estén presentes.

## Actualización: conservación y proveedores

La carencia de límite temporal de journald descrita en la revisión inicial se ha
corregido: conservación de treinta días y rotación diaria. También se han unificado
a treinta copias diarias los registros de rsyslog, UFW, PostgreSQL, btmp y wtmp.
Los de la aplicación conservan siete. Los plazos dependen del ciclo de rotación;
no son una garantía universal sobre todos los archivos administrativos ni sobre
proveedores externos. Véase `../security/log-retention-20260919.md` para alcance,
pruebas y reversión. El borrador privado refleja esta configuración.

OSMF declara una red mundial de servidores de caché para las teselas. No se debe
afirmar que las peticiones de mapas permanecen en Alemania por alojar allí Nomuvia.
[Política OSMF](https://osmfoundation.org/wiki/Privacy_Policy).
Cloudflare distingue su actuación como responsable y como encargado según los
datos, y declara mecanismos DPF/SCC para determinadas transferencias. Esto no
prueba por sí solo qué contrato concreto tiene la cuenta ni convierte el DNS
actual en un proxy HTTP. [Política Cloudflare](https://www.cloudflare.com/privacypolicy/).
La revisión de garantías aplicables a cada servicio y del correo personal continúa
pendiente; no se han inventado acuerdos ni aceptado contratos por el responsable.

## Orden para cerrar la revisión

1. DPA específico: aceptación confirmada por el responsable; conservar copia.
   Gestión como particular en España confirmada por el responsable.
2. Fijar conservación/bases reales y completar aviso, condiciones y traducciones.
3. Resolver la matriz de fuentes por blueprint y verificar fichas de imágenes.
4. Documentar rol de IA y procedencia; completar revisión humana del material y rutas.
5. Verificar publicación técnica con datos aprobados. Solo entonces decidir apertura.

No se han marcado revisiones humanas como hechas, cambiado acceptedForPilot,
contactado titulares de derechos ni abierto el catálogo durante esta revisión.
