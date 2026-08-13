# Ficha de marketplace — Español

## Identidad

- Nombre: `YT Looper`
- Categoría: Productividad
- Resumen:
  `Repite fragmentos A/B de YouTube a velocidad personalizada y guarda una biblioteca de loops.`
- Sitio web: `https://github.com/AdriRRP/yt-looper`
- Soporte: `https://github.com/AdriRRP/yt-looper/issues`
- Privacidad: `https://github.com/AdriRRP/yt-looper/blob/main/PRIVACY.md`

## Descripción

Practica música, idiomas, baile o cualquier detalle de un vídeo repitiendo exactamente el tramo que
necesitas. Marca A y B, ajusta la velocidad entre 0,25× y 4× y YT Looper mantendrá el tono mientras
reproduce el fragmento.

- Widget compacto integrado en el vídeo y atajos de teclado.
- Biblioteca local con nombres, carpetas anidadas, edición y arrastrar y soltar.
- Enlaces de loop compartibles que no requieren una cuenta ni un servidor.
- Estado independiente por pestaña y actualizaciones seguras entre ventanas.
- Pausa automática de los controles durante anuncios.
- Interfaz en español e inglés, sin analítica, anuncios ni recopilación de datos.

Todos los fragmentos permanecen en el almacenamiento local del navegador. La extensión solo actúa en
páginas de reproducción de YouTube.

## Propósito único y permisos

Propósito único: permitir crear, reproducir, organizar y compartir fragmentos A/B de vídeos de
YouTube a una velocidad personalizada.

- `storage`: conserva localmente preferencias, puntos A/B y la biblioteca creada por el usuario.
- `activeTab`: permite que el popup consulte y restaure el widget de la pestaña de YouTube activa
  tras una acción explícita del usuario.
- `clipboardWrite`: copia un enlace de loop únicamente al pulsar Compartir.
- `https://www.youtube.com/*`: inserta el controlador A/B exclusivamente en páginas de YouTube.
- Código remoto: no; todo el JavaScript ejecutable está incluido en el paquete.
- Datos recopilados o transmitidos: ninguno.

## Notas para revisión

Abra cualquier vídeo normal de YouTube. El widget aparece colapsado hasta marcar A o B. Use los
botones de captura o `Alt/Option+Shift+A`, `Alt/Option+Shift+B` y `Alt/Option+Shift+L`. El botón de
la barra abre la biblioteca. No se necesita cuenta, pago ni configuración externa.
