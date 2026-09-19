# Traducciones del aviso operativo

El archivo privado indicado por `PILOT_NOTICE_FILE` conserva los campos originales
en español y las claves `operatorName`, `contactEmail` y `launchReview` existentes.
Admite un objeto opcional `translations` con entradas `es`, `en`, `fr`, `de`, `it`.
Cada entrada debe contener texto no vacío para los seis campos:
`hosting`, `processors`, `transfers`, `retention`, `legalBases`, `rights`.

Una traducción parcial no se mezcla con el original: se muestra todo el contenido
operativo en español, con una advertencia traducida y `lang="es"`. La identidad y
el contacto no pueden modificarse desde una traducción. Los archivos existentes
siguen funcionando; los archivos incompletos o inválidos no se presentan como
avisos configurados. Se mantiene el límite de 32768 caracteres para el archivo
completo, compartido con el control de apertura del backend.

Las traducciones no activan el catálogo ni cambian las declaraciones de revisión.
Completar y revisar los cinco idiomas antes de desplegar el aviso definitivo.
No incluir datos personales reales en ejemplos versionados.
