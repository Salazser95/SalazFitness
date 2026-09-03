# Acceso remoto: usar la app fuera de casa sin alquilar un servidor

Esta guía es para el caso concreto de dejar el portátil encendido haciendo de
servidor y entrar a la app desde el iPhone estando fuera — en el gimnasio, en
el súper — sin contratar nada ni "subirlo a la nube". Es para probar la app
mientras se usa de verdad, no una instalación definitiva.

---

## 1. Por qué hace falta HTTPS (y no vale con la IP local)

Esto es lo primero porque es la causa real de que hoy la app no se pueda usar
bien desde el móvil.

SalazFitness es una PWA con *service worker* — el script que la hace
funcionar como una app instalada, con icono propio y sin la barra de Safari.
Los navegadores solo dejan arrancar un service worker en dos situaciones:
`https://` de verdad, o `localhost`. Punto. No hay excepción para redes de
confianza ni para IPs privadas.

Por eso entrar por `http://192.168.1.23/` desde el móvil no funciona bien: no
es solo que "no sea seguro", es que el navegador ni siquiera deja que el
service worker arranque, así que la app no se comporta como una app —no se
puede instalar bien, falla en segundo plano, cosas que deberían funcionar sin
red no funcionan—. Hace falta un HTTPS real, con certificado válido, para que
el teléfono trate la app como lo que es.

Cloudflare Tunnel resuelve exactamente esto: mete un certificado válido
delante del portátil sin que haya que gestionar ningún certificado a mano.

---

## 2. Qué NO es esto

Para que quede claro antes de empezar:

- La app y la base de datos MySQL **siguen viviendo en tu portátil**. Nada se
  mueve a ningún sitio.
- Cloudflare (o Tailscale, en la opción B) es solo **la tubería**: el camino
  para que una petición del iPhone llegue hasta tu portátil sin que tengas
  que abrir puertos en el router ni tener IP pública. No aloja tu app, no
  guarda tus datos, no sustituye a un servidor.
- **Si apagas el portátil, o lo suspendes, o se cae el wifi, la app deja de
  responder.** No hay nada corriendo en ningún otro sitio que la mantenga
  viva.
- No hace falta cuenta de pago en ningún lado para lo que se explica aquí.

Es decir: esto es la versión "de prueba mientras entreno o compro", tal y
como se pidió. El día que haga falta que la app esté disponible siempre, sin
depender de que el portátil esté encendido, esa es una conversación distinta
(un servidor de verdad, en la nube).

---

## 3. Opción A — Cloudflare Tunnel, modo rápido (5 minutos, sin cuenta)

No hace falta cuenta de Cloudflare ni dominio propio. Sirve para probar hoy
mismo.

### Pasos

1. Compila la PWA y arranca el servidor normal, como en
   [DESPLIEGUE.md](DESPLIEGUE.md), si no lo tienes ya arrancado:

   ```bash
   cd deploy
   docker compose --env-file .env up -d --build
   ```

2. Levanta el túnel con el overlay, perfil `rapido`:

   ```bash
   cd deploy
   docker compose -f docker-compose.yml -f docker-compose.tunel.yml \
       --profile rapido up -d
   ```

3. Saca la URL de los logs de `cloudflared`:

   ```bash
   docker compose logs tunel-rapido | grep trycloudflare.com
   ```

   Busca una línea parecida a:

   ```
   +--------------------------------------------------------------------------------------------+
   |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):   |
   |  https://algo-al-azar-de-varias-palabras.trycloudflare.com                                  |
   +--------------------------------------------------------------------------------------------+
   ```

   Esa URL es la que se abre desde el iPhone.

