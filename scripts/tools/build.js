const fs = require('fs');
const path = require('path');

// Read the original HTML file
const htmlContent = fs.readFileSync('dynasty29.html', 'utf8');

// Simple minification
const minified = htmlContent
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/>\s+</g, '><') // Remove spaces between tags
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .trim();

// Create dist directory if it doesn't exist
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Write minified HTML to dist/index.html
fs.writeFileSync('dist/index.html', minified);

console.log('✅ Build complete! Minified HTML saved to dist/index.html');
console.log('📦 Original size:', (htmlContent.length / 1024).toFixed(2), 'KB');
console.log('📦 Minified size:', (minified.length / 1024).toFixed(2), 'KB');
console.log('📉 Size reduction:', ((1 - minified.length / htmlContent.length) * 100).toFixed(1), '%'); 