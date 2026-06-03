// js/controlador-multimedia.js
// Lógica aislada para gestión de Listas de Reproducción y Video rendering nativo

window.playlist = window.playlist || [];
window.indiceActual = window.indiceActual || 0;
window.intervaloProgresoVideo = null; 

// Extraemos ipcRenderer usando el puente nativo sin usar "const ipcRenderer" para evitar colisiones globales
// Si ya existe de forma global lo usamos, de lo contrario lo asignamos de forma segura
if (!window.ipcRendererInstance) {
    try {
        window.ipcRendererInstance = window.nodeRequire('electron').ipcRenderer;
    } catch(e) {
        // Fallback en caso de que esté expuesto de forma directa en renderer.js
        window.ipcRendererInstance = typeof ipcRenderer !== 'undefined' ? ipcRenderer : null;
    }
}

function actualizarInterfazPlaylist(tipo) {
    const contenedor = tipo === 'audio' ? document.getElementById('playlistAudio') : document.getElementById('playlistVideo');
    if (!contenedor) return;

    contenedor.innerHTML = '';
    window.playlist.forEach((track, indice) => {
        const item = document.createElement('div');
        item.className = `track ${indice === window.indiceActual ? 'seleccionada' : ''}`;
        item.innerText = `${indice + 1}. ${track.nombre}`;
        item.onclick = () => {
            window.indiceActual = indice;
            cargarTrackActual(tipo);
        };
        contenedor.appendChild(item);
    });
}

function agregarAplaylist(input, tipo) {
    if (!input.files || input.files.length === 0) return;
    window.playlist = [];

    for (let i = 0; i < input.files.length; i++) {
        const archivo = input.files[i];
        const urlObjetoNativo = URL.createObjectURL(archivo);
        window.playlist.push({
            nombre: archivo.name,
            srcUrl: urlObjetoNativo
        });
    }

    actualizarInterfazPlaylist(tipo);
    if (window.playlist.length > 0) {
        window.indiceActual = 0;
        cargarTrackActual(tipo);
    }
}

function cargarTrackActual(tipo) {
    if (!window.playlist || window.playlist.length === 0) return;
    clearInterval(window.intervaloProgresoVideo);
    
    const track = window.playlist[window.indiceActual];
    const reproductor = document.getElementById('reproductorGlobal');
    if (!reproductor) return;
    
    reproductor.src = track.srcUrl;
    
    if (tipo === 'audio') {
        const txtNombre = document.getElementById('nombreAudio');
        if (txtNombre) txtNombre.innerText = `TRACK: ${track.nombre}`;
        reproductor.style.display = 'none';
    } else {
        const txtNombre = document.getElementById('nombreVideo');
        if (txtNombre) txtNombre.innerText = `VIDEO: ${track.nombre}`;
        
        const contenedorVideo = document.getElementById('contenedorVideoReal');
        if (contenedorVideo) {
            contenedorVideo.innerHTML = ''; 
            reproductor.style.display = 'block';
            reproductor.style.width = '100%';
            reproductor.style.height = '100%';
            reproductor.style.background = '#000';
            contenedorVideo.appendChild(reproductor);
        }
        iniciarSegunderoProgreso();
    }
    
    reproducir();
    actualizarInterfazPlaylist(tipo);
}

function iniciarSegunderoProgreso() {
    clearInterval(window.intervaloProgresoVideo);
    const reproductor = document.getElementById('reproductorGlobal');
    const barraProgreso = document.getElementById('progreso-video-slider');
    
    if (!reproductor || !barraProgreso) return;

    window.intervaloProgresoVideo = setInterval(() => {
        if (reproductor.duration) {
            barraProgreso.value = (reproductor.currentTime / reproductor.duration) * 100;
        }
    }, 300);
}

function reproducir() { 
    const r = document.getElementById('reproductorGlobal');
    if (r && r.src) {
        r.play().catch(e => console.log("Esperando interacción:", e));
    } 
}

function pausar() { 
    const r = document.getElementById('reproductorGlobal');
    if (r) r.pause(); 
}

function detener() { 
    const r = document.getElementById('reproductorGlobal');
    if (r) {
        r.pause(); 
        r.currentTime = 0; 
        const barraProgreso = document.getElementById('progreso-video-slider');
        if (barraProgreso) barraProgreso.value = 0;
    }
}

