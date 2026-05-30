const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function crearVentana() {
  const ventanaPrincipal = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,     
      contextIsolation: false,   
      webviewTag: true,          // 👈 CRUCIAL: Esto activa el componente del Navegador Web
      backgroundThrottling: false 
    }
  });

  ventanaPrincipal.loadFile(path.join(__dirname, 'index.html'));
}

// Puente nativo para el selector de carpetas
ipcMain.handle('seleccionar-carpeta', async () => {
  const resultado = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (resultado.canceled) return null;
  return resultado.filePaths[0];
});

app.whenReady().then(() => {
  crearVentana();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});