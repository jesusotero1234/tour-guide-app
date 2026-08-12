# Revisión del tour completo de Madrid — 13 de agosto de 2026

## Qué se generó

La ejecución real produjo borradores para las siete paradas con
`deepseek/deepseek-v4-flash-0731`, servido directamente por DigitalOcean a través de OpenRouter. El tour
completo se puede leer en [`tour-preview-20260812.md`](tour-preview-20260812.md).

Son 3.343 palabras, unos 24 minutos de escucha. Los 120 minutos declarados incluyen desplazamientos y
pausas. Este texto sigue marcado como borrador porque la auditoría automática de aquella ejecución no
terminó.

## Fallos técnicos observados y corrección aplicada

| Fallo real | Causa comprobada | Corrección |
| --- | --- | --- |
| Gemini devolvió HTTP 400 al desactivar reasoning | Ese endpoint exige razonamiento | El auditor B y el auditor global usan `gpt-5.4-mini` con reasoning `low`; el auditor A conserva DeepSeek |
| Gemini devolvió `INVALID_ARGUMENT` con auditorías largas | Su endpoint rechazó el schema dinámico grande | Las auditorías se dividen en lotes de hasta 16 frases |
| DeepSeek y después un auditor mini terminaron en `length` | Las razones largas no cabían de forma estable en 2.000 tokens | Cada razón queda limitada a 120 caracteres y cada lote conserva su propio schema exacto |
| Writers y repairs recibieron 429 de DigitalOcean | Límite transitorio del pool compartido | Una sola parada concurrente y un único reintento para 429/timeout/5xx |
| OpenAI rechazó `uniqueItems` en Structured Outputs | Esa keyword no está admitida por su subconjunto de JSON Schema | La unicidad de `propositionIds` se valida en código después de recibir el JSON |
| Un run fallido seguía consumiendo pruebas de mutación | Gate A mezclaba generación del tour y benchmark | `--tour-only` conserva escritura y auditoría de las siete paradas, pero omite las mutaciones |

## Errores editoriales encontrados

| Parada | Problema del borrador | Solución aplicada al sistema |
| --- | --- | --- |
| Palacio Real | Repite «la ciudad terminó rodeando» y presenta las ocho alturas como visibles desde el mismo punto | El prompt prohíbe copiar el lema; el dossier mantiene seis niveles visibles desde Bailén y ocho solo como total condicionado por el desnivel |
| Plaza de la Villa | Anuncia Plaza Mayor pero termina hablando de una puerta | La promesa se trata como tema, no como frase reutilizable |
| Plaza Mayor | Manda bajar por el Arco de Cuchilleros para ir a Sol, alejando al visitante | Las paradas vecinas ya no se interpretan como instrucciones de ruta; el escritor no puede inventar giros, cruces o escaleras |
| Puerta del Sol | Afirma que Cibeles era abrevadero en 1777 | El dossier separa diseño en 1777, instalación a finales de 1781 y usos posteriores |
| Puerta del Sol | Sitúa en 1854 el origen del Kilómetro Cero | La referencia municipal se corrigió: desde 1950 se considera punto de partida de las carreteras radiales |
| Puerta de Alcalá | «Granito del lugar» | La fuente autorizada especifica granito segoviano y decoración de piedra de Colmenar |
| Puerta de Alcalá | Invita a acercarse porque los vanos eran peatonales | El dossier aclara que era una función histórica y nunca una autorización para entrar hoy en la rotonda |
| Puerta de Alcalá | La última parada anuncia que el recorrido continúa | Si no existe `nextStop`, el prompt exige un cierre explícito del tour |

## Cierre recomendado para la última parada

> Aquí termina el recorrido: una antigua frontera convertida en monumento resume el paso de villa cercada
> a capital abierta.

## Estado

- El Markdown legible existe y conserva el borrador real sin ocultar sus defectos.
- Las correcciones están en el perfil, el protocolo de auditoría, el prompt y los dossiers de Sol y Alcalá.
- No se aumentó el límite conjunto de gasto de 2 USD. Los intentos fallidos dejaron 0,147289 USD en el
  ledger conservador, insuficientes para otra ejecución completa de siete paradas.
- La siguiente generación completa debe hacerse con presupuesto nuevo o con un proveedor local; no se debe
  falsear el ledger existente.
