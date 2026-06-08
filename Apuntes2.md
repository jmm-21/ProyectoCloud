# Arquitectura AWS - Undersounds

Actualizacion con el despliegue de la web en los servicios de AWS.

---

## 1. High-Level Overview & Core Infrastructure

The network architecture is built upon a dedicated *VPC (Virtual Private Cloud)* that isolates and secures all underlying computational resources.

To implement industry-standard *High Availability (HA) and Fault Tolerance, the VPC is horizontally partitioned into **three distinct Subnets* spanning different Availability Zones.

By distributing resources across three isolated subnets, the architecture eliminates any Single Point of Failure (SPOF) at the data center level. If one of AWS’s physical zones experiences an outage, the traffic router dynamically re-routes requests to the remaining healthy infrastructure seamlessly.

## 2. Containerized Microservices Layer (AWS ECS)
The core application logic of UnderSounds is decoupled into a containerized microservices pattern using *AWS ECS (Elastic Container Service)*.

Instead of managing monolithic virtual machines, the platform relies on lightweight Docker containers managed by an ECS Cluster (cluster-undersounds2). This layer is explicitly split into two decoupled services running simultaneously across all three subnets:

 * *frontend-service*: Handles the user interface, client-side routing, and static asset delivery.
 * *backend-service*: Exposes the REST API, processes business logic, and manages core application workflows.

Because ECS automatically provisions and balances tasks across the three subnets, both the frontend and backend scale horizontally and maintain continuous uptime.

## 3. Container Management & Storage (AWS ECR)

To power the ECS cluster, the architecture incorporates *AWS ECR (Elastic Container Registry)*.

 * ECR acts as our secure, private Docker image repository.
 * It hosts immutable, version-controlled blueprints of both the frontend-service and backend-service.
 * When the cluster needs to scale out or deploy an update, it securely pulls the specific compiled Docker images directly from ECR, ensuring rapid deployment and environment consistency.


## Flujo de una Peticion

```
I       nternet (Usuarios)
                 │
                 ▼ puerto 80
┌───────────────────────────────────┐
│ Application Load Balancer (ALB)   │  ← AWS sustituye al Routing Mesh y a los Nginx balanceadores
└────────────────┬──────────────────┘
                 │
       ┌─────────┴─────────┐
       ▼ (Ruta /)          ▼ (Ruta /api)
┌──────────────┐    ┌───────────────────────────────────┐
│  Frontend    │    │      Target Groups (Capa 1)       │  ← Gestionan el juego Blue/Green
│ (Contenedor) │    │ ┌───────────────────────────────┐ │
└──────────────┘    │ │  TG-Blue  OR     TG-Green     │ │
                    │ └───────────────┬───────────────┘ │
                    └─────────────────┼─────────────────┘   
                                      │
                                      ▼
                    ┌───────────────────────────────────┐
                    │     AWS ECS Cluster (Capa 2)      │  ← AWS orquesta vuestros contenedores
                    │   ┌───────────────────────────┐   │
                    │   │    Backend (Node.js)      │   │  ← Recibe el tráfico limpio del ALB
                    │   └─────────────┬─────────────┘   │
                    └─────────────────┼─────────────────┘
                                      │
                                      ▼
                    ┌───────────────────────────────────┐
                    │      Base de Datos (Capa 3)       │  ← Instancia aislada en Subnet Privada
                    │             (MongoDB)             │
                    └───────────────────────────────────┘
```

---

## MongoDB

Para la capa de datos de nuestra arquitectura, se ha optado por un modelo de Base de Datos como Servicio (DBaaS) utilizando MongoDB Atlas. En lugar de desplegar y mantener un clúster de bases de datos dentro de nuestras propias instancias de AWS, el almacenamiento de datos se externaliza a una infraestructura totalmente gestionada.

La comunicación entre los servicios de computación en AWS y la base de datos externa se realiza mediante un enlace por cadena de conexión seguro (Connection String).

¿Cómo funciona el flujo de conexión?

Inyección de la URI mediante variables de entorno:
La dirección de acceso del clúster (el "enlace") se almacena de forma segura en las Task Definitions de AWS ECS o en el gestor de secretos como una variable de entorno (habitualmente llamada MONGO_URI). La cadena de conexión sigue el formato estándar de alta disponibilidad:

mongodb+srv://<usuario>:<password>@cluster-undersounds.mongodb.net/database_name

Resolución mediante DNS (El protocolo mongodb+srv):

El prefijo +srv le indica a nuestro Backend (Node.js) que consulte los registros DNS de MongoDB Atlas. De forma automática, Atlas le devuelve al contenedor las direcciones IP de los tres nodos reales (el Replica Set: el nodo primario de escritura y los secundarios de lectura) que componen el clúster. Por defecto, la arquitectura estándar de MongoDB Atlas (incluso la capa gratuita Tier M0) te monta un Replica Set de 3 nodos independientes gestionados por ellos

---

## Autoescalabilidad

Al migrar a AWS, sustituimos la gestión estática de réplicas de Docker Swarm por AWS ECS Service Auto Scaling. Mediante alarmas de Amazon CloudWatch basadas en el uso de CPU, la infraestructura es capaz de duplicar horizontalmente el número de contenedores de Backend ante picos de tráfico, registrándolos dinámicamente en el ALB. Una vez normalizado el servicio, el sistema reduce los contenedores automáticamente, logrando una arquitectura elástica, de alta disponibilidad y optimizada en costes.

---

## CI/CD

```
[ Tu PC ] ── git push ──► [ GitHub Actions ]
                                │ (Build & Push)
                                ▼
                       [ Amazon ECR ] (Imágenes Docker)
                                │
                                ▼ (Despliegue Blue/Green)
                       [ AWS ECS Cluster ]
                         ┌───────────┐
                         ▼           ▼
                   [TG-Blue]       [TG-Green]
                       │               │
                       ▼               ▼
                 (Versión 1)     (Versión 2)
                       ▲               ▲
                       └───────┬───────┘
                               │ (Cambiazo de tráfico)
                          [ AWS ALB ]
```

### Paso 1: La Integración Continua (CI) en GitHub Actions

Todo empieza en nuestro repositorio de GitHub. Cuando terminamos una mejora en el código del Backend o del Frontend y hacéis un git push main:

Disparador (Trigger): GitHub Actions detecta el cambio y arranca el Workflow (vuestro archivo .yml).

Pruebas (Testing): El pipeline levanta un entorno virtual, descarga vuestro código y ejecuta los tests automáticos para asegurarse de que el nuevo código no rompe nada.

Construcción (Build): GitHub Actions se loguea en vuestra cuenta de AWS usando las credenciales y ejecuta el comando de Docker para compilar las nuevas imágenes:

docker build -t undersounds-backend .

Empuje (Push) a Amazon ECR: GitHub Actions sube las nuevas imágenes empaquetadas a vuestros repositorios de Amazon ECR (undersounds-backend y undersounds-frontend). Cada imagen se sube con una etiqueta nueva (por ejemplo, el ID del commit de Git) para que no se machaquen las versiones anteriores.

### Paso 2: El Despliegue Continuo (CD) con Estrategia Blue/Green
Aquí es donde ocurre la magia de AWS para actualizar la app con "Zero-Downtime". Imaginemos que la web actual (Versión 1) está corriendo en el entorno Blue.

Creación del entorno Green: GitHub Actions le avisa a AWS ECS de que hay una nueva imagen en ECR. ECS no apaga los contenedores que están funcionando (Blue). En su lugar, levanta una nueva Task Definition (Versión 2) en un entorno paralelo llamado Green.

El test de salud (Health Check): Los nuevos contenedores Green arrancan en la sombra. El Target Group Green empieza a enviarles peticiones de prueba automáticas (Health Checks) para comprobar que el servidor de Node.js responde correctamente. Los usuarios externos siguen navegando en los contenedores Blue sin enterarse de nada.

El "Cambiazo" de tráfico (Switch): Una vez que AWS ECS comprueba que todos los contenedores Green están sanos y listos le da la orden al Application Load Balancer (ALB) de cambiar las tornas.

El ALB, de forma instantánea y fluida, empieza a redirigir el 100% del tráfico de los usuarios hacia el Target Group Green.

Apagado del entorno antiguo: Los usuarios ya están usando la nueva versión (Green). El ALB mantiene los contenedores Blue encendidos durante unos minutos por si acaso algo fallara (volver a Blue en un milisegundo). Si todo va bien, ECS apaga ordenadamente los contenedores viejos (Blue) para no consumir recursos.

---

## EL enlace para nuestra aplicación

El enlace de acceso a la aplicación corresponde al DNS Name público del Application Load Balancer (ALB), cuyo formato ([Nombre]-[ID].[Región].elb.amazonaws.com) identifica el recurso en la región de Estocolmo (eu-north-1). Se utiliza este direccionamiento en lugar de IPs estáticas debido a que los contenedores en AWS ECS poseen IPs efímeras que cambian en cada despliegue. El DNS del ALB actúa como un punto de entrada único e invariable, abstrayendo la infraestructura interna y permitiendo el enrutamiento por caminos (/ frente a /api) hacia las subredes correspondientes.

El nombre de DNS provisto por el ALB es una dirección provisional y por defecto. Para un despliegue comercial, la arquitectura permite asociar un dominio personalizado (ej. undersounds.com) mediante Amazon Route 53. Esto se realiza configurando un Registro Alias que mapea el dominio propio hacia el DNS del balanceador. Adicionalmente, el proceso requeriría generar un certificado SSL/TLS mediante AWS Certificate Manager (ACM) acoplado al ALB para habilitar el protocolo seguro HTTPS (puerto 443) de cara a los usuarios finales.

---

## Patrones de red

### El Patrón DMZ / Subredes Públicas y Privadas (El más importante)

Este es el patrón de seguridad por excelencia en la nube. Consiste en dividir nuestra red (VPC) en dos zonas aisladas:

    Subred Pública (La "Capa Exteror"): Es la única zona con acceso directo a Internet gracias a un componente llamado Internet Gateway. Aquí solo se coloca el Balanceador de Carga (ALB).

    Subred Privada (La "Capa Interior"): No tiene acceso directo desde el exterior. Aquí se esconden nuestros contenedores de ECS (Front y Back) y la Base de Datos si la movemos ahí.

¿Cómo funciona este patrón? El tráfico de internet entra obligatoriamente por el ALB en la subred pública. El ALB actúa como un "muro de contención" y redirige el tráfico hacia la subred privada de forma controlada. Si un atacante intenta conectarse directamente a la IP de nuestro    backend, la red de AWS lo bloquea porque la subred privada es invisible desde el exterior.

### El Patrón de Microservicios con Balanceador de Carga Interno (o Enrutamiento por Caminos)

En local, teniamos Nginx decidiendo a dónde iba cada petición. En AWS, el patrón de red correcto utiliza el ALB basado en rutas (Path-based Routing).

El patrón consiste en definir una única puerta de entrada y dividir el tráfico en la capa de red:

    El tráfico que llega a la raíz (/ o /index.html) se envía al Target Group del Frontend.

    El tráfico que llega a la ruta de la API (/api/*) se desvía al Target Group del Backend.

Esto permite que, a nivel de red, el Frontend y el Backend escalen de forma totalmente independiente. Si el backend se satura por muchas peticiones a la base de datos, el patrón de red asegura que el Frontend siga sirviendo la web estática sin enterarse del problema.

### El Patrón de Red para los Contenedores: AWS VPC Network Mode (awsvpc)

Cuando deplegamos contenedores en AWS ECS (especialmente si usamos AWS Fargate), existe un patrón de red específico para los contenedores llamado modo awsvpc.

Cómo funcionaba en Swarm: Todos los contenedores compartían la red de la máquina virtual y nos teniamos que pelear mapeando puertos (8080:80, 5000:5000).

Cómo funciona el patrón awsvpc: AWS le asigna a cada contenedor su propia tarjeta de red virtual (ENI) y su propia IP privada dentro de nuestra subred.

¿Qué significa esto? Que nuestro contenedor de Backend tiene su propia IP como si fuera un servidor independiente. Esto hace que la comunicación sea muchísimo más rápida, limpia y permite aplicar políticas de seguridad (Security Groups) específicas para cada contenedor por separado.

---
