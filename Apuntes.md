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

Cada réplica de Nginx actúa como **proxy inverso y segundo balanceador de carga**. Reenvía la petición al servicio `backend` por nombre de servicio; Swarm resuelve el nombre y balancea entre las **3 réplicas del backend**.

Esta capa es fundamental para:
- **Seguridad:** Oculta la estructura interna de la API.
- **Escalabilidad:** Gestiona el tráfico hacia un número variable de réplicas.

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

Se ejecuta cada vez que hacemos un pull.

### 2. CD: Continuous Deployment

Proceso que toma tu código aprobado por el CI, lo empaqueta y lo sube a Internet para que tus usuarios puedan usarlo, sin que tengas que hacer nada.

Toma el código limpio, elimina archivos de desarrollo que no se necesitan en Internet y prepara los archivos finales de produccion.

Se conecta al servidor: Abre una conexión segura con tu hosting (Render, AWS o tu propio servidor Linux).

Sube los archivos y reinicia la aplicación.

Por último veirfica que esté viva.

Al hacer git push se verifica el codigo con el CI, si se aprueba el CD detecta el cambio y lanza la nueva version.

---

## BLUE-GREEN

Para garantizar la alta disponibilidad de la aplicación y minimizar los riesgos durante los lanzamientos de nuevas versiones.

Mantenemos dos entornos de producción idénticos pero aislados:

1. Entorno Azul (Blue): Es el entorno que está actualmente activo y recibiendo el 100% del tráfico de los usuarios reales.

2. Entorno Verde (Green): Es el entorno de reserva (en espera), donde se despliega y prueba la nueva versión del software de forma segura antes de pasar a producción.

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
