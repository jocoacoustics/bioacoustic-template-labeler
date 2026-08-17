# Bioacoustic Template Labeler · v48.2

https://jocoacoustics.github.io/bioacoustic-template-labeler/

Herramienta web estática/local para **marcar plantillas acústicas sobre espectrogramas, buscar patrones similares y revisar/exportar coincidencias**. v48.2 consolida **Perch2 ONNX en el navegador** como segundo motor de búsqueda, sin backend de inferencia y sin subir el audio del usuario.

## Inicio rápido

Descomprime el proyecto y sirve la carpeta mediante HTTP:

```bash
cd bioacoustic-template-labeler-wizard-v48.2
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

## Perch2 en v48.2

- Se ejecuta localmente en `perch-worker.js` mediante ONNX Runtime Web.
- Intenta **WebGPU** y utiliza **WASM** como fallback local.
- **Automático** es la configuración predeterminada: filtra cada ventana usando exactamente la banda frecuencial de la muestra usada por Perch2 (en multimuestra, la muestra #1).
- **Audio completo** omite el filtro frecuencial previo.
- **Banda de frecuencias** permite definir manualmente **Frecuencia mínima/Frecuencia máxima** con una barra de dos puntos cuya geometría de interacción usa escala **Mel**. Los valores analíticos se convierten de nuevo a Hz.
- Perch2 usa ventanas de **5 s**, señal a **32 kHz**, normalización de pico a `0.25` y embedding de **1536** dimensiones.
- En una plantilla **multi-muestra**, Perch2 usa exclusivamente la **primera muestra (#1)**. La búsqueda clásica mantiene intacta su semántica multimuestra.
- El score coseno, el ajuste de bordes, la separación entre huellas y el padding se pueden modificar después de la inferencia sin recalcular embeddings.
- Las ventanas Perch2 de 5 s se convierten en eventos mediante el **perfil temporal del coseno**: picos y valles determinan cuántas huellas existen y el ancho de cada pico se transforma por encajado de ventanas en una caja temporal refinada. La duración mínima de una caja refinada es el ancho temporal de la plantilla realmente usada por Perch2; el paso temporal describe la resolución del barrido, no el ancho mínimo.
- El centro temporal refinado se estima como el punto medio entre los cruces izquierdo/derecho del soporte del pico; la caja permanece centrada salvo corrección por los límites reales del audio.
- La búsqueda clásica conserva un pool de candidatos para que **Score mínimo** pueda moverse y redibujar resultados sin volver a ejecutar el worker.

La primera ejecución de Perch2 descarga ONNX Runtime Web y el modelo ONNX como recursos estáticos. El audio permanece en el navegador.

## Características principales

- Visor STFT multirresolución con timeline virtual y zoom temporal profundo hasta `100 000 px/s`.
- Teselas visuales con caché, fallback continuo y precarga predictiva.
- Separación estricta entre visualización y análisis.
- Múltiples plantillas independientes, con configuración y resultados por plantilla.
- Plantillas multimuestra con varios estimadores compuestos.
- Búsqueda clásica con seis métodos de comparación y autoajuste.
- Búsqueda Perch2 local con Automático / Audio completo / Banda de frecuencias.
- Resultados unificados con columna **método**.
- Panel lateral redimensionable y responsive.
- Exportación CSV, XLSX y TXT Audacity.

## Estructura

```text
bioacoustic-template-labeler-wizard-v48.2/
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
