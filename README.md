# 🎄 Control de Maquila · Panetones Personalizados

Aplicación Web Progresiva (PWA) moderna, responsiva y offline-first diseñada para el seguimiento y gestión de pedidos de maquila de panetones en el área de ventas. Permite sincronización bidireccional con **Google Sheets** mediante un backend ligero en **Google Apps Script**.

---

## ✨ Características Principales

- **Diseño Adaptable (Responsive):** 100% optimizado para smartphones, tablets y pantallas de escritorio.
- **Doble Vista (Tarjetas ⇄ Tabla):**
  - **Vista Tarjetas:** Tarjetas ejecutivas con avatar de marca, badge de fórmula (`Barletta`, `Amore`, `Fastpan`), métricas clave y pipeline de avance conectado.
  - **Vista Tabla Compacta:** Formato de hoja de cálculo ideal para escanear decenas de clientes de un vistazo (con columna fija en móviles).
- **Pipeline de Avance Interactivo:**
  1. **DIGESA:** Ampliación de marca.
  2. **Arte:** Aprobación de empaque y diseño.
  3. **Sistema:** Ingreso formal a producción.
  - Se marcan con un solo toque y calculan automáticamente el estado del pedido.
- **Formulario de pedido en una pantalla:** secciones Pedido · Fechas · Avance · Estado y notas. En móvil se abre como *bottom sheet*; en escritorio, como modal centrado. Valida por campo (con mensajes claros y foco en el primer error), guarda con Enter, muestra el estado resultante en vivo y avisa antes de descartar cambios o eliminar (sin diálogos nativos del navegador).
- **Deshacer en lugar de confirmar:** marcar o desmarcar una etapa se aplica al instante y muestra un aviso con «Deshacer» (7 s; se pausa al pasar el cursor o enfocar). Lo mismo al eliminar un pedido. Funciona también después de sincronizar con Sheets.
- **Alertas Inteligentes de Entrega:** Cálculo de días restantes (`¡Hoy!`, `Mañana`, `Faltan X d`, `Atrasado X d`).
- **Selector de Tema:** Modo Oscuro (Obsidian & Ember) y Modo Claro (Artisan Cream). Todo el texto cumple contraste WCAG AA (≥ 4.5:1), verificado con un escaneo automático de los textos renderizados en ambos temas.
- **PWA Instalable:** Funciona sin conexión a internet gracias a Service Worker y persistencia en `localStorage`.
- **Sincronización con Google Sheets:** Comunicación vía Web App (`Code.gs`) protegida por token secreto, con resolución de conflictos por timestamp.

---

## 🚀 Estructura del Proyecto

```text
├── index.html        # Aplicación web completa (HTML5 + CSS3 Vanilla + JS)
├── Code.gs           # Backend para Google Apps Script (Web App)
├── manifest.json     # Manifiesto de instalación PWA (íconos PNG, maskable, acceso directo)
├── sw.js             # Service Worker: red primero para el HTML, caché para el resto
├── icons/            # Íconos PWA (192, 512, maskable 512, apple-touch-icon)
├── fonts/            # Inter (latin, variable) alojada localmente + licencia OFL
├── .gitignore        # Configuración de exclusiones git
└── README.md         # Documentación del proyecto
```

---

## ⚙️ Conexión con Google Sheets

