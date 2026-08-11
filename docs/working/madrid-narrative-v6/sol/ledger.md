# Ledger factual: guion de Puerta del Sol

Fecha de auditoría: 2026-08-11

Estado: **aprobado por el gate humano; todas las afirmaciones verificables enlazadas; cero warnings abiertos**

Este ledger audita [`script.md`](script.md) contra [`dossier.md`](dossier.md). Se presta atención especial
a la certeza de la etimología, el alcance de la expropiación y la diferencia entre centralidad convencional
y centro geográfico.

## Claim ↔ fuente

| Claim | Afirmación usada en el guion | Proposición | Fuente | Certeza | Estado |
|---|---|---|---|---|---|
| C01 | Hoy no existe una puerta visible en Puerta del Sol. | P01 | S01 | observación actual | verificado |
| C02 | El inventario municipal explica el nombre mediante un postigo medieval decorado con un sol; la muralla desapareció en el XVII y el nombre quedó. | P01 | S01 | media-alta; atribución explícita | verificado con cautela |
| C03 | Mayor, Arenal, Alcalá y Carrera de San Jerónimo convergen aquí; entre los siglos XVII y XIX formaban un espacio alargado y angosto. | P02 | S01 | alta | verificado |
| C04 | El antiguo límite ganó centralidad conforme Madrid creció hacia el este. | P02 | S01 | alta | verificado |
| C05 | En 1855, las obras fueron declaradas de utilidad pública y el Gobierno obtuvo la facultad de decidir enajenaciones forzosas. | P03 | S02 | alta | verificado |
| C06 | En 1857 se eligió el proyecto de Del Valle, Rivera y Morer; las obras se desarrollaron entre 1859 y 1862. | P04 | S01 | alta | verificado |
| C07 | Los edificios anteriores del lado de Correos son distintos y el arco semicircular opuesto fue proyectado unitariamente. | P05 | S01 | alta | verificado |
| C08 | La Casa de Correos terminó en 1768 según el diseño de Jaime Marquet. | P06 | S03, S04 | alta | verificado |
| C09 | La reforma conservó su alineación y trazó el semicírculo opuesto. | P05, P06 | S01, S03 | alta | verificado |
| C10 | El reloj no pertenecía al edificio de 1768; el de la iglesia del Buen Suceso se trasladó tras la demolición de 1854 y funcionaba mal. | P06, P07 | S03–S07 | alta | verificado |
| C11 | José Rodríguez Losada ofreció un reloj nuevo, inaugurado en 1866. | P07 | S03–S05 | alta | verificado |
| C12 | Cada 31 de diciembre marca doce campanadas ante una multitud que toma doce uvas y millones lo siguen por televisión. | P08 | S03, S06 | alta, sensible al tiempo | verificado a 2026-08-11 |
| C13 | El instrumento funcional terminó convertido en ritual colectivo. | P08 | S03, S06 | inferencia directa | permitido |
| C14 | Sol se definió en 1854 como origen del kilometraje radial y la primera placa oficial se instaló en 1950. | P09 | S03, S06 | alta | verificado |
| C15 | Leer el paso de borde a origen como «un borde fabricado como centro» sintetiza las transformaciones documentadas. | P10 | S01–S07 | inferencia explícita | permitido |
| C16 | Cibeles fue diseñada en 1777, tuvo usos de abrevadero y abastecimiento y en 1895 fue desplazada y orientada hacia Sol. | P11 | S08 | alta | verificado |
| C17 | Contrastar utilidad cotidiana y símbolo anticipa el cambio de función documentado en Cibeles. | P11 | S08 | inferencia explícita | permitido |

## Resolución de nombres y números

| Token | Tipo | Resolución |
|---|---|---|
| Puerta del Sol, Casa de Correos, iglesia del Buen Suceso, Kilómetro Cero | lugar, edificios y marcador | autorizados por P01–P09 |
| Mayor, Arenal, Alcalá, Carrera de San Jerónimo, Cibeles | calles y parada siguiente | autorizadas por P02, P11 |
| Gobierno | institución vinculada al marco de expropiación | autorizada por P03 |
| Lucio del Valle, Juan Rivera, José Morer | autores del proyecto | autorizados por P04 |
| Jaime Marquet, José Rodríguez Losada | arquitecto y relojero | autorizados por P06, P07 |
| siglos XVII y XIX; 1768, 1854, 1855, 1857, 1859–1862, 1866, 1950, 1777, 1895 | fechas | autorizadas por P01–P11 |
| 31 de diciembre, doce campanadas, doce uvas | ritual | autorizado por P08 |

Warnings abiertos: **0**.

## Inferencias y límites editoriales

- La explicación del postigo siempre se atribuye al inventario municipal; no se presenta como una
  etimología demostrada sin discusión.
- «Facultad de decidir qué propiedades» conserva el alcance legal de S02. No afirma cuántas se expropiaron,
  quién vivía en ellas ni cómo reaccionó.
- «Esa asimetría pertenece al proyecto» describe la conservación y el diseño unitario documentados; no
  atribuye una intención estética adicional.
- «No formaba parte del edificio de 1768» se refiere al reloj y a su torre; evita el ambiguo «no es el original».
- «Ritual colectivo» se limita a la multitud y la retransmisión a millones; no afirma sincronizar literalmente a todo el país.
- Kilómetro Cero es origen convencional de carreteras y no centro geográfico.
- «Borde fabricado como centro» reúne varias épocas y decisiones; no supone un plan maestro único.
- El cierre de Cibeles resume el cambio de función y posición; la escena siguiente aportará sus detalles.

## Redacción y reparación localizada

DeepSeek `deepseek-v4-flash`, con temperatura 0,7 y pensamiento desactivado, produjo el primer borrador.
La credencial procedió de `backend/.env` y no se registró.

La reparación conservó el arco puerta→geometría→reloj→Kilómetro Cero y actuó en ventanas locales para:

1. Atribuir con cautela al inventario municipal la explicación del nombre.
2. Sustituir «decisiones duras» y «proceso no inocente» por la potestad legal verificable.
3. Eliminar a los residentes no documentados como sujetos concretos de la expropiación.
4. Reemplazar izquierda/derecha por la comparación estable entre Casa de Correos y semicírculo opuesto.
5. Precisar que el reloj no pertenecía al proyecto de 1768.
6. Cambiar «todo un país» por la multitud y los millones documentados.
7. Comprimir el puente de Cibeles y eliminar «te cuento el resto».
8. Retirar dos ecos retóricos tras la reauditoría sin introducir hechos nuevos.

No se regeneró el guion completo.

## Lectura adversarial doble

### DeepSeek, temperatura 0

- Primer pase válido: auditó las 35 frases exactamente una vez.
- Detectó la generalización sobre residentes, la inflación «todo un país», la ambigüedad del gancho y la
  densidad del puente a Cibeles. Se aceptaron las correcciones de alcance y se aligeró el cierre.
- Reauditoría válida: cubrió las 27 frases reparadas sin objeciones factuales. Se aceptaron dos ajustes de
  redundancia; se rechazó mover el cierre del reloj porque su posición ya completa ese bloque.

### Gemma, temperatura 0, Ollama Windows

- Primer pase válido: auditó las 35 frases. Aportó de forma exclusiva la retirada del falso «secreto» y
  de la muletilla «te cuento el resto»; coincidió indirectamente sobre el juicio «proceso no inocente».
- Reauditoría válida: cubrió las 27 frases y no encontró problemas. Confirmó que la atribución al inventario
  municipal conserva correctamente la cautela etimológica.

Resultado acumulado en las tres nuevas paradas: Gemma ha producido respuestas válidas en todas y ha
aportado mejoras exclusivas en Villa y Sol, pero no en Plaza Mayor. Continúa como auditor en sombra.

## Comprobación final previa al gate

- Respaldo factual: completo.
- Nombres y números: todos resueltos.
- Lectura estimada: 2,8–3 minutos a 130–140 palabras por minuto.
- Dirección de mirada: Casa de Correos, contraste de fachadas, reloj y placa del Kilómetro Cero.
- Reparación: localizada; sin regeneración global.
- Estado editorial: aprobado por el responsable editorial el 11 de agosto de 2026.
