# Arquitectura Docker Swarm — Undersounds

Documentación técnica sobre la arquitectura de despliegue con Docker Swarm, Nginx, MongoDB Replica Set y autoescalabilidad.

---

## Flujo de una Petición

```
Internet
   │
   ▼ puerto 8081
┌─────────────────────────┐
│   Routing Mesh (Capa 0) │  ← Docker Swarm intercepta la conexión
└────────────┬────────────┘
             │
   ┌──────── ▼ ────────┐
   │  Nginx x3 (Capa 1)│  ← Balanceo entre réplicas de Nginx
   └────────┬──────────┘
            │
   ┌─────── ▼ ─────────┐
   │ Backend x3 (Capa 2)│  ← Nginx balancea entre réplicas del backend
   └────────┬───────────┘
            │
   ┌─────── ▼ ──────────────────┐
   │ MongoDB Replica Set (Capa 3)│  ← 3 nodos: mongo1, mongo2, mongo3
   └────────────────────────────┘
```

1. **Entrada:** El usuario llega al puerto `8081`.
2. **Routing Mesh (Capa 0):** Docker Swarm recibe la conexión en cualquier nodo físico.
3. **Balanceo Nginx (Capa 1):** Swarm entrega la petición a una de las 3 réplicas de Nginx.
4. **Balanceo Backend (Capa 2):** Nginx pasa la petición al servicio `backend`; Swarm balancea entre las 3 réplicas.
5. **Consistencia Mongo (Capa 3):** El backend escribe/lee en el Replica Set de MongoDB.

---

## Nginx como Proxy Inverso

La configuración de Nginx define qué hacer cuando alguien llega a la raíz (`/`) del sitio:

