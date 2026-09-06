# Integración de generación de tours en la aplicación

Fecha: 2026-09-06. Solicitado: planificar y ejecutar las correcciones de la auditoría frontend/backend.

## Objetivo

Una solicitud del formulario llega a Codex como autor y termina en un borrador vigente, explícitamente pendiente de revisión, o en un error observable. Los tours publicados conservan sus controles de aprobación. Preservar los cambios de trabajo existentes.

## Decisiones comunes

- El backend decide reutilización y generación. El formulario no consulta el catálogo antes del POST.
- Compartir el criterio de publicación y reutilización; vincular los resultados a la versión del generador.
- Verificar el tour de un trabajo completado antes de devolverlo. Reiniciar de forma condicional trabajos cuyo resultado ya no es válido.
- Reclamar la ejecución en PostgreSQL con propietario y vencimiento; renovar durante la ejecución y condicionar las escrituras al propietario. Recuperar trabajos vencidos, sin duplicar trabajos con propietario activo.
- Distinguir errores definitivos de seguimiento de fallos transitorios. Mantener el contrato de errores HTTP.
- Generador elegido por el usuario: Codex como autor. Reutilizar el canario con `--writer-transport=codex` en un proceso aislado, compilado para ejecución; conservar preparación y auditorías existentes.
- El modo Codex produce `complete_needs_review`, nunca una aprobación automática. Guardar el tour como `review`, devolver `reviewRequired` y mostrar aviso de borrador. No falsear textAudit ni globalScorecard para publicarlo.
- Versión de generación `codex-author-v8-app-1`; el formulario solo permite historia en español mientras esos sean los contratos reales del autor. Rechazar solicitudes no soportadas antes de iniciar llamadas.
- Ejecutar con plazo de 30 minutos, presupuesto API máximo configurable (2 USD por defecto), cancelación por pérdida de propiedad y artefactos por intento. Validar integración con procesos/proveedores simulados; no lanzar canarios pagados como prueba automática.

## Orden de ejecución

1. Registrar contratos y baseline; decidir la integración del generador.
2. Corregir formulario y seguimiento, con comprobación de tipos.
3. Implementar propiedad y recuperación de trabajos, con pruebas de concurrencia, vencimiento y errores.
4. Adaptar el generador elegido a la persistencia de tours y al progreso del trabajo.
5. Unificar calidad, versión y reutilización; probar resultados eliminados, retirados y obsoletos.
6. Probar el recorrido con proveedores simulados y revisar el diff completo. Documentar cualquier validación externa pendiente.

## Criterios de aceptación

- El formulario no depende de una consulta de listado para iniciar una generación.
- Un 404 o un resultado completado inválido no produce polling infinito.
- Dos procesos no pueden publicar el mismo trabajo simultáneamente; las escrituras de un propietario vencido se rechazan.
- Un trabajo completado con tour no reutilizable no devuelve éxito obsoleto.
- El generador integrado produce datos estructurados y usa sus controles de calidad reales; no se simulan aprobaciones.
- Las pruebas enfocadas y las comprobaciones TypeScript pasan, o los bloqueos concretos se documentan.

## Baseline conocido

Auditoría anterior: 11/12 pruebas de GenerationJobService y controlador tours pasan; una expectativa del error de calidad no incluye signals. Node del sistema es incompatible con Jest; usar Node 22.14.0 instalado en ~/.nvm.

## Ejecución y validación

Los seis pasos de implementación están completados. Se conectó el formulario al adaptador Codex, se añadieron propiedad temporal y escrituras condicionadas en PostgreSQL, se corrigieron reutilización y seguimiento y se muestra el estado de revisión en el tour.

- 115 pruebas enfocadas pasan en nueve suites: adaptador y artefactos, proceso aislado, servicio y repositorio de trabajos, controladores, reutilización y autor Codex existente. Los casos de concurrencia del repositorio utilizan un doble de base de datos; no equivalen a una prueba de carga con varios servidores reales.
- Compilación del backend y del proceso de generación completada; comprobación TypeScript del frontend completada.
- Cliente Prisma regenerado y migración aditiva `20260906120000_generation_job_leases` aplicada a la base local.
- Preflight local: Codex CLI instalado y sesión de ChatGPT activa. No se ejecutó una generación real con proveedores externos.
- El servicio local del puerto 3001 no está disponible durante la comprobación final. Queda pendiente el recorrido HTTP y de navegador con el servidor arrancado, además de una generación real.

## Operación

El backend requiere Node 22 o posterior. `npm run build` compila también el proceso aislado; `npm run dev` lo prepara mediante `predev`. Aplicar las migraciones antes de iniciar el servicio en otros entornos.

El proceso necesita Codex CLI autenticado, las credenciales de los proveedores que usa el canario y los documentos del autor. `NARRATIVE_AUTHOR_ASSET_ROOT` permite indicar el directorio de estos documentos; por defecto se usa `docs/operations` del repositorio. La imagen Docker actual requiere provisionar CLI, autenticación y documentos para generar; el cambio de versión de Node por sí solo no deja esa imagen preparada para generación real.

`TOUR_GENERATION_SPEND_LIMIT_USD` configura el límite API del canario por intento (2 USD por defecto); no es un presupuesto agregado de todos los trabajos ni mide el consumo de la suscripción Codex. La recuperación de un trabajo vencido inicia otro intento. El canario tiene un plazo de 30 minutos y el supervisor concede un minuto adicional para terminar; la pérdida de propiedad cancela el proceso.

La interfaz admite historia en español con las duraciones ya soportadas. Los resultados de Codex permanecen en `review`, incluyen hallazgos y ajuste de duración y no se publican automáticamente. Esta integración no añade un proceso de aprobación humana.
