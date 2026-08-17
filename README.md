# Bioacoustic Template Labeler · v46

https://jocoacoustics.github.io/bioacoustic-template-labeler/

Herramienta web estática/local para **marcar plantillas acústicas sobre espectrogramas, buscar patrones similares y revisar/exportar coincidencias**. v46 incorpora **Perch2 ONNX en el navegador** como segundo motor de búsqueda, sin backend de inferencia y sin subir el audio del usuario.

## Inicio rápido

Descomprime el proyecto y sirve la carpeta mediante HTTP:

```bash
cd bioacoustic-template-labeler-wizard-v46
python -m http.server 8000
```

Abre:

```text
http://localhost:8000
```

> No abras `index.html` mediante `file:///...`: los Web Workers y recursos del modelo pueden quedar bloqueados por el navegador.

## Flujo

1. **Sube audio** y genera automáticamente el espectrograma.
2. **Explora** con reproducción y zoom temporal/frecuencial.
3. **Marca una plantilla**; opcionalmente agrega varias muestras del mismo fonotipo.
4. Elige uno o ambos motores:
   - **Búsqueda** clásica sobre la representación espectral.
   - **Búsqueda Perch2** mediante embeddings de 1536 dimensiones y coseno real.
5. Revisa todos los candidatos en el mismo panel **Resultados** y exporta CSV, XLSX o TXT Audacity.

## Perch2 en v46

- Se ejecuta localmente en `perch-worker.js` mediante ONNX Runtime Web.
- Intenta **WebGPU** y utiliza **WASM** como fallback local.
- **Audio completo** es la configuración predeterminada.
- **Banda de frecuencias** es opcional y manual; `fmin`/`fmax` se ajustan con una barra de dos puntos cuya geometría de interacción usa escala **Mel** para dar mayor precisión en bajas frecuencias. Los valores analíticos se convierten de nuevo a Hz.
- **Comparar** ejecuta audio completo y banda para contrastar ambos embeddings.
- Perch2 usa ventanas de **5 s**, señal a **32 kHz**, normalización de pico a `0.25` y embedding de **1536** dimensiones.
- En una plantilla **multi-muestra**, Perch2 usa exclusivamente la **primera muestra (#1)**. La búsqueda clásica mantiene intacta su semántica multimuestra.
- Score coseno e IoU se pueden modificar después de la inferencia sin recalcular embeddings.

La primera ejecución de Perch2 descarga ONNX Runtime Web y el modelo ONNX como recursos estáticos. El audio permanece en el navegador.

## Características principales

- Visor STFT multirresolución con timeline virtual y zoom temporal profundo hasta `100 000 px/s`.
- Teselas visuales con caché, fallback continuo y precarga predictiva.
- Separación estricta entre visualización y análisis.
- Múltiples plantillas independientes, con configuración y resultados por plantilla.
- Plantillas multimuestra con varios estimadores compuestos.
- Búsqueda clásica con seis métodos de comparación y autoajuste.
- Búsqueda Perch2 local con Audio completo / Banda de frecuencias / Comparar.
- Resultados unificados con columna **método**.
- Panel lateral redimensionable y responsive.
- Exportación CSV, XLSX y TXT Audacity.

## Estructura

```text
bioacoustic-template-labeler-wizard-v46/
├── index.html
├── styles.css
├── README.md
├── AGENTS.md
├── CHANGELOG.md
├── documentacion.html
├── LICENSE
├── .nojekyll
└── src/
    ├── app.js
    ├── audio-worker.js
    ├── perch-worker.js
    ├── visual-worker.js
    └── colormaps.js
```

### Responsabilidades

- `src/app.js`: estado, UX, plantillas, resultados y coordinación de workers.
- `src/audio-worker.js`: motor analítico clásico de plantillas y similitud.
- `src/perch-worker.js`: Perch2 ONNX local, embeddings, filtrado opcional y barrido temporal.
- `src/visual-worker.js`: STFT visual, overview y teselas multirresolución.
- `src/colormaps.js`: paletas exclusivamente visuales.

## Documentación y mantenimiento

Abre `documentacion.html` para el manual completo, algoritmos y matemática.

**Antes de modificar el proyecto, leer `AGENTS.md`.** El historial canónico se mantiene en `CHANGELOG.md`.

## Privacidad y despliegue

El audio se procesa localmente en el navegador. La aplicación puede publicarse como sitio estático. Perch2 no requiere servidor CPU/GPU; el cálculo se ejecuta en el dispositivo del usuario mediante WebGPU o WASM.
