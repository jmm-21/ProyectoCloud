require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// 1. Configuración
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const testFile = path.join(__dirname, 'music', 'test.mp3'); // Asegúrate de que este archivo existe

async function runTest() {
    console.log("--- INICIANDO TEST DE CLOUDINARY ---");
    
    // Verificación de credenciales
    console.log("Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME ? "✅ OK" : "❌ No encontrado");

    if (!fs.existsSync(testFile)) {
        console.error("❌ ERROR: No encuentro el archivo 'music/test.mp3'. Pon uno para probar.");
        return;
    }

    try {
        console.log("2. Intentando subir archivo...");
        const uploadRes = await cloudinary.uploader.upload(testFile, {
            resource_type: "video",
            folder: "test_undersounds"
        });
        console.log("✅ SUBIDA EXITOSA. URL:", uploadRes.secure_url);

        console.log("3. Esperando 3 segundos para probar la descarga...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log("4. Intentando verificar la existencia en la nube...");
        const search = await cloudinary.api.resource(uploadRes.public_id, { resource_type: 'video' });
        console.log("✅ ARCHIVO VERIFICADO EN LA NUBE. Formato:", search.format);

        console.log("\n--- TEST FINALIZADO CON ÉXITO ---");
        console.log("Ya puedes entrar en tu Media Library de Cloudinary y deberías ver la carpeta 'test_undersounds'.");

    } catch (error) {
        console.error("❌ ERROR DURANTE EL TEST:", error.message);
    }
}

runTest();