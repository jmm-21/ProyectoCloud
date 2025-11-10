UnderSounds - Music Platform for Independent Artists
UnderSounds is a complete platform for independent music artists and their followers. It allows musicians to distribute their music, sell merchandise, and connect with fans, while listeners can discover, buy, and enjoy music in various formats.

🎵 Key Features
For Listeners
Discover Music: Explore a catalog organized by genre, artists, and albums

Listen: Integrated player to listen to music before buying

Download: Get music in multiple formats (MP3, FLAC, WAV)

Collect: Create your personal library with your favorite artists

Connect: Rate, comment, and follow your favorite artists

For Artists
Digital Distribution: Upload and sell your music directly to fans

Merchandising: Sell products related to your brand

Custom Profile: Tell your story and connect with your audience

Analytics: Data on plays, downloads, and sales

Direct Payments: Receive income from your sales transparently

🔧 Architecture
UnderSounds uses the full MERN stack:

Frontend: React.js + Vite

Backend: Node.js + Express.js

Database: MongoDB

Authentication: JWT + OAuth2 (Google)

Payments: Stripe

🚀 Installation and Setup
Prerequisites
Node.js 16.x or higher

MongoDB 4.4 or higher

FFmpeg (for audio file conversion)

Stripe Account (for payment processing)

Registered project on Google Cloud Platform (for OAuth)

Project Setup
Clone the repository:

Bash

git clone https://github.com/your-user/undersounds.git
cd undersounds
Configure the backend:

Bash

cd undersounds-backend
npm install
Create a .env file with:

MONGO_URI=mongodb://localhost:27017/undersounds
ACCESS_TOKEN_SECRET=your_jwt_secret_key
REFRESH_TOKEN_SECRET=another_jwt_secret_key
SESSION_SECRET=key_for_sessions
GOOGLE_CLIENT_ID=google_oauth_id
GOOGLE_CLIENT_SECRET=google_oauth_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
STRIPE_SECRET_KEY=stripe_secret_key
You will need a dbmeta.json file and a dbmeta_local.json file. If it's your first time starting the server, the latter file will have a lower version than the former, and the DB update process will be initiated.

Configure the frontend:

Bash

cd ../undersounds-frontend
npm install
Create a .env file with:

VITE_API_URL=http://localhost:5000/api
VITE_STRIPE_PUBLIC_KEY=stripe_public_key
Start the application:

Backend:

Bash

cd undersounds-backend
node server.js
Frontend:

Bash

cd undersounds-frontend
npm start
Access the application:

Frontend: http://localhost:3000

Backend API: http://localhost:5000/api

API Documentation: http://localhost:5000/api-docs

📂 Project Structure
undersounds/
├── undersounds-frontend/       # React Application
│   ├── src/
│   │   ├── assets/             # Static assets 
│   │   ├── components/         # Reusable components
│   │   ├── context/            # React Contexts
│   │   ├── pages/              # Main pages
│   │   ├── services/           # API Services
│   │   └── utils/              # Utilities
│   ├── .env                    # Environment variables
│   └── package.json            # Frontend dependencies
│
├── undersounds-backend/        # Node.js/Express Server
│   ├── config/                 # Configurations
│   ├── controller/             # API Controllers
│   ├── docs/                   # Swagger Documentation
│   ├── model/                  # Data Models
│   ├── routes/                 # API Routes
│   ├── services/               # Services
│   ├── utils/                  # Utilities
│   ├── .env                    # Environment variables
│   └── package.json            # Backend dependencies
│
└── README.md                   # Main documentation
🧰 Highlighted Technical Features
Custom audio player integrated throughout the application

Real-time audio format conversion (MP3, FLAC, WAV)

Advanced authentication system with JWT, refresh tokens, and OAuth

Stripe integration for secure payment processing

Scalable architecture based on microservices and REST API

Advanced search system with filters.

📜 License
This project is under the MIT License. See its details on Github.

© 2025 UnderSounds - Platform for independent music.
