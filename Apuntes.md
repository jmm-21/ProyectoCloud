CODIGO NGIX:
	Aquí se define qué hacer cuando alguien llega a la raíz (/) de tu sitio:

	Nginx
	location / {
		proxy_pass http://backend_servers;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
	}
	proxy_pass http://backend_servers;: Esta es la instrucción clave. Le dice a Nginx: "No proceses tú esta petición, pásala al grupo de servidores que definimos arriba en upstream".

	proxy_set_header Host $host;: Sirve para que el backend sepa a qué nombre de dominio intentaba entrar el usuario originalmente.

	proxy_set_header X-Real-IP $remote_addr;: ¡Muy importante! Sin esto, el backend pensaría que todas las visitas vienen de Nginx. Con esta línea, le pasas al backend la IP real del
	usuario que está en su casa navegando.

AUTOESCALABILIDAD:
	Docker Swarm no escala automáticamente por carga de CPU / tráfico de forma nativa.
	Para autoscala necesitas:
		un monitor de métricas (CPU, tráfico, latencia)
		un script o herramienta externa
		que ese script ejecute docker service update --replicas=N o docker service scale
		
	Ejemplo simple:
		Monitorea uso CPU de backend
		Si supera 70% durante X minutos => docker service scale undersounds_backend=8
		Si baja de 30% => docker service scale undersounds_backend=3
		
	En local, lo más práctico
		Mantén el stack Swarm
		Usa docker service scale cuando preveas el pico
		nginx seguirá balanceando entre las réplicas
		
MONGO ROBUSTNESS:
	REPLICA SET
	Red Overlay: Al usar driver: overlay, permites que los contenedores se 
	comuniquen entre diferentes nodos físicos del clúster Swarm usando los nombres de servicio (mongo1, mongo2, etc.).
	
NGNIX:
	pero si tengo varias replicas de ngnix no habria problema con los puertos?
	Esa es una de las dudas más comunes y es totalmente lógica! Si intentas levantar dos programas en el mismo puerto en tu PC "normal", el segundo te dará un error de Address already in use.
	Sin embargo, Docker Swarm funciona de manera diferente gracias a una tecnología llamada Routing Mesh (Malla de Enrutamiento).
	
	¿Cómo es posible que no haya conflicto?
	Cuando declaras un puerto en el modo Swarm (como tu "8081:80"), Docker no asigna ese puerto directamente al contenedor, sino al Clúster.
	Virtualización de IP: Cada réplica de Nginx tiene su propia dirección IP interna dentro de la red appnet. Como son IPs distintas, todas pueden usar el puerto 80 internamente sin pegarse.
	El Ingress Load Balancer: Docker Swarm reserva el puerto 8081 en todos los nodos del clúster (los servidores físicos).
	
	Reparto de cartas: Cuando alguien entra por el puerto 8081 de cualquier servidor, el "Routing Mesh" de Docker actúa como un crupier de cartas: recibe la conexión y la redirige internamente a 
	una de las réplicas de Nginx que esté libre y saludable.
	
	Las ventajas de tener varias réplicas de Nginx:
	Balanceo de carga: Si tienes 1.000 usuarios entrando a la vez, Swarm reparte 333 a cada una de tus 3 réplicas de Nginx, evitando que una sola se sature.
	Actualizaciones sin cortes (Zero Downtime): Si quieres cambiar algo en el nginx.conf, Swarm irá actualizando las réplicas de una en una. Mientras una se reinicia, las otras dos siguen atendiendo a los usuarios. No hay ni un segundo de caída.
	Resiliencia total: Si un contenedor de Nginx "peta" por un error de memoria, el Routing Mesh deja de enviarle tráfico instantáneamente y lo redirige a los otros dos mientras Swarm levanta el sustituto.

WHY DOCKER SWARM?
	1. Alta Disponibilidad (High Availability - HA)
	Self-healing (Auto-curación): Swarm monitoriza constantemente el estado de los contenedores. Si uno falla, Swarm lo reinicia automáticamente en un nodo saludable.
	Sin puntos únicos de fallo: Al tener 3 réplicas de MongoDB y del Backend, el sistema puede sobrevivir a la caída de un servidor físico sin que el usuario final lo note.

	2. Orquestación del Replica Set de MongoDB
	Configurar un clúster de base de datos a mano es complejo. Swarm facilita esto mediante:
	Resolución de nombres (DNS interno): Los contenedores se comunican por nombre de servicio (mongo1, mongo2), lo que permite que el Replica Set se mantenga unido aunque las direcciones IP internas cambien al reiniciar contenedores.
	Aislamiento de red: Gracias al driver overlay, el tráfico de replicación de datos es privado y seguro dentro del clúster.
	
	3. Escalabilidad Horizontal (Scaling)
	Si tu proyecto "Undersounds" se vuelve viral y recibe miles de visitas:
	Escalado sencillo: Puedes pasar de 3 a 10 réplicas de tu backend con un solo comando (docker service scale), y Swarm se encarga de repartir los contenedores.
	Balanceo de carga nativo: Swarm incluye un balanceador de carga interno (el Routing Mesh). No necesitas configurar hardware externo para repartir el tráfico entre tus réplicas del backend.

	4. Gestión de Ciclo de Vida (Zero Downtime)
	Como vimos con update_config, Swarm permite actualizar tu aplicación (por ejemplo, subir una nueva versión del frontend) de forma progresiva.
	Rolling Updates: Actualiza los nodos de uno en uno, garantizando que el servicio nunca esté caído durante el mantenimiento.
	Rollback automático: Si la nueva versión tiene un error y no arranca, Swarm vuelve automáticamente a la versión anterior estable.

