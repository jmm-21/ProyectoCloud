# UnderSounds Backend

The UnderSounds backend provides a complete API to manage the music platform, offering services for authentication, music content management, payment processing, and more.

## Main functionalities

### Authentication and Users
- **Traditional registration and login** with JWT and refresh token system
- **Google OAuth authentication** using Passport.js
- **Password recovery** with OTP system
- **User profiles** with different roles (fan, band, record label)

### Music Content Management
- **Music catalog**: albums, artists, and tracks
- **Music download** in multiple formats (MP3, WAV, FLAC)
- **Audio file conversion** using FFmpeg
- **Jamendo integration** to expand the music catalog

### E-commerce
- **Shopping cart** to manage selected items
- **Payment processing** using Stripe
- **Merchandising management** (t-shirts and other products)

### Other functionalities
- **Music news system** (full CRUD)
- **Automatic documentation** with Swagger

## Installation and configuration

1. **Clone the repository**:
git clone <REPOSITORY_URL> cd undersounds-backend


2. **Install dependencies**:
npm install


3. **Configure environment variables**:
Create a `.env` file with:
MONGO_URI=<MONGODB_URI> ACCESS_TOKEN_SECRET=<JWT_ACCESS_SECRET> REFRESH_TOKEN_SECRET=<JWT_REFRESH_SECRET> SESSION_SECRET=<SESSION_SECRET> GOOGLE_CLIENT_ID=<GOOGLE_OAUTH_ID> GOOGLE_CLIENT_SECRET=<GOOGLE_OAUTH_SECRET> GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback STRIPE_SECRET_KEY=<STRIPE_SECRET_KEY>


4. **Run the server**:
npm start


5. **Access the documentation**:
Navigate to `http://localhost:5000/api-docs` to explore the API with Swagger.

## Database management

The backend includes tools to import and export MongoDB data:

- **Import data**:
npm run mongoimport


- **Export data**:
npm run mongoexport


## Main Endpoints

### Authentication
- `POST /api/auth/register`: User registration
- `POST /api/auth/login`: Login
- `POST /api/auth/refresh-token`: Token renewal
- `POST /api/auth/logout`: Logout
- `GET /api/auth/google`: Google authentication
- `POST /api/auth/forgot-password`: Recovery request
- `POST /api/auth/reset-password`: Reset with OTP

### Music
- `GET /api/albums`: Get all albums
- `GET /api/albums/{id}`: Get specific album
- `GET /api/albums/{id}/download`: Download a track in MP3/WAV/FLAC
- `GET /api/albums/{id}/download-album`: Download a full album in ZIP

### Artists
- `GET /api/artists`: List of artists
- `GET /api/artists/{id}`: Information of a specific artist

### Merchandising
- `GET /api/merchandising`: Product catalog
- `GET /api/merchandising/{id}`: Product details

### News
- `GET /api/noticias`: Get music news
- `POST /api/noticias`: Create news

### Payments
- `POST /create-checkout-session`: Process payments with Stripe

## Technologies used

- **Node.js and Express**: Server base
- **MongoDB and Mongoose**: Database and ODM
- **JWT and Passport**: Authentication and authorization
- **FFmpeg**: Audio format conversion
- **Stripe**: Payment processing
- **Swagger**: API Documentation
- **Archiver**: File compression for download

## Technical requirements

- Node.js 16.x or higher
- MongoDB 4.4 or higher
- FFmpeg (globally installed for audio conversion)
- Internet connection for external services (Stripe, OAuth)

## Project structure

```
back-end/
├── config/              # Configurations (DB, Passport)
├── controller/          # API Controllers
├── data-dump/           # Exported MongoDB data
├── docs/                # API Documentation (Swagger)
├── model/               # Data models and DAOs
├── routes/              # Route definitions
├── services/            # Services (audio conversion, etc.)
├── utils/               # Utilities
├── view/                # HTML Views (minimal)
├── .env                 # Environment variables (not in repo)
└── server.js            # Entry point
```