4. Antes de abrirla desde fuera, pon esa URL en `deploy/.env` — Django la
   rechaza si no la conoce — y reinicia el contenedor `api`:

   ```bash
   # en deploy/.env
   SALAZ_ALLOWED_HOSTS=.trycloudflare.com
   SALAZ_APP_URL=https://algo-al-azar-de-varias-palabras.trycloudflare.com
   SALAZ_CSRF_ORIGINS=https://algo-al-azar-de-varias-palabras.trycloudflare.com
   ```

   ```bash
   docker compose --env-file .env up -d api
   ```

   (El comodín `.trycloudflare.com` en `SALAZ_ALLOWED_HOSTS` evita tener que
   tocar esa variable cada vez que la URL cambie — ver la sección 8 sobre por
   qué eso es aceptable solo para pruebas. `SALAZ_CSRF_ORIGINS` sí hay que
   ponerlo exacto en cada reinicio, porque el CSRF de Django no admite
   comodines.)

### Lo que hay que saber de este modo

- **La URL es al azar y cambia cada vez que reinicias el contenedor del
  túnel.** No sirve para dejarle la dirección guardada a nadie de forma
  permanente, ni para meterla en `VITE_API_BASE` al compilar el APK.
- **Cualquiera que tenga esa URL llega a la pantalla de login.** No hace
  falta contraseña de Cloudflare ni nada: la URL sí es difícil de adivinar
  (es larga y aleatoria), pero si alguien la consigue, entra a Django. Ver la
  sección 8.

---

## 4. Opción A+ — modo con nombre y Cloudflare Access (la que deberías acabar usando)

Con una cuenta gratuita de Cloudflare y (idealmente) un dominio propio, el
túnel tiene nombre y la URL **no cambia nunca**. Y se le puede poner
Cloudflare Access delante: una pantalla previa, antes incluso de llegar a
Django, que solo deja pasar a quien tú autorices por correo.

### 4.1. Crear el túnel con nombre

En el panel de Cloudflare:

1. **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**.
2. Elige **Cloudflared**, ponle un nombre (por ejemplo `salazfitness`).
3. En la pantalla de instalación del conector, copia el token que aparece
   después de `--token` — es una cadena larga. Ese es tu
   `CLOUDFLARE_TUNNEL_TOKEN`.
4. En **Public Hostname**, añade uno: el subdominio que quieras (con un
   dominio ya dado de alta en Cloudflare) apuntando al servicio
   `http://web:80` — es el mismo nombre de servicio que usa el contenedor
   `web` dentro de la red de docker compose, no una URL real.

### 4.2. Arrancar el túnel

```bash
# en deploy/.env
CLOUDFLARE_TUNNEL_TOKEN=el-token-que-copiaste
SALAZ_ALLOWED_HOSTS=salazfitness.tudominio.com
SALAZ_APP_URL=https://salazfitness.tudominio.com
SALAZ_CSRF_ORIGINS=https://salazfitness.tudominio.com
```

```bash
cd deploy
docker compose --env-file .env up -d --build
docker compose -f docker-compose.yml -f docker-compose.tunel.yml \
    --profile nombrado up -d
```

Ya con esto tienes una URL fija con HTTPS real. Sin más pasos, sigue siendo
el modo rápido pero con URL estable: cualquiera con esa URL llega igualmente
al login. El paso siguiente es lo que lo hace de verdad seguro.

### 4.3. Cloudflare Access: código por correo antes de llegar a Django

Esto pone una pantalla de Cloudflare delante de todo. Sin pasarla, ni
siquiera se llega a ver el login de la app.

1. **Zero Trust** → **Access** → **Applications** → **Add an application** →
   **Self-hosted**.
2. **Application domain**: el mismo subdominio del túnel
   (`salazfitness.tudominio.com`).
3. En **Policies**, crea una con **Action: Allow** y una regla **Include** →
   **Emails** → tu correo (`salazser95@gmail.com`, o los que quieras dejar
   pasar).
4. Guarda.

A partir de ahí, entrar a la URL pide un código de un solo uso que Cloudflare
manda al correo autorizado — nada de contraseñas que recordar, y nadie sin
ese correo llega ni a ver la pantalla de login de Django. Esta es la
configuración con la que este montaje deja de ser "una prueba con un enlace
que más vale que no se filtre" y pasa a ser razonablemente seguro para uso
normal.

