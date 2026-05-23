# Bioacoustic Template Labeler

Aplicación web pura para marcar una plantilla acústica en un espectrograma y buscar regiones similares por embeddings simples del patch espectral.

## Inicio rápido

Descomprime el ZIP y sirve la carpeta con un servidor local. Por ejemplo, con Python/Conda:

```bash
cd bioacoustic-template-labeler-wizard-v10
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
