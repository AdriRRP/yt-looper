# Ayuda, límites y privacidad

[English](/AdriRRP/yt-looper/wiki/Troubleshooting-and-privacy-EN) ·
[Inicio](/AdriRRP/yt-looper/wiki/Inicio-ES)

## El widget no aparece

1. Comprueba que estás en una URL normal `https://www.youtube.com/watch?...`.
2. Recarga la pestaña si instalaste o actualizaste la extensión con YouTube ya abierto.
3. Confirma que YT Looper está habilitado y tiene permiso para `youtube.com`.
4. Si lo cerraste con la X, abre el popup y pulsa **Mostrar panel**.
5. Si no hay A/B, es normal que comience minimizado.

## Sólo aparece un spinner

YouTube está reproduciendo o terminando un anuncio. YT Looper espera para no aplicar saltos ni
velocidad al anuncio. Los controles vuelven cuando YouTube recupera el vídeo principal.

## No puedo guardar

- A y B deben formar un intervalo válido y B debe estar después de A.
- Un fragmento con el mismo vídeo, A, B y velocidad sólo puede guardarse una vez.
- Si el badge está verde, el loop ya está guardado.
- Si está naranja, utiliza actualizar para sincronizar A, B y velocidad.
- Usa la X del badge para desvincularlo y crear otro fragmento sin borrar el anterior.

## Un atajo no responde

Prueba el control equivalente del widget. El sistema operativo, el navegador u otra extensión puede
reservar la combinación. En macOS recuerda usar **Option (⌥)** en lugar de buscar una tecla Alt.

## El enlace compartido no carga el loop

- Confirma que YT Looper está instalado y habilitado.
- Abre el enlace completo, incluido el fragmento `#ytl=…`.
- No edites manualmente el payload: la extensión rechaza valores inválidos por seguridad.
- Si YouTube ya estaba abierto, prueba a pegar el enlace en una pestaña nueva.

## El ZIP no se instala permanentemente

Es el comportamiento esperado para paquetes sin firma:

- Firefox elimina los complementos temporales al reiniciarse.
- Chrome carga la carpeta en modo desarrollador.
- Safari elimina extensiones temporales al cerrar o después de 24 horas.

Consulta las instrucciones específicas de [Firefox](/AdriRRP/yt-looper/wiki/Instalacion-Firefox-ES),
[Chrome](/AdriRRP/yt-looper/wiki/Instalacion-Chrome-ES) o
[Safari](/AdriRRP/yt-looper/wiki/Instalacion-Safari-ES).

## Privacidad

YT Looper no recopila datos fuera del dispositivo ni transmite telemetría, historial, contenido de
vídeo o datos personales. Sólo procesa localmente los identificadores y títulos de los vídeos y los
parámetros necesarios para la biblioteca. Los loops, nombres y carpetas se guardan en el
almacenamiento local de la extensión. Los enlaces compartidos se generan localmente e incluyen sólo
versión de formato, A, B y velocidad. El identificador de vídeo permanece en el parámetro normal `v`
de YouTube.

La extensión solicita acceso a YouTube para encontrar el reproductor y controlar el vídeo. No
descarga código remoto.

## Informar de un problema

Abre un [issue en GitHub](https://github.com/AdriRRP/yt-looper/issues) e indica navegador, versión
del navegador, versión de YT Looper, URL de ejemplo y pasos para reproducirlo. No publiques datos
privados ni enlaces que no quieras compartir públicamente.