---

## 5. Opción B — Tailscale

Para quien prefiera una red privada en vez de una URL pública, aunque sea
protegida.

Tailscale monta una red mesh (una VPN entre tus propios dispositivos): el
portátil y el iPhone se ven entre sí como si estuvieran en la misma red
local, estén donde estén. La diferencia frente al túnel: **exige instalar la
app de Tailscale en el iPhone** (gratis, en la App Store) y darse de alta con
una cuenta — no es solo abrir una URL en Safari.

Pasos, en corto:

1. Instala Tailscale en el portátil y date de alta.
2. Instala la app de Tailscale en el iPhone, con la misma cuenta.
3. En el portátil, sirve la app con HTTPS real dentro de la red de Tailscale:

   ```bash
   tailscale serve https / http://localhost:80
   ```

   Esto expone la app en `https://tu-portatil.tu-tailnet.ts.net` — un
   certificado válido, sin tocar nginx.
4. Desde el iPhone, con la app de Tailscale conectada, entra a esa URL.

Al ser una red privada, no hace falta nada parecido a Cloudflare Access: solo
entra quien tú metas en tu red de Tailscale. La contrapartida es justo esa
app instalada y esa cuenta, cosa que el túnel de Cloudflare no pide.

---

## 6. Que el portátil no se duerma

Si se suspende, el túnel se cae con él.

**Linux:**

```bash
# mientras dure la sesion en la que arrancaste el servidor
systemd-inhibit --what=sleep --why="SalazFitness de prueba" sleep infinity &
```

O, más a lo bruto y permanente hasta que lo deshagas:

```bash
sudo systemctl mask sleep.target suspend.target
# para deshacerlo cuando ya no haga falta:
sudo systemctl unmask sleep.target suspend.target
```

**macOS:**

```bash
caffeinate -s
```

(`-s` evita que se suspenda mientras esté conectado a la corriente; deja la
terminal abierta, o lánzalo con `&` al final para que siga en segundo plano.)

**Windows:**

```powershell
powercfg /change standby-timeout-ac 0
```

**Aviso para portátiles con tapa:** en Linux y Windows, muchos equipos
suspenden al cerrar la tapa aunque hayas desactivado la suspensión por
inactividad — son ajustes distintos.

- Linux: en `/etc/systemd/logind.conf`, pon `HandleLidSwitch=ignore` (y
  `HandleLidSwitchDocked=ignore` si va con el cargador puesto) y reinicia
  `systemd-logind` (`sudo systemctl restart systemd-logind`).
- Windows: *Panel de control* → *Opciones de energía* → *Elegir el
  comportamiento del cierre de la tapa* → pon "No hacer nada" en corriente.
- macOS: con la tapa cerrada y solo alimentación, sin monitor externo, el Mac
  sí suspende igualmente aunque haya `caffeinate` corriendo — para eso hace
  falta un monitor o adaptador conectado, o dejar la tapa abierta.

---

## 7. Instalar la PWA en el iPhone

Con la URL del túnel abierta y funcionando en Safari:

1. Toca el icono de **Compartir** (el cuadrado con la flecha hacia arriba).
2. **Añadir a pantalla de inicio**.
3. Confirma el nombre y toca **Añadir**.

Queda un icono en la pantalla de inicio que abre la app a pantalla completa,
sin la barra de Safari, como una app instalada de verdad.

**Tiene que ser Safari.** En iOS, Chrome (y cualquier otro navegador) usa por
debajo el motor de Safari, pero Apple solo deja instalar PWAs a pantalla
completa desde el propio Safari — desde Chrome, "Añadir a pantalla de inicio"
solo crea un acceso directo que abre Chrome, no una app instalada con su
propio service worker.

---

## 8. Seguridad, sin adornos

Ni todo vale ni hay que asustarse: esto es lo que hay en cada opción.

