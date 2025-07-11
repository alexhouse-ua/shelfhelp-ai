require('dotenv').config();

// Firebase configuration - requires environment variables
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID
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