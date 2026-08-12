# Instalar el ZIP en Chrome

[English](/AdriRRP/yt-looper/wiki/Install-Chrome-EN) ·
[Volver al inicio](/AdriRRP/yt-looper/wiki/Inicio-ES)

Chrome permite cargar el paquete descomprimido en modo desarrollador. La extensión seguirá
disponible entre reinicios mientras conserves la carpeta y no la elimines desde
`chrome://extensions`.

## Descargar y descomprimir

1. Abre [Releases](https://github.com/AdriRRP/yt-looper/releases) y entra en la versión más
   reciente.
2. En **Assets**, descarga `yt-looper-chrome-vX.Y.Z.zip`.
3. Descomprime el ZIP. `manifest.json` debe quedar en la raíz de la carpeta resultante.
4. Opcionalmente comprueba su hash con `SHA256SUMS`.

Si todavía no aparece ninguna release, el proyecto aún no ha publicado su primer paquete público.

## Cargar en Chrome

1. Escribe `chrome://extensions` en la barra de direcciones.
2. Activa **Modo desarrollador** en la esquina superior derecha.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta que contiene `manifest.json`, no el ZIP ni una carpeta superior.
5. Abre el menú de extensiones (pieza de puzle) y fija YT Looper a la barra.
6. Abre un vídeo normal de YouTube. Si la pestaña ya estaba abierta, recárgala una vez.

Para actualizar manualmente, sustituye los archivos por los de la nueva versión y pulsa el icono de
recarga de YT Looper en `chrome://extensions`.

## Verificar el archivo

macOS o Linux:

```bash
shasum -a 256 yt-looper-chrome-vX.Y.Z.zip
```

Windows PowerShell:

```powershell
Get-FileHash .\yt-looper-chrome-vX.Y.Z.zip -Algorithm SHA256
```

Compara el resultado con la línea correspondiente de `SHA256SUMS`.

## Referencia oficial

Google documenta la carga local en
[Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

¿Chrome muestra un error de manifest? Confirma que descargaste el ZIP de Chrome y consulta
[Ayuda y privacidad](/AdriRRP/yt-looper/wiki/Ayuda-y-privacidad-ES).
