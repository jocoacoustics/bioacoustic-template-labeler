# AGENTS.md — Reglas obligatorias de mantenimiento

Este archivo contiene las **reglas obligatorias para cualquier agente, LLM o desarrollador que modifique Bioacoustic Template Labeler**. Debe leerse antes de editar código.

Un cambio **no se considera terminado** hasta cumplir la sección **Definition of Done**.

## 1. Identidad del proyecto

- Proyecto: **Bioacoustic Template Labeler**.
- Versión estable de referencia de este documento: **v45.8.4**.
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

### 4.5 Responsive y UX

21. La interfaz debe funcionar correctamente en escritorio al **100 % de zoom del navegador**.
22. El panel derecho debe continuar siendo redimensionable y sus controles deben reorganizarse de forma responsive.
23. Evitar scrolls globales redundantes; usar scroll únicamente donde tenga función real.
24. Un cambio exclusivamente de estilo debe ser lo más localizado posible.
25. No reescribir componentes estables si una corrección quirúrgica resuelve el problema.

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
- [ ] Cambiar método de comparación.
- [ ] Autoajuste Ninguno/Conservador/Balanceado/Sensible.
- [ ] Repetir búsqueda sin crear plantilla nueva.
- [ ] Verificar cajas y tabla.

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