EL FLUJO DE UNA PETICION SERIA ASI:
	Entrada: El usuario llega al puerto 8081.
	Routing Mesh (Capa 0): Docker Swarm recibe la conexión en el nodo físico. No le importa cuál de los 3 Nginx responda.
	Balanceo Nginx (Capa 1): Swarm entrega la petición a una de las 3 réplicas de Nginx.
	Balanceo Backend (Capa 2): Nginx pasa la petición al servicio backend. Swarm vuelve a balancear entre las 3 réplicas del Backend.
	Consistencia Mongo (Capa 3): El backend escribe/lee en el Replica Set de MongoDB (3 nodos).
	
REDUNDANCIA ENTRE ROUTING MESH Y NGNIX?
	Docker Swarm gestiona la existencia de los contenedores, mientras que Nginx gestiona el contenido de las peticiones.
	Docker Swarm trabaja en la Capa de Transporte (TCP/UDP). Su "Routing Mesh" es como un conserje que solo mira el número de habitación (el puerto 8081) y te empuja hacia adentro. No sabe qué hay en el paquete que llevas.
	Nginx, en cambio, trabaja en la Capa de Aplicación (HTTP). Es un recepcionista que abre el paquete, lee la carta, verifica tu identidad y decide si pasas o no. Nginx entiende el protocolo web, Swarm solo entiende conexiones de red.
	El balanceador de Swarm es "ciego": reparte el tráfico de forma equitativa (Round Robin) sin importar nada más. Nginx permite un balanceo inteligente:
	Sticky Sessions: Puede hacer que un usuario se mantenga siempre conectado a la misma réplica del backend si tu aplicación lo necesita.
	Health Checks avanzados: Nginx puede dejar de enviar tráfico a un backend si este devuelve errores específicos
	
EXPLICACION DEL FLUJO DE LA AQUITECTURA
	1. Internet entrando al Routing Mesh
		Un usuario o el frontend (undersounds-frontend) realiza una petición a la API. Esta petición llega desde Internet al clúster de Docker Swarm.
		En el fichero docker-stack.yml, el servicio nginx publica el puerto 8081 (ports: - "8081:80").
		Docker Swarm intercepta todo el tráfico que llega a cualquier nodo del clúster en el puerto 8081 a través de su Routing Mesh. Esta es la puerta de entrada a vuestros servicios.
	2. El Routing Mesh repartiendo a las réplicas de Nginx
		Una vez que la petición está en el Routing Mesh, este actúa como un primer balanceador de carga.
		Su función es distribuir la petición de manera equitativa entre las 3 réplicas del servicio nginx que están corriendo, tal como se define en deploy: replicas: 3.
		Esto garantiza que si una de las réplicas de Nginx falla, el tráfico se redirige automáticamente a las que siguen activas, proporcionando alta disponibilidad.
	3. Nginx repartiendo a las réplicas del Backend
		Cada réplica de Nginx actúa como un proxy inverso y un segundo balanceador de carga.
		Recibe la petición del Routing Mesh y, según las reglas definidas en nginx.conf, la reenvía al servicio backend.
		Nginx no se comunica con una réplica específica del backend, sino con el nombre del servicio (backend). Docker Swarm se encarga de resolver este nombre y balancear la carga internamente entre las 3 réplicas del backend.
		Esta capa es fundamental para la seguridad (oculta la estructura interna de la API) y la escalabilidad (permite gestionar el tráfico hacia un número variable de réplicas del backend).
	4. El Backend conectándose al Replica Set de Mongo
		Finalmente, la réplica del backend que recibe la petición necesita acceder a los datos.
		Se conecta al Replica Set de MongoDB llamado rs0 usando la cadena de conexión definida en las variables de entorno: MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/undersounds?replicaSet=rs0.
		Al conectarse al Replica Set y no a una única instancia, la aplicación obtiene tolerancia a fallos. Si el nodo mongo1 (Primary) cae, el resto de nodos del set (mongo2 o mongo3) votan para elegir un nuevo primario, y la aplicación puede 
		seguir funcionando sin interrupción. Los datos se mantienen consistentes entre todos los nodos gracias a la replicación.
		