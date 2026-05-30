const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// 🔥 PARCHE OPCIONAL: Si la pantalla sigue tendiendo a quedarse en blanco o parpadear,
// descomentá la siguiente línea eliminando las dos barras '//' para desactivar la aceleración por hardware:
// app.disableHardwareAcceleration();

function crearVentana() {
  const ventanaPrincipal = new BrowserWindow({
    width: 1400,
    height: 900,
    // Podés agregar un color de fondo nativo oscuro para evitar el destello blanco inicial al cargar la app
    backgroundColor: '#243146', 
    webPreferences: {
      nodeIntegration: true,     
      contextIsolation: false,   
      webviewTag: true,          // 👈 Crucial para que levante el motor de las pestañas web
      
      // 🔥 PARCHES MAESTROS DE RENDERIZADO ANTICONGELAMIENTO
      backgroundThrottling: false, // Evita que Chromium congele o suspenda las pestañas en segundo plano
      nativeWindowOpen: true       // Garantiza un ciclo de vida limpio para los hilos secundarios del webview
    }
  });
  
  ventanaPrincipal.loadFile(path.join(__dirname, 'index.html'));

  // Opcional: Descomentá la siguiente línea si querés que las DevTools se abran automáticamente al compilar
  // ventanaPrincipal.webContents.openDevTools();
}

// Puente nativo para el selector de carpetas (Code Proyectos y Vault de Notas)
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