```nginx
location / {
    proxy_pass http://backend_servers;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

| Directiva | Descripción |
|---|---|
| `proxy_pass` | Reenvía la petición al grupo de servidores definido en `upstream` |
| `proxy_set_header Host` | Informa al backend el dominio original al que accedió el usuario |
| `proxy_set_header X-Real-IP` | Pasa la IP real del cliente; sin esto, el backend vería solo la IP de Nginx |

---

## Routing Mesh vs Nginx: ¿Redundancia?

Aunque ambos balancean carga, operan en capas distintas y son complementarios:

| | Docker Swarm (Routing Mesh) | Nginx |
|---|---|---|
| **Capa** | Transporte (TCP/UDP) | Aplicación (HTTP) |
| **Analogía** | Conserje que mira el número de habitación (puerto) | Recepcionista que lee el contenido del paquete |
| **Tipo de balanceo** | Round Robin "ciego" | Inteligente (sticky sessions, health checks HTTP) |
| **Conocimiento del protocolo** | Solo conexiones de red | Entiende HTTP completamente |

**Capacidades adicionales de Nginx:**
- **Sticky Sessions:** Mantiene a un usuario conectado siempre a la misma réplica del backend.
- **Health Checks avanzados:** Deja de enviar tráfico a un backend si devuelve errores HTTP específicos.

---

## Réplicas de Nginx y Conflicto de Puertos

> *"Si tengo varias réplicas de Nginx, ¿no habría problema con los puertos?"*

No hay conflicto gracias al **Routing Mesh** de Docker Swarm:

- Cuando se declara `"8081:80"` en modo Swarm, Docker reserva ese puerto en **el clúster**, no en un contenedor individual.
- **Virtualización de IP:** Cada réplica de Nginx tiene su propia IP interna dentro de la red `appnet`, por lo que todas pueden usar el puerto 80 internamente sin colisión.
- **Ingress Load Balancer:** Swarm reserva el puerto `8081` en todos los nodos físicos. El Routing Mesh actúa como crupier: recibe la conexión y la redirige a una réplica libre y saludable.

**Ventajas de múltiples réplicas de Nginx:**

- **Balanceo de carga:** Con 1.000 usuarios simultáneos, Swarm reparte ~333 a cada réplica.
- **Zero Downtime Updates:** Al actualizar `nginx.conf`, Swarm reinicia las réplicas de una en una; las demás siguen activas.
- **Resiliencia:** Si una réplica falla, el Routing Mesh deja de enviarle tráfico al instante y Swarm levanta un sustituto.

**El único detalle externo: Tu DNS**

Como Swarm abre el puerto en todos los nodos, la única precaución que debes tomar es de cara al exterior (en tu proveedor de dominio como Cloudflare, GoDaddy, etc.).

En lugar de apuntar tu dominio (mi-app.com) a la IP de un solo nodo, debes configurar múltiples registros de tipo A apuntando a las IPs de todos tus nodos de Swarm:

mi-app.com ➔ A ➔ IP_NODO_1
   
mi-app.com ➔ A ➔ IP_NODO_2
   
mi-app.com ➔ A ➔ IP_NODO_3
   
Si el Nodo 1 explota físicamente, los navegadores de los usuarios intentarán conectar con la IP del Nodo 2 o Nodo 3, donde la malla de Swarm recibirá el tráfico y se lo entregará 
a los contenedores de Nginx que queden vivos. ¡Redundancia total sin instalar nada extra!

---

## MongoDB: Robustez con Replica Set

### Configuración del Replica Set (`rs0`)

```
mongodb://mongo1:27017,mongo2:27017,mongo3:27017/undersounds?replicaSet=rs0
```

- **Red Overlay:** El driver `overlay` permite que los contenedores se comuniquen entre distintos nodos físicos del clúster usando nombres de servicio (`mongo1`, `mongo2`, `mongo3`).
- **Tolerancia a fallos:** Si el nodo primario (`mongo1`) cae, los restantes votan y eligen un nuevo primario automáticamente; la aplicación continúa sin interrupción.
- **Replicación:** Los datos se mantienen consistentes entre los 3 nodos.

### Ventajas de usar Swarm para el Replica Set

- **DNS interno:** Los contenedores se comunican por nombre de servicio, independientemente de si cambian sus IPs internas al reiniciarse.
- **Aislamiento de red:** El tráfico de replicación de datos es privado y seguro dentro del clúster gracias a la red `overlay`.

---

## Autoescalabilidad

> Docker Swarm **no escala automáticamente** por carga de CPU/tráfico de forma nativa. Se requiere una solución externa.

### Componentes necesarios

1. Un monitor de métricas (CPU, tráfico, latencia).
2. Un script o herramienta externa.
3. Ese script ejecuta `docker service scale` según las métricas.

### Ejemplo de lógica de autoescalado

```bash
# Si CPU del backend supera el 70% durante X minutos:
docker service scale undersounds_backend=8