1. Abre una nueva hoja de cálculo en [Google Sheets](https://sheets.new).
2. Ve a **Extensiones ➔ Apps Script**.
3. Pega el código de [`Code.gs`](./Code.gs).
4. Ejecuta **una vez** la función `generarToken` (▶ Ejecutar) y autoriza los permisos. Copia el token que aparece en el **Registro de ejecución**: queda guardado en *Propiedades del script*, no en el código.
5. Haz clic en **Implementar ➔ Nueva implementación**:
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
6. Copia la URL del Web App generada.
7. En la aplicación web, abre **Configuración (⚙)**, pega la URL y el token, y guarda.

> Si ya tenías el script instalado: pega el nuevo `Code.gs`, ejecuta `generarToken`, **crea una nueva versión** de la implementación y actualiza el token en la app. Las columnas de la hoja pasan a formato texto automáticamente (las fechas ya no se convierten a objetos Date).

---

## 🛡️ Seguridad de los datos al sincronizar

- **Perder la conexión no borra nada:** si la hoja no responde, los pedidos quedan en este equipo y se envían cuando vuelva la red.
- **La app nunca descarta datos locales por lo que diga la hoja.** Si la hoja responde vacía, incompleta, borrada o restaurada a una versión antigua, lo que falta (o lo que esté más reciente en el equipo) se conserva y se **reenvía automáticamente**. Si la hoja sigue sin guardarlos, la app avisa («La hoja no guardó N pedidos · siguen seguros en este equipo») y no insiste en bucle.
- **Cambiar de hoja:** al guardar una URL distinta en ⚙ (o conectar por primera vez), **todo lo que hay en el equipo se envía a la nueva hoja**. Si la nueva hoja ya tenía datos, se fusionan por fecha de modificación y gana lo más reciente. Cambiar solo el token no reenvía nada.
- **Filas borradas a mano en la hoja** reaparecerán en la siguiente sincronización (el equipo las reenvía). Para eliminar un pedido de verdad usa «Eliminar pedido» en la app.
- El respaldo local vive en el navegador: si borras los datos del sitio antes de sincronizar, se pierden los cambios pendientes.

---

## 👥 Varios vendedores a la vez

Cada campo de un pedido (marca, cantidad, peso, fórmula, fechas, etapas, estado, observaciones y «eliminado») guarda **la fecha de su última edición**. Al sincronizar, la app y la hoja combinan cada pedido **campo por campo**:

- **Campos distintos** (uno cambia la cantidad y otro la fecha de entrega, o marcan etapas diferentes): se conservan **los dos** cambios.
- **El mismo campo**: gana la edición **más reciente**, aunque haya llegado antes a la hoja o se hiciera sin conexión.
- **Formulario abierto**: al guardar solo se aplican los campos que **tú** cambiaste; lo que otro vendedor modificó mientras tanto no se pisa con valores viejos.
- **Editar una celda a mano en Google Sheets** también cuenta: un disparador `onEdit` (se activa solo, sin instalar nada) sella la fecha de esa celda. Si la fecha coincide con la de la app, gana la hoja.
- **Eliminar** es un campo más: si alguien elimina un pedido mientras otro edita otro campo, el pedido queda eliminado y la edición se conserva.

**Para activarlo en una hoja ya instalada:** pega el nuevo `Code.gs`, **crea una nueva versión** de la implementación (Implementar ➔ Administrar implementaciones ➔ Editar ➔ Nueva versión). La columna `fieldTs` se agrega sola al encabezado y las filas antiguas siguen funcionando (parten de su fecha `updatedAt`). Mientras la hoja use el `Code.gs` anterior, la app funciona como antes (gana el pedido completo más reciente).

**Limitaciones conocidas:** «más reciente» se decide con el reloj de cada dispositivo (y el de Google para ediciones manuales); un teléfono con la hora muy adelantada ganaría conflictos que no debería. Mantén la fecha y hora en automático. Dos ediciones del mismo campo en el mismo milisegundo no se consideran conflicto realista.

---

## 📲 PWA y despliegue

- **Actualizaciones:** el HTML se pide primero a la red (con revalidación), así que cada despliegue se ve en la **primera** carga con conexión. Sin conexión, o si la red tarda más de 4 s, se usa la última copia guardada y la descarga termina en segundo plano para la siguiente carga.
- **Cuándo subir `VERSION` en `sw.js`:** solo si cambias la lista `PRECACHE` (nuevos archivos, íconos o fuentes). Los cambios en `index.html` no lo requieren.
- **Migración desde la versión anterior:** el service worker viejo era caché-primero, así que la primera recarga tras actualizar aún puede mostrar la versión previa; desde la segunda ya funciona el esquema nuevo.
- **Fuente:** Inter está en `fonts/` (no se pide nada a Google Fonts), por lo que la tipografía también funciona sin conexión.
- **Instalación:** en Android/Chrome aparece «Instalar app». En iPhone: Compartir ➔ «Añadir a pantalla de inicio». La app instalada incluye el acceso directo «Nuevo pedido».

---

## 📄 Licencia

Desarrollado para uso interno y gestión comercial de maquila.