function siguienteTrack(tipo) {
    if (window.playlist.length === 0) return;
    window.indiceActual = (window.indiceActual + 1) % window.playlist.length;
    cargarTrackActual(tipo);
}

function anteriorTrack(tipo) {
    if (window.playlist.length === 0) return;
    window.indiceActual = (window.indiceActual - 1 + window.playlist.length) % window.playlist.length;
    cargarTrackActual(tipo);
}

function limpiarPlaylist(tipo) {
    window.playlist = [];
    window.indiceActual = 0;
    detener();
    actualizarInterfazPlaylist(tipo);
    const txt = document.getElementById(tipo === 'audio' ? 'nombreAudio' : 'nombreVideo');
    if (txt) txt.innerText = tipo === 'audio' ? 'TRACK: (Ninguno cargado)' : 'VIDEO: (Ninguno cargado)';
    
    if (tipo === 'video') {
        const contenedorVideo = document.getElementById('contenedorVideoReal');
        if (contenedorVideo) {
            contenedorVideo.innerHTML = `<span style="color: #4a5568; font-family: monospace; font-size: 11px;">[PANTALLA DE VIDEO OFFLINE]</span>`;
        }
    }
}

function cambiarVolumen(val) {
    const r = document.getElementById('reproductorGlobal');
    if (r) r.volume = val;
    const txt = document.getElementById('txtVolumen');
    if (txt) txt.innerText = `${Math.round(val * 100)}%`;
}

window.scrollearProgresoVideo = function(valorPorcentaje) {
    const r = document.getElementById('reproductorGlobal');
    if (r && r.duration) {
        r.currentTime = (valorPorcentaje / 100) * r.duration;
    }
};

// Reemplaza ÚNICAMENTE la función window.cargarStreamVideo al final de tu controlador-multimedia.js:

window.cargarStreamVideo = async function() {
    const input = document.getElementById('input-url-video-stream');
    const contenedor = document.getElementById('contenedorVideoReal');
    const txtNombre = document.getElementById('nombreVideo');
    const reproductor = document.getElementById('reproductorGlobal');

    if (!input || !input.value.trim() || !contenedor || !reproductor) return;

    const url = input.value.trim();
    if (txtNombre) txtNombre.innerText = "STREAM: Extrayendo flujo nativo seguro...";

    if (!window.ipcRendererInstance) {
        alert("Error crítico: El puente de comunicación IPC no está disponible.");
        if (txtNombre) txtNombre.innerText = "VIDEO: (Error de Entorno)";
        return;
    }

    // Adaptado para enviar la estructura de objeto que el backend espera consistentemente
    const respuesta = await window.ipcRendererInstance.invoke('extraer-youtube-stream', {
        inputUsuario: url,
        plataforma: '',
        esBusqueda: false
    });

    if (respuesta.success) {
        console.log("[IPC Stream] Flujo inyectado con éxito:", respuesta.urlDirecta);
        if (txtNombre) txtNombre.innerText = `STREAM: ${respuesta.titulo}`;

        contenedor.innerHTML = '';
        reproductor.style.display = 'block';
        reproductor.style.width = '100%';
        reproductor.style.height = '100%';
        reproductor.style.background = '#000';
        contenedor.appendChild(reproductor); 

        reproductor.src = respuesta.urlDirecta;
        
        reproducir();
        iniciarSegunderoProgreso();
        
        // Ejecutamos la sincronización de barras de la pestaña video por si está activa
        if (typeof window.sincronizarControladoresDeTiempo === 'function') {
            window.sincronizarControladoresDeTiempo();
        }
        
        input.value = '';
    } else {
        console.error("[IPC Stream] Error devuelto del backend:", respuesta.error);
        alert(`No se pudo decodificar el video: ${respuesta.error}`);
        if (txtNombre) txtNombre.innerText = "VIDEO: (Fallo de Extracción)";
    }
};

// Vinculamos de forma segura las llamadas nativas de los botones de video.html hacia el controlador global
window.controlarVideoNativo = function(accion) {
    if (accion === 'play') reproducir();
    if (accion === 'pause') pausar();
    if (accion === 'stop') detener();
};

// Registro global libre de fallas
window.agregarAplaylist = agregarAplaylist;
window.reproducir = reproducir;
window.pausar = pausar;
window.detener = detener;
window.siguienteTrack = siguienteTrack;
window.anteriorTrack = anteriorTrack;
window.limpiarPlaylist = limpiarPlaylist;
window.cambiarVolumen = cambiarVolumen;