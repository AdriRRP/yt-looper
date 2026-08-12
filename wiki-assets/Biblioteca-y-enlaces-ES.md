# Biblioteca, carpetas y enlaces compartidos

[English](/AdriRRP/yt-looper/wiki/Library-and-sharing-EN) ·
[Inicio](/AdriRRP/yt-looper/wiki/Inicio-ES) · [Guía de uso](/AdriRRP/yt-looper/wiki/Guia-de-uso-ES)

El icono de YT Looper en la barra del navegador abre una biblioteca disponible desde cualquier
página. Si la pestaña activa contiene un vídeo con A y B válidos, debajo del árbol también aparece
el fragmento actual.

![Biblioteca jerárquica y fragmento actual](https://raw.githubusercontent.com/wiki/AdriRRP/yt-looper/screenshots/library-popup.png)

## Árbol de carpetas

- Pulsa una carpeta para expandirla o contraerla.
- Usa **+** en Biblioteca para crear una carpeta raíz.
- Usa **+** en cualquier carpeta para crear una subcarpeta.
- Arrastra un fragmento y suéltalo sobre una carpeta para moverlo.
- También puedes cambiar la carpeta desde el editor.
- Al eliminar una carpeta, sus elementos se recolocan de forma segura en su carpeta superior; no se
  borran silenciosamente sus fragmentos.

## Abrir y editar un fragmento

Pulsa el nombre de un fragmento para abrir el editor modal. El botón ▶ del árbol lo abre
directamente en YouTube con el loop activado.

![Editor de nombre, parámetros y carpeta](https://raw.githubusercontent.com/wiki/AdriRRP/yt-looper/screenshots/fragment-editor.png)

El editor permite:

- Renombrar el fragmento. El nuevo nombre aparecerá en todos sus badges.
- Cambiar A, B y velocidad.
- Moverlo a otra carpeta.
- Abrirlo en YouTube.
- Eliminarlo mediante una confirmación de dos pasos.

El nombre es cosmético. La comprobación de duplicados utiliza vídeo, A, B y velocidad. Por ello,
renombrar un fragmento no crea una copia ni rompe su asociación con el loop.

## Fragmento actual

La tarjeta inferior utiliza el mismo lenguaje visual que el widget:

- Azul para un loop nuevo listo para guardar.
- Verde para un fragmento guardado y sincronizado.
- Naranja si los parámetros han cambiado.

Pulsa el badge para revisar o editar. El botón lateral guarda un loop nuevo o actualiza rápidamente
los parámetros del fragmento seleccionado, según el estado.

## Compartir un loop

Pulsa el icono azul de compartir en el widget o en la tarjeta de fragmento actual. YT Looper copia
una URL canónica de YouTube con un payload Base64URL validado.

El enlace contiene únicamente:

- Versión del formato.
- Identificador del vídeo.
- Punto A.
- Punto B.
- Velocidad.

No contiene el nombre ni la carpeta, y no sube el loop a ningún servidor. Al abrirlo con YT Looper
instalado, la extensión valida los datos, salta a A y activa el loop. El receptor puede reproducirlo
sin guardarlo o añadirlo a su propia biblioteca con el nombre que prefiera. Sin la extensión, el
enlace continúa abriendo el vídeo normal de YouTube cerca del inicio del fragmento.

## Nombres generados

Si no escribes un nombre, YT Looper propone uno a partir del título y del intervalo. Puedes
cambiarlo al guardar o posteriormente desde el editor. El nombre elegido seguirá siendo el nombre
visible del fragmento aunque sus parámetros se actualicen.
