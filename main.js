const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

// Enforce Single Instance Lock (Prevent multiple duplicate processes)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Start the Express backend server
  require('./server/app.js');

  let mainWindow = null;

  app.on('second-instance', () => {
    // When a second instance is launched, focus the existing main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function tryLoadURL(window, url, maxRetries = 10, interval = 200) {
    let retries = 0;
    function checkAndLoad() {
      http.get(url, (res) => {
        window.loadURL(url);
      }).on('error', () => {
        retries++;
        if (retries < maxRetries) {
          setTimeout(checkAndLoad, interval);
        } else {
          // Fallback final attempt
          window.loadURL(url);
        }
      });
    }
    checkAndLoad();
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 1050,
      minHeight: 680,
      backgroundColor: '#0b0f19',
      title: 'Sigma Store',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    tryLoadURL(mainWindow, 'http://localhost:4000');

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  app.whenReady().then(() => {
    createWindow();

    const { globalShortcut } = require('electron');
    globalShortcut.register('F5', () => {
      if (mainWindow) mainWindow.reload();
    });
    globalShortcut.register('CommandOrControl+R', () => {
      if (mainWindow) mainWindow.reload();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('will-quit', () => {
    const { globalShortcut } = require('electron');
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
