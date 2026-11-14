# Manual de Forma

[English](manual.md)

Forma convierte imágenes en modelos 3D en tu propio equipo. No se sube nada: la generación, los proyectos y los archivos se quedan en local.

## Instalación

Descarga el instalador de tu sistema desde la [página de versiones](https://github.com/jscode-es/forma/releases): `.exe` para Windows, `.dmg` para macOS (Apple Silicon), `.AppImage` o `.deb` para Linux. Los instaladores aún no están firmados, así que SmartScreen de Windows y Gatekeeper de macOS piden confirmación la primera vez (en macOS: clic derecho → Abrir).

## El estudio

| Zona | Qué hace |
| --- | --- |
| Barra superior | Nombre del proyecto, indicador de cambios sin guardar (punto morado), Nuevo, Guardar proyecto (Ctrl+S) |
| Menú izquierdo | Crear 3D, Crear animación, Exportar; Referencias debajo del menú principal con las pestañas Desde texto, Una vista y Multivista; el objeto de la escena; Biblioteca, Modelos, Ayuda y Ajustes |
| Visor | La vista 3D. Arrastra para orbitar, rueda para acercar, botón derecho para desplazar. Vistas Material, Sólido y Malla, cámaras predefinidas, encuadre y cuadrícula |
| Panel inferior | Versiones, Cola de trabajos, Proceso (entradas, parámetros, archivos y registro de cada trabajo) y Línea de tiempo |
| Inspector | Cambia según la sección del menú izquierdo. Crear 3D: Crear, Modelo, Acabado, Edición. Crear animación: Captura, Esqueleto, Clips, Personaje. Exportar: Archivos, Intercambio. El buscador busca dentro de la sección actual; las flechas del teclado cambian de pestaña |
| Barra de estado | GPU y VRAM, motores disponibles, versión |

Cada proyecto nuevo empieza con un cubo de 1 m. Se recuerdan los proyectos, los ajustes y la disposición de los paneles; al arrancar se abre el último proyecto.

## Activar un motor

Forma incluye los motores que admite, pero los activas tú, porque sus licencias son entre tú y sus autores.

1. Abre **Modelos** (menú izquierdo) → **Motores**.
2. Pulsa **Activar** en el motor (por ejemplo Hunyuan3D 2.0). Revisa los requisitos: GPU NVIDIA con CUDA y VRAM suficiente, Python 3.11, Git si el plugin descarga código, espacio en disco.
3. Lee las licencias, marca **He leído y acepto estas licencias** y pulsa **Aceptar y activar**.
4. Forma descarga el código del motor en una versión fija, prepara su entorno de Python (varios GB la primera vez), lo verifica y descarga los pesos del modelo. Ves el progreso y las últimas líneas de salida, y puedes cancelar.

Avanzado: si ya tienes un entorno de Python con los paquetes necesarios, marca **Usar un entorno de Python existente** y elige su ejecutable `python`.

La pestaña **Pesos** lista los archivos de modelo con tamaño, licencia, revisión y estado. Verificar recalcula los SHA-256, Reparar descarga solo lo dañado y Buscar actualizaciones solo informa de versiones nuevas.

Hunyuan3D 2.0 tiene licencia de Tencent y no se aplica en la Unión Europea, el Reino Unido ni Corea del Sur.

## Crear un modelo desde una imagen

1. En **Referencias > Una vista**, pulsa la tarjeta o arrastra una imagen desde una carpeta sobre ella. Se admiten PNG, JPG y WebP (hasta 20 MB y 16 megapíxeles).
2. Opcional: haz clic derecho en la tarjeta y elige **Quitar fondo**. **Usar la imagen sin fondo** en ese menú permite elegir la versión utilizada.
3. En **Crear 3D → Crear → Motor de generación**, elige el motor (el engranaje abre el gestor de modelos). La calidad (Rápida, Equilibrada, Alta) fija 15, 30 o 50 pasos; su engranaje personaliza los pasos de cada perfil. Los ajustes del motor (semilla, guía, resolución) se guardan con el proyecto.
4. Opcional: **Escala física** ajusta el resultado a una altura en metros.
5. Pulsa **Generar modelo**. El trabajo aparece en **Cola de trabajos**; **Proceso** muestra el progreso, las imágenes preparadas y el registro.

En una RTX 5070 (12 GB), Hunyuan3D 2.0 tarda unos 2 minutos con 30 pasos.

## Crear un modelo desde texto

1. Activa un motor de imagen, como **SDXL-Lightning**, en **Modelos → Motores**.
2. En **Referencias → Desde texto → Prompt**, describe un objeto y elige el motor de imagen. *Imágenes* fija cuántas candidatas obtienes y *Semilla* las hace reproducibles; la candidata *n* usa semilla + *n*.
3. Pulsa **Generar imágenes** (o Ctrl+Enter en el prompt). Las candidatas aparecen bajo el prompt.
4. Pulsa la candidata que te guste: se convierte en la referencia, con su prompt y su semilla.
5. Pulsa **Continuar en Crear 3D** y sigue como en [Crear un modelo desde una imagen](#crear-un-modelo-desde-una-imagen), desde el paso 3.

El **Historial de prompts** guarda todos los prompts del proyecto con los ajustes del motor y la semilla. **Reutilizar** recupera el prompt y los ajustes para repetirlo o variarlo.

## Varias vistas y revisión de referencias

1. Abre **Referencias > Multivista**. La cuadrícula de dos columnas reserva un espacio para las imágenes frontal, trasera, izquierda, derecha y superior opcional, cada una con su icono de cara. Pulsa una tarjeta o arrastra una imagen sobre ella para añadir o sustituir esa vista. El clic derecho permite quitar el fondo, elegir la imagen preparada, reasignar o eliminar. Asignar una vista ocupada intercambia las dos imágenes.
2. Quita el fondo de cada imagen. **Revisión de referencias** comprueba los límites de las siluetas transparentes: avisa si la ocupación vertical difiere más del 15 % o la proporción de vistas opuestas difiere más del 25 %. Son avisos aproximados; un fondo opaco impide revisar la silueta de forma fiable.
3. **Igualar alturas de referencias** crea imágenes preparadas cuadradas de 1024 px con la misma altura del objeto, conservando proporciones y originales. La altura común se reduce cuando es necesario para encajar siluetas anchas sin recortarlas; la vista superior se excluye. El interruptor de imagen preparada permite recuperar el original.
4. Activa **Hunyuan3D 2 MV** en Modelos y selecciónalo en **Crear 3D > Crear**. Utiliza entre una y cuatro vistas laterales con nombre; no admite la superior. El inspector indica las vistas admitidas. Los motores de una sola imagen utilizan la frontal o la primera disponible. Se conservan las asignaciones al guardar y reintentar trabajos.
5. En **Crear 3D > Edición > Proyección de referencia**, elige una referencia. Una cámara ortográfica fija superpone la imagen sobre la malla. Ajusta opacidad, escala uniforme y desplazamientos; Restablecer alineación recupera los valores iniciales. **Detener proyección** restaura la órbita. La alineación dura durante la sesión actual; no modifica geometría, materiales ni exportaciones.

El plugin MV incluye código fijado y pesos con sumas de verificación. La inferencia con GPU de este nuevo adaptador sigue pendiente de una prueba con el modelo real; el flujo de Electron se prueba con el motor de demostración.

## Versiones

Cada resultado es una versión nueva. Lo generado y lo optimizado se abre en **Vista previa**:

- **Comparar** muestra la versión activa en la misma vista.
- **Aplicar** convierte la vista previa en la versión activa.
- **Descartar** elimina una candidata sin guardar.

La pestaña **Versiones** lista todas las versiones con origen, triángulos, parámetros y SHA-256 una vez guardadas. Puedes previsualizar y aplicar cualquiera. Importar un GLB (bloque Escena → **Importar GLB**) crea directamente una versión activa.

**Comparar versiones** (arriba de la pestaña **Versiones**) renderiza hasta seis versiones con las mismas cuatro cámaras (frontal, tres cuartos, lateral y trasera), la misma iluminación y el mismo encuadre, una fila por versión, junto a su motor, triángulos, tamaño, materiales, peso del archivo y parámetros principales. Cada modelo se ajusta a su marco, así que compara formas y detalle; los tamaños aparecen en metros. **Guardar PNG** exporta la hoja con el diálogo nativo. Genera la misma referencia con varios motores o ajustes para elegir el mejor.

## Materiales y texturas

En **Crear 3D > Acabado > Materiales**, selecciona un material para consultar sus factores y mapas integrados de albedo, metalicidad, rugosidad, normales y AO. Importar sustituye un mapa en una nueva vista previa; la malla necesita el canal UV indicado. Se muestra la procedencia del mapa cuando se conoce. **Previsualizar cambios** edita color, metalicidad, rugosidad y opacidad. **Aislar material** solo afecta al visor; **Comparar** muestra la versión activa. Aplica la vista previa antes de exportarla.

**Ampliar 2×/4×** remuestrea los mapas con interpolación bilineal y un límite de 4096 píxeles por lado. No reconstruye detalle mediante IA. El albedo se interpola en RGB lineal y se normalizan los vectores de normales. Esta ruta rechaza mapas de datos con transparencia: utiliza imágenes opacas para normales, metalicidad, rugosidad y AO.

**Textura IA** permite elegir un motor instalado y una referencia explícita para la malla activa. El resultado es una vista previa que conserva su modelo padre aunque selecciones otro durante el trabajo. El plugin [Hunyuan3D Paint 2.1 PBR](../plugins/hunyuan3d-2-1-paint/README.md) genera albedo, metalicidad y rugosidad, regenera las UV y puede neutralizar la iluminación de la referencia con Delight; la resolución del atlas (512, 1024 o 2048 px) se elige en sus ajustes. Usa una referencia sin fondo para obtener texturas más limpias. En una RTX 5070 (12 GB), una malla de 40.000 caras con atlas de 1024 px tarda unos 3 minutos. El motor no genera mapas normal ni AO: hornéalos en **Acabado > Normales** y **Acabado > Oclusión ambiental**, o impórtalos. La edición de materiales y la importación de mapas funcionan sin motor de IA.

## Optimizar y LOD

**Crear 3D → Modelo → Optimizar y LOD** reduce la versión activa a un presupuesto de triángulos y puede crear hasta tres niveles de detalle. Se conservan las UV, los materiales y las texturas, y cada archivo se verifica. Si un presupuesto no se puede alcanzar sin dañar la malla, no se publica nada. Los modelos con esqueleto aún no se admiten.

## Herramientas de malla

Estas operaciones necesitan Blender 4 o posterior instalado; se han probado con Blender 5.2.1 LTS. Si Forma no lo encuentra, pulsa **Configurar Blender** y selecciona su ejecutable. No hace falta instalar paquetes Python ni descargar pesos.

En **Crear 3D > Modelo > Inspeccionar malla**, analiza la versión activa: vértices, caras, triángulos, caras degeneradas, bordes abiertos, aristas no manifold y componentes. Los bordes abiertos también cuentan como no manifold. La inspección solo crea un informe.

**Retopología** utiliza QuadriFlow y regenera las UV. El presupuesto cuenta cuadriláteros; el GLB puede tener hasta el doble de triángulos. **Previsualizar retopología** crea una versión candidata. Esta operación admite una malla estática con un material sencillo; rechaza texturas, colores de vértice y materiales complejos para evitar perderlos.

En **Acabado > UV**, selecciona la resolución y pulsa **Previsualizar UV** para desplegar y empaquetar las islas. **Exportar plantilla UV** guarda un PNG mediante el diálogo nativo, disponible para la versión de origen o su resultado durante la sesión. Sustituir UV también rechaza materiales con texturas, colores de vértice o nodos complejos.

En **Acabado > Normales**, elige recalcular hacia fuera o bakear desde otra versión detallada. El bake necesita UV en la versión activa, una única malla objetivo y ambas versiones alineadas en el mismo espacio. Utiliza Cycles en CPU e integra el mapa de normales en el GLB. La jaula y distancia de rayos son automáticas; revisa la vista previa, especialmente en superficies próximas o cóncavas.

En **Acabado > Oclusión ambiental**, elige la resolución y las muestras y pulsa **Previsualizar oclusión ambiental**. Blender hornea la oclusión de la geometría con Cycles en CPU sobre las UV existentes y Forma la añade como mapa de oclusión del GLB: la malla, las UV y los demás mapas se conservan byte a byte. Necesita una sola malla con UV (despliégalas antes si hace falta); un mapa de oclusión existente se sustituye. Un modelo texturizado de 40.000 caras tarda unos 12 s a 1024 px y 64 muestras.

Cada modificación conserva el original y requiere **Aplicar** para activar su resultado. Las modificaciones rechazan esqueletos, morph targets y animaciones. Los GLB deben contener sus recursos integrados.

## Pintura 3D

En **Crear 3D > Acabado > Pintura 3D**, selecciona el material y pulsa **Empezar a pintar**. La malla necesita UV0. Si no hay textura de color base, se crea una blanca de 1024 o 2048 px; una textura existente conserva su tamaño y debe tener como máximo 2048 px por lado.

Pinta con el botón izquierdo sobre la superficie. **Clonar** toma el origen con Alt+clic y lo copia al pintar otra zona. **Cuentagotas** recoge el color del mapa; **Restaurar** recupera los píxeles que había al empezar la sesión de pintura, incluida su transparencia. El radio se mide en píxeles de textura. El factor de color del material sigue multiplicando el mapa pintado.

**Deshacer pintura** y **Rehacer pintura** actúan por trazo. El historial ocupa como máximo 64 MiB: hasta ocho trazos en 1024 × 1024 y dos en 2048 × 2048. **Pausar pintura** permite navegar; los trazos pendientes se conservan al cambiar de versión y **Volver al origen de pintura** los recupera en su malla. **Guardar versión pintada** crea una vista previa; aplícala para exportarla. Guardar el proyecto incluye automáticamente la pintura pendiente como variante. Cerrar o cambiar de proyecto pide guardar, descartar o cancelar cuando quedan trazos sin guardar.

Se pinta sobre el mapa UV dentro de 0–1: el pincel puede alcanzar islas cercanas en la textura y no interpola a través de saltos de UV. Los materiales con extensiones, otros canales UV, transformaciones de textura no identidad o texturas comprimidas no están admitidos. No se alteran la geometría ni los demás mapas.

## Esqueleto humanoide

En **Crear animación > Esqueleto**, las herramientas utilizan Blender instalado y la versión que muestra el visor. El modelo debe estar de pie, con +Y hacia arriba y +Z al frente, en pose T o A. Selecciona cada **Punto del cuerpo**, ajusta sus coordenadas y activa **Mostrar guías del cuerpo** para comprobar la colocación. X y Z se centran en la caja del modelo; Y empieza en su base. **Previsualizar esqueleto humanoide** crea 19 huesos y calcula pesos automáticos mediante Blender. Un fallo del cálculo detiene el trabajo; no se asignan pesos de sustitución.

En el editor, selecciona un hueso. **Mostrar huesos** dibuja el esqueleto. Los desplazamientos de reposo son fracciones de la altura del modelo; **Previsualizar edición de reposo** guarda el cambio como una nueva variante. **Mostrar pesos de piel** representa la influencia del hueso seleccionado: azul equivale a cero y rojo a uno. Esta vista suspende temporalmente la pintura y restaura sus materiales al desactivarse.

La **Rotación de pose local (grados)** permite probar la deformación. **Restablecer pose** recupera el reposo. Estas rotaciones solo afectan al visor; no se guardan ni se exportan como animaciones.

La política de clips es explícita: **Conservar clips** mantiene las animaciones compatibles al editar el esqueleto existente; **Descartar clips explícitamente** las elimina de la variante nueva. Sustituir un esqueleto existente exige elegir descarte. La malla original permanece intacta y cada resultado requiere **Aplicar** para activarlo antes de exportar o guardar como versión activa.

Este autorig usa guías manuales, no reconoce automáticamente la anatomía ni crea dedos o controles IK. Los casos no compatibles se rechazan con un registro de error: varias pieles independientes, morph targets, extensiones glTF, recursos externos, nombres de articulaciones ambiguos o pesos no válidos. La edición requiere transformaciones globales identidad en la malla y sus ancestros ajenos al esqueleto, y coincidencia de las poses de reposo y vinculación. Revisa la deformación de la vista previa antes de aplicar el resultado.

## Animación y biblioteca de clips

En **Crear animación > Clips**, pulsa **Cargar esqueleto mostrado** para leer los clips del GLB o crear un ciclo local de reposo, caminar o correr. Estos presets son procedurales y necesitan el esqueleto humanoide compatible de Forma. La biblioteca de animaciones es independiente de los proyectos: guardar, importar o eliminar proyectos no borra sus clips. Guarda el clip en la biblioteca para reutilizarlo; los archivos JSON de animación se importan y exportan mediante diálogos nativos.

El editor ofrece pistas de traslación, rotación y escala por hueso. Selecciona un hueso, canal y fotograma, ajusta los valores y añade o actualiza la clave. La rotación local se edita en grados y se guarda como cuaternión normalizado. La interpolación es lineal o escalonada por pista. FPS convierte fotogramas en segundos; cambiarlo cambia la velocidad sin desplazar las claves. La duración no puede excluir claves existentes. Deshacer y rehacer conservan hasta 64 MiB de historial serializado. Los canales cúbicos importados se muestrean a fotogramas editables; los clips originales ajenos al que se guarda permanecen intactos.

La pestaña inferior **Línea de tiempo** reproduce, pausa y recorre fotogramas, con bucle y velocidad ajustables. **Guardar versión de animación** crea una vista previa del GLB con el clip; aplica el resultado antes de exportarlo. Guardar el proyecto incluye la animación pendiente como variante. Los cambios sin guardar están protegidos al cerrar o cambiar de proyecto. Si muestras otra versión, vuelve al origen de la animación para continuar editando.

En **Retarget**, elige un clip de la biblioteca y asigna cada hueso de origen a un destino distinto. Puedes empezar por los nombres coincidentes. Las jerarquías, orientaciones y escalas de reposo deben ser compatibles; las diferencias de tamaño se ajustan cuando son compatibles. Un mapeo incompleto o incompatible detiene la operación, sin modificar el modelo.

En **Captura**, elige un vídeo local de una sola persona y genera el movimiento con **MediaPipe Motion**. El motor y su modelo Pose Landmarker Lite están instalados tras tu autorización. La inferencia se ejecuta en CPU, sin subir el vídeo ni descargar durante el trabajo. El flujo usa por defecto hasta 10 segundos a 15 FPS. El clip detectado se añade a la biblioteca y queda preparado en el editor para revisarlo y guardarlo como variante.

La captura estima el movimiento en el sitio: no recupera desplazamiento de raíz calibrado, giro de torsión, dedos, cara ni contacto fiable con el suelo; cabeza y cuello mantienen el reposo. Debe verse el cuerpo completo. Las oclusiones o una cámara móvil pueden producir errores. Sin suficientes poses válidas, el trabajo falla. Texto a movimiento mediante proveedores externos queda sin configurar por elección del usuario.

## Exportar

**Exportar** (menú izquierdo) **→ Archivos → Exportar GLB** siempre guarda la versión activa (una versión en vista previa no se exporta hasta que la apliques). El archivo se vuelve a leer y se comprueba su SHA-256. Los LOD se exportan como archivos separados.

**Exportar → Intercambio → Paquetes para motores** prepara una carpeta para **Blender**, **Unity** o **Godot** a partir de la versión activa:

- `model.glb` y, si quieres, sus LOD como `lod-N.glb`, cada uno comprobado con el validador glTF de Khronos; un archivo con errores de validación no se empaqueta.
- Tangentes MikkTSpace para las primitivas con mapa de normales, para que el mapa se vea igual en todos los motores.
- `README.md` con los pasos de importación de ese motor, `validation.json` y `forma-package.json` (unidades, ejes y SHA-256 de cada archivo).
- Para Blender, `import_forma.py`, que importa el modelo y sus LOD en una colección `Forma`. Unity necesita el paquete glTFast; Godot 4 importa GLB de forma nativa.

**Preparar paquete** trabaja en segundo plano y lista los archivos con su validación; **Exportar carpeta…** los copia a una carpeta nueva y comprueba cada copia.

## Proyectos

- **Guardar proyecto** (Ctrl+S) pide un nombre la primera vez. Los archivos se copian a la carpeta del proyecto.
- **Biblioteca** abre, renombra, duplica y elimina proyectos.
- Si hay cambios sin guardar, cerrar la ventana, empezar un proyecto nuevo o abrir otro pregunta si guardar, descartar o cancelar.

## Ajustes y datos

**Ajustes** incluye el idioma (inglés, español o sistema), el tema (claro, oscuro o sistema), la carpeta de datos y un informe de hardware (GPU, VRAM, controlador, CUDA, disco libre, Python, motores). La carpeta de datos guarda la base de datos, los proyectos, los trabajos, los motores y los pesos.

## Problemas frecuentes

| Problema | Qué hacer |
| --- | --- |
| Un motor indica "No se encuentra Python" o la activación falla por Git o Python | Instala Python 3.11 desde python.org y Git desde git-scm.com, y vuelve a pulsar Activar |
| "VRAM insuficiente" o "CUDA no disponible" | El motor necesita una GPU NVIDIA con CUDA; revisa el informe de hardware en Ajustes |
| Un trabajo ha fallado | Abre **Proceso**: el registro muestra la salida del motor. **Reintentar** lo repite con las mismas entradas |
| No se pudo cargar el modelo | Forma conserva la versión anterior. Los GLB comprimidos con Draco aún no se admiten |
| Otra cosa | [Informa del problema](https://github.com/jscode-es/forma/issues/new/choose) con el registro de Proceso |
