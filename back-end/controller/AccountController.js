const AccountDao = require('../model/dao/AccountDAO');
const AccountDTO = require('../model/dto/AccountDTO');
const AccountFactory = require('../model/factory/AccountFactory');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Importaciones de Artistas
const ArtistDAO = require('../model/dao/ArtistDAO');
const ArtistaFactory = require('../model/factory/ArtistaFactory');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'pruebaspi060@gmail.com',       
    pass: 'haqv baox evro yxcj'            
  }
});

// Función para generar un OTP aleatorio
function generateOtp() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return otp;
}

// Función para enviar el correo con el OTP
async function sendOtpEmail(email, otp) {
  const mailOptions = {
    from: '"Soporte" pruebaspi060@gmail.com',
    to: email,
    subject: 'Código de recuperación de contraseña',
    text: `Tu código OTP es: ${otp}`,
    html: `<p>Tu código OTP es: <strong>${otp}</strong></p>`
  };
  await transporter.sendMail(mailOptions);
}

class AccountController {

  // Función privada interna para corregir URLs (para no repetir código)
  _applyBaseUrl(dto) {
    const baseUrl = process.env.BASE_URL || `https://proyectocloud-5.onrender.com`;
    
    if (dto.profileImage && dto.profileImage.startsWith('/assets')) {
      dto.profileImage = `${baseUrl}${dto.profileImage}`;
    }
    if (dto.bannerImage && dto.bannerImage.startsWith('/assets')) {
      dto.bannerImage = `${baseUrl}${dto.bannerImage}`;
    }
    
    // Si el DTO trae los datos del artista vinculado (populate)
    if (dto.artist) {
      if (dto.artist.profileImage && dto.artist.profileImage.startsWith('/assets')) {
        dto.artist.profileImage = `${baseUrl}${dto.artist.profileImage}`;
      }
      if (dto.artist.bannerImage && dto.artist.bannerImage.startsWith('/assets')) {
        dto.artist.bannerImage = `${baseUrl}${dto.artist.bannerImage}`;
      }
    }
  }

