# v45.8 — timeline virtual y zoom extremo

- Zoom temporal hasta **100 000 px/s** mediante un slider logarítmico.
- El canvas visual permanece del tamaño del viewport; el scrollbar usa una línea de tiempo virtual, evitando canvases gigantes.
- Durante reproducción el visor nunca queda en blanco: usa inmediatamente la mejor resolución ya disponible y sustituye el fallback cuando llega la tesela fina.
- Cola de teselas con prioridad: viewport actual → precarga hacia delante durante playback → contexto posterior/anterior → precarga media en background.
- STFT visual adaptativa: ventanas más cortas para zoom temporal profundo y mayor FFT cuando predomina el zoom frecuencial, con compromiso automático tiempo–frecuencia.
- Precarga ligera de resolución media sobre todo el audio después de mostrar la vista general.
- El motor analítico de plantillas/búsqueda permanece separado del visor.

# Hotfix v45.6.1

Corrige un fallo de inicialización de v45.6: el selector de paletas llamaba `syncPalettePicker()` antes de inicializar `PALETTE_LABELS`, provocando un `ReferenceError` y abortando el registro de eventos de la interfaz. Esta revisión mantiene las mejoras visuales de v45.6 y añade cache-busting en los recursos principales para evitar reutilizar JavaScript/CSS de builds anteriores en `localhost`.

# Bioacoustic Template Labeler

## Novedades v45.6 — UX consolidada, responsive y coherente

La v45.6 continúa la línea de v45 construida **directamente sobre v43**. Se conserva el flujo completo de plantillas, varias muestras, caché, métodos de comparación, autoajuste, resultados y exportaciones. La novedad es una capa visual multirresolución independiente inspirada en el visor del Buscador bioacústico v21.



### Mejora visual v45.6

- **Guía visual** con cuatro pasos y estado contextual del flujo.
- **Configuración del espectrograma** reorganizada por grupos, con iconos coherentes, sliders compactos, valores visibles y selector de paleta con mini degradados.
- El icono de **Gamma** representa una curva tonal no lineal; brillo, contraste, altura y zoom usan símbolos propios.
- **Vista previa de Plantilla** usa la misma escala visual, paleta, brillo, contraste y gamma del espectrograma. El mismo espacio representa la plantilla simple o la compuesta.
- **Multi-muestra** queda separada en una subtarjeta violeta con contador, método y acciones propias; agregar/quitar muestras ya no se confunde con agregar/quitar plantillas.
- **Plantilla responsive por ancho del panel**: campos + preview en dos columnas cuando caben; en panel estrecho o móvil, preview debajo. No requiere reducir el zoom del navegador.
- **Búsqueda** adopta autoajuste segmentado y acciones jerarquizadas; **Resultados** integra exportaciones con iconos, tabla compacta y frecuencias visibles en kHz.
- **Móvil funcional**: el espectrograma mantiene marcado táctil de ROI con el dedo; dentro del canvas el gesto de marcado no desplaza la página.
- Se preserva la reproducción estilo v43, el ancla de seguimiento ~40 %, los zooms por espectrograma/reglas, los métodos de búsqueda, cachés, autoajuste y exportaciones.

**Ajustes UX acumulados v45.1–v45.6:**

- El espectrograma calcula automáticamente su altura útil para mostrar el rango completo desde **0 Hz hasta Nyquist** sin depender del slider de altura. El slider queda como ajuste manual opcional; **Restablecer visualización** recupera el ajuste automático.
- El eje de frecuencia se compacta a una banda estrecha y el rótulo **Frecuencia (kHz)** puede ocupar ligeramente el borde del espectrograma.
- **Tiempo (s)** queda en la franja superior del eje temporal.
- La reproducción recupera la cinemática fluida de v43: el cursor avanza hasta aproximadamente el **40 %** del visor y, desde allí, permanece visualmente estable mientras el espectrograma se desplaza continuamente hacia la izquierda. Cerca del final, el espectrograma deja de desplazarse y el cursor completa el recorrido.
- **Ver todo** incorpora icono de encaje.
- El playhead recupera mayor presencia visual: centro rojo con halo blanco.
- Escalas visuales: **Lineal, Mel y Logarítmica**. Mel continúa siendo un remapeo visual del eje; no es un banco de filtros mel ni modifica el motor analítico. La escala logarítmica también es exclusivamente visual.
- El panel **Plantilla** se reorganiza al estilo del mockup: chips con flechas superiores, campos compactos, frecuencias mostradas en kHz, vista previa compuesta con metadatos, método y acciones de muestras más limpias.


