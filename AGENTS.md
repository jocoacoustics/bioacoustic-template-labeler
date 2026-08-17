# AGENTS.md — Reglas obligatorias de mantenimiento

Este archivo contiene las **reglas obligatorias para cualquier agente, LLM o desarrollador que modifique Bioacoustic Template Labeler**. Debe leerse antes de editar código.

Un cambio **no se considera terminado** hasta cumplir la sección **Definition of Done**.

## 1. Identidad del proyecto

- Proyecto: **Bioacoustic Template Labeler**.
- Versión estable de referencia de este documento: **v48.2**.
- Tipo: aplicación web estática/local.
- Objetivo: seleccionar plantillas acústicas sobre espectrogramas, buscar patrones similares, revisar coincidencias y exportar resultados.
- Filosofía: procesamiento local, arquitectura explícita, comportamiento reproducible y fundamento matemático documentado.

## 2. Fuentes de verdad

Cada archivo tiene una responsabilidad documental distinta. No duplicar innecesariamente contenido.

| Fuente | Responsabilidad |
|---|---|
| `index.html`, `styles.css`, `src/*.js` | Comportamiento real del software |
| `README.md` | Qué es, inicio rápido, capacidades principales y estructura pública |
| `documentacion.html` | Manual completo, arquitectura, algoritmos y fundamento matemático |
| `CHANGELOG.md` | Historial canónico de versiones |
| `AGENTS.md` | Reglas obligatorias para mantener y modificar el proyecto |

Cuando haya discrepancias, **el código actual define el comportamiento real**, pero la discrepancia debe corregirse antes de entregar la versión.

## 3. Arquitectura actual

```text
index.html
   │
   ├── styles.css
   │
   └── src/app.js
          │
          ├── audio-worker.js
          │      └── análisis, plantillas, búsqueda y scores
          │
          ├── perch-worker.js
          │      └── Perch2 ONNX local, embeddings y barrido temporal
          │
          ├── visual-worker.js
          │      └── STFT visual, overview y teselas
          │
          └── colormaps.js
                 └── representación cromática visual
```

### Visor multirresolución

La arquitectura visual actual incluye:

```text
Audio
  ↓
overview completo
  ↓
timeline virtual
  ↓
teselas multirresolución
  ├── viewport visible: prioridad máxima
  ├── prefetch de reproducción
  ├── contexto cercano
  └── calentamiento en background
  ↓
fallback a la mejor resolución disponible
```

No reemplazar esta arquitectura por un canvas completo cuyo ancho crezca directamente con el zoom.

## 4. Invariantes obligatorias

Estas reglas no deben romperse salvo decisión explícita del responsable del proyecto.

### 4.1 Procesamiento local

1. El procesamiento principal debe continuar ejecutándose localmente en el navegador.
2. No introducir un backend como requisito de funcionamiento sin decisión explícita.
3. No subir audio del usuario a servicios externos de forma implícita.

### 4.2 Separación análisis ↔ visualización

4. El motor visual y el motor analítico son independientes.
5. Cambiar cualquiera de los siguientes controles **no puede modificar los resultados analíticos de búsqueda**:
   - paleta;
   - brillo;
   - contraste;
   - gamma;
   - altura;
   - zoom temporal;
   - zoom frecuencial;
   - escala visual Lineal/Mel/Logarítmica;
   - FFT configurada exclusivamente para visualización;
   - detalle temporal exclusivamente visual.
6. Una mejora visual no autoriza modificar scores, embeddings, ROI, plantillas o resultados salvo que el cambio lo requiera explícitamente.

### 4.3 Visor

7. No sustituir el timeline virtual por canvases gigantes.
8. El canvas físico del espectrograma debe permanecer acotado aproximadamente al viewport visible.
9. El visor **no debe quedar en blanco** mientras espera una tesela de mayor resolución. Debe mostrar overview o la mejor tesela disponible.
10. El zoom profundo debe solicitar/recalcular detalle espectral cuando corresponda; no debe limitarse a ampliar píxeles de una imagen de baja resolución.
11. La reproducción de audio nunca debe bloquearse esperando al motor visual.
12. El prefetch debe priorizar la región visible y la dirección de reproducción antes que cálculos de background.
13. Los títulos y reglas de tiempo/frecuencia deben permanecer estables durante zoom y desplazamiento.
14. La geometría del visor no debe saltar cuando aparece el scrollbar horizontal.

### 4.4 Plantillas y muestras

15. **Plantilla**, **muestra** y **coincidencia** son entidades conceptualmente distintas.
16. Agregar una muestra a una plantilla multimuestra no debe crear una nueva plantilla.
17. Ejecutar o repetir una búsqueda no debe crear plantillas accidentalmente.
18. Cada plantilla debe conservar independientemente:
   - etiqueta;
   - color;
   - ROI/soporte;
   - muestras;
   - método de plantilla;
   - método de comparación;
   - parámetros de búsqueda;
   - resultados;
   - cachés aplicables.
