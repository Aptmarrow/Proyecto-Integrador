# Despliegue en la Nube — Danmakrew (`nomercygames.me`)

El `Dockerfile` en la raíz del repositorio empaqueta todo en un **único contenedor Docker** escuchando en un solo puerto (`$PORT`):
- `/` → Frontend React + PixiJS (estáticos servidos por Nginx con SPA fallback)
- `/api/*` → Backend Fastify conectado a **Neon PostgreSQL**
- `/docs` → Documentación interactiva **Swagger / OpenAPI**
- `/signal` y `/game` → WebSockets (`wss://nomercygames.me/signal` y `/game`)

---

## Opción 1: Azure for Students (VM Linux Ubuntu 24/7 con \$100 gratis)

1. Registrate con tu mail educativo (`@alumno.etec.um.edu.ar`) en https://azure.microsoft.com/free/students/ (no pide tarjeta).
2. En el Portal de Azure creá una **Virtual Machine** (Ubuntu 24.04 LTS, tamaño `Standard_B1s` o `B2s`) y en **Networking → Inbound port rules** abrí los puertos TCP **22 (SSH)**, **80 (HTTP)** y **443 (HTTPS)**.
3. Conectate por SSH a la VM e instalá Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
4. Cloná el repo, creá `Backend/.env` con tus credenciales (Neon, JWT, Mailer y `FRONTEND_URL=https://nomercygames.me,https://www.nomercygames.me`) y levantá el contenedor en puerto 80:
   ```bash
   git clone https://github.com/Aptmarrow/Proyecto-Integrador.git
   cd Proyecto-Integrador
   # Pegar tus variables en Backend/.env (NO subir a Git)
   docker build -t danmakrew-cloud .
   docker run -d --name danmakrew --restart unless-stopped \
     -p 80:8080 -e PORT=8080 --env-file Backend/.env danmakrew-cloud
   ```
5. En **Cloudflare → DNS → Records (`nomercygames.me`)**:
   - Borrá los 4 registros `A` viejos de GitHub Pages (`185.199.108-111.153`).
   - Creá un registro **`A`**: Name `@` → Value `<IP pública de la VM Azure>` → **Proxied (nube naranja)**.
   - En **SSL/TLS → Edge Certificates**, activá **Always Use HTTPS**.
   *(Opcional: para usar **Full (strict)** en Cloudflare, generá un Origin Certificate gratis en Cloudflare SSL/TLS → Origin Server y montalo en Nginx en el puerto 443).*

---

## Opción 2: Azure Container Apps / Render.com (PaaS gestionado, 0 administración de VM)

### En Render.com (gratis sin tarjeta)
1. Entrá a https://render.com → **New → Web Service** → conectá el repo `Proyecto-Integrador`.
2. Runtime: **Docker** (detecta automáticamente el `Dockerfile` de la raíz).
3. Cargá las variables de entorno en *Environment* (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `EMAIL_USER`, `EMAIL_PASS`, `FRONTEND_URL=https://nomercygames.me`).
4. En **Settings → Custom Domains**, agregá `nomercygames.me`.
5. En **Cloudflare → DNS**: reemplazá los 4 `A` de GitHub Pages por el `CNAME` (`@` → `<tu-app>.onrender.com`, Proxied) y dejá SSL/TLS en **Full (strict)**.

