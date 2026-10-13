# homepage-terminal

Página de inicio / nueva pestaña con aire de escritorio Linux tuneado y lo acogedor de macOS: cristal esmerilado, paleta gruvbox, JetBrains Mono y un fondo de brasas en ASCII.

**Web:** <https://ak1ta4.github.io/homepage-terminal/> · demo con datos ficticios: <https://ak1ta4.github.io/homepage-terminal/?demo>

## Qué incluye

- **Fondo generativo**, sin imágenes: un campo de caracteres ASCII que sube despacio como humo sobre brasas (ruido con *domain warping* dibujado en un canvas a ~12 fps desde un atlas de glifos), más cálido abajo y con un poco de luz bajo el ratón. Se pausa con la pestaña oculta.
- **Reloj** en mono fina (sin segundos, 24 h o 12 h), la fecha en minúsculas y un saludo que se escribe solo con cursor de terminal: «buenos días», «buenas tardes», «buenas noches» o «dulces sueños», con tu nombre si lo pones.
- **Ventana de terminal** con los semáforos de macOS y `usuario@equipo: ~`:
  - el prompt `❯` es el buscador de Google, con autocompletado (sugerencias, tus favoritos y búsquedas recientes; `Tab` / `→` acepta el texto fantasma);
  - debajo, como un `ls ~/favoritos`, tus favoritos con el glifo de su marca ([Simple Icons](https://simpleicons.org)) o su inicial, teñidos con colores gruvbox. Atajos `1`–`9` y `0`, arrastrar para reordenar (o `Alt` + flechas), `+` para añadir y, al pasar el ratón, ✎ para editar y × para borrar.
- **Editor de favoritos**: nombre, URL, icono (automático, un glifo de Simple Icons por su nombre, una imagen por URL o subida —se recorta a 64 px— o un texto / emoji de hasta dos caracteres) y color.
- **Luz nocturna**: una capa cálida sobre toda la página, como el filtro de luz nocturna del sistema.
- **Barra de sistema** tipo neofetch (equipo, uptime, IP y procesos) cuando hay agente.
- **Ajustes** (arriba a la izquierda): luz nocturna, intensidad de las brasas, tu nombre, formato de 24 h, iconos glifo / inicial, barra de sistema y animaciones.

Atajos (fuera de un campo de texto): `/` buscar · `1`–`9`, `0` abrir favorito · `F` pantalla completa · `Esc` salir del campo.

## Con o sin agente

Es una web estática: funciona sola, con los favoritos guardados en tu navegador.

Si en el PC está en marcha el agente local de [homepage-dashboard](https://github.com/ak1ta4/homepage-dashboard) (`http://127.0.0.1:47800`), lo usa para:

- leer y guardar los favoritos en su `data.json` (las tareas de ese archivo no se tocan);
- las sugerencias de búsqueda;
- los datos de la barra de sistema.

Para que la versión publicada pueda hablar con el agente, su `config.json` debe incluir `https://ak1ta4.github.io` en `origins`. El navegador puede pedir permiso la primera vez para acceder a la red local.

## Privacidad

- Ajustes, iconos personalizados, búsquedas recientes y (sin agente) favoritos se guardan solo en el `localStorage` del navegador.
- Los glifos se descargan de jsDelivr (`simple-icons`) la primera vez y quedan guardados; con «inicial» no se hace ninguna petición.
- Mientras escribes en el buscador, el texto se envía a Google para obtener sugerencias (igual que hace la barra del navegador).

## Usarlo como nueva pestaña

Con una extensión tipo *New Tab Override*, pon `https://ak1ta4.github.io/homepage-terminal/` como página de la nueva pestaña.

## Desarrollo local

```bash
python -m http.server 5620
```

Y abre <http://localhost:5620> (o <http://localhost:5620/?demo>).

## Estructura

```
index.html   página
style.css    estilos (gruvbox, cristal, terminal)
app.js       datos: buscador, favoritos, agente local
ui.js        todo lo visual: fondo, reloj, iconos, editor, luz nocturna, ajustes
```

---

Fuente: JetBrains Mono (Google Fonts, OFL). Glifos: Simple Icons (CC0).