**Mejora de reproducción v45.6:**

- Se eliminó el seguimiento por saltos, zonas seguras y throttling que hacían sentir que cursor y espectrograma competían entre sí.
- El seguimiento vuelve a actualizar `scrollLeft` en cada `requestAnimationFrame`, siguiendo la filosofía de v43.
- El ancla visual se fija aproximadamente al 40 % del ancho útil del espectrograma.
- El render multirresolución pinta un corredor por delante y detrás del viewport para que el desplazamiento durante playback no obligue a recalcular la imagen en cada frame.
- Las solicitudes de teselas durante reproducción se limitan y ocurren en segundo plano; el audio y el playhead nunca esperan al motor visual.
- El clic simple sobre el espectrograma continúa moviendo únicamente el cursor al instante exacto pulsado, sin recentrar la vista.
- La selección sobre las reglas temporal y frecuencial permanece visualmente explícita mediante una banda lineal azul mientras se arrastra.

**Corrección UX v45:** se eliminó la barra/miniatura inferior de navegación porque reducía demasiado el área útil y podía hacer parecer que el espectrograma estaba recortado. La vista ahora abre mostrando el audio completo, conserva el zoom avanzado y usa un reproductor compacto propio. La paleta inicial es **Magma clara**, una variante afinada con fondo marfil y energía coral–magenta–púrpura inspirada en el mockup final.

- **Vista general + teselas de detalle** según el zoom, caché LRU y precarga de teselas vecinas.
- **Zoom avanzado**: Ver todo, `+`, `−`, zoom rectangular tiempo–frecuencia, arrastre de la regla temporal y del eje de frecuencia.

- **Eje temporal científico arriba del espectrograma** con marcas mayores/menores, formato `0 … 55, 1:00, 1:05…` y etiqueta del playhead.
- **Eje de frecuencia en kHz** con encabezado horizontal `Frecuencia (kHz)` y marcas numéricas “bonitas” adaptadas al zoom.
- **Zoom sin márgenes negros**: el viewport se mantiene dentro del audio y la vista general actúa como fallback mientras llegan teselas de mayor detalle.
- **Anotaciones refinadas**: cajas ligeras, chips de etiqueta legibles y colores de fonotipos independientes de la paleta del espectrograma.
- **UX compacta de escritorio**: proporción aproximada 2/3 visor y 1/3 panel, iconografía SVG coherente por acordeón y tabla de resultados más densa.
- **Vista completa por defecto**: al cargar el audio se encaja toda la duración; el detalle aumenta con `+`, `−`, selección o las reglas.
- **Reproductor compacto propio** sincronizado con el playhead, sin la barra nativa del navegador.
- **Paletas**: Magma clara (por defecto), Magma invertida, Magma, Inferno invertida, Inferno, Plasma invertida, Plasma, Viridis invertida, Viridis, Cividis, Turbo, Hot, Grises y Grises invertidos.
- **Ajustes visuales**: contraste, brillo, gamma, FFT visual (Auto/1024/2048/4096/8192), detalle temporal y altura.
- **Escala**: Lineal, Mel y Logarítmica. Mel y Logarítmica son escalas de visualización; no transforman la matriz analítica.
- **Separación estricta análisis ↔ visualización**: cambiar zoom, paleta, gamma, brillo, contraste, Mel/Logarítmica, FFT visual, detalle o altura no recalcula ni invalida las plantillas y búsquedas de v43.
- **Atajos**: `0` Ver todo, `z` Zoom selección, `+`/`−` zoom, `Esc` salir del modo zoom, `Espacio` play/pausa y `←`/`→` salto de 1 s.

### Estructura del proyecto v45.6

```text
bioacoustic-template-labeler-wizard-v45.8/
├── index.html
├── styles.css
├── src/
│   ├── app.js            # UX, plantillas, búsqueda, resultados y navegación
│   ├── audio-worker.js   # motor analítico heredado de v43
│   ├── visual-worker.js  # FFT visual, vista general, teselas y multirresolución
│   └── colormaps.js      # paletas de visualización, incluidas variantes invertidas
├── documentacion.html
├── README.md
├── LICENSE
├── .nojekyll
└── assets/
```


Aplicación web pura para marcar una o varias plantillas acústicas, buscar coincidencias por similitud espectral y revisar resultados sobre un visor multirresolución. Todo el procesamiento base continúa en el navegador.

## Inicio rápido

Descomprime el ZIP y sirve la carpeta con un servidor local. Por ejemplo, con Python/Conda:

```bash
cd bioacoustic-template-labeler-wizard-v45.8
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


## Cambios v29

- Se agrega el modo **Usar varias muestras** para construir una plantilla compuesta por fonotipo.
- El modo está desactivado por defecto y se activa desde el panel **Plantilla**.
- Al activarlo, puedes agregar varias cajas como muestras de la misma plantilla y quitar la última muestra desde un subpanel específico.
- Se agrega selector de **Método de plantilla** para elegir cómo construir la plantilla compuesta.
- Para plantillas compuestas, el soporte frecuencial se estima con Q10/Q90 de las muestras y la duración se toma como la mayor duración observada.
- Las muestras se alinean primero por centroide de energía y luego por máxima similitud ponderada en zonas salientes.
- La búsqueda, el autoajuste, la tabla y las exportaciones siguen funcionando por plantilla/fonotipo.

### Actualización v30

- El modo **Usar varias muestras** queda como una opción simple de una sola línea.
- El subpanel de muestras solo aparece cuando ese modo está activo.
- Dentro del subpanel quedan el selector de **Estimador**, los botones **Agregar muestra** / **Quitar última muestra**, el resumen de muestras y una vista previa del soporte compuesto.
- Se corrige la búsqueda manual desde el panel **Búsqueda**: al ajustar score o separación y volver a buscar, no se crea un fonotipo nuevo accidentalmente.

### Actualización v31

- El control **Usar varias muestras** queda verdaderamente compacto en una sola línea.
- El subpanel de muestras muestra primero una vista previa de la **plantilla compuesta** que se va construyendo, no solo el soporte rectangular.
- La vista previa se actualiza al cambiar entre **mediana** y **promedio** y al agregar o quitar muestras.
- El estimador y los botones de muestra quedan debajo de la vista previa para mantener el flujo limpio.

### Actualización v34

- Se consolida la fase 1 de mejora algorítmica para **Usar varias muestras**.
- El selector **Método de plantilla** ofrece ahora cinco métodos:
  - **consenso NCC**: alinea las muestras por similitud ponderada y combina las zonas energéticas con un consenso robusto;
  - **consenso ponderado**: alinea las muestras y promedia dando más peso a las que mejor se alinean con la referencia;
  - **medoide**: usa la muestra real más representativa del conjunto;
  - **mediana alineada**: combina las muestras alineadas por mediana píxel a píxel;
  - **promedio alineado**: combina las muestras alineadas por promedio.
- Se elimina el método visual ambiguo **mejor coincidencia** del constructor de plantilla; ahora todos los métodos del selector producen una plantilla visual concreta.
- La vista previa muestra la plantilla efectiva según el método elegido. En **medoide**, muestra la muestra medoide real.
- README y documentación explican la función de similitud ponderada $\operatorname{Sim}_w$ y los métodos de consenso.


## Optimización de plantillas compuestas

La versión v35 agrega caché para las plantillas compuestas. Cuando se usan varias muestras, la app calcula la plantilla compuesta una sola vez por combinación de muestras, método y visualización. Si se vuelve al mismo método o se relanza la búsqueda sin cambiar las muestras, se reutiliza el resultado ya calculado.

Esto evita recalcular la alineación NCC, el consenso ponderado, la mediana o el medoide cada vez que se redibuja el panel o se ejecuta una búsqueda. Además, el panel de muestras muestra una barra de progreso pequeña durante la construcción de la plantilla compuesta.


### Optimización de plantillas compuestas

La versión v36 conserva en caché cada plantilla compuesta por combinación de muestras, método de plantilla y configuración visual. Si cambias entre `consenso NCC`, `consenso ponderado`, `medoide`, `mediana alineada` y `promedio alineado`, los métodos ya calculados se reutilizan sin recalcular. El caché solo se invalida cuando se agregan/quitan muestras, cambia el audio o cambia la configuración del espectrograma.

El método `medoide` usa una ruta rápida basada en embeddings 48×48 para escoger la muestra real más representativa, evitando la alineación NCC completa cuando no es necesaria. La búsqueda usa la plantilla compuesta ya cacheada en el worker y no debe reconstruirla en cada ventana candidata.


## Nota v37: caché por método de plantilla

Cuando se usa **Usar varias muestras**, cada método de plantilla ya calculado queda guardado en caché para la plantilla activa. Cambiar entre consenso NCC, consenso ponderado, medoide, mediana alineada y promedio alineado reutiliza la vista previa existente si las muestras y la configuración del espectrograma no cambiaron. El caché solo se invalida al agregar/quitar muestras, cambiar audio o reconstruir el espectrograma.

## Nota v38: caché persistente por método y precalentamiento del worker

La versión v38 corrige la gestión de caché de plantillas compuestas. Cada plantilla conserva una caché por método (`consenso NCC`, `consenso ponderado`, `medoide`, `mediana alineada`, `promedio alineado`) mientras no cambien las muestras ni la configuración del espectrograma. Cambiar de un método ya calculado a otro y volver al anterior debe mostrar la vista previa inmediatamente.

También se evita que el soporte compuesto mostrado en los campos se agregue accidentalmente como una nueva muestra al buscar coincidencias. La búsqueda reutiliza el conjunto real de muestras y precalienta la caché interna del worker para que, cuando ya se calculó una plantilla compuesta, el motor de búsqueda no tenga que reconstruirla innecesariamente.

## Nota v39: método de comparación por correlación cruzada

La versión v39 agrega **correlación cruzada** al selector de búsqueda, que ahora se llama **Método de comparación**. Este método aplica una NCC local sobre una representación reducida de la plantilla y de cada ventana candidata. En la opción **correlación cruzada** solo se permiten pequeños desplazamientos temporales; en la opción **correlación cruzada 2D** se permiten pequeños desplazamientos temporales y frecuenciales.

La diferencia frente a la correlación normalizada es que la correlación simple compara dos patches ya alineados, mientras que la correlación cruzada permite pequeñas desalineaciones internas. Puede ser más robusta, pero también puede tardar más que coseno/correlación/euclidiana.

Además, la vista previa de plantilla compuesta ahora usa el borde de color como marco externo del canvas, evitando que el borde tape píxeles importantes de la plantilla visualizada.


## Nota v41: correlación cruzada 2D

La versión v41 retira **coseno cruzado** porque no aportó mejoras consistentes y agrega **correlación cruzada 2D** como método de comparación.

La comparación queda separada así:

- **correlación cruzada**: prueba pequeños desplazamientos internos en tiempo.
- **correlación cruzada 2D**: prueba pequeños desplazamientos internos en tiempo y frecuencia.

Para una plantilla reducida `P` y una ventana candidata reducida `Q`, la correlación cruzada 2D evalúa:

```text
score = max NCC(P, shift(Q, Δt, Δf)) × penalización(Δt, Δf)
```

Los desplazamientos se mantienen pequeños para no volver el método demasiado permisivo. La penalización reduce el score cuando la mejor coincidencia exige mover demasiado la ventana. El score final sigue normalizado entre 0 y 1 para conservar la compatibilidad con el autoajuste de picos/islas.

## Nota v42: correlación 2D multi-escala

La versión v42 agrega **correlación 2D multi-escala** como método de comparación avanzado. Este método extiende la correlación cruzada 2D: además de probar pequeños desplazamientos en tiempo y frecuencia, prueba pequeñas variaciones globales de duración y escala frecuencial.

No es un warping tiempo-frecuencia libre. Es una aproximación controlada: usa pocas escalas cercanas a 1 y penaliza tanto los desplazamientos como las deformaciones para evitar que el método se vuelva demasiado permisivo.

```text
score = max NCC(P, transform(Q, escala_t, escala_f, Δt, Δf)) × penalización
```

La escala del score se mantiene entre 0 y 1, por lo que sigue siendo compatible con el autoajuste de picos/islas y con el mismo control de score mínimo.


## Autoajuste por perfil

La versión v43 reemplaza el antiguo casillero de autoajuste por un selector con cuatro perfiles:

- **Ninguno:** usa exactamente el score mínimo y la separación entre ventanas definidos manualmente.
- **Conservador:** prioriza pocas coincidencias de alta confianza; corresponde al comportamiento más estricto usado en versiones previas.
- **Balanceado:** perfil recomendado por defecto para la primera búsqueda de cada plantilla; usa picos/islas, prominencia local y límites adaptativos para aumentar sensibilidad sin volver a cientos de cajas.
- **Sensible:** acepta más candidatos cuando hay picos prominentes, útil para exploración.

Cada plantilla nueva arranca con **Balanceado**. Después de su primera búsqueda, el perfil pasa automáticamente a **Ninguno** para que el usuario pueda ajustar manualmente el score mínimo y la separación entre ventanas. Cuando el perfil no es Ninguno, los controles manuales se muestran como referencia, pero quedan bloqueados porque serán calculados al buscar.

El modo experto permite ajustar límites internos como mínimo objetivo de candidatos, máximo automático, prominencia mínima y agrupamiento temporal. Estos parámetros se guardan por plantilla y se envían al worker solo cuando el modo experto está activado.
