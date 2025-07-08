require('dotenv').config();

// Firebase configuration with graceful fallback
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyB4TakMQWbIxBw7rHz6zaw0tN5f7vc9nVE",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "shelfhelp-ai.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://shelfhelp-ai-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "shelfhelp-ai"
};

// Check if Firebase is properly configured
function isFirebaseConfigured() {
  return !!(
    firebaseConfig.apiKey && 
    firebaseConfig.authDomain && 
    firebaseConfig.databaseURL && 
    firebaseConfig.projectId
  );
}

// Check if Firebase credentials are available for admin SDK
function hasFirebaseCredentials() {
  // Check for service account key file or default credentials
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    process.env.FIREBASE_PRIVATE_KEY ||
    // In production environments, default credentials might be available
    (process.env.NODE_ENV === 'production' && process.env.FIREBASE_PROJECT_ID)
  );
}

module.exports = {
  firebaseConfig,
  isFirebaseConfigured,
  hasFirebaseCredentials
};