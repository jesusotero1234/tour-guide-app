# Diseño móvil publicado en Nomuvia

19 de septiembre de 2026. Autorización del responsable: «Aplicalo en nomuvia».

Release activa: `/srv/tour-guide/releases/20260919-mobile-design`.
Anterior: `/srv/tour-guide/releases/20260919-thematic-paragraphs`.

Se compararon los hashes del frontend local con la versión remota y se
publicaron exclusivamente los 13 archivos del diseño aprobado: catálogo con
ciudades y fotografías verificadas, muestras de audio de hasta 45 segundos,
ficha del paseo, textos en cinco idiomas, controles de escucha y aviso de
privacidad más compacto. El manifiesto de cambios está en
`mobile-design-manifest.json` dentro de la release.

La compilación remota terminó correctamente como usuario administrativo sin
ejecutar npm como root. Conserva las dos advertencias de dependencias de hooks
ya existentes. Se activó la release mediante sustitución atómica del enlace
`current` y se reinició únicamente `nomuvia-frontend`. El PID del backend se
mantuvo y ambos servicios están activos, con cero reinicios automáticos.

## Comprobación pública

Navegador Chromium sobre `https://nomuvia.com`, sin interceptar peticiones:

- Portada redirigida al catálogo nuevo; español e inglés comprobados.
- Valencia muestra sus dos tours, fotografía real y muestra de audio reproducible.
- Ficha con cinco paradas desplegables, distancia y tiempo de ruta peatonal.
- Audio real reproducido; continúa al cambiar entre texto y mapa.
- Escucha recuperada al volver desde la ficha, sin reproducción automática.
- Controles dentro de pantalla a 320, 390 y 430 píxeles.
- Sin errores de JavaScript ni solicitudes POST durante la prueba.
- Los 22 tours españoles y sus versiones de audio coinciden con la instantánea
  pública anterior al despliegue. No se modificaron datos, audios ni configuración.

Capturas públicas en `output/mobile-design/public-{catalogo,ficha,reproductor}.png`.
La prueba no sustituye una comprobación en un iPhone físico.

## Reversión

El registro previo y el manifiesto están en
`/root/nomuvia-before-mobile-design-20260919/`. Para revertir, restaurar
atómicamente `/srv/tour-guide/current` a la release anterior y reiniciar solo
`nomuvia-frontend`. No hay cambios de base de datos que revertir.
