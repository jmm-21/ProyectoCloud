const mongoose = require('mongoose');

//const mongoURI = process.env.MONGO_URI || 'mongodb+srv://marinatrabaa_db_user:qEvgHJaQUihFkvwE@cluster0.keo4ezr.mongodb.net/test?appName=Cluster0';
const mongoURI = 'mongodb+srv://marinatrabaa_db_user:qEvgHJaQUihFkvwE@cluster0.keo4ezr.mongodb.net/test?appName=Cluster0';

const connectDB = async () => {
  try {
    console.log('[DB] Intentando conectar a MongoDB Atlas...');
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('¡Conectado a MongoDB Atlas con éxito desde AWS!');
  } catch (error) {
    console.error('Error de conexión a MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB;