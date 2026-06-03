// js/controlador-descargas.js
// Lógica de automatización para descargas multimedia de alta velocidad

function logDescarga(texto) {
    // Si la pestaña AI Lab definió una caja especial, la usa; si no, busca la genérica
    const targetId = window.outputDescargadorId || 'outputDescargador';
    const contenedor = document.getElementById(targetId);
    if (contenedor) {
        contenedor.innerText += `\n[SISTEMA] ${texto}`;
        contenedor.scrollTop = contenedor.scrollHeight;
    }
}

function descargarRecurso(tipo) {
    const inputUrl = document.getElementById('inputUrlDescarga');
    if (!inputUrl || !inputUrl.value.trim()) {
        alert("Por favor, ingresa una URL válida.");
        return;
    }

    const urlTarget = inputUrl.value.trim();
    const deventasLog = document.getElementById('ai-monitor-output');
    if (deventasLog) deventasLog.innerText = `Iniciando protocolo de extracción para: ${urlTarget}\nPor favor espera...`;

    let comando = '';
    if (tipo === 'audio') {
        comando = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 "${urlTarget}"`;
    } else {
        comando = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" "${urlTarget}"`;
    }

    logDescarga("Ejecutando proceso en segundo plano de terminal...");

    // Usamos el require nativo guardado para evitar colisiones globales
    const { exec } = window.nodeRequire('child_process');

    exec(comando, (error, stdout, stderr) => {
        if (error) {
            console.error(error);
            logDescarga(`❌ ERROR CRÍTICO: Asegúrate de tener 'yt-dlp' instalado globalmente en tu sistema.\nDetalles: ${error.message}`);
            return;
        }
        
        if (stderr && !stdout) {
            logDescarga(`Aviso de consola: ${stderr}`);
        }

        logDescarga(stdout);
        logDescarga(`✨ ¡OPERACIÓN COMPLETADA! El archivo se guardó.`);
        
        // Limpiamos los inputs correspondientes
        const inputOriginal = document.getElementById('scrapper-url-input');
        if (inputOriginal) inputOriginal.value = '';
        inputUrl.value = '';
    });
}

window.descargarRecurso = descargarRecurso;