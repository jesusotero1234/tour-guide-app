# 05 · Reproductor: empezar cerca y orden dinámico: informe

Hecho entre el 1 y el 2 de octubre de 2026 en la rama `plan/20261001-fase0`, sin confirmar en git ni desplegar.

## Resultado

| Entregable | Estado |
|---|---|
| Orden activo (`tourOrder.ts`): guardado por huella, descarte al cambiar la versión, «volver al recomendado» | Hecho |
| Optimizador `bestOpenPath`: exacto hasta 12 paradas, vecino más cercano y 2-opt hasta 40; conserva el orden dado si ya es óptimo | Hecho y probado contra fuerza bruta |
| Motor de audio persistente (`useTourAudioEngine`): un solo `<audio>` para todo el paseo, enlaces encadenados, Media Session registrada una vez | Hecho |
| Enlaces: tras la introducción suena `first`, tras cada cuerpo `next` de la siguiente del orden activo y al final `finish` | Hecho |
| Pantalla bloqueada: `nexttrack` y `previoustrack` (menos de 5 s va a la anterior; después, al inicio) con título, ciudad, álbum y carátula | Hecho en el motor; **falta probarlo en un iPhone y en un Android reales** |
| Ficha: «Empezar aquí» en cada parada y «Usar mi ubicación» con la tarjeta de 400 m | Hecho |
| Reproductor: «Parada N de M» en el orden activo, distancia y tiempo con ubicación, aviso de llegada con vibración y sin reproducción automática, aviso de otra parada cercana | Hecho |
| Mapa: marcadores numerados por el orden activo, líneas de los tramos en orden personalizado (discontinua si falta uno) y menú «Ver esta parada» | Hecho |
| Traslado de la marca «escuchada» entre versiones de audio (§4.4) | Hecho y probado |
| Proxy: `walking-legs` y `cue/[...slug]` con streaming y aborto; lista de rutas permitidas en un archivo con prueba | Hecho |
| Textos en los 5 idiomas, con `de` e `it` de `listeningCopy` completos | Hecho |
| Fixture, pruebas unitarias y de Playwright con capturas a 390×844 y 360×740 | Hecho |
| Prueba en iPhone y Android reales con la pantalla bloqueada | **Pendiente** |

## Pruebas

| Prueba | Resultado |
|---|---|
| `node --test` de optimizador, orden, progreso, tramos, llegada, formato de distancia, textos y rutas del proxy | 20 en verde |
| `test-flexible-tour.cjs` (Playwright, 9 escenarios) | En verde, repetida 6 veces seguidas sin fallos |
| `test-tour-listening.cjs` (los tres modos) | En verde |
| `scripts/check-all.sh` | En verde, ahora con los 4 scripts de prueba del frontend |

Escenarios de `test-flexible-tour.cjs`:

1. La ficha ofrece empezar junto a la parada 3; solo se recuerda la elección de ubicación, nunca una coordenada; el orden guardado es 3, 4, 2, 1.
2. Al terminar el cuerpo suena el enlace de la siguiente parada del orden activo, en el mismo elemento, y no deja progreso propio.
3. Dos lecturas seguidas junto a la siguiente parada muestran el aviso y vibran. No suena nada hasta que pulsas «Escuchar».
4. `nexttrack` y `previoustrack`, con un solo elemento de audio durante todo el paseo.
5. Saltar a una parada que no es la siguiente pregunta primero; «Solo escuchar esta» no reordena.
6. Recargar conserva el orden y la parada, y «Volver al orden recomendado» lo borra.
7. El mapa dibuja un tramo por cada pareja, uno discontinuo si falta la geometría, y marcadores 1 a 4.
8. Sin desbordamiento horizontal a 360 px y con objetivos táctiles de al menos 44 px.
9. Un tour sin `orderFlexible` no ofrece «empezar aquí», ni ubicación, ni enlaces: comportamiento anterior.

Capturas en [`05-capturas/`](05-capturas/): ficha, reproductor, aviso de llegada y mapa a 390×844, y ficha y mapa a 360×740.

## Decisiones que se apartan del plan

- **Analítica.** Los enlaces no se conectan a `attachAudioAnalytics`, así que sus segundos no cuentan como escucha. No se añadió `segment: 'body'` a las paradas, para no cambiar los eventos que ya llegan a Umami.
- **Tiempo hasta la siguiente parada.** El plan usa la matriz desde la parada actual. Eso da «10 m · 6 min» cuando ya estás junto a la siguiente. Ahora la matriz solo se usa si estás a 150 m o menos de la parada actual; si no, el tiempo sale de tu distancia.
- **Textos nuevos en un módulo aparte** (`flexibleCopy.ts`), no dentro de `mobileTourCopy.ts`, que exige cadenas simples y lo van a tocar otros paquetes.
- **`previoustrack` desde la primera parada** vuelve a la introducción si el tour la tiene.
- **Un cambio de comportamiento que el plan pedía y una prueba antigua negaba.** `test-tour-listening.cjs` afirmaba que la marca «escuchada» de una parada no pasa a una versión nueva del audio; el plan §4.4 exige lo contrario. Se actualizó esa aserción y se añadió que terminar la introducción no marca otra parada.
- **Dos arreglos a esa prueba que no eran del plan.** Esperaba el aviso de privacidad sin darle tiempo a aparecer (una carrera que hacía fallar dos de sus tres modos antes de tocar nada), y ahora espera hasta 4 s.

## Hallazgos durante el trabajo

- Cambiar el `src` de un elemento ya reproduciendo deja una duración vieja hasta que carga el nuevo. Con el motor persistente, las pruebas antiguas leían esa duración y adelantaban su comprobación. Se resolvió cargando el segmento en un efecto de capa (`useLayoutEffect`), antes de pintar.
- Al cargar otro archivo el navegador restablece la velocidad. El motor fija `defaultPlaybackRate` y `playbackRate` en cada segmento, lo que también arregla el fallo A4 de [06](../06-ui.md).
- Chrome fusiona dos lecturas de ubicación que llegan juntas. La prueba de llegada las separa 700 ms, como hace un teléfono.

## Cómo se ejecuta

```bash
cd frontend
node --test scripts/test-route-order.cjs scripts/test-tour-state.cjs
PLAYWRIGHT_MODULE=<ruta a playwright> CHROMIUM_PATH=<ruta a chrome> BASE_URL=http://127.0.0.1:3100 node scripts/test-flexible-tour.cjs
```

Con `npx next dev -p 3100` en marcha y las rutas calentadas (la primera compilación en modo desarrollo hace fallar a las pruebas por tiempo). `SHOTS=<carpeta>` guarda las capturas.

## Pendiente de ti

1. Probar en un iPhone (Safari) y en un Android (Chrome), con la pantalla bloqueada: que el enlace suene tras el cuerpo, y que siguiente y anterior funcionen con título, ciudad y carátula. Es el riesgo principal de este paquete.
2. Los datos reales llegan con [04](../04-regeneracion-y-publicacion.md); hasta entonces ningún tour publicado activa esta experiencia.