# Si CPU baja del 30%:
docker service scale undersounds_backend=3
```

### Estrategia recomendada en local

- Mantener el stack en Swarm.
- Escalar manualmente antes de un pico de tráfico previsto.
- Nginx seguirá balanceando automáticamente entre las nuevas réplicas.

---

## ¿Por qué Docker Swarm?

### 1. Alta Disponibilidad (HA)

- **Self-healing:** Swarm monitoriza el estado de los contenedores y los reinicia automáticamente en un nodo saludable si fallan.
- **Sin puntos únicos de fallo:** Con 3 réplicas de MongoDB y del backend, el sistema sobrevive a la caída de un servidor físico sin que el usuario lo note.

### 2. Escalabilidad Horizontal

- **Escalado sencillo:** Pasar de 3 a 10 réplicas con un único comando.
- **Balanceo nativo:** El Routing Mesh distribuye el tráfico sin necesidad de configurar hardware externo.

```bash
docker service scale undersounds_backend=10
```

### 3. Zero Downtime Updates

- **Rolling Updates:** Actualiza los nodos de uno en uno; el servicio nunca está caído durante el mantenimiento.
- **Rollback automático:** Si la nueva versión falla al arrancar, Swarm vuelve automáticamente a la versión anterior estable.

### 4. Orquestación del Replica Set de MongoDB

- Resolución de nombres DNS interna para mantener el Replica Set unido aunque cambien las IPs.
- Aislamiento de red mediante el driver `overlay`.

---

## Explicación Detallada del Flujo

### 1. Entrada al Routing Mesh

Un usuario o el frontend (`undersounds-frontend`) realiza una petición a la API. Esta llega al clúster de Docker Swarm. El servicio `nginx` publica el puerto `8081` (`ports: - "8081:80"`), y Swarm intercepta todo el tráfico en ese puerto mediante su Routing Mesh.

### 2. Routing Mesh → Réplicas de Nginx

El Routing Mesh actúa como primer balanceador de carga. Distribuye la petición de forma equitativa entre las **3 réplicas del servicio `nginx`** (`deploy: replicas: 3`). Si una réplica falla, el tráfico se redirige automáticamente a las activas.

### 3. Nginx → Réplicas del Backend

Cada réplica de Nginx actúa como **proxy inverso y segundo balanceador de carga**. Reenvía la petición al `upstream` llamado `backend_servers`. Este, a su vez, apunta al nombre de servicio `backend`.

Aquí ocurre la magia de la colaboración:
1.  Nginx le pide al DNS interno de Docker Swarm la dirección de `backend`.
2.  Swarm responde no con una, sino con **todas las IPs** de las réplicas del backend que están sanas.
3.  Nginx recibe esa lista y usa su propio algoritmo de balanceo (por defecto, Round Robin) para elegir a cuál de las réplicas le enviará la petición.

Es una arquitectura muy robusta: Swarm se encarga de la disponibilidad de las réplicas y Nginx del balanceo inteligente a nivel de aplicación (HTTP).

### 4. Backend → Replica Set de MongoDB

La réplica del backend que recibe la petición se conecta al Replica Set `rs0` usando la cadena de conexión con los 3 nodos. Al conectarse al Replica Set en lugar de a una instancia única, la aplicación obtiene **tolerancia a fallos**: si el primario cae, los otros nodos eligen uno nuevo y la aplicación sigue funcionando sin interrupción.

---

## CI/CD

### 1. CI: Continuous Integration

Usaremos GitHub Actions.

Sirve para asegurar que el codigo compila y es perfectamente válido antes de que rompa el entorno de producción o el trabajo de tus compañeros.

Corre en una máquina virtual de GitHub completamente limpia y desde cero, ejecuta npm install. Te avisa a ti antes de que afecte a producción.

Si te dejaste una variable mal declarada, rompiste un tipo de dato o hay un error de sintaxis grave, el build fallará y sabrás que linea reparar.

En nuestro caso, que no tenemos tests, solo revisa si el proyecto no está roto y tiene todo lo que necesita.

Se ejecuta cada vez que hacemos un push.

### 2. CD: Continuous Deployment

Proceso que toma tu código aprobado por el CI, lo empaqueta y lo sube a Internet para que tus usuarios puedan usarlo, sin que tengas que hacer nada.

Toma el código limpio, elimina archivos de desarrollo que no se necesitan en Internet y prepara los archivos finales de produccion.

Se conecta al servidor: Abre una conexión segura con tu hosting (Render, AWS o tu propio servidor Linux).

Sube los archivos y reinicia la aplicación.

Por último veirfica que esté viva.

Al hacer git push se verifica el codigo con el CI, si se aprueba el CD detecta el cambio y lanza la nueva version.

---

## CI/CD Pipeline

### ¿Por qué es importante?

Un pipeline de integración y despliegue continuo automatiza:
1. Las pruebas cada vez que haces push a GitHub.
2. La construcción de la imagen Docker.
3. El push a un registro (Docker Hub, ghcr.io).
4. El despliegue automático en Swarm.

**Sin CI/CD:** Desplegar requiere pasos manuales, errores humanos, downtime.
**Con CI/CD:** Cada commit pasa por pruebas y se despliega automáticamente si es válido.

### Flujo con GitHub Actions

```
1. Developer hace push a GitHub
   │
   ▼ (Trigger webhook)
