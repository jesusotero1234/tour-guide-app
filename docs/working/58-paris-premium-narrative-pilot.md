# Piloto narrativo premium de París

Fecha: 2026-08-08

Estado: **tres textos congelados; `review_required`; sin aprobación humana**

## Alcance

Este piloto es un flujo offline independiente del narrador de producción. Usa la ruta exacta del fixture v7 de París, pero genera y valida únicamente tres escenas:

1. Notre-Dame como apertura.
2. Louvre como giro central.
3. Palais-Royal como desenlace.

No modifica el fixture de ruta, endpoints HTTP, frontend, TTS ni el estado editorial de París. La aprobación futura de estos textos tampoco convierte la ruta en `verified`.

El contrato v1 admite únicamente `es-ES` y falla de forma explícita ante cualquier otro idioma. Las reglas léxicas dependientes del idioma están agrupadas bajo esa variante; no existe una lista de palabras corrientes permitidas ni un fallback que aplique reglas españolas a otro idioma. Incorporar otro idioma requerirá declarar y probar su propio conjunto de reglas.

## Evidencia cerrada

Cada escena recibe cuatro hechos completos con propietario canónico, URL, fecha de captura y fingerprint. El modelo no recibe ninguna otra fuente.

- Notre-Dame: crecimiento medieval, riesgo de demolición, movilización asociada a Victor Hugo e incendio de 2019 con reapertura en 2024. Fuente: [historia oficial de Notre-Dame](https://www.notredamedeparis.fr/en/understand/history/).
- Louvre: fortaleza de Philippe Auguste, residencia real, proyecto renacentista de François I y apertura pública durante la Revolución. Fuente: [dossier histórico oficial del Louvre](https://presse.louvre.fr/wp-content/uploads/2016/12/832675.pdf).
- Palais-Royal: residencia de Richelieu, galerías comerciales, foro anti-Versalles y llamada de Camille Desmoulins del 12 de julio de 1789. Fuente: [historia oficial del Palais-Royal](https://www.domaine-palais-royal.fr/en/decouvrir/histoire-du-domaine-national-du-palais-royal).

La respuesta congelada contiene 257, 257 y 256 palabras. Sus aperturas usan tres motores distintos y sus transiciones son Notre-Dame → Sainte-Chapelle, Louvre → Arc du Carrousel y Palais-Royal → cierre.

La respuesta incluida es el fixture editorial de replay, no una captura live atribuible a DeepSeek. Demuestra el contrato completo y permite revisar los textos sin red. La generación externa queda implementada, pero no se ejecutó porque el entorno no dispone de `DEEPSEEK_API_KEY`.

## Validación

El validador exige las tres escenas y su orden exacto, español, 220–260 palabras, cinco bloques narrativos, indicación visual, hechos existentes, fechas y nombres permitidos y la transición real. También rechaza:

- aperturas equivalentes;
- una frase de siete o más palabras compartida por dos escenas;
- un mismo hecho usado en más de dos bloques;
- diálogos, recuerdos o dramatizaciones marcadas;
- cambios de ruta, evidencia, prompt, modelo o texto sin renovar el fingerprint correspondiente.

La llamada estructurada a DeepSeek devuelve las tres escenas juntas. Sólo un fallo de transporte o JSON inválido permite un segundo intento; un error semántico termina inmediatamente en `review_required`.

## Replay y generación externa

```bash
cd backend
npm run quality:narrative:paris:v1
```

El comando anterior no usa la red: reconstruye el request desde la ruta v7, carga la respuesta congelada, recalcula todos los fingerprints y valida los tres textos.

Una nueva llamada externa necesita dos señales explícitas y una credencial disponible:

```bash
npm run quality:narrative:paris:v1 -- --generate --allow-external
```

El runner imprime el resultado, pero no sobrescribe fixtures ni publica contenido.

## Gate humano pendiente

La primera ficha de revisión contiene sólo los textos y oculta proveedor, modelo, prompt, fingerprints y fuentes. Después, los mismos tres revisores reciben las fichas de evidencia.

La aprobación requiere dos votos de compra de tres, mediana mínima de 4/5 en curiosidad, tensión humana, utilidad visual, naturalidad y progresión, mediana mínima de 3/5 por escena y ningún error factual crítico ni omisión engañosa. Si falla, el artefacto conserva `review_required` y registra una única capa siguiente: evidencia, estructura o estilo.

No se ha ejecutado ese gate. Por ello no existe el commit `content: approve premium Paris narration pilot`.

## Verificación técnica

- piloto narrativo: 2 suites y 9 pruebas pasan;
- piloto + v7 + regresión v5/v6: 20 suites y 84 pruebas pasan;
- replay offline del piloto y los tres replays v7 pasan;
- `npm run build` pasa;
- suite backend completa: 62 suites pasan y 2 fallan; 444 pruebas pasan, 2 fallan y 1 se omite;
- los dos fallos globales siguen siendo los preexistentes de `LandmarkTiering.test.ts` y `tours.test.ts`; estos archivos no se modificaron;
- `npm run lint` sigue sin arrancar porque el backend no contiene configuración de ESLint.
