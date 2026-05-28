const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const AccountDao = require('../model/dao/AccountDAO');

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await AccountDao.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Configurar estrategia JWT
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.ACCESS_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET || 'clave_secreta_de_emergencia_undersounds_123'
};

passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const user = await AccountDao.findById(payload.id);
    if (user) {
      return done(null, user);
    }
    return done(null, false);
  } catch (err) {
    return done(err, false);
  }
}));

// Estrategia Google existente
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'texto_falso_google_client_id_para_aws',         
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'texto_falso_google_client_secret_para_aws',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'texto_falso_google_callback_url_para_aws'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Busca el usuario por correo (o crea uno nuevo)
      let account = await AccountDao.findByEmail(profile.emails[0].value);
      if (!account) {
        const newAccountData = {
          username: profile.displayName,
          email: profile.emails[0].value,
          provider: 'google',
          providerId: profile.id,
          profileImage: profile.photos[0].value,
          bio: '',
          role: 'fan'
        };
        account = await AccountDao.create(newAccountData);
      }
      return done(null, account);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;