19. La vista previa debe representar la plantilla efectiva y respetar su proporción temporal/frecuencial.
20. En modo multimuestra, la vista previa debe representar el soporte/plantilla compuesta, no limitarse a la primera muestra.

### 4.5 Búsqueda Perch2

21. Perch2 es un **segundo motor analítico**; no sustituye ni modifica la búsqueda clásica de `audio-worker.js`.
22. La inferencia Perch2 debe ejecutarse localmente en el navegador mediante `perch-worker.js`; no introducir un servidor CPU/GPU como requisito.
23. La plantilla activa alimenta ambos motores, pero Perch2 usa una referencia simple: si la plantilla es multimuestra se usa **exclusivamente `samples[0]`**.
24. La configuración Perch2 pertenece a cada plantilla y debe persistir independientemente al navegar entre plantillas.
25. `Automático` es el modo Perch2 predeterminado y usa la banda frecuencial de la referencia usada por Perch2; `Audio completo` omite filtrado previo y `Banda de frecuencias` permite un rango manual.
26. El control dual `fmin/fmax` usa coordenada Mel solo para mejorar la interacción. Antes del filtrado, sus posiciones deben convertirse de nuevo a Hz; no confundir esta escala UX con la escala visual del espectrograma.
27. Cambiar plantilla, muestras, geometría, modo de señal, banda manual o paso temporal invalida candidatos Perch2. Cambiar score coseno, ajuste de bordes, separación entre huellas, padding o exclusión de plantilla solo reconstruye/refiltra eventos existentes y **no debe recalcular embeddings**.
28. Los resultados clásicos y Perch2 se conservan por separado dentro de la plantilla y se combinan únicamente para visualización/exportación en `Resultados`.
29. El coseno Perch2 debe conservar su dominio matemático real `[-1,1]`. El ajuste temporal debe aprovechar el perfil de coseno de las ventanas desplazadas; no eliminar ventanas antes de analizar picos, valles y ancho temporal.


### 4.6 Convenciones de frecuencia y filtros posteriores

30. Toda frecuencia visible expresada en **kHz** debe mostrarse con exactamente **tres decimales**.
31. En interfaz usar **Frecuencia mínima** y **Frecuencia máxima**; reservar `fmin` y `fmax` para código, fórmulas y documentación técnica.
32. Un parámetro posterior al cálculo no debe volver a ejecutar el motor si todos los datos necesarios ya están disponibles en caché. En particular, **Score mínimo** de la búsqueda clásica debe refiltrar el pool calculado cuando exista.
33. En Perch2, una ventana de 5 s es una unidad de inferencia, no necesariamente una detección final. La secuencia de cosenos debe tratarse como un **perfil temporal**: máximos locales son huellas candidatas y la profundidad de los valles decide si se unen o separan.
34. Para un pico con ventana del modelo de longitud `L` y soporte temporal del perfil de ancho `W`, el refinamiento usa el encajado de las ventanas extremas, equivalente a `D ≈ L − W`. La duración final nunca debe ser menor que el **ancho temporal de la plantilla usada realmente por Perch2** (plantilla simple o `samples[0]`). El Paso temporal `Δ` representa la resolución de muestreo/incertidumbre del perfil y **no** es un ancho mínimo. Si existe una sola ventana válida, no inventar un refinamiento más preciso: conservar 5 s, salvo que la plantilla sea más larga.
35. `Audio completo` de Perch2 no implica localización frecuencial. La UX y exportación deben distinguir entre rango frecuencial localizado y no localizado.
36. En modo `Automático`, el rango analítico debe derivarse en cada búsqueda de la ROI de referencia usada por Perch2 (plantilla simple o `samples[0]`); el panel manual de banda permanece oculto.

### 4.7 Responsive y UX

37. La interfaz debe funcionar correctamente en escritorio al **100 % de zoom del navegador**.
38. El panel derecho debe continuar siendo redimensionable y sus controles deben reorganizarse de forma responsive.
39. Evitar scrolls globales redundantes; usar scroll únicamente donde tenga función real.
40. Un cambio exclusivamente de estilo debe ser lo más localizado posible.
41. No reescribir componentes estables si una corrección quirúrgica resuelve el problema.

## 5. Política de cambios

Antes de modificar una función estable:

1. identificar qué comportamiento actual depende de ella;
2. determinar el alcance exacto solicitado;
3. preferir cambios localizados;
4. conservar APIs/estado interno cuando sea razonable;
5. probar regresiones después del cambio.

### Regla de preservación

