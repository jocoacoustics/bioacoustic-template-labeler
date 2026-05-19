# Bioacoustic Template Labeler

Aplicación web pura para etiquetado asistido de patrones acústicos en espectrogramas.

## Inicio rápido

```powershell
cd bioacoustic-template-labeler-wizard
python -m http.server 8000
```

Abre:

```text
http://localhost:8000
```

No abras `index.html` directamente con doble clic. Usa un servidor local o GitHub Pages.

## Funciones

- Carga local de audio en el navegador.
- Construcción automática del espectrograma al subir audio.
- Reproductor inferior limpio.
- Espectrograma con ROI interactiva por arrastre.
- Eje de frecuencia fijo y visible.
- Nombre del archivo como cabecera del espectrograma.
- Escala de frecuencia lineal o mel.
- Mapa de color magma o blanco y negro.
- Búsqueda por similitud de embedding.
- Exportación CSV de candidatos.
- Documentación en `documentacion.html`.

## Publicación en GitHub Pages

Sube todo el contenido del proyecto a un repositorio, dejando `index.html` en la raíz. En GitHub usa:

`Settings → Pages → Deploy from a branch → main → /root`

