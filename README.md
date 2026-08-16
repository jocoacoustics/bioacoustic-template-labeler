# Bioacoustic Template Labeler · v45.8.4

https://jocoacoustics.github.io/bioacoustic-template-labeler/

Herramienta web local para **marcar plantillas acústicas sobre espectrogramas, buscar patrones similares y revisar/exportar coincidencias**. El audio y el análisis se procesan en el navegador mediante JavaScript y Web Workers; no requiere backend para operar.

## Inicio rápido

Descomprime el proyecto y sirve la carpeta con un servidor local:

```bash
cd bioacoustic-template-labeler-wizard-v45.8.4
python -m http.server 8000
```

Abre en el navegador:

```text
http://localhost:8000
```

Durante desarrollo, si quieres evitar caché del navegador:

```bash
npx --yes http-server . -p 8000 -c-1
```

> No se recomienda abrir `index.html` mediante `file:///...`: los Web Workers pueden quedar bloqueados por el navegador.

## Flujo de trabajo

1. **Subir audio** y generar automáticamente el espectrograma.
2. **Explorar** con reproducción, zoom temporal/frecuencial y escalas Lineal/Mel/Logarítmica.
3. **Marcar una plantilla** sobre el patrón acústico de interés.
4. Opcionalmente **combinar varias muestras** del mismo fonotipo para construir una plantilla compuesta.
5. **Buscar coincidencias**, revisar cajas/resultados y exportar a CSV, XLSX o TXT Audacity.

## Características principales

* Visor STFT **multirresolución** con timeline virtual y zoom temporal profundo de hasta `100 000 px/s`.
* Renderizado por teselas con caché, fallback continuo y precarga predictiva durante reproducción.
* Zoom temporal, frecuencial y combinado sin crear canvases gigantes.
* Separación estricta entre **visualización** y **motor analítico**: paleta, brillo, contraste, gamma, zoom y escala visual no modifican los resultados de búsqueda.
* Escalas visuales Lineal, Mel y Logarítmica.
* Paletas avanzadas y ajustes de contraste, brillo y gamma.
* Múltiples plantillas independientes, cada una con etiqueta, color, parámetros y resultados propios.
* Plantillas multimuestra mediante consenso NCC, consenso ponderado, medoide, mediana alineada o promedio alineado.
* Métodos de comparación: coseno, correlación normalizada, euclidiana normalizada, correlación cruzada temporal, correlación cruzada 2D y correlación 2D multi-escala.
* Autoajuste por perfiles: Ninguno, Conservador, Balanceado y Sensible.
* Panel lateral redimensionable y responsive.
* Exportación CSV, XLSX y TXT compatible con etiquetas de Audacity.

## Estructura

```text
bioacoustic-template-labeler-wizard-v45.8.4/
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
    ├── visual-worker.js
    └── colormaps.js
```

### Responsabilidades principales

* `src/app.js`: estado de la aplicación, UX, navegación, plantillas, resultados y coordinación de workers.
* `src/audio-worker.js`: procesamiento analítico, construcción de plantillas y búsqueda de similitud.
* `src/visual-worker.js`: STFT visual, overview y teselas multirresolución.
* `src/colormaps.js`: paletas usadas exclusivamente para representación visual.

## Documentación

Abre [`documentacion.html`](documentacion.html) para el manual completo. Incluye:

* uso de la interfaz;
* parámetros;
* fundamentos matemáticos;
* métodos de similitud y composición multimuestra;
* arquitectura del visor multirresolución;
* rendimiento y caché;
* solución de problemas;
* control de cambios e historial anterior.

## Desarrollo asistido por IA

**Antes de modificar el proyecto, leer `AGENTS.md`.** Ese archivo contiene las reglas obligatorias de mantenimiento, invariantes arquitectónicas, política de versiones, actualización documental y checklist de regresión.

El historial canónico de versiones se mantiene en [`CHANGELOG.md`](CHANGELOG.md).

## Privacidad y despliegue

El procesamiento del audio se realiza localmente en el navegador. La aplicación puede servirse como sitio estático local o publicarse en GitHub Pages.

## Versión

Versión estable: **v45.8.4**.

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).