2. GitHub Actions inicia workflow
   │
   ├─ Ejecuta tests (npm test)
   │
   ├─ Build imagen Docker
   │  └─ docker build -t ghcr.io/usuario/undersounds-backend:latest .
   │
   ├─ Push a registro (GHCR)
   │  └─ docker push ghcr.io/usuario/undersounds-backend:latest
   │
   ▼
3. SSH a nodo Swarm + actualiza servicio
   └─ docker pull + docker service update
   
   ▼
4. Swarm hace Rolling Update (sin downtime)
   └─ Reinicia réplicas una a una
```
### Ventajas de este enfoque

| Ventaja | Impacto |
|---|---|
| **Automatización** | 0 pasos manuales; reduce errores |
| **Rapidez** | Deploy en < 5 minutos |
| **Trazabilidad** | Cada deploy enlazado a commit |
| **Rollback automático** | Si el health check falla, Swarm vuelve a versión anterior |
| **Escalabilidad** | Mismo pipeline para 3 réplicas o 100 |

## Patrones de Red y Resiliencia

### El Problema: ¿Qué pasa si una réplica es lenta?

En una arquitectura distribuida, un solo componente lento puede "contagiar" el sistema entero.

**Ejemplo sin resiliencia:**
```
Cliente 1 → Backend 1 (2ms)      ✓ Rápido
Cliente 2 → Backend 2 (2ms)      ✓ Rápido
Cliente 3 → Backend 3 (500ms)    ✗ Lento (base de datos no responde)
            ↓
Timeout del Cliente 3 (30s)
↓
Nginx aguarda a Backend 3 durante 30s
↓
Socket de Nginx agotado → Otros clientes se quedan sin respuesta
↓
"Backend crashed" (en realidad, Nginx está saturado esperando Backend 3)
```

### Solución: Patrones de Resiliencia

#### 1. **Circuit Breaker (Disyuntor)**

Evita que una réplica del servicio que funciona mal "contagie" y ralentice todo el sistema.

```nginx
# En Nginx: Si una de las réplicas del backend no responde, Nginx puede dejar de enviarle tráfico.

upstream backend_servers {
    # Docker Swarm resuelve 'backend' a las IPs de todas las réplicas activas.
    # Nginx aplicará estas reglas a cada una de ellas de forma individual.
    # Si una réplica falla 3 veces en 10 segundos, Nginx la marca como "caída"
    # y deja de enviarle tráfico durante esos 10s, permitiendo que se recupere.
    server backend:5000 max_fails=3 fail_timeout=10s;
}

# El tráfico se reparte automáticamente entre las réplicas que quedan sanas.
```

**Estado del Circuit:**
- **CLOSED** (normal): Nginx envía tráfico normalmente.
- **OPEN** (desconectado): Nginx no envía tráfico, Backend 3 descansa.
- **HALF-OPEN** (prueba): Nginx prueba con 1 request cada 10s.
  - Si responde → CLOSED (recuperado).
  - Si falla → OPEN (sigue caído).

#### 2. **Retry Logic (Reintentos)**

Si falla una petición, reintentar con otra réplica.

```nginx
location / {
    proxy_pass http://backend_servers;
    proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
    proxy_next_upstream_tries 3;
    proxy_next_upstream_timeout 5s;
}
```

**Flujo:**
1. Envía petición a Backend 1 → Timeout
2. Retry: Envía a Backend 2 → OK (responde)
3. Cliente recibe respuesta sin saber que hubo fallo

#### 3. **Rate Limiting (Limitación de tasa)**

Evita que un cliente spam demore a los demás.

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://backend_servers;
}
```

