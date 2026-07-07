import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { FirebaseProvider } from './contexts/FirebaseContext.js';
import './config/firebase.js';
import './styles.css';

const Root = () => (
    <FirebaseProvider>
        <App />
    </FirebaseProvider>
);

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Root />); 