# Manual de Forma

[English](manual.md)

Forma convierte imágenes en modelos 3D en tu propio equipo. No se sube nada: la generación, los proyectos y los archivos se quedan en local.

## Instalación

Descarga el instalador de tu sistema desde la [página de versiones](https://github.com/jscode-es/forma/releases): `.exe` para Windows, `.dmg` para macOS (Apple Silicon), `.AppImage` o `.deb` para Linux. Los instaladores aún no están firmados, así que SmartScreen de Windows y Gatekeeper de macOS piden confirmación la primera vez (en macOS: clic derecho → Abrir).

## El estudio

| Zona | Qué hace |
| --- | --- |
| Barra superior | Nombre del proyecto, indicador de cambios sin guardar (punto morado), Nuevo, Guardar proyecto (Ctrl+S) |
| Menú izquierdo | Crear 3D, Crear animación, Exportar; el objeto de la escena; la imagen de referencia; Biblioteca, Modelos, Ayuda y Ajustes |
| Visor | La vista 3D. Arrastra para orbitar, rueda para acercar, botón derecho para desplazar. Vistas Material, Sólido y Malla, cámaras predefinidas, encuadre y cuadrícula |
| Panel inferior | Versiones, Cola de trabajos, Proceso (entradas, parámetros, archivos y registro de cada trabajo) y Línea de tiempo |
| Inspector | Cambia según la sección del menú izquierdo. Crear 3D: Crear, Modelo, Acabado, Edición. Crear animación: Captura, Esqueleto, Clips, Personaje. Exportar: Archivos, Intercambio. El buscador busca dentro de la sección actual; las flechas del teclado cambian de pestaña |
| Barra de estado | GPU y VRAM, motores disponibles, versión |

Cada proyecto nuevo empieza con un cubo de 1 m. Se recuerdan los proyectos, los ajustes y la disposición de los paneles; al arrancar se abre el último proyecto.

## Activar un motor

Forma incluye los motores que admite, pero los activas tú, porque sus licencias son entre tú y sus autores.

1. Abre **Modelos** (menú izquierdo) → **Motores**.
2. Pulsa **Activar** en el motor (por ejemplo Hunyuan3D 2.0). Revisa los requisitos: GPU NVIDIA con CUDA y VRAM suficiente, Python 3.11 y Git, espacio en disco.
3. Lee las licencias, marca **He leído y acepto estas licencias** y pulsa **Aceptar y activar**.
4. Forma descarga el código del motor en una versión fija, prepara su entorno de Python (varios GB la primera vez), lo verifica y descarga los pesos del modelo. Ves el progreso y las últimas líneas de salida, y puedes cancelar.

Avanzado: si ya tienes un entorno de Python con los paquetes necesarios, marca **Usar un entorno de Python existente** y elige su ejecutable `python`.

La pestaña **Pesos** lista los archivos de modelo con tamaño, licencia, revisión y estado. Verificar recalcula los SHA-256, Reparar descarga solo lo dañado y Buscar actualizaciones solo informa de versiones nuevas.

Hunyuan3D 2.0 tiene licencia de Tencent y no se aplica en la Unión Europea, el Reino Unido ni Corea del Sur.

## Crear un modelo desde una imagen

1. En **Referencias**, pulsa la zona de arrastre y elige un PNG, JPG o WebP (hasta 20 MB y 16 megapíxeles).
2. Opcional: **Quitar fondo** crea una versión sin fondo; el interruptor elige cuál se usa.
3. En **Crear 3D → Crear → Motor de generación**, elige el motor (el engranaje abre el gestor de modelos). La calidad (Rápida, Equilibrada, Alta) fija 15, 30 o 50 pasos; su engranaje personaliza los pasos de cada perfil. Los ajustes del motor (semilla, guía, resolución) se guardan con el proyecto.
4. Opcional: **Escala física** ajusta el resultado a una altura en metros.
5. Pulsa **Generar modelo**. El trabajo aparece en **Cola de trabajos**; **Proceso** muestra el progreso, las imágenes preparadas y el registro.

En una RTX 5070 (12 GB), Hunyuan3D 2.0 tarda unos 2 minutos con 30 pasos.

## Versiones

Cada resultado es una versión nueva. Lo generado y lo optimizado se abre en **Vista previa**:

- **Comparar** muestra la versión activa en la misma vista.
- **Aplicar** convierte la vista previa en la versión activa.
- **Descartar** elimina una candidata sin guardar.

La pestaña **Versiones** lista todas las versiones con origen, triángulos, parámetros y SHA-256 una vez guardadas. Puedes previsualizar y aplicar cualquiera. Importar un GLB (bloque Escena → **Importar GLB**) crea directamente una versión activa.

## Optimizar y LOD

**Crear 3D → Modelo → Optimizar y LOD** reduce la versión activa a un presupuesto de triángulos y puede crear hasta tres niveles de detalle. Se conservan las UV, los materiales y las texturas, y cada archivo se verifica. Si un presupuesto no se puede alcanzar sin dañar la malla, no se publica nada. Los modelos con esqueleto aún no se admiten.

## Exportar

**Exportar** (menú izquierdo) **→ Archivos → Exportar GLB** siempre guarda la versión activa (una versión en vista previa no se exporta hasta que la apliques). El archivo se vuelve a leer y se comprueba su SHA-256. Los LOD se exportan como archivos separados.

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