**Explicación:**
- `rate=10r/s`: Máximo 10 requests/segundo por IP.
- `burst=20`: Permite picos de 20 requests siempre que el promedio sea 10/s.
- Si un cliente hace 50 requests/s → Nginx rechaza los que superen el límite (429 Too Many Requests).

#### 4. **Timeouts**

Evitar esperas infinitas.

```nginx
location / {
    proxy_pass http://backend_servers;
    proxy_connect_timeout 5s;    # Espera 5s para conectar
    proxy_send_timeout 5s;       # Espera 5s para que Backend lea
    proxy_read_timeout 10s;      # Espera 10s para que Backend responda
}
```

Si Backend no responde en 10s → Nginx envía 504 Gateway Timeout.

### Implementación en nuestra arquitectura

```
Cliente
  │
  ▼
Nginx (Rate Limiting + Circuit Breaker)
  │
  ├─ Si rate limit → Rechaza (429)
  ├─ Si Backend falla 3 veces → Circuito abierto
  └─ Si OK → Retry Logic (reintentar con otra réplica si falla)
  │
  ▼
Backend 1/2/3 (con timeouts)
  │
  ▼
MongoDB Replica Set
```

### Tabla: Comparación de patrones

| Patrón | Problema que resuelve | Dónde implementar |
|---|---|---|
| **Circuit Breaker** | Un backend lento mata al sistema | Nginx |
| **Retry Logic** | Fallos transitorios | Nginx |
| **Rate Limiting** | Clientes abusivos satureando | Nginx |
| **Timeouts** | Conexiones colgadas infinitas | Nginx + Backend |
| **Health Checks** | Detectar backends muertos | Nginx + Swarm |

---

## Docker Swarm vs Kubernetes (para 25 usuarios)

### El Escenario: ¿Qué elegir para una app con 25 usuarios?

**Requisitos:**
- 25 usuarios simultáneos.
- App Node.js + MongoDB.
- Equipo pequeño (tu grupo).
- Presupuesto: Máquinas viejas o cloud barato.

### Comparación: Swarm vs Kubernetes

| Criterio | Docker Swarm | Kubernetes (k8s) |
|---|---|---|
| **Curva de aprendizaje** | Fácil (1-2 días) | Difícil (2-4 semanas) |
| **Configuración** | `docker-compose.yml` | YAML + Helm + CRDs |
| **Líneas de config** | ~50 líneas | ~500 líneas |
| **Escalado** | `docker service scale` | Horizontal Pod Autoscaler (HPA) |
| **Self-healing** | ✓ Reinicia contenedores | ✓ Reinicia pods |
| **Load balancing** | Routing Mesh (simple) | Service + Ingress (potente) |
| **Networking** | Overlay simple | CNI plugins (Flannel, Calico) |
| **Recursos mínimos** | 3 máquinas (1GB RAM c/u) | 3 masters + workers (2GB+ c/u) |
| **Community** | Pequeña | ENORME (estándar industria) |
| **Capacidad** | Hasta ~1000 nodos | 5000+ nodos (Google usa internamente) |
| **Mantenimiento** | Bajo | Alto (actualizaciones, parches) |
| **Vendor lock-in** | Bajo | Bajo (portable) |

### Para 25 usuarios: ¿Por qué Swarm es mejor?

1. **Overhead bajo:** Swarm consume ~100MB RAM por nodo. k8s consume ~500MB+ solo en control plane.
2. **Configuración rápida:** `docker-compose.yml` vs 10 archivos YAML.
3. **Escalable suficiente:** 3 réplicas con Swarm soportan 100+ usuarios sin problemas.
4. **Mantén el foco:** Aprendes a escalar distribuida sin perderte en k8s.

### Cuándo cambiar a Kubernetes

Cuando tu app crezca a:
- **100+ usuarios**: Swarm empieza a sentirse limitado.
- **Multi-región:** k8s es mejor para federar clusters.
- **Múltiples lenguajes:** k8s gestiona cualquier contenedor; Swarm es más Docker-centric.
- **Dependencias complejas:** k8s con Service Mesh (Istio).
- **Empresa grande:** k8s es estándar.

**Migración:** Lo bueno es que ambos usan Docker, así que migraste 70% del trabajo ya.

---

## Gestión de Actualizaciones: Zero Downtime Deployment

### El Problema: Actualizar sin que los usuarios lo noten

**Sin estrategia:** Parar app → Actualizar → Iniciar. Usuarios: "¿Qué está pasando?" Downtime: 2-5 minutos.

**Con estrategia:** Mantener servicio activo durante toda la actualización.

### Estrategia 1: Rolling Update (Ya lo tienes)

```
Estado inicial:
  Backend Replica 1: v1.0 ✓
  Backend Replica 2: v1.0 ✓
  Backend Replica 3: v1.0 ✓

Paso 1: Actualizar Replica 1
  Backend Replica 1: v1.1 (reiniciando)
  Backend Replica 2: v1.0 ✓ ← Tráfico aquí
  Backend Replica 3: v1.0 ✓ ← Tráfico aquí

Paso 2: Actualizar Replica 2
  Backend Replica 1: v1.1 ✓
  Backend Replica 2: v1.1 (reiniciando)
  Backend Replica 3: v1.0 ✓ ← Tráfico aquí

Paso 3: Actualizar Replica 3
  Backend Replica 1: v1.1 ✓
  Backend Replica 2: v1.1 ✓
  Backend Replica 3: v1.1 (reiniciando)

Final:
  Backend Replica 1: v1.1 ✓
  Backend Replica 2: v1.1 ✓
  Backend Replica 3: v1.1 ✓

Tiempo total: ~3 minutos (con health checks de 30s cada uno)
Downtime: 0 minutos
```

**Configuración en Docker Compose:**
```yaml
services:
  backend:
    image: undersounds-backend:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1           # Actualiza 1 réplica a la vez
        delay: 10s               # Espera 10s entre réplicas
        failure_action: rollback # Si falla, vuelve a versión anterior
      restart_policy:
        condition: on-failure
        delay: 5s
```

### Estrategia 2: Blue-Green Deployment
Para garantizar la alta disponibilidad de la aplicación y minimizar los riesgos durante los lanzamientos de nuevas versiones.

Mantenemos dos entornos de producción idénticos pero aislados:

1. Entorno Azul (Blue): Es el entorno que está actualmente activo y recibiendo el 100% del tráfico de los usuarios reales.

2. Entorno Verde (Green): Es el entorno de reserva (en espera), donde se despliega y prueba la nueva versión del software de forma segura antes de pasar a producción.Para cambios críticos o si quieres rollback instantáneo.

### Flujo de Trabajo

[ Tráfico Usuario ] -> [ Enrutador/Balanceador ]

|

|---> [ Entorno Azul ] (Versión Actual v1.0)

|---> [ Entorno Verde ] (Nueva Versión v2.0 - En Pruebas)

Despliegue Seguro: La nueva versión del código se despliega exclusivamente en el entorno que está libre (Verde).

Fase de Pruebas: Se realizan las verificaciones necesarias en el entorno Verde sin afectar la experiencia de los usuarios reales.

Cambio de Tráfico (Switch): Una vez validada la estabilidad, el enrutador o balanceador de carga redirige el tráfico hacia el entorno Verde de forma instantánea.

Reserva: El entorno Azul pasa a quedar en espera para el próximo ciclo de actualización.

## Beneficios Clave:

1. Cero Tiempo de Inactividad (Zero Downtime): El cambio de tráfico entre entornos es casi instantáneo, eliminando las pantallas de mantenimiento para el usuario.

2. Rollback Inmediato y Seguro: Si se detecta un error crítico tras el lanzamiento, revertir el cambio es tan simple como redirigir el tráfico de vuelta al entorno anterior (Azul), el cual permanece intacto.

