# Changelog

Historial canónico de versiones de **Bioacoustic Template Labeler**.

## v45.8.4 — 2026-08-16

### Changed
- La vista previa de plantilla permanece oculta mientras no exista una selección/ROI válida y aparece únicamente cuando existe contenido real que mostrar.
- El bloque de definición de plantilla aprovecha todo el ancho mientras el preview está oculto.

### Documentation
- README reescrito como entrada breve al proyecto.
- Documentación completa reorganizada por uso, controles, matemática, arquitectura, mantenimiento e historial.
- Buscador local incorporado en la barra lateral de `documentacion.html`.
- Nuevo `AGENTS.md` con invariantes, política de versiones, actualización documental, checklist de regresión y Definition of Done.
- Nuevo `CHANGELOG.md` como historial canónico independiente del README y del manual.

## v45.8.3 — 2026-08-16

### Fixed
- Se eliminaron los rótulos redundantes `[kHz]` y `[s]` del preview; las unidades permanecen incorporadas en las etiquetas finales de los ejes internos.

## v45.8.2 — 2026-08-16

### Changed
- Refinamiento del etiquetado interno del preview de plantilla.
- La última etiqueta de frecuencia muestra la unidad `kHz` y la última temporal muestra `s`.
- Se evita el solapamiento de etiquetas en el origen suprimiendo la primera etiqueta temporal cuando compite con la etiqueta inferior de frecuencia.

## v45.8.1 — 2026-08-16

### Changed
- La vista previa preserva mejor la proporción temporal/frecuencial de la ROI o plantilla compuesta.
- Las reglas del preview pasan a marcas internas con texto negro en negrita y contorno blanco.
- El eje temporal del preview usa tiempo relativo desde cero hasta la duración de la plantilla efectiva.
- En multimuestra, el soporte del preview evoluciona con la composición de las muestras.

## v45.8 — 2026-08-16

### Added
- Timeline virtual para zoom temporal extremo sin crear canvases gigantes.
- Zoom temporal de hasta `100 000 px/s` con control logarítmico.
- Cola priorizada de teselas y prefetch predictivo durante reproducción.
- Fallback multirresolución: el visor utiliza overview o la mejor tesela disponible mientras llega el detalle solicitado.
- Precarga ligera en background de una resolución intermedia.
- Gestión de caché visual con presupuesto aproximado de 160 MB.
- STFT visual adaptativa según el balance entre zoom temporal y frecuencial.

### Changed
- El canvas físico del espectrograma permanece acotado al viewport y se repinta sobre una coordenada temporal virtual.
- Los niveles de detalle visual se recalculan bajo demanda en lugar de ampliar una imagen de baja resolución.

### Preserved
- Motor analítico de plantillas y búsqueda independiente del visor.
- Flujo multi-plantilla, multimuestra, búsqueda, resultados y exportaciones.

## v45.7.4 — 2026-08-16

### Added
- Mayor profundidad de zoom temporal y frecuencial.
- Etiquetas adaptativas en reglas, frecuencia con tres decimales en kHz.
- Panel lateral reducible a anchos menores con reorganización responsive.
- Marcas internas en la vista previa de plantilla.

### Changed
- Mejor selección de resolución visual durante zoom profundo.

## v45.7.3 — 2026-08-16

### Fixed
- Eliminado scroll global vertical redundante en escritorio.
- Reservado permanentemente el espacio del scrollbar horizontal del espectrograma para evitar saltos de geometría.
- Títulos de tiempo/frecuencia mantenidos durante desplazamiento y zoom.
- Reproductor más compacto.
- Icono de exportación TXT reemplazado por icono de archivo de texto.

## v45.7.2 — 2026-08-16

### Added
- Panel lateral redimensionable mediante separador de arrastre y persistencia del ancho.

### Fixed
- Reglas temporal/frecuencial más compactas.
- Mejor alineación de títulos y etiqueta 0 de frecuencia.
- Preview de plantilla restringido para evitar desbordamiento.
- Autoajuste en una sola fila cuando el ancho disponible lo permite.

## v45.7.1 — 2026-08-16

### Fixed
- Refinamiento de reglas y marcas del espectrograma.
- Conservación del inicio temporal durante los primeros niveles de zoom.
- Icono de contraste canónico.

## v45.7 — 2026-08-16

### Changed
- Consolidación visual de reglas, preview, controles y exportaciones.
- Guía contraída por defecto.
- Mejor comportamiento del primer zoom para evitar redimensionamientos del visor.
- Preview proporcional y progreso de construcción de plantilla compuesta.

## v45.6.1 — 2026-08-16

### Fixed
- Corrección crítica de inicialización: `syncPalettePicker()` se ejecutaba antes de inicializar `PALETTE_LABELS`, provocando un `ReferenceError` y abortando el registro de eventos.
- Añadido cache-busting explícito para evitar mezcla de recursos entre versiones ejecutadas en `localhost`.

## v45.6 — 2026-08-16

### Changed
- Rediseño visual amplio de acordeones y configuración del espectrograma.
- Selector de paletas con muestras de color.
- Mejor separación entre acciones de muestras y acciones de plantillas.
- Reorganización responsive del panel Plantilla, Búsqueda y Resultados.

### Known issue
- La primera entrega de v45.6 presentó una regresión de inicialización corregida en v45.6.1.

## v45.x — consolidación del visor

- Separación formal entre motor analítico y visualización.
- Visor multirresolución con overview y teselas de detalle.
- Escalas Lineal, Mel y Logarítmica exclusivamente visuales.
- Paletas avanzadas, brillo, contraste y gamma.
- Navegación mediante Ver todo, zoom, reglas y seguimiento de reproducción.
- Reproductor compacto propio y playhead refinado.

## v43 — base funcional consolidada

La línea v45 se construyó preservando el flujo funcional de v43:

- carga y decodificación local de audio;
- espectrograma;
- ROI;
- plantillas;
- búsqueda;
- resultados;
- reproducción;
- exportaciones.

## Historial anterior

### v42
- Correlación 2D multi-escala con pequeñas variaciones controladas de escala temporal/frecuencial y penalización por deformación.

### v41
- Correlación cruzada 2D con pequeños desplazamientos en tiempo y frecuencia.

### v39
- Correlación cruzada local con tolerancia temporal y penalización de desplazamientos.

### v38
- Caché persistente por método de plantilla compuesta y precalentamiento de la caché del worker.

### v37
- Conservación de previews compuestos por método para evitar recálculo innecesario cuando las muestras no cambian.

### v34
- Consenso NCC y consenso ponderado; consolidación de métodos de plantilla multimuestra.

### v31
- Vista previa visual de la plantilla compuesta.

### v30
- Simplificación UX de varias muestras y corrección del flujo de ajuste manual de búsquedas.

### v29
- Introducción de plantillas con varias muestras del mismo fonotipo.

### v19
- Búsqueda incremental: procesar plantillas nuevas conservando resultados de las anteriores.

### v18
- Simplificación del flujo plantilla → búsqueda y reorganización de la tabla de resultados.

### v11
- Métricas unificadas en score 0–1 e incorporación de correlación normalizada.

### v9
- Etiqueta opcional para ROI y exportación TXT compatible con Audacity.
