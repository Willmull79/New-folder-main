# Firebase Setup Guide - Fix Authentication Issues

## 🔧 **Current Issues:**
1. Login screen not working
2. Colors are wrong
3. Firebase authentication may not be properly configured

## 🛠️ **Step 1: Fix Firebase Authentication**

### **Enable Authentication in Firebase Console:**

1. Go to [Firebase Console](https://console.firebase.google.com/project/dynasty-420)
2. Click on **"Authentication"** in the left sidebar
3. Click **"Get started"** if not already enabled
4. Go to **"Sign-in method"** tab
5. Enable **"Email/Password"** authentication:
   - Click on **"Email/Password"**
   - Toggle **"Enable"** to ON
   - Click **"Save"**

### **Configure Authentication Settings:**

1. Go to **"Settings"** tab in Authentication
2. Add your domain to **"Authorized domains"**:
   - Add: `localhost`
   - Add: `dynasty-420.web.app`
   - Add: `dynasty-420.firebaseapp.com`

## 🎨 **Step 2: Fix Color Issues**

The color scheme has been updated in `src/styles.css` to use a consistent dark theme:
- Background: `#111827` (gray-900)
- Cards: `#1f2937` (gray-800)
- Inputs: `#374151` (gray-700)
- Buttons: Blue for primary, Green for success

## 🧪 **Step 3: Test Authentication**

1. Open `test-firebase.html` in your browser
2. Try to register a new user
3. Try to login with the registered user
4. Check if authentication works

## 🚀 **Step 4: Start the App**

```bash
# Start the frontend
npm run dev

# Or use the Firebase-only version
start-firebase-only.bat
```

## 🔍 **Step 5: Check for Errors**

Open browser console (F12) and look for:
- Firebase initialization errors
- Authentication errors
- Network errors

## 📋 **Common Issues & Solutions:**

### **Issue: "Firebase is not loaded"**
**Solution:** Check if Firebase scripts are loading properly in `src/index.html`

### **Issue: "Permission denied"**
**Solution:** Check Firestore security rules in Firebase Console

### **Issue: "Invalid API key"**
**Solution:** Verify Firebase config in `src/config/firebase.js`

### **Issue: "Authentication not enabled"**
**Solution:** Enable Email/Password authentication in Firebase Console

## 🔧 **Firebase Security Rules:**

Make sure your Firestore security rules allow read/write access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Allow public read access to leagues
    match /leagues/{leagueId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## 📞 **Need Help?**

1. Check the browser console for specific error messages
2. Test with the `test-firebase.html` file
3. Verify Firebase project settings in the console
4. Make sure all Firebase services are enabled

## 🎯 **Expected Result:**

After following these steps:
- ✅ Login/Register should work
- ✅ Colors should be consistent dark theme
- ✅ App should load without errors
- ✅ Firebase Functions should be accessible 