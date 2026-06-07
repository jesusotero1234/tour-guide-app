# Presupuesto VRAM local: RTX 5080 16GB

> Documento de planificación. No cambia comportamiento de producción hasta que se implemente en código.

## Objetivo

Ejecutar narración con `llama3.1:8b` y TTS primario con VoxCPM en una RTX 5080 de 16GB, manteniendo Kokoro como fallback.

## Estimación de memoria

| Componente | Estimación VRAM | Nota |
|---|---:|---|
| `llama3.1:8b` Q4_K_M | ~4.8GB | Disponible y recomendado para narración |
| `llama3.1:8b` Q5_K_M | ~5.5GB | Mejor calidad potencial, más margen consumido |
| VoxCPM `openbmb/VoxCPM2` | ~4–6GB | TTS principal en `pods/voxcpm-pod` |
| Total esperado | ~10–12GB + overhead | Cabe en 16GB si no se cargan modelos grandes extra |
| `gemma4:26b` | alto/no recomendado simultáneo | Default env del llm-pod, pero no activo en narración larga por override |

```text
RTX 5080 16GB
├─ llama3.1:8b Q4_K_M  ≈ 4.8GB
├─ VoxCPM2             ≈ 4–6GB
├─ CUDA/runtime/cache  ≈ overhead variable
└─ Margen esperado     ≈ 4GB aprox. según cuantización y runtime
```

## Estado actual vs objetivo

Actual:
- Narración larga usa `qwen3:4b` hardcodeado en `pods/llm-pod/src/routes/narrativeLong.ts`.
- `gemma4:26b` puede estar configurado como default env, pero no gobierna la narración larga.
- VoxCPM existe como pod en `:3006`; Kokoro existe en `:3005`.

Objetivo:
- Narración larga usa `llama3.1:8b`.
- VoxCPM es TTS principal.
- Kokoro queda como fallback para resiliencia.
- Evitar cargar simultáneamente `gemma4:26b` junto con VoxCPM y `llama3.1:8b` en la misma GPU salvo prueba explícita.

## Confirmación live test (2026-05-24)

- **Tour Madrid "historia", francés, 240 minutos**: generado exitosamente con `llama3.1:8b` (narración) + VoxCPM (TTS primario) en RTX 5080 16GB.
- **6 stops** con narración rica en francés, 0 fallbacks en generación de texto.
- **Audio**: VoxCPM generó audio para todos los stops sin errores OOM.
- **Conclusión**: El perfil `llama3.1:8b` Q4_K_M + VoxCPM es estable en 16GB para tours de hasta 240 minutos.

## Roadmap operativo

### Fase V-1 — Perfil conservador recomendado

- Usar `llama3.1:8b` Q4_K_M para narración.
- Ejecutar VoxCPM como TTS principal.
- Mantener Kokoro fallback, preferiblemente sin asumir que también consume VRAM significativa si corre CPU/ONNX según configuración local.

Por qué importa / riesgo reducido:
- Reduce riesgo de OOM en 16GB.
- Permite mejorar narración y voz sin activar `gemma4:26b`.

Criterios de aceptación:
- Tour completo genera texto y audio sin errores OOM.
- La GPU mantiene margen durante narración + TTS.

### Fase V-2 — Medición real

- Medir VRAM durante tres puntos: solo LLM, solo VoxCPM, ambos activos.
- Registrar picos y tiempos de generación.

Por qué importa / riesgo reducido:
- Sustituye estimaciones por datos reales del equipo.
- Detecta si Q5_K_M es viable sin comprometer VoxCPM.

Criterios de aceptación:
- Hay una tabla de picos medidos por escenario.
- Se decide si Q4_K_M o Q5_K_M será el perfil por defecto.

### Fase V-3 — Política de degradación

- Si hay OOM, bajar a Q4_K_M o serializar LLM/TTS.
- Si VoxCPM falla por memoria, usar Kokoro fallback.
- No promover `gemma4:26b` para narración larga local mientras comprometa VoxCPM.

Por qué importa / riesgo reducido:
- Evita que una mejora de calidad bloquee generación completa.
- Preserva una ruta local estable para MVP.

Criterios de aceptación:
- Los fallos de memoria degradan a un proveedor/modelo menor en vez de abortar silenciosamente.
