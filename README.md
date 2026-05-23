# Bioacoustic Template Labeler

Aplicación web pura para marcar una plantilla acústica en un espectrograma y buscar similares acústicas por embeddings simples del patch espectral.

## Inicio rápido

Descomprime el ZIP y sirve la carpeta con un servidor local. Por ejemplo, con Python/Conda:

```bash
cd bioacoustic-template-labeler-wizard-v19
python -m http.server 8000
```

Abre:

```text
http://localhost:8000
```

También puedes publicar los archivos directamente en GitHub Pages. El archivo `index.html` debe quedar en la raíz del repositorio.

## Notas de esta versión

- El reproductor está integrado dentro del módulo del espectrograma.
- El espectrograma evita scroll vertical interno y conserva navegación horizontal.
- El panel derecho tiene scroll propio.
- Los paneles del lado derecho son acordeones completos: se expanden con toda su altura y se contraen limpiamente.
- La configuración del espectrograma queda contraída por defecto.
- El flujo tipo wizard abre/cierra secciones según la acción: marcar ROI, guardar plantilla, buscar y revisar resultados.
- Exporta resultados en CSV y XLSX.


## v9

- Agrega campo **Etiqueta (opcional)** para la ROI.
- La etiqueta se incluye en la tabla de resultados, CSV y XLSX.
- Agrega exportación **TXT Audacity** con formato de dos líneas por etiqueta: `tmin\ttmax\tetiqueta` y `\\\tfmin\tfmax`.


## Exportación

Los archivos CSV, XLSX y TXT Audacity se descargan usando el mismo nombre base del audio original, cambiando solo la extensión.


## Cambios v11

- Nueva métrica: correlación normalizada.
- Todas las métricas devuelven score común entre 0 y 1.
- “Stride temporal” se renombró a “Separación entre ventanas”.
- Íconos de ayuda para métrica, score mínimo y separación entre ventanas.
- Autoajuste opcional al buscar: propone separación y score mínimo usando la duración de ROI, picos/islas temporales, exclusión de la ROI original y barandas internas de cantidad.
- El botón principal ahora dice “Buscar similares”.

## Cambios v12

- Autoajuste más conservador: agrupa ventanas cercanas en picos/islas antes de estimar el umbral.
- El score mínimo automático usa codo, percentil alto, fracción del mejor score y un objetivo conservador de número de coincidencias.
- Se reduce el efecto de cientos de cajas consecutivas cuando el umbral queda muy bajo.
- La tabla de resultados permite ordenar columnas haciendo clic en el encabezado.
- El botón principal vuelve a llamarse “Buscar similares”.

## Cambios v13

- Autoajuste corregido para evitar los dos extremos: cientos de cajas o una sola coincidencia.
- El umbral automático se calcula sobre picos/islas temporales, excluyendo la ROI original para estimar el corte.
- Se añadieron límites internos: mínimo objetivo de candidatos y máximo automático, sin inventar coincidencias falsas.
- El máximo automático es distinto del límite técnico de dibujo/exportación.
- Se conserva el botón “Buscar similares” y la tabla ordenable de v12.

## Cambios v16

- Soporte multi-plantilla / multi-fonotipo.
- Navegación por chips y carrusel entre plantillas.
- Cada plantilla conserva etiqueta, color, parámetros y resultados.
- La primera búsqueda procesa todas las plantillas; las siguientes búsquedas son locales a la plantilla activa.
- El botón Limpiar afecta solo a la plantilla activa.
- La columna etiqueta de la tabla es editable y propaga el cambio a todos los resultados de la misma plantilla.
- Exportación combinada CSV/XLSX/TXT Audacity con todas las plantillas.

## Cambios v17

- Flujo multi-plantilla simplificado.
- El panel **Plantilla** usa chips arriba y carrusel abajo.
- El botón **Agregar plantilla +** guarda/actualiza la plantilla actual y abre automáticamente una nueva plantilla para seguir marcando. Si solo marcas una plantilla, puedes pulsar directamente **Buscar coincidencias**; se guarda automáticamente si la caja es válida.
- El botón **Quitar plantilla −** elimina la plantilla activa.
- El botón **Buscar coincidencias** procesa todas las plantillas válidas con autoajuste por plantilla.
- El panel **Búsqueda** replica la navegación por chips/carrusel para ajustar parámetros por plantilla.
- La tabla de resultados elimina la columna redundante de plantilla y muestra la etiqueta como primera columna, en una cápsula coloreada editable.

## Cambios v18

- La tabla de resultados queda ordenada como `#`, `etiqueta`, `score`, `tmin`, `tmax`, `fmin`, `fmax`.
- Si marcas una plantilla válida, puedes pulsar directamente **Buscar coincidencias** sin antes pulsar **Agregar plantilla +**; la app la guarda automáticamente.
- **Quitar plantilla −** usa un tono rojo suave y **Agregar plantilla +** un tono azul.


## Cambio v19

La búsqueda desde el panel Plantilla ahora procesa solo plantillas nuevas o pendientes. Si agregas plantillas después de una búsqueda, se conservan las coincidencias y parámetros ya ajustados de las plantillas anteriores. Para recalcular una plantilla existente, selecciónala en el panel Búsqueda y pulsa Buscar similares.