3. Pruebas en Entornos Reales: Permite validar el comportamiento del software en una infraestructura idéntica a la de producción antes de abrirla al público.

```
ANTES:

  Nginx (Load Balancer)
  │
  ▼
Blue:   Backend v1.0 (3 réplicas) ← Usuarios aquí
Green:  Backend v1.1 (3 réplicas)  ← En espera (sin tráfico)

Probar Green:
  - Pruebas de humo: ¿Responde correctamente?
  - ¿Base de datos OK?
  - ¿API endpoints funcionan?

DESPUÉS (Si todo OK):

  Nginx actualiza router
  │
  ▼ (cambio instantáneo)
Blue:   Backend v1.0 (3 réplicas)  ← Sin tráfico (backup)
Green:  Backend v1.1 (3 réplicas) ← Usuarios aquí

Si algo falla:
  Nginx revierte el router en < 1 segundo
  ← Usuarios vuelven a v1.0
```

**Ventajas:**
- Rollback instantáneo (no 3 minutos como Rolling Update).
- Cero impacto durante la actualización.
- Puedes validar completamente antes de flip.

**Desventaja:**
- Necesita el doble de recursos (2 sets de réplicas).

### Estrategia 3: Canary Deployment

Actualización gradual en % de tráfico.

```
Inicial:
  v1.0: 100% del tráfico (100 usuarios)
  v1.1: 0% del tráfico

Canary (1%):
  v1.0: 99% del tráfico (99 usuarios)
  v1.1: 1% del tráfico (1 usuario) ← Observar metricas

Si todo OK después de 5 min:

Canary (10%):
  v1.0: 90%
  v1.1: 10% ← Más usuarios probando

Si todo OK:

Canary (50%):
  v1.0: 50%
  v1.1: 50%

Si todo OK:

Final:
  v1.0: 0%
  v1.1: 100%
```

**Beneficio:** Si v1.1 tiene un bug, solo afecta el 1-10% de usuarios inicialmente.

### Comparación de estrategias

| Estrategia | Downtime | Rollback | Recursos | Validación |
|---|---|---|---|---|
| **Rolling Update** | 0 | 3 minutos | Normal | Media |
| **Blue-Green** | 0 | < 1s | El doble | Alta |
| **Canary** | 0 | Gradual | Normal | Muy alta |

---

## Sharding para Bases de Datos Masivas

### El Problema: "Cientos de GB de datos"

**Replica Set (Lo que tienes ahora):**
- 3 nodos con copia exacta de los datos.
- Cada nodo almacena TODO: 500 GB × 3 = 1.5 TB total.
- ✓ Alta disponibilidad (si cae 1, quedan 2).
- ✗ No escala el almacenamiento (cada nodo necesita 500 GB).

**Sharding:**
- Datos particionados entre múltiples nodos.
- Nodo 1: usuarios A-G (100 GB).
- Nodo 2: usuarios H-N (100 GB).
- Nodo 3: usuarios O-Z (100 GB).
- Cada shard tiene su Replica Set (HA + Sharding).

### Arquitectura con Sharding

```
Query: "Dame usuario 'alice@example.com'"

Mongos (Router)
│
├─ Hash: alice@example.com → Shard 1 (A-G)
│
▼
Shard 1 Replica Set
  ├─ Primary (100 GB)
  ├─ Secondary (100 GB)
  └─ Secondary (100 GB)
  
(Responde: "alice" encontrado)
```

### Cuándo usar Sharding

- **Datos > 100 GB per-node:** Empieza a considerar.
- **Writes > 10,000/segundo:** Sharding distribuye carga.
- **Baja latencia requerida:** Sharding acerca datos a usuarios (geográficamente).

**Para 25 usuarios iniciales:** Replica Set es suficiente.
**Para 1000+ usuarios:** Evalúa Sharding.

