# Revisión del tour histórico de Berlín

Fecha: 21 de septiembre de 2026.

El recorrido anterior era correcto en sus datos, pero no representaba bien la
identidad histórica de Berlín. Tres de sus siete paradas se concentraban en la
Isla de los Museos, mientras que no incluía el Reichstag, la Puerta de
Brandeburgo ni una parada dedicada a la división de la ciudad.

La causa fue doble. La consulta complementaria de lugares emblemáticos agotó su
plazo de veinte segundos y la adquisición continuó con el mapa. En ese mapa, un
límite aplicado antes de comparar todos los grupos dejó fuera lugares muy
reconocibles. El editor posterior solo pudo escoger entre la lista parcial y
marcó como imprescindibles tanto el conjunto de la Isla de los Museos como uno
de sus museos.

La nueva preparación protege cuatro identidades revisadas por el usuario:

- Q151897, Reichstagsgebäude.
- Q82425, Brandenburger Tor.
- Q819081, Topographie des Terrors, junto al tramo conservado del Muro.
- Q68689, Checkpoint Charlie.

El sistema consulta esas identidades directamente en el mapa, las conserva en
las preselecciones y las trata como obligatorias al medir la ruta. Los restantes
lugares siguen siendo elegidos por el flujo habitual con sus fuentes y tiempos
peatonales. La auditoría editorial también recibió una regla general para no
declarar imprescindibles a la vez un conjunto y varias atracciones que repiten
la misma visita.

La versión anterior se archiva completa antes del reemplazo. La regeneración de
Berlín espera a que termine la cola europea activa; después ejecuta preparación,
guion revisado y audio combinado, y solo sustituye el estado disponible cuando
cada fase supera su recibo de integridad. El estado está en
`backend/tmp/pilot-batch-europe-20260920/berlin-route-revision-state.json` y los
registros quedan en la carpeta de Berlín con el sufijo `-revision-runner.log`.

Validación realizada: 82 pruebas de adquisición, selección y ruta; 64 pruebas
de administración y recuperación; cuatro pruebas de directorios de preparación;
TypeScript principal y del trabajador de generación; y una comprobación real de
fuentes en alemán. Las cuatro identidades resultaron aptas para narración.