**Preservar primero, modificar después.**

Ejemplos:

- corregir un icono → no tocar `audio-worker.js`;
- mejorar responsive → no cambiar scores;
- optimizar el visor → no cambiar semántica de plantillas;
- agregar una métrica → no alterar las métricas existentes sin motivo documentado.

## 6. Matemática y algoritmos

La matemática forma parte de la documentación esencial del proyecto y **no debe eliminarse para hacer la documentación más breve**.

Cuando se agregue o cambie un algoritmo, transformación, métrica o estimador:

1. documentar su propósito;
2. incluir formulación matemática cuando corresponda;
3. definir variables y unidades;
4. explicar el efecto práctico;
5. indicar explícitamente si afecta:
   - visualización;
   - análisis;
   - construcción de plantilla;
   - búsqueda;
   - score;
   - resultados;
6. actualizar `documentacion.html` en la misma versión.

## 7. Política de versiones

Toda entrega debe tener un número de versión coherente.

Orientación:

- corrección o refinamiento menor: `45.8.3 → 45.8.4`;
- capacidad relevante dentro de la misma línea: evaluar `45.8.x → 45.9`;
- cambio mayor de arquitectura/producto: evaluar incremento mayor antes de implementarlo.

### Lugares que deben coincidir

Al cambiar de versión, revisar como mínimo:

- nombre de la carpeta/ZIP;
- `<title>` de `index.html`;
- etiqueta visible de versión;
- query de cache-busting de `styles.css`;
- query de cache-busting de `src/app.js`;
- query de cache-busting de `src/colormaps.js`;
- `README.md`;
- `CHANGELOG.md`;
- `documentacion.html` cuando muestre la versión actual;
- `AGENTS.md` si su referencia de versión estable cambia en una entrega documental importante.

**Nunca entregar un ZIP cuyo nombre de versión no coincida con la versión visible de la aplicación.**

## 8. Mantenimiento obligatorio de documentación

### 8.1 `CHANGELOG.md` — siempre

Toda versión entregada debe tener una entrada en `CHANGELOG.md`.

Registrar solo categorías aplicables:

```text
## vX.Y.Z — YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Documentation
- ...
```

No borrar el historial anterior al crear una nueva versión.

### 8.2 `documentacion.html` — cuando cambia comportamiento o técnica

Actualizar obligatoriamente si cambia cualquiera de estos puntos:

- interfaz o flujo relevante para el usuario;
- parámetros;
- algoritmo;
- matemática;
- método de comparación;
- método de plantilla;
- arquitectura del visor;
- caché/rendimiento;
- exportaciones;
- atajos;
- limitaciones;
- solución de problemas.

La documentación debe describir **el estado actual del software**, no obligar al usuario a reconstruirlo leyendo notas de versiones antiguas.

Las versiones antiguas pertenecen a **Control de cambios / Historial anterior**.

### 8.3 `README.md` — mantener corto

Actualizar cuando cambie:

- instalación/ejecución;
- flujo principal;
- capacidades principales;
- estructura pública del repositorio;
- formatos de entrada/salida;
- requisito importante para empezar.

No convertir el README en changelog ni manual técnico.

### 8.4 `AGENTS.md` — actualizar reglas, no novedades

Modificar cuando aparezca:

- una nueva invariante;
- una nueva responsabilidad arquitectónica;
- una nueva obligación de mantenimiento;
- un nuevo paso obligatorio de validación.

No usar `AGENTS.md` para enumerar pequeñas novedades de cada versión.

## 9. Checklist de regresión

Ejecutar lo que aplique al alcance. Para cambios de arquitectura o entregas grandes, ejecutar el checklist completo.

### Carga

- [ ] Servir mediante HTTP local.
- [ ] Abrir sin errores JavaScript de inicialización.
- [ ] Cargar un audio.
- [ ] Construir el espectrograma.

### Visor

- [ ] Ver todo.
- [ ] Zoom temporal.
- [ ] Zoom temporal profundo/extremo.
- [ ] Zoom frecuencial.
- [ ] Zoom combinado.
- [ ] Regla temporal y regla frecuencial.
- [ ] Lineal / Mel / Logarítmica.
- [ ] Cambiar paleta.
- [ ] Brillo / contraste / gamma.
- [ ] Reproducir mientras existe zoom profundo.
- [ ] Confirmar ausencia de regiones blancas durante playback.
- [ ] Confirmar que el espectrograma no cambia de tamaño al primer zoom.
- [ ] Verificar seguimiento del cursor.

### Plantillas

- [ ] Dibujar ROI.
- [ ] Confirmar que preview aparece solo cuando existe una selección válida.
- [ ] Crear/agregar plantilla.
- [ ] Eliminar plantilla.
- [ ] Navegar entre varias plantillas.
- [ ] Activar varias muestras.
- [ ] Agregar/quitar muestras.
- [ ] Cambiar método de plantilla.
- [ ] Verificar preview compuesto.