| Configuración | Qué queda expuesto | Qué hacer |
|---|---|---|
| Túnel rápido (sección 3) | La URL es aleatoria y difícil de adivinar, pero **cualquiera que la consiga llega directo a la pantalla de login** de Django. No hay nada delante filtrando. | Vale para una prueba de un rato, con la URL solo compartida contigo mismo. No la publiques, no la mandes por un canal público. Ciérrala cuando termines (`docker compose --profile rapido down`). |
| Túnel con nombre, sin Access (sección 4.2) | Lo mismo que el modo rápido, pero con una URL que no cambia — así que el riesgo dura mientras el túnel esté levantado, no solo un rato. | No lo dejes así de forma permanente: añade Cloudflare Access (sección 4.3). |
| Túnel con nombre + Access (sección 4.3) | Nada llega a Django sin pasar antes el código de Cloudflare al correo autorizado. Es razonablemente seguro para dejarlo puesto. | Revisa de vez en cuando qué correos están en la política de Access. |
| Comodín `.trycloudflare.com` en `SALAZ_ALLOWED_HOSTS` | Dejarías pasar el `Host` de **cualquier** túnel rápido de Cloudflare, no solo el tuyo — aunque para que sirva de algo, además tendrían que acertar tu IP/puerto o, en este montaje, apuntar tu mismo túnel. | Solo para pruebas tuyas de un rato. Con dominio propio, usa el hostname exacto. |
| Tailscale (sección 5) | Nada público: solo entra quien esté en tu red de Tailscale. | El riesgo pasa a ser la cuenta de Tailscale y qué dispositivos están dados de alta en ella. |
| Cuenta `salaz1` de prueba (ver DESPLIEGUE.md) | Contraseña conocida, `123456`. | No la crees (`SALAZ_CREAR_USUARIO_PRUEBA` en blanco) en cualquier configuración que no sea el modo con Access delante. |

Regla general: si vas a dejar el túnel puesto más de una sesión de prueba,
usa el modo con nombre + Access. El modo rápido es para "lo enciendo, lo
pruebo, lo apago".

---

## 9. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Error `DisallowedHost` en los logs de `api` | La URL del túnel no está en `SALAZ_ALLOWED_HOSTS` | Añádela (o el comodín `.trycloudflare.com` en modo rápido) y `docker compose --env-file .env up -d api` |
| Falla el login o cualquier `POST` con un error de CSRF (`CSRF verification failed`) | Falta la URL del túnel en `SALAZ_CSRF_ORIGINS`, o no lleva el `https://` delante | Ponla exacta, con esquema, en `SALAZ_CSRF_ORIGINS` y reinicia `api` |
| La PWA no se instala / "Añadir a pantalla de inicio" no aparece o crea un acceso directo normal | No estás en Safari, o la URL no es `https://` de verdad | Ábrela en Safari (no Chrome), comprueba que la barra de direcciones muestra `https://` con el candado |
| El túnel no levanta / `docker compose logs tunel-rapido` no saca ninguna URL | El contenedor `web` no está sano, o no hay red de salida desde el portátil | `docker compose ps` para ver que `web` está `Up`; revisa `docker compose logs tunel-rapido` entero, no solo el grep |
| Redirección en bucle entre `http` y `https` | Poco probable con este `nginx.conf` (ver el porqué en el propio fichero y en `salaz_settings_prod.py`), pero si aparece: revisa que no haya OTRO proxy además de `cloudflared`/Caddy metiendo su propio `X-Forwarded-Proto` | Comprueba con `curl -I` las cabeceras que llegan a `web`; no debería haber más de un proxy delante de nginx |
| Va lento | El portátil, la subida de tu conexión a internet (el túnel depende de tu subida, no de tu bajada) o el propio wifi del sitio desde el que entras | Prueba con datos móviles para descartar el wifi de fuera; si sigue lento, es la subida de tu conexión de casa, no algo que se arregle desde aquí |
