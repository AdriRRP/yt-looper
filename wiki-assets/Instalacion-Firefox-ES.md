# Instalar el ZIP en Firefox

[English](/AdriRRP/yt-looper/wiki/Install-Firefox-EN) ·
[Volver al inicio](/AdriRRP/yt-looper/wiki/Inicio-ES)

> **Importante:** un ZIP sin firma se carga como complemento temporal y desaparece al reiniciar
> Firefox. La instalación permanente requerirá una versión firmada por Mozilla.

## Descargar

1. Abre [Releases](https://github.com/AdriRRP/yt-looper/releases) y entra en la versión más
   reciente.
2. En **Assets**, descarga `yt-looper-firefox-vX.Y.Z.zip`.
3. Opcionalmente descarga `SHA256SUMS` y compara el SHA-256 antes de instalar.
4. Descomprime el ZIP en una carpeta que puedas conservar durante la sesión.

Si todavía no aparece ninguna release, el proyecto aún no ha publicado su primer paquete público. No
uses el ZIP de Chrome o Safari: cada paquete incluye un manifest específico.

## Cargar temporalmente

1. Escribe `about:debugging#/runtime/this-firefox` en la barra de direcciones.
2. Pulsa **Cargar complemento temporal…**.
3. En la carpeta descomprimida, selecciona `manifest.json`.
4. Abre un vídeo normal de YouTube y comprueba que aparece YT Looper.
5. Si el icono queda dentro del menú de extensiones, fíjalo a la barra para acceder a la biblioteca.

Firefox mantiene la carga sólo hasta el siguiente reinicio. Para recargar la misma versión durante
la sesión, vuelve a `about:debugging` y usa **Recargar**.

## Ventanas privadas

Firefox no permite extensiones en navegación privada de forma predeterminada. Si lo necesitas, abre
`about:addons`, entra en YT Looper y habilita **Ejecutar en ventanas privadas**.

## Verificar el archivo

macOS o Linux:

```bash
shasum -a 256 yt-looper-firefox-vX.Y.Z.zip
```

Windows PowerShell:

```powershell
Get-FileHash .\yt-looper-firefox-vX.Y.Z.zip -Algorithm SHA256
```

Compara el resultado con la línea correspondiente de `SHA256SUMS`.

## Referencia oficial

Mozilla documenta este procedimiento en
[Your first extension](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing).

¿No aparece el widget? Consulta [Ayuda y privacidad](/AdriRRP/yt-looper/wiki/Ayuda-y-privacidad-ES).
