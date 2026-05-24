# Bioacoustic Template Labeler

Aplicación web pura para marcar una plantilla acústica en un espectrograma y buscar similares acústicas por embeddings simples del patch espectral.

## Inicio rápido

Descomprime el ZIP y sirve la carpeta con un servidor local. Por ejemplo, con Python/Conda:

```bash
cd bioacoustic-template-labeler-wizard-v8
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
