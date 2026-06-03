// main.js - Backend unificado con soporte nativo para yt-dlp (360p Unificado)
const { app, BrowserWindow, ipcMain, dialog } = require('electron'); 
const path = require('path');
const { exec } = require('child_process'); 

// Parche anticongelamiento para Manjaro e Intel Graphics
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

function crearVentana() {
  const ventanaPrincipal = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#243146',
    webPreferences: {
      nodeIntegration: true,         
      contextIsolation: false,       
      webviewTag: true,              
      backgroundThrottling: false, 
      webSecurity: false,            // Permite leer tus JS locales y los streams sin bloqueos de Chromium
      nativeWindowOpen: true       
    }
  });
  
  ventanaPrincipal.loadFile(path.join(__dirname, 'index.html'));
  ventanaPrincipal.webContents.openDevTools();
}

// =================================================================
// ⚡ PUENTE NATIVO MULTIMEDIA: CONSULTAS DE BÚSQUEDA Y EXTRACCIÓN (360p)
// =================================================================
ipcMain.handle('extraer-youtube-stream', async (event, datos) => {
  return new Promise(async (resolve) => {
    const ytDlpRutaAbsoluta = '/usr/bin/yt-dlp'; 
    
    // Desestructuramos soportando de forma segura tanto si mandan Objeto como si mandan String plano
    let inputUsuario = typeof datos === 'string' ? datos : datos.inputUsuario;
    let plataforma = (datos && datos.plataforma) ? datos.plataforma.toLowerCase() : '';
    let esBusqueda = (datos && datos.esBusqueda) ? datos.esBusqueda : false;

    if (!inputUsuario) {
      return resolve({ success: false, error: "El input de usuario está vacío." });
    }

    if (esBusqueda) {
      // ---------------------------------------------------------------
      // MODO BÚSQUEDA: LOGICA SEPARADA POR PLATAFORMA
      // ---------------------------------------------------------------
      if (plataforma === 'dailymotion') {
        console.log(`[Backend API] Buscando nativamente vía API REST de Dailymotion: [${inputUsuario}]`);
        
        try {
          // Consultamos la API pública oficial de Dailymotion. Trae campos limpios e inmunes a bloqueos.
          const urlApiDm = `https://api.dailymotion.com/videos?search=${encodeURIComponent(inputUsuario)}&fields=title,url&limit=5`;
          
          const respuestaApi = await fetch(urlApiDm);
          if (!respuestaApi.ok) throw new Error(`HTTP Error: ${respuestaApi.status}`);
          
          const datosJson = await respuestaApi.json();
          
          if (datosJson && datosJson.list && datosJson.list.length > 0) {
            const resultados = datosJson.list.map(video => ({
              titulo: video.title || 'Video sin título',
              urlOrigen: video.url
            }));
            
            console.log(`[Backend API] Se encontraron ${resultados.length} videos en Dailymotion con éxito.`);
            return resolve({ success: true, esLista: true, resultados });
          } else {
            return resolve({ success: false, error: "No se encontraron resultados para esta búsqueda." });
          }
        } catch (apiErr) {
          console.error("[Backend API Error] Falló el fetch nativo de Dailymotion:", apiErr.message);
          return resolve({ success: false, error: "Error de red al consultar el catálogo de Dailymotion." });
        }

      } else {
        // ---------------------------------------------------------------
        // BÚSQUEDA EN YOUTUBE (El motor clásico plano de yt-dlp sigue siendo impecable)
        // ---------------------------------------------------------------
        console.log(`[Backend] Aplicando comando oficial de YouTube para: [${inputUsuario}]`);
        const comandoBusqueda = `"${ytDlpRutaAbsoluta}" --flat-playlist -j "ytsearch5:${inputUsuario}"`;
        
        console.log(`[Backend Exec] Ejecutando: ${comandoBusqueda}`);

        exec(comandoBusqueda, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
          if (error) {
            console.error(`[Backend Error] Falló la búsqueda en YouTube. Stderr:`, stderr);
            return resolve({ success: false, error: stderr || error.message });
          }

          try {
            const lineas = stdout.trim().split('\n').filter(Boolean);
            const resultados = lineas.map(linea => {
              const json = JSON.parse(linea);
              return {
                titulo: json.title || 'Video sin título',
                urlOrigen: json.webpage_url || json.url
              };
            });

            return resolve({ success: true, esLista: true, resultados });
          } catch (parseErr) {
            return resolve({ success: false, error: "Error decodificando metadatos de YouTube." });
          }
        });
      }

    } else {
      // =================================================================
      // EXTRACCIÓN DE LINK DIRECTO (Cuando se le da clic a VER o es URL directa)
      // =================================================================
      console.log(`[Backend] Resolviendo stream final para: ${inputUsuario}`);
      
      // Filtros óptimos: Forzamos mp4 de 360p para que Chromium lo reproduzca nativo sin HLS/m3u8 roto
      let filtroFormato = 'best[height<=360][ext=mp4]/best[height<=360]/best';
      if (inputUsuario.includes('dailymotion.com') || inputUsuario.includes('dai.ly')) {
        filtroFormato = 'best[height<=360][vcodec!=none][acodec!=none]/best[height<=360]';
      }

      const comandoFinal = `"${ytDlpRutaAbsoluta}" --get-title -g -f "${filtroFormato}" --format-sort "ext:mp4:m4a" --no-warnings "${inputUsuario}"`;
      console.log(`[Backend Exec Directo] Ejecutando: ${comandoFinal}`);

      exec(comandoFinal, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[Backend Error] Falló la resolución del stream directo. Stderr:`, stderr);
          return resolve({ success: false, error: "Error al resolver el flujo de video con yt-dlp." });
        }

        const respuestaLineas = stdout.trim().split('\n').filter(Boolean);
        
        if (respuestaLineas.length >= 2) {
          const tituloReal = respuestaLineas[0];
          const urlDirecta = respuestaLineas[1];
          return resolve({ success: true, esLista: false, titulo: tituloReal, urlDirecta });
        } else if (respuestaLineas.length === 1) {
          return resolve({ success: true, esLista: false, titulo: "Streaming Seleccionado (360p)", urlDirecta: respuestaLineas[0] });
        } else {
          return resolve({ success: false, error: "No se capturaron flujos válidos desde el servidor remoto." });
        }
      });
    }
  });
});

// =================================================================
// 📁 PUENTE NATIVO: SELECTOR DE CARPETAS
// =================================================================
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