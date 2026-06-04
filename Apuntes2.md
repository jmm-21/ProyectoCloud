# Arquitectura AWS - Undersounds

Actualizacion con el despliegue de la web en los servicios de AWS.

---

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