### Búsqueda

- [ ] Ejecutar búsqueda.
- [ ] Tras buscar, mover Score mínimo y confirmar redibujo inmediato sin nuevo cálculo del worker.
- [ ] Cambiar método de comparación.
- [ ] Autoajuste Ninguno/Conservador/Balanceado/Sensible.
- [ ] Repetir búsqueda sin crear plantilla nueva.
- [ ] Verificar cajas y tabla.

### Búsqueda Perch2

- [ ] Confirmar `Automático` como modo predeterminado y verificar que toma la banda de la muestra usada por Perch2.
- [ ] Confirmar que `Audio completo` no filtra y que `Banda de frecuencias` despliega el panel manual Frecuencia mínima/Frecuencia máxima.
- [ ] Comprobar que la barra dual usa Mel para interacción y devuelve Hz correctos.
- [ ] En multimuestra, comprobar que la referencia usada es la primera muestra (#1), también para el rango automático.
- [ ] Ejecutar Perch2 con WebGPU cuando esté disponible y verificar fallback WASM.
- [ ] Verificar progreso y cancelación.
- [ ] Cambiar score, Ajuste de bordes, Separación entre huellas y padding después de buscar y confirmar que no se recalculan embeddings.
- [ ] Confirmar que un perfil con un pico ancho puede producir una caja estrecha y que una sola ventana conserva sus 5 s.
- [ ] Confirmar que dos picos separados por un valle profundo se convierten en dos huellas y que el control Unir ↔ Separar modifica ese criterio sin recalcular embeddings.
- [ ] Confirmar que la duración refinada nunca sea menor que el ancho temporal de la plantilla usada por Perch2.
- [ ] Confirmar que cambiar el Paso temporal modifica la resolución del perfil, pero no impone el ancho mínimo de la caja.
- [ ] Confirmar que el centro refinado coincide con el punto medio de los cruces del soporte, salvo recorte por límites reales del audio.
- [ ] Confirmar que `Resultados` combina búsqueda clásica y Perch2 con columna método.
- [ ] Cambiar de plantilla y volver: la configuración Perch2 debe conservarse por plantilla.

### Exportaciones

- [ ] CSV.
- [ ] XLSX.
- [ ] TXT Audacity.

### Responsive

- [ ] Escritorio al 100 %.
- [ ] Ancho lateral por defecto.
- [ ] Reducir ancho del panel lateral.
- [ ] Confirmar que campos y botones se reorganizan sin desbordarse.
- [ ] Comprobar viewport estrecho/móvil cuando el cambio afecte responsive.

## 10. Validaciones automáticas mínimas antes de empaquetar

Ejecutar como mínimo:

```bash
node --check src/app.js
node --check src/audio-worker.js
node --check src/perch-worker.js
node --check src/visual-worker.js
node --check src/colormaps.js
```

Además:

- comprobar que no existan IDs HTML duplicados;
- comprobar que los recursos referenciados existan;
- comprobar que el HTML de la versión apunte a los recursos con el cache-busting correcto;
- comprobar que `README.md`, `CHANGELOG.md`, `documentacion.html` y `AGENTS.md` estén presentes.

## 11. Definition of Done — OBLIGATORIA

Una nueva versión solo está lista cuando:

- [ ] El cambio solicitado está implementado.
- [ ] El alcance no se expandió innecesariamente.
- [ ] Las invariantes relevantes siguen cumpliéndose.
- [ ] JavaScript pasa chequeo de sintaxis.
- [ ] No hay IDs HTML duplicados.
- [ ] El flujo afectado fue probado.
- [ ] La versión visible fue actualizada.
- [ ] El cache-busting fue actualizado.
- [ ] `CHANGELOG.md` tiene la nueva versión.
- [ ] `documentacion.html` fue actualizado si cambió comportamiento/técnica.
- [ ] `README.md` fue actualizado si cambió información de entrada al proyecto.
- [ ] `AGENTS.md` fue actualizado si apareció una nueva regla arquitectónica.
- [ ] El ZIP/carpeta final usa exactamente el número de versión correcto.

## 12. Instrucción para agentes futuros

Antes de entregar una modificación, informar brevemente:

1. qué cambió;
2. qué archivos fueron modificados;
3. qué validaciones se ejecutaron;
4. si se actualizó documentación/changelog;
5. qué áreas funcionales se mantuvieron intencionalmente intactas.

Si una solicitud entra en conflicto con una invariante de este documento, **no ignorar silenciosamente la invariante**: explicar el conflicto y resolverlo explícitamente antes de cambiar la arquitectura.
