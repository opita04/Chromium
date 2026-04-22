#!/usr/bin/env node

// Build script for Nyaa Auto Download Extension
// Creates a production-ready extension package

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const extensionDir = __dirname;
const buildDir = path.join(extensionDir, 'build');
const distDir = path.join(extensionDir, 'dist');

// Create build directories
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Copy extension files to build directory
function copyExtensionFiles() {
    const filesToCopy = [
        'manifest.json',
        'background',
        'content',
        'popup',
        'options',
        'icons'
    ];
    
    filesToCopy.forEach(file => {
        const srcPath = path.join(extensionDir, file);
        const destPath = path.join(buildDir, file);
        
        if (fs.existsSync(srcPath)) {
            if (fs.statSync(srcPath).isDirectory()) {
                copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    });
}

// Copy directory recursively
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    entries.forEach(entry => {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

// Create extension package
function createPackage() {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(path.join(distDir, 'nyaa-auto-download-extension.zip'));
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', () => {
            console.log(`Extension package created: ${archive.pointer()} bytes`);
            resolve();
        });
        
        archive.on('error', (err) => {
            reject(err);
        });
        
        archive.pipe(output);
        archive.directory(buildDir, false);
        archive.finalize();
    });
}

// Main build function
async function build() {
    try {
        console.log('Building Nyaa Auto Download Extension...');
        
        // Copy files
        console.log('Copying extension files...');
        copyExtensionFiles();
        
        // Create package
        console.log('Creating extension package...');
        await createPackage();
        
        console.log('Build completed successfully!');
        console.log(`Extension files: ${buildDir}`);
        console.log(`Package: ${path.join(distDir, 'nyaa-auto-download-extension.zip')}`);
        
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Run build
if (require.main === module) {
    build();
}

module.exports = { build, copyExtensionFiles, createPackage };
