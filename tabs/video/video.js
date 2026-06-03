// tabs/video/video.js - Lógica Multimedia con Buscador de Resultados Unificado

window.mapearMinutosVideo = function(segundos) {
    if (isNaN(segundos) || segundos === Infinity) return "00:00";
    const m = Math.floor(segundos / 60).toString().padStart(2, '0');
    const s = Math.floor(segundos % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// ⚡ BOTÓN BUSCAR: Trae la lista de los 5 mejores videos según plataforma
window.buscarVideoPlataforma = async function() {
    const inputUrl = document.getElementById('input-url-video-stream');
    const plataforma = document.getElementById('selectorPlataformaVideo').value;
    const listaBox = document.getElementById('listaResultadosVideo');
    const monitorNombre = document.getElementById('nombreVideo');

    if (!inputUrl || !inputUrl.value.trim()) {
        alert("Por favor, ingresá palabras clave o una URL.");
        return;
    }

    const inputObjetivo = inputUrl.value.trim();
    const esUrl = inputObjetivo.startsWith('http://') || inputObjetivo.startsWith('https://');

    if (esUrl) {
        if (listaBox) listaBox.style.display = 'none';
        window.ejecutarStreamDirecto(inputObjetivo, false);
        return;
    }

    if (monitorNombre) monitorNombre.innerText = `BUSCANDO: "${inputObjetivo}" en ${plataforma.toUpperCase()}...`;
    if (listaBox) {
        listaBox.innerHTML = `<div style="color: #64748b; font-family: monospace; font-size: 11px; padding: 4px;">Buscando en la red...</div>`;
        listaBox.style.display = 'block';
    }

    try {
        const electronSeguro = window.nodeRequire ? window.nodeRequire('electron') : require('electron');
        const { ipcRenderer } = electronSeguro;

        const respuesta = await ipcRenderer.invoke('extraer-youtube-stream', {
            inputUsuario: inputObjetivo,
            plataforma: plataforma,
            esBusqueda: true
        });

        if (respuesta.success && respuesta.esLista) {
            if (monitorNombre) monitorNombre.innerText = `RESULTADOS ENCONTRADOS EN ${plataforma.toUpperCase()}`;
            listaBox.innerHTML = ''; 

            respuesta.resultados.forEach((video, index) => {
                const renglon = document.createElement('div');
                renglon.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #161f2c; padding: 4px 2px;";
                
                const urlSegura = encodeURIComponent(video.urlOrigen);

                renglon.innerHTML = `
                    <span style="color: #cbd5e0; font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1;" title="${video.titulo}">
                        ${index + 1}. ${video.titulo}
                    </span>
                    <button onclick="window.ejecutarStreamDirecto(decodeURIComponent('${urlSegura}'), true)" 
                            style="background: #2b3a52; border: 1px solid #a855f7; color: #a855f7; font-size: 10px; cursor: pointer; padding: 2px 6px; border-radius: 2px; font-weight: bold; font-family: monospace;">
                        ▶ VER
                    </button>
                `;
                listaBox.appendChild(renglon);
            });
        } else {
            listaBox.innerHTML = `<div style="color: #ff5555; font-family: monospace; font-size: 11px; padding: 4px;">Error: ${respuesta.error}</div>`;
        }
    } catch (err) {
        console.error("Error al buscar lista:", err);
    }
};

// 🎞️ REPRODUCIR: Remueve duplicados e interactúa directamente con el reproductor unificado
window.ejecutarStreamDirecto = async function(urlOrigen, vieneDeLista) {
    const monitorNombre = document.getElementById('nombreVideo');
    const contenedor = document.getElementById('contenedorVideoReal');
    const listaBox = document.getElementById('listaResultadosVideo');
    const reproductor = document.getElementById('reproductorGlobal');

    if (!reproductor) {
        console.error("No se encontró el reproductorGlobal en el ecosistema.");
        return;
    }

    if (monitorNombre) monitorNombre.innerText = "VIDEO: Conectando flujo de video unificado...";
    if (vieneDeLista && listaBox) listaBox.style.display = 'none';

    try {
        const electronSeguro = window.nodeRequire ? window.nodeRequire('electron') : require('electron');
        const { ipcRenderer } = electronSeguro;

        // Unificamos el envío de parámetros al backend
        const respuesta = await ipcRenderer.invoke('extraer-youtube-stream', {
            inputUsuario: urlOrigen,
            plataforma: '',
            esBusqueda: false
        });

        if (respuesta.success && contenedor) {
            if (monitorNombre) monitorNombre.innerText = respuesta.titulo;

            // Limpiamos el texto offline del viewport
            contenedor.innerHTML = '';
            
            // Re-configuramos el reproductor único nativo para que se muestre en el visor de video
            reproductor.style.display = 'block';
            reproductor.style.width = '100%';
            reproductor.style.height = '100%';
            reproductor.style.objectFit = 'contain';
            reproductor.style.background = '#000';
            
            // Mudamos el nodo al contenedor actual por si estaba en la pestaña de audio
            contenedor.appendChild(reproductor);

            // Seteamos origen y fuego!
            reproductor.src = respuesta.urlDirecta;
            reproductor.autoplay = true;
            
            if (typeof window.reproducir === 'function') {
                window.reproducir();
            } else {
                reproductor.play().catch(e => console.log(e));
            }

            setTimeout(() => {
                window.sincronizarControladoresDeTiempo();
            }, 150);
        } else {
            alert("Error al abrir stream: " + respuesta.error);
            if (monitorNombre) monitorNombre.innerText = "VIDEO: (Fallo de Extracción)";
        }
    } catch (err) {
        console.error("Error inyectando streaming:", err);
    }
};

// Sincroniza los sliders compartidos
window.sincronizarControladoresDeTiempo = function() {
    const video = document.getElementById('reproductorGlobal'); // Usar siempre el global
    const slider = document.getElementById('progreso-video-slider');
    const txtActual = document.getElementById('vid-tiempo-actual') || document.getElementById('txtTiempoActual'); // Fallback de nombres comunes
    const txtTotal = document.getElementById('vid-tiempo-total') || document.getElementById('txtTiempoTotal');
    const sliderVol = document.getElementById('volumen-video-slider');

    if (!video) return;

    if (sliderVol) video.volume = sliderVol.value;

    video.ontimeupdate = function() {
        if (txtActual) txtActual.innerText = window.mapearMinutosVideo(video.currentTime);
        if (slider && video.duration) {
            slider.value = (video.currentTime / video.duration) * 100;
        }
    };

    video.onloadedmetadata = function() {
        if (txtTotal) txtTotal.innerText = window.mapearMinutosVideo(video.duration);
    };
};

console.log("-> Buscador e inyector de video centralizado cargado.");