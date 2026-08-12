# Guía completa de uso

[English](/AdriRRP/yt-looper/wiki/User-guide-EN) · [Inicio](/AdriRRP/yt-looper/wiki/Inicio-ES) ·
[Biblioteca y enlaces](/AdriRRP/yt-looper/wiki/Biblioteca-y-enlaces-ES)

## Dónde funciona

YT Looper se activa en páginas de reproducción normales de YouTube (`youtube.com/watch`). No está
diseñado para Shorts, reproductores incrustados ni navegadores móviles. La navegación interna de
YouTube está soportada: puedes cambiar de vídeo sin recargar la pestaña.

## El widget del vídeo

Cuando un vídeo no tiene puntos A/B, el widget empieza minimizado. Se expande automáticamente al
marcar el primer punto o manualmente mediante el botón morado de expansión.

![Widget con un loop guardado y activo](https://raw.githubusercontent.com/wiki/AdriRRP/yt-looper/screenshots/video-widget.png)

### Marcar A y B

Puedes establecer cada punto de tres maneras:

1. Pulsa el botón de diana junto a **A** o **B** para tomar el tiempo actual del vídeo.
2. Escribe los segundos directamente en el campo numérico.
3. Usa **−** y **+** para mover el punto en pasos de 0,1 segundos.

A debe ser igual o mayor que cero y B debe estar después de A. Los controles de loop sólo se
habilitan cuando el intervalo es válido. Escribir en los campos no activa los atajos propios de
YouTube: YT Looper detiene esos eventos antes de que lleguen a la página.

### Velocidad y tono

Escribe o ajusta una velocidad entre **0,25× y 4×**. La conservación de tono está siempre activa, de
modo que ralentizar una canción no cambia innecesariamente su afinación.

### Activar y detener

Pulsa **Activar loop** para saltar a A y comenzar la repetición. El mismo botón pasa a **Detener
loop**. Detenerlo conserva A, B y velocidad para que puedas reanudarlo después.

### Compartir

El botón azul de compartir copia un enlace de YouTube que contiene el identificador del vídeo, A, B
y velocidad. Consulta
[cómo funcionan los enlaces compartidos](/AdriRRP/yt-looper/wiki/Biblioteca-y-enlaces-ES#compartir-un-loop).

### Minimizar, cerrar y restaurar

- **Minimizar** conserva una cabecera pequeña sobre el vídeo.
- La **X roja** oculta el widget para ese vídeo, pero el loop y los atajos siguen funcionando.
- Abre el popup de la extensión y pulsa **Mostrar panel** para restaurarlo.

La elección de cerrar se aplica al vídeo actual. Al entrar en otro vídeo sin parámetros, el widget
vuelve a comenzar minimizado.

## Atajos de teclado

| Acción               | Windows/Linux | macOS |
| -------------------- | ------------- | ----- |
| Marcar A             | `Alt+Shift+A` | `⌥⇧A` |
| Marcar B             | `Alt+Shift+B` | `⌥⇧B` |
| Activar/detener loop | `Alt+Shift+L` | `⌥⇧L` |

En macOS, la tecla `Alt` se llama **Option (⌥)**. Si el sistema, otra extensión o una distribución
de Linux reserva una combinación, utiliza los controles del widget.

## Estados de un fragmento

El color del badge informa de lo que ocurrirá:

- **Azul:** A, B y velocidad forman un loop válido todavía no guardado.
- **Verde:** el loop coincide con un fragmento guardado.
- **Naranja:** has modificado A, B o velocidad respecto al fragmento guardado.

En naranja aparece una acción de actualización rápida. Sólo cambia A, B y velocidad; el nombre y la
carpeta se conservan. La **X del badge** desvincula el loop guardado sin eliminarlo: los parámetros
actuales quedan listos para guardarse como un fragmento nuevo.

## Guardar

Con A y B válidos, pulsa el icono de marcador. En el popup se abrirá una hoja de revisión donde
puedes aceptar el nombre generado, escribir otro nombre, revisar los parámetros y elegir una
carpeta. YT Looper identifica duplicados por vídeo, A, B y velocidad, no por el nombre, y evita
guardar dos veces el mismo loop.

## Anuncios de YouTube

Mientras YouTube muestra un anuncio, YT Looper suspende la manipulación del vídeo. El popup
sustituye los controles por un spinner y el widget muestra que está esperando. Al terminar el
anuncio, reaparecen los controles y el estado del loop sigue disponible.

## Persistencia y cambio de vídeo

YT Looper recuerda los parámetros asociados a cada vídeo y las preferencias de reproducción. Al
abrir un fragmento desde la biblioteca restaura vídeo, A, B y velocidad, salta a A y activa el loop.
La navegación interna de YouTube se detecta para que el controlador se conecte al vídeo nuevo.
