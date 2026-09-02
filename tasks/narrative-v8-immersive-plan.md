# Plan — V8 narrativo inmersivo y verificable

## Objetivo

Producir paradas más largas, ricas e inmersivas sin relajar la fidelidad factual ni cambiar de modelo antes de medir el pipeline corregido.

## Alcance confirmado

El informe externo revisó un canario anterior. En el canario actual Qwen sí escribió siete paradas, pero siguen vigentes estos defectos:

- selecciones de evidencia no contiguas pueden conservar una afirmación más amplia que la cita;
- interpretaciones debatibles y nombres/números no corroborados se degradan o filtran en silencio;
- la duración solicitada no se convierte en objetivos por parada;
- investigación y curaduría tienen límites fijos que no responden a la riqueza requerida;
- el escritor recibe una pauta vaga de dos o tres minutos.

Los problemas de identidad física del Senado, geometría y reanudación del checkpoint ya están corregidos y quedan fuera de esta intervención.

## Decisiones

- No sustituir Qwen todavía: primero darle objetivos explícitos y medirlo.
- Rechazar contratos de evidencia inválidos; nunca “arreglarlos” perdiendo silenciosamente soporte.
- Calcular objetivos deterministas por parada desde duración total, caminata y relevancia.
- Pasar esos objetivos a investigación, curaduría, escritura y validación.
- Mantener compatibilidad con los perfiles y artefactos V8 existentes cuando falten los nuevos campos.

## Fases

### 1. Integridad de evidencia (P0)

Pruebas rojas para selección no contigua, interpretación debatible insuficientemente corroborada y nombres/números no sustentados. Después, rechazo explícito con motivo de contrato.

Aceptación: ninguna proposición aceptada puede contener afirmaciones que excedan sus spans válidos.

### 2. Objetivos de narración

Crear un asignador puro de tiempo/palabras/riqueza por parada. Considera duración solicitada, tiempo de caminata y peso de paradas obligatorias, con límites seguros.

Aceptación: suma acotada al tiempo disponible; cada parada recibe segundos, palabras y mínimo de tarjetas visuales/evidencias.

### 3. Investigación y curaduría adaptativas

Propagar el objetivo a la investigación. Ajustar presupuesto de spans/caracteres y máximo de proposiciones. Cubrir inicio, centro y final de fuentes largas. Rechazar páginas con plantillas sin resolver.

Aceptación: los paquetes largos son diversos por posición y la puerta writer-ready exige suficiente riqueza, además de roles.

### 4. Contrato del escritor

Incluir objetivo de palabras/segundos y una secuencia inmersiva basada únicamente en evidencia autorizada: orientación visible, cambio temporal, vida humana, contraste/significado y transición.

Aceptación: el resultado queda dentro de tolerancia de longitud o falla explícitamente; no se inventan detalles para llenar cuota.

### 5. Evaluación del modelo

Ejecutar pruebas locales y un ensayo congelado con Qwen. Solo si incumple esquema, grounding o longitud después del contrato corregido, comparar alternativas económicas disponibles en OpenRouter con precios y documentación vigentes.

Aceptación: decisión basada en la misma entrada, rúbrica y coste.

## Verificación final

- pruebas unitarias focalizadas;
- suite narrativa V8 relevante;
- compilación TypeScript;
- revisión del diff y de archivos modificados;
- comando de canario completo para Madrid, sin ejecutarlo con coste externo salvo autorización explícita.
