require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const accountRoutes = require('./routes/AccountRoutes');
const albumRoutes = require('./routes/AlbumRoutes');
const artistRoutes = require('./routes/ArtistRoutes');
const noticiasMusica = require('./routes/NewsRoutes');
const MerchRoutes = require('./routes/MerchandisingRoutes');
const StreamingRoutes = require('./routes/StreamingRoutes');
const Stripe = require('stripe');
const passport = require('./config/passport');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const session = require('express-session');

mongoose.set('strictQuery', false);

const app = express();
// Ruta especial para que el Health Check de AWS sepa que el backend está vivo
app.get('/', (req, res) => {
  res.status(200).send('Backend de UnderSounds operando correctamente');
});

const Album = require('./model/models/Album');

// Definir la URL base para recursos estáticos y documentación
const BASE_URL = process.env.BASE_URL || 'http://0.0.0.0:8081';

app.use(cors({
  origin: ['http://localhost:8081', process.env.FRONTEND_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());
app.use(cookieParser());

// Configurar tipos MIME para archivos de audio
app.use((req, res, next) => {
  if (req.path.endsWith('.m4a')) {
    res.setHeader('Content-Type', 'audio/mp4');
  } else if (req.path.endsWith('.mp3')) {
    res.setHeader('Content-Type', 'audio/mpeg');
  }
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'undersounds_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', 
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 día en milisegundos
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// 1. Definimos la ruta base de assets
const assetsPath = path.join(__dirname, 'assets');

// 2. EL DIAGNÓSTICO PRIMERO: Así registrará en los logs de AWS qué archivo exacto falla
app.use('/assets', (req, res, next) => {
  console.log(`[ASSETS ACCESO] Petición recibida para: ${req.path}`);
  next();
});

// 3. Servir las subcarpetas específicas (Primero lo más específico)
app.use('/assets/music', express.static(path.join(assetsPath, 'music')));
app.use('/assets/images', express.static(path.join(assetsPath, 'images')));

// 4. Servir la carpeta global por si acaso
app.use('/assets', express.static(assetsPath));

// Añadimos una clave de pruebas falsa por si la variable de entorno no existe en AWS
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_falsa_emergencia_aws_51N...';
const stripe = Stripe(stripeKey);

// Conectar a MongoDB
connectDB();

// Configuración Swagger
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'UnderSounds API',
      version: '1.0.0',
      description: 'Documentación de la API de UnderSounds'
    },
    servers: [
      { url: `${BASE_URL}/api` }
    ]
  },
  apis: ['./docs/openapi.yaml']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Rutas de la API
app.use('/api/auth', accountRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/noticias', noticiasMusica);
app.use('/api/merchandising', MerchRoutes);
app.use('/api/streaming', StreamingRoutes);

app.get('/', (req, res, next) => {
    console.log("¡TRAFICO REAL RECONOCIDO! Ruta raíz accedida.");
    next(); // Le dice a Express: "Ya hice mi log, ahora sigue bajando"
});

app.use(express.static(path.join(__dirname, 'view')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'view', 'index.html'));
});

const PORT = process.env.PORT || 5000;
const startServer = () => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
};

// ----- Gestión de metadata -----
// Definición de los archivos de metadata:
// - sharedMetaFile: versión global (compartido en el repo, por ejemplo, config/dbmeta.json)
// - localMetaFile: versión local (entorno de desarrollo, config/dbmeta_local.json)
const sharedMetaFile = path.join(__dirname, 'config', 'dbmeta.json');
const localMetaFile = path.join(__dirname, 'config', 'dbmeta_local.json');

// Función auxiliar: obtiene la versión guardada en un fichero (o 0 si no existe)
// Si es el archivo local y no existe, se crea con valor 0
const getVersionFromFile = (filePath) => {
  let version = 0;
  try {
    if (!fs.existsSync(filePath)) {
      if (filePath === localMetaFile) {
        fs.writeFileSync(filePath, JSON.stringify({ dbVersion: 0, colecciones: [] }, null, 2));
        console.log(`${filePath} no existía, se ha creado con valor 0 y colecciones vacías.`);
        return 0;
      }
    } else {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      version = parsed.dbVersion || 0;
    }
  } catch (err) {
    console.error(`Error leyendo ${filePath}:`, err);
  }
  return version;
};

// Función auxiliar: actualiza un fichero de metadata con la nueva versión y opcionalmente las colecciones
const updateVersionFile = (filePath, newVersion, newColecciones = null) => {
  let meta = {};
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      meta = JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error leyendo ${filePath}:`, err);
  }
  meta.dbVersion = newVersion;
  if (newColecciones !== null) {
    meta.colecciones = newColecciones;
  }
  fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
  console.log(`${filePath} actualizado a la versión ${newVersion} con colecciones:`, meta.colecciones);
};

// La versión global (esperada en el repo) se extrae de dbmeta.json
const CURRENT_DB_VERSION = getVersionFromFile(sharedMetaFile);

// Al iniciar, se compara la versión local con la global (CURRENT_DB_VERSION).
// Si la versión local es menor, se ejecuta mongoimport y luego se actualizan ambos ficheros.
const checkAndImportData = async () => {
  console.log("[AWS] Iniciando secuencia de arranque de emergencia...");

  // 1. Bandera para asegurarnos de que Express SOLO se enciende UNA VEZ
  let serverStarted = false;
  const safeStartServer = () => {
    if (!serverStarted) {
      serverStarted = true;
      clearTimeout(timeout); // Cancelamos el temporizador de emergencia
      console.log("[AWS] Dando orden de encender Express...");
      startServer();
    }
  };

  // 2. Temporizador de emergencia: si en 4 segundos Mongo no responde, arrancamos Express igual
  const timeout = setTimeout(() => {
    console.log("[AWS WARN] Mongoose tarda demasiado en conectar. Arrancando Express por emergencia para evitar caída en AWS...");
    safeStartServer();
  }, 4000);

  // 3. Esperar pacientemente la conexión a la base de datos de Atlas
  if (mongoose.connection.readyState !== 1) {
    try {
      console.log("[AWS] Esperando evento 'open' de Mongoose...");
      await new Promise(resolve => mongoose.connection.once('open', resolve));
      console.log("[AWS] ¡Conexión con Atlas confirmada por evento!");
    } catch (err) {
      console.error("[AWS ERROR] Error esperando la conexión a Mongo:", err);
    }
  } else {
    console.log("[AWS] Mongoose ya estaba conectado previamente.");
  }

  // 4. ¡EL CORTE RADICAL! Saltamos por completo el conteo de álbumes, versiones y el spawn('import-db.js')
  console.log("[AWS] Omitiendo chequeo de versiones locales e import-db.js para entorno cloud.");
  
  // 5. Encendemos el servidor de forma segura
  safeStartServer();
};

// ----- Gestión del respaldo (mongoexport) al cierre -----
process.on('SIGINT', () => {
  console.log("Se detectó el cierre del proceso.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question("¿Desea respaldar los datos con mongoexport? (S/N): ", (answer) => {
    if (answer.trim().toUpperCase() === "S") {
      console.log("Ejecutando mongoexport para respaldar datos...");
      
      // Usar spawn en lugar de exec para mantener la interactividad
      const child = spawn('node', ['export-db.js'], { 
        stdio: 'inherit' // Esto conecta stdin/stdout/stderr del hijo al padre
      });

      child.on('exit', (code) => {
        console.log(`\nExportación de datos completada con código ${code}`);
        
        // Se actualiza tanto la versión global como la local a CURRENT_DB_VERSION + 1
        const newVersion = CURRENT_DB_VERSION + 1;
        let currentCollections = [];
        try {
          const metaData = fs.existsSync(sharedMetaFile) ? JSON.parse(fs.readFileSync(sharedMetaFile, 'utf8')) : {};
          currentCollections = metaData.colecciones || [];
        } catch (e) {
          console.error(e);
        }
        updateVersionFile(sharedMetaFile, newVersion, currentCollections);
        updateVersionFile(localMetaFile, newVersion, currentCollections);
        
        rl.close();
        process.exit();
      });
    } else {
      console.log("No se realizará el respaldo de datos.");
      rl.close();
      process.exit();
    }
  });
});

app.post('/create-checkout-session', async (req, res) => {
  const { items } = req.body;

  const lineItems = items.map(item => ({
    price_data: {
      currency: 'eur',
      product_data: {
        name: item.name,
        //images: item.image,
      },
      unit_amount: Math.round(item.price * 100), // en céntimos
    },
    quantity: item.quantity,
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/paymentSuccess`,
    cancel_url: `${process.env.FRONTEND_URL}/`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Al iniciar se verifica si hay que hacer mongoimport
checkAndImportData();