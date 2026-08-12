# Snapshots de investigación narrativa V6

`NarrativeResearchSnapshotV6` v2 separa dos artefactos con distinta política de conservación:

- El **manifest compartible** contiene únicamente identidad, URL final, hash de la URL solicitada,
  título, autoridad determinista, fecha de captura, fingerprints, revisión de Wikimedia cuando
  existe y entre uno y tres extractos literales breves por fuente. Su `capturePolicy` es `once`.
- El **artefacto privado** contiene las capturas completas necesarias para reproducir la
  investigación. Debe guardarse en un directorio ignorado y nunca versionarse ni adjuntarse al
  informe compartible.

El constructor exige exactamente un juego de extractos por fuente, rechaza IDs, URLs finales,
URLs solicitadas y fingerprints duplicados, y verifica que cada extracto aparezca literalmente
en la captura sin equivaler a su contenido completo. Cada extracto admite hasta 500 caracteres;
se permiten tres y 1.000 caracteres en total por fuente.

El replay vuelve a validar el fingerprint del manifest, la correspondencia uno-a-uno con el
artefacto privado, el hash de cada URL solicitada, la clasificación de autoridad y el fingerprint
SHA-256 de cada contenido antes
de crear `ReplayNarrativeSourceProviderV6`. Por tanto, las repeticiones posteriores no navegan.
Los fingerprints detectan cambios accidentales o sustituciones entre los dos artefactos; no son
firmas criptográficas de autoría.

`palace.manifest.json` es únicamente el fixture negativo legado que demuestra que una captura sin
S01/S03 no puede declararse v2. El snapshot aceptado es `palace-v2.manifest.json`.

```ts
const { manifest, privateArtifact } = createNarrativeResearchSnapshotBundleV6({
  captures,
  excerptsBySourceId,
});

// Versionar `manifest`; conservar `privateArtifact` únicamente en almacenamiento privado.
const sourceProvider = replayNarrativeResearchSnapshotV6(manifest, privateArtifact);
```
