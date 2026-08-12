# Instalar el ZIP en Safari para macOS

[English](/AdriRRP/yt-looper/wiki/Install-Safari-EN) ·
[Volver al inicio](/AdriRRP/yt-looper/wiki/Inicio-ES)

> **Importante:** Safari admite el ZIP como extensión temporal de desarrollo. La elimina al cerrar
> Safari o después de 24 horas. Una instalación permanente necesita una aplicación macOS firmada y
> distribuida mediante el flujo de Apple.

## Descargar

1. Abre [Releases](https://github.com/AdriRRP/yt-looper/releases) y entra en la versión más
   reciente.
2. En **Assets**, descarga `yt-looper-safari-vX.Y.Z.zip`.
3. Puedes seleccionar el ZIP directamente en Safari; si falla, descomprímelo y selecciona la carpeta
   que contiene `manifest.json`.
4. Opcionalmente compara su hash con `SHA256SUMS`.

Si todavía no aparece ninguna release, el proyecto aún no ha publicado su primer paquete público.

## Mostrar las opciones de desarrollo

1. Abre **Safari → Ajustes → Avanzado**.
2. Activa **Mostrar funciones para desarrolladores web**.
3. Abre la nueva pestaña **Desarrollador** de Ajustes.
4. Activa **Permitir extensiones sin firmar**. macOS puede pedir autenticación.

## Añadir la extensión

1. En **Safari → Ajustes → Desarrollador**, pulsa **Añadir extensión temporal…**.
2. Selecciona `yt-looper-safari-vX.Y.Z.zip` o su carpeta descomprimida.
3. En **Ajustes → Extensiones**, habilita YT Looper si no lo está ya.
4. Autoriza el acceso a `youtube.com` cuando Safari lo solicite.
5. Abre o recarga un vídeo normal de YouTube.

La opción **Permitir extensiones sin firmar** también se restablece al cerrar Safari, por lo que
puede ser necesario activarla de nuevo en la siguiente sesión.

## Verificar el archivo

```bash
shasum -a 256 yt-looper-safari-vX.Y.Z.zip
```

Compara el resultado con la línea correspondiente de `SHA256SUMS`.

## Referencia oficial

Apple explica la carga temporal y sus límites en
[Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

Para problemas de permisos o si el icono no aparece, consulta
[Ayuda y privacidad](/AdriRRP/yt-looper/wiki/Ayuda-y-privacidad-ES).