  async register(req, res) {
    try {
      const inputData = req.body;
      const existingAccount = await AccountDao.findByEmail(inputData.email);
      if (existingAccount) {
        return res.status(400).json({ error: 'El correo electrónico ya está en uso' });
      }
   
      inputData.profileImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(inputData.username)}&size=128&background=random&color=fff`;
      const accountData = AccountFactory.createAccount(inputData);
      accountData.password = await bcrypt.hash(accountData.password, 10);
      
      if (accountData.role === 'band') {
        try {
          const artistData = {
            name: accountData.bandName || accountData.username,
            profileImage: accountData.profileImage,
            bannerImage: accountData.bannerImage,
            genre: accountData.genre || '',
            bio: accountData.bio || '',
            followers: 0,
            albums: []
          };
          
          const newArtistData = ArtistaFactory.createArtist(artistData);
          const newArtist = await ArtistDAO.createArtist(newArtistData);
          accountData.artistId = newArtist._id;
          
          console.log(`Artista creado para cuenta: ${accountData.email}`);
        } catch (artistError) {
          console.error('Error al crear artista vinculado:', artistError);
        }
      }
      
      const newAccount = await AccountDao.create(accountData);
      const accountDTO = new AccountDTO(newAccount);
      this._applyBaseUrl(accountDTO); // Corregir URLs

      res.status(201).json(accountDTO);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      const account = await AccountDao.findByEmail(email);
      if (!account) return res.status(401).json({ error: 'Credenciales inválidas' });
      
      const valid = await bcrypt.compare(password, account.password);
      if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

      let accountToReturn = account;
      if (account.role === 'band') {
        accountToReturn = await AccountDao.findByIdWithArtist(account._id);
      }

      const accessToken = jwt.sign(
        { id: account._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '15m' }
      );
      const refreshToken = jwt.sign(
        { id: account._id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        ...(req.body.remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {})
      });

      const accountDTO = new AccountDTO(accountToReturn);
      this._applyBaseUrl(accountDTO); // Corregir URLs

      res.json({
        account: accountDTO,
        accessToken
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async refreshToken(req, res) {
    try {
      const token = req.cookies.refreshToken;
      if (!token) return res.status(401).json({ error: 'No se proporcionó refresh token' });
      
      jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Refresh token no válido' });
        
        const newAccessToken = jwt.sign(
          { id: decoded.id },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: '15m' }
        );
        
        const account = await AccountDao.findById(decoded.id);
        if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

        let accountToReturn = account;
        if (account.role === 'band' && account.artistId) {
          accountToReturn = await AccountDao.findByIdWithArtist(account._id);
        }

        const accountDTO = new AccountDTO(accountToReturn);
        this._applyBaseUrl(accountDTO); // Corregir URLs

        res.json({ 
          accessToken: newAccessToken, 
          account: accountDTO 
        });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  generateToken(user) {
    if (!user) throw new Error('Usuario no válido');
    return jwt.sign(
      { id: user._id || user.id, email: user.email },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '1d' }
    );
  }

  async getAccountType(req, res) {
    try {
      const { id } = req.params;
      const account = await AccountDao.findById(id);
      if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
      res.json({ type: account.type });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const { id } = req.params;
      const updatedAccount = await AccountDao.update(id, req.body);
      const accountDTO = new AccountDTO(updatedAccount);
      this._applyBaseUrl(accountDTO); // Corregir URLs
      
      res.json({ success: true, account: accountDTO });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
  
  async logout(req, res) {
    res.clearCookie('refreshToken');
    res.json({ success: true });
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const account = await AccountDao.findByEmail(email);
      if (!account) return res.status(404).json({ error: 'Correo no encontrado' });
      
      const otp = generateOtp();
      const otpToken = jwt.sign({ otp, email }, process.env.OTP_SECRET, { expiresIn: '10m' });
      
      sendOtpEmail(email, otp).catch(err => console.error("Error correo OTP:", err));
      
      res.json({ message: 'Se ha enviado un código OTP a su correo', otpToken });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  async resetPassword(req, res) {
    try {
      const { email, otp, newPassword, otpToken } = req.body;
      if (!otpToken) return res.status(400).json({ error: 'No se ha proporcionado el otpToken' });
      
      let decoded;
      try {
        decoded = jwt.verify(otpToken, process.env.OTP_SECRET);
      } catch (err) {
        return res.status(400).json({ error: 'Token OTP inválido o expirado' });
      }
      
      if (decoded.email !== email || decoded.otp !== otp) {
        return res.status(400).json({ error: 'OTP inválido' });
      }
      
      const account = await AccountDao.findByEmail(email);
      if (!account) return res.status(404).json({ error: 'Correo no encontrado' });
      
      account.password = await bcrypt.hash(newPassword, 10);
      await account.save();
      
      res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async linkBandToArtist(req, res) {
    try {
      const { accountId } = req.params;
      const account = await AccountDao.findById(accountId);
      
      if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
      if (account.role !== 'band') return res.status(400).json({ error: 'Solo para bandas' });
      if (account.artistId) return res.status(400).json({ error: 'Ya vinculada' });
      
      const artistData = {
        name: account.bandName || account.username,
        profileImage: account.profileImage,
        bannerImage: account.bannerImage,
        genre: account.genre || '',
        bio: account.bio || '',
        followers: account.followers || 0,
        albums: []
      };
      
      const newArtistData = ArtistaFactory.createArtist(artistData);
      const newArtist = await ArtistDAO.createArtist(newArtistData);
      const updatedAccount = await AccountDao.linkToArtist(accountId, newArtist._id);
      
      const accountDTO = new AccountDTO(updatedAccount);
      this._applyBaseUrl(accountDTO); // Corregir URLs

      res.json({ 
        success: true, 
        message: 'Cuenta vinculada correctamente',
        account: accountDTO
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AccountController();