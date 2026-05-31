// =========================================================================
// 1. CAPTURAMOS LAS REFERENCIAS NATIVAS DE NODE DE ENTRADA
// =========================================================================
window.nodeRequire = require; // Escondemos el require nativo acá para protegerlo
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const { exec } = require('child_process');

// Inyección modular blindada de componentes HTML desde la carpeta 'tabs'
const cargarMódulo = (id) => {
    try {
        const rutaTab = path.join(__dirname, 'tabs', `${id}.html`);
        const contenedor = document.getElementById(`vista-${id}`);
        if (fs.existsSync(rutaTab) && contenedor) {
            contenedor.innerHTML = fs.readFileSync(rutaTab, 'utf-8');
            console.log(`✨ Módulo [${id}] inyectado correctamente.`);
        } else {
            console.warn(`⚠️ No se pudo inyectar el módulo: ${id}. Comprobar archivo o contenedor.`);
        }
    } catch (err) {
        console.error(`Error crítico cargando pestaña [${id}]:`, err);
    }
};

// Cargamos todas las vistas de forma segura, incluyendo el nuevo asistente BMO
['audio', 'video', 'editor', 'browser', 'obsidian', 'bmo', 'type-training', 'ai-tasks'].forEach(cargarMódulo);

// PARCHE MAESTRO ANTICONFLICTO: Ocultamos RequireJS temporalmente para Monaco
window.require = undefined;

// Guardamos variables de estado globales de la aplicación
const medio = document.getElementById('reproductorGlobal');
let playlist = [];
let indiceActual = 0;
let esMute = false;
let volumenPrevio = 1;
let editorInstancia = null;
let rutaProyectoActual = '';
let archivoCodigoAbierto = '';
let rutaVaultActual = '';
let archivoNotaAbierto = '';

// Listas para almacenamiento del navegador
let listaFavs = JSON.parse(localStorage.getItem('br_favoritos')) || [];
let listaHist = JSON.parse(localStorage.getItem('br_historial')) || [];
let navegadorPestanas = []; 
let idPestanaActiva = null;

// =========================================================================
// 2. CONFIGURACIÓN DEL PROCESO DE INICIALIZACIÓN (window.onload)
// =========================================================================
window.onload = () => {
    // Restauramos estado del navegador virtual
    const ultimaUrl = localStorage.getItem('browser_ultima_url') || 'https://google.com';
    const inputUrl = document.getElementById('browser-url');
    if (inputUrl) inputUrl.value = ultimaUrl;

    // Inicializamos pestañas web
    crearNuevaPestanaWeb(ultimaUrl);

    // Auto-vincular carpetas previas si existen físicamente en el disco
    const ultimaCarpetaCode = localStorage.getItem('code_ultima_carpeta');
    if (ultimaCarpetaCode && fs.existsSync(ultimaCarpetaCode)) {
        rutaProyectoActual = ultimaCarpetaCode;
        renderListaFisica(rutaProyectoActual, 'listaArchivosCode', false);
    }

    const ultimoVault = localStorage.getItem('obsidian_ultimo_vault');
    if (ultimoVault && fs.existsSync(ultimoVault)) {
        rutaVaultActual = ultimoVault;
        renderListaFisica(rutaVaultActual, 'listaNotasMD', true);
    }

    // Cambiar a la última sección abierta de forma fluida
    const ultimaTab = localStorage.getItem('app_ultima_tab') || 'audio';
    const botonTab = document.getElementById(`btn-tab-${ultimaTab}`);
    if (botonTab) cambiarVista(ultimaTab, botonTab);
};

// Configuración diferida de Monaco Editor para que cargue vía CDN sin trabar el hilo
window.webRequire.config({ 
    paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
});

function inicializarEditor() {
    if (editorInstancia) return;

    window.webRequire(['vs/editor/editor.main'], function() {
        editorInstancia = monaco.editor.create(document.getElementById('editor-monaco'), {
            value: '// Bienvenido a tu entorno de desarrollo nativo liviano\n// Selecciona un archivo de tu panel lateral para programar.',
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: 'monospace'
        });

        editorInstancia.onDidChangeModelContent(() => {
            if (archivoCodigoAbierto && editorInstancia) {
                fs.writeFileSync(archivoCodigoAbierto, editorInstancia.getValue(), 'utf-8');
            }
        });

        const ultimoArchivo = localStorage.getItem('code_ultimo_archivo');
        if (ultimoArchivo && fs.existsSync(ultimoArchivo)) {
            abrirCodigoEnEditor(ultimoArchivo);
        }
    });
}

function cambiarVista(vistaId, botonCliquado) {
    document.querySelectorAll('.view-section').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const seccionDestino = document.getElementById(`vista-${vistaId}`);
    if (seccionDestino) {
        seccionDestino.classList.add('active');
        seccionDestino.style.display = 'flex'; // Cambiado a flex para respetar layouts modernos de los módulos
    }
    if (botonCliquado) botonCliquado.classList.add('active');

    localStorage.setItem('app_ultima_tab', vistaId);

    if (vistaId === 'video') {
        medio.style.display = 'block';
        medio.controls = true;
        const contVid = document.getElementById('contenedorVideoReal');
        if(contVid) contVid.appendChild(medio);
    } else {
        medio.style.display = 'none';
        document.body.appendChild(medio);
    }

    if (vistaId === 'editor') {
        inicializarEditor();
        setTimeout(() => { if (editorInstancia) editorInstancia.layout(); }, 100);
    }
}

async function abrirSelectorCarpeta(tipo) {
    const ruta = await ipcRenderer.invoke('seleccionar-carpeta');
    if (!ruta) return;

    if (tipo === 'code') {
        rutaProyectoActual = ruta;
        localStorage.setItem('code_ultima_carpeta', ruta);
        renderListaFisica(rutaProyectoActual, 'listaArchivosCode', false);
        printTerminal(`Carpeta del proyecto vinculada con éxito: ${ruta}`);
    } else if (tipo === 'notes') {
        rutaVaultActual = ruta;
        localStorage.setItem('obsidian_ultimo_vault', ruta);
        renderListaFisica(rutaVaultActual, 'listaNotasMD', true);
    }
}

// =========================================================================
// 3. EXPLORADOR RECURSIVO BLINDADO (Anti-cuelgues SWAP / Archivos Ocultos)
// =========================================================================
function renderListaFisica(rutaRaiz, contenedorId, soloMarkdown) {
    const divContenedor = document.getElementById(contenedorId);
    if (!divContenedor) return;
    divContenedor.innerHTML = '';

    function generarArbol(rutaActual, nodoDestino, nivel = 0) {
        try {
            if (!fs.existsSync(rutaActual)) return;
            const elementos = fs.readdirSync(rutaActual);
            
            const carpetas = [];
            const archivos = [];

            elementos.forEach(el => {
                try {
                    const rutaCompleta = path.join(rutaActual, el);
                    const stat = fs.statSync(rutaCompleta);
                    if (stat.isDirectory()) carpetas.push({ el, rutaCompleta });
                    else archivos.push({ el, rutaCompleta });
                } catch (e) {
                    // Evita fugas de memoria o bloqueos si el archivo está protegido por Linux
                }
            });

            // Dibujar Carpetas de manera eficiente
            carpetas.forEach(c => {
                const divCarpeta = document.createElement('div');
                divCarpeta.style = `padding-left: ${nivel * 12}px; display: flex; align-items: center; cursor: pointer; font-size: 12px; font-weight: bold; color: #a855f7; padding-top: 3px; padding-bottom: 3px;`;
                divCarpeta.innerText = `📁 ${c.el}`;

                const subContenedor = document.createElement('div');
                subContenedor.style.display = 'block';

                divCarpeta.onclick = (e) => {
                    e.stopPropagation();
                    const oculto = subContenedor.style.display === 'none';
                    subContenedor.style.display = oculto ? 'block' : 'none';
                    divCarpeta.innerText = oculto ? `📁 ${c.el}` : `📂 ${c.el}`;
                };

                nodoDestino.appendChild(divCarpeta);
                nodoDestino.appendChild(subContenedor);
                generarArbol(c.rutaCompleta, subContenedor, nivel + 1);
            });

            // Dibujar Archivos (.md o código general)
            const cachedArchivo = localStorage.getItem(soloMarkdown ? 'obsidian_ultima_nota' : 'code_ultimo_archivo');
            
            archivos.forEach(a => {
                const extension = path.extname(a.el).toLowerCase();
                if (soloMarkdown && extension !== '.md') return;

                const item = document.createElement('div');
                item.className = 'tree-item';
                item.style.paddingLeft = `${nivel * 12 + 6}px`;
                item.style.cursor = 'pointer';
                if (cachedArchivo === a.rutaCompleta) item.classList.add('activo');
                item.innerText = soloMarkdown ? `📄 ${a.el.replace('.md','')}` : `📄 ${a.el}`;
                
                item.onclick = (e) => {
                    e.stopPropagation();
                    document.querySelectorAll(`#${contenedorId} .tree-item`).forEach(i => i.classList.remove('activo'));
                    item.classList.add('activo');
                    
                    if (soloMarkdown) abrirNotaObsidian(a.rutaCompleta);
                    else abrirCodigoEnEditor(a.rutaCompleta);
                };
                nodoDestino.appendChild(item);
            });
        } catch (err) {
            console.error("Error construyendo árbol:", err);
        }
    }

    generarArbol(rutaRaiz, divContenedor, 0);
}

function abrirCodigoEnEditor(ruta) {
    try {
        if (!editorInstancia) return;
        const contenido = fs.readFileSync(ruta, 'utf-8');
        archivoCodigoAbierto = ruta;
        localStorage.setItem('code_ultimo_archivo', ruta);
        
        const ext = path.extname(ruta).toLowerCase();
        let lang = 'javascript';
        if (ext === '.py') lang = 'python';
        if (ext === '.rs') lang = 'rust';
        if (ext === '.html') lang = 'html';
        if (ext === '.css') lang = 'css';
        if (ext === '.json') lang = 'json';
        if (ext === '.md') lang = 'markdown';
        
        const antiguoModelo = editorInstancia.getModel();
        const nuevoModelo = monaco.editor.createModel(contenido, lang);
        editorInstancia.setModel(nuevoModelo);
        if (antiguoModelo) antiguoModelo.dispose();
        
        printTerminal(`Archivo cargado en Monaco: ${path.basename(ruta)}`);
    } catch (err) {
        printTerminal(`Error leyendo archivo: ${err.message}`, true);
    }
}

function ejecutarCodigoActual() {
    if (!archivoCodigoAbierto || !editorInstancia) return;
    
    fs.writeFileSync(archivoCodigoAbierto, editorInstancia.getValue(), 'utf-8');
    const extension = path.extname(archivoCodigoAbierto).toLowerCase();
    let comandoEjecucion = '';

    if (extension === '.js') comandoEjecucion = `node "${archivoCodigoAbierto}"`;
    else if (extension === '.py') comandoEjecucion = `python "${archivoCodigoAbierto}"`;
    else if (extension === '.rs') {
        const rutaBinario = archivoCodigoAbierto.replace('.rs', '');
        comandoEjecucion = `rustc "${archivoCodigoAbierto}" && "${rutaBinario}"`;
    } else {
        printTerminal(`Extensión ${extension} no configurada para ejecución directa.`, true);
        return;
    }

    printTerminal(`[RUNNING]: ${comandoEjecucion}`);
    exec(comandoEjecucion, (error, stdout, stderr) => {
        if (error) {
            printTerminal(`❌ ERROR:\n${stderr || error.message}`, true);
            return;
        }
        printTerminal(`✨ SALIDA:\n${stdout}`);
    });
}

// Funciones operativas de creación
function crearNuevoArchivoCode() {
    if (!rutaProyectoActual) { alert("Primero vinculá una carpeta de proyecto."); return; }
    const nombreArchivo = prompt("Nombre del archivo con su extensión (ej: main.js, script.py, app.rs):");
    if (!nombreArchivo) return;
    const rutaFinal = path.join(rutaProyectoActual, nombreArchivo);
    try {
        fs.writeFileSync(rutaFinal, '', 'utf-8');
        renderListaFisica(rutaProyectoActual, 'listaArchivosCode', false);
        abrirCodigoEnEditor(rutaFinal);
    } catch (err) { alert("Error creando archivo: " + err.message); }
}

function crearNuevaCarpetaCode() {
    if (!rutaProyectoActual) { alert("Primero vinculá una carpeta de proyecto."); return; }
    const nombreCarpeta = prompt("Nombre de la nueva carpeta:");
    if (!nombreCarpeta) return;
    const rutaFinal = path.join(rutaProyectoActual, nombreCarpeta);
    try {
        if (!fs.existsSync(rutaFinal)) {
            fs.mkdirSync(rutaFinal);
            renderListaFisica(rutaProyectoActual, 'listaArchivosCode', false);
        }
    } catch (err) { alert("Error creando carpeta: " + err.message); }
}

// =========================================================================
// 4. MÓDULO OBSIDIAN (Notas Markdown)
// =========================================================================
function abrirNotaObsidian(ruta) {
    try {
        const txtArea = document.getElementById('editorObsidian');
        if (txtArea) txtArea.value = fs.readFileSync(ruta, 'utf-8');
        archivoNotaAbierto = ruta;
        localStorage.setItem('obsidian_ultima_nota', ruta);
        
        const rutaActiva = document.getElementById('ruta-nota-activa');
        if (rutaActiva) rutaActiva.innerText = `ARCHIVO: ${path.basename(ruta).toUpperCase()}`;
    } catch (err) {
        console.error("Error abriendo nota:", err);
    }
}

function guardarNotaObsidian() {
    const txtArea = document.getElementById('editorObsidian');
    if (archivoNotaAbierto && txtArea) {
        fs.writeFileSync(archivoNotaAbierto, txtArea.value, 'utf-8');
    }
}

function crearNuevaNota() {
    if (!rutaVaultActual) { 
        alert("⚠️ Error: No hay ninguna ruta de Vault guardada o vinculada."); 
        return; 
    }
    const nombreNota = prompt("Nombre de la nueva nota:");
    if (!nombreNota) return;
    
    const rutaFinal = path.join(rutaVaultActual, `${nombreNota}.md`);
    try {
        fs.writeFileSync(rutaFinal, `# ${nombreNota}\n\n`, 'utf-8');
        renderListaFisica(rutaVaultActual, 'listaNotasMD', true);
        abrirNotaObsidian(rutaFinal);
    } catch (err) {
        alert(`❌ ERROR DE SISTEMA al crear nota:\nCódigo: ${err.code}\nMensaje: ${err.message}`);
    }
}

function crearNuevaCarpetaNota() {
    if (!rutaVaultActual) { 
        alert("⚠️ Error: Primero vinculá un Vault de notas."); 
        return; 
    }
    const nombreCarpeta = prompt("Nombre de la nueva carpeta:");
    if (!nombreCarpeta) return;
    
    const rutaFinal = path.join(rutaVaultActual, nombreCarpeta);
    try {
        if (!fs.existsSync(rutaFinal)) {
            fs.mkdirSync(rutaFinal);
            renderListaFisica(rutaVaultActual, 'listaNotasMD', true);
        } else {
            alert("⚠️ La carpeta ya existe en esa ubicación.");
        }
    } catch (err) {
        alert(`❌ ERROR DE SISTEMA al crear carpeta:\nCódigo: ${err.code}\nMensaje: ${err.message}`);
    }
}

// =========================================================================
// 5. TERMINAL INTEGRADA
// =========================================================================
function printTerminal(t, err = false) {
    const out = document.getElementById('outputTerminal');
    if(!out) return;
    out.innerHTML += `<div style="color: ${err ? '#ff5555' : '#00d4ff'}; margin-top:5px; border-left: 3px solid ${err ? '#ff3333' : '#7000ff'}; padding-left: 5px;">${t}</div>`;
    out.scrollTop = out.scrollHeight;
}

function procesarComando(e) {
    if (e.key === 'Enter') {
        const el = document.getElementById('inputTerminal');
        if (!el) return;
        const cmd = el.value.trim();
        if (!cmd) return;
        
        printTerminal(`> ${cmd}`);
        el.value = '';

        if (cmd === 'clear' || cmd === 'cls') {
            const out = document.getElementById('outputTerminal');
            if(out) out.innerHTML = '';
            return;
        }

        try {
            const resEval = eval(cmd);
            printTerminal(resEval !== undefined ? resEval : 'ejecutado.');
        } catch (err) {
            printTerminal(`Error en comando: ${err.message}`, true);
        }
    }
}

// =========================================================================
// 6. REPRODUCTOR DE AUDIO Y VIDEO WIDGETS
// =========================================================================
function agregarAplaylist(input, tipo) {
    Array.from(input.files).forEach(f => {
        playlist.push({ nombre: f.name, url: URL.createObjectURL(f), tipo });
    });
    actualizarInterfaces();
    if (medio.paused && !medio.src && playlist.length > 0) {
        cargarTrack(playlist.length - input.files.length);
    }
}

function actualizarInterfaces() {
    const pla = document.getElementById('playlistAudio');
    const plv = document.getElementById('playlistVideo');

    if(pla) pla.innerHTML = playlist.filter(t => t.tipo === 'audio').length ? '' : '<div style="color:#888;text-align:center;padding-top:40px;">Playlist vacía</div>';
    if(plv) plv.innerHTML = playlist.filter(t => t.tipo === 'video').length ? '' : '<div style="color:#888;text-align:center;padding-top:40px;">Playlist vacía</div>';

    playlist.forEach((t, i) => {
        const d = document.createElement('div');
        d.className = `track ${i === indiceActual && medio.src ? 'seleccionada' : ''}`;
        d.innerText = `${i + 1}. ${t.tipo === 'audio' ? '🎵' : '🎬'} ${t.nombre}`;
        d.onclick = () => cargarTrack(i);

        if(t.tipo === 'audio' && pla) pla.appendChild(d);
        else if(t.tipo === 'video' && plv) plv.appendChild(d);
    });
}

function cargarTrack(i) {
    if (i < 0 || i >= playlist.length) return;
    indiceActual = i;
    medio.src = playlist[i].url;

    const na = document.getElementById('nombreAudio');
    const nv = document.getElementById('nombreVideo');

    if (playlist[i].tipo === 'audio' && na) na.innerText = `TRACK: ${playlist[i].nombre.toUpperCase()}`;
    else if(nv) nv.innerText = `VIDEO: ${playlist[i].nombre.toUpperCase()}`;

    actualizarInterfaces();
    reproducir();
}

function reproducir() { if (medio.src) medio.play(); }
function pausar() { medio.pause(); }
function detener() { medio.pause(); medio.currentTime = 0; }
function siguienteTrack() { if (indiceActual + 1 < playlist.length) cargarTrack(indiceActual + 1); else if (playlist.length > 0) cargarTrack(0); }
function anteriorTrack() { if (indiceActual - 1 >= 0) cargarTrack(indiceActual - 1); else if (playlist.length > 0) cargarTrack(playlist.length - 1); }

function cambiarVolumen(v) { 
    medio.volume = v; 
    const txtVol = document.getElementById('txtVolumen');
    const bMute = document.getElementById('btnMute');
    if(txtVol) txtVol.innerText = `${Math.round(v * 100)}%`; 
    if(bMute) bMute.innerText = v > 0 ? "🔊" : "🔇"; 
}

function alternarMute() { 
    const ctrlVol = document.getElementById('controlVolumen');
    if (!esMute) { 
        volumenPrevio = medio.volume; cambiarVolumen(0); if(ctrlVol) ctrlVol.value = 0; esMute = true; 
    } else { 
        cambiarVolumen(volumenPrevio); if(ctrlVol) ctrlVol.value = volumenPrevio; esMute = false; 
    } 
}

function alternarLoop() { 
    medio.loop = !medio.loop; const bl = document.getElementById('btnLoop'); 
    if(bl){ bl.innerText = medio.loop ? "🔁 LOOP (ON)" : "🔁 LOOP (OFF)"; bl.classList.toggle('activo', medio.loop); }
}

function limpiarPlaylist() { 
    detener(); medio.src = ""; playlist = []; indiceActual = 0; 
    const nAudio = document.getElementById('nombreAudio'); if(nAudio) nAudio.innerText = "TRACK: (Ninguno cargado)"; 
    actualizarInterfaces(); 
}
medio.addEventListener('ended', () => { if (!medio.loop) siguienteTrack(); });

// =========================================================================
// 7. BROWSER SIDEBAR & PESTAÑAS MÚLTIPLES
// =========================================================================
function alternarPanelLateral() {
    const sidebar = document.getElementById('browser-sidebar');
    if (!sidebar) return;
    sidebar.style.display = (sidebar.style.display === 'none' || sidebar.style.display === '') ? 'flex' : 'none';
    if (sidebar.style.display === 'flex') renderizarFavoritosYHistorial();
}

function alternarFavoritoActual() {
    if (!idPestanaActiva) return;
    const wv = document.getElementById(`wv-${idPestanaActiva}`);
    if (!wv) return;
    const urlActual = wv.getURL ? wv.getURL() : wv.src;
    if (!urlActual) return;

    if (listaFavs.includes(urlActual)) {
        listaFavs = listaFavs.filter(u => u !== urlActual);
    } else {
        listaFavs.push(urlActual);
    }
    localStorage.setItem('br_favoritos', JSON.stringify(listaFavs));
    verificarIconoFavorito(urlActual);
    renderizarFavoritosYHistorial();
}

function registrarUrlEnHistorial(url) {
    if (!url || url === 'about:blank') return;
    if (listaHist.length === 0 || listaHist[0] !== url) {
        listaHist.unshift(url);
        if (listaHist.length > 25) listaHist.pop();
        localStorage.setItem('br_historial', JSON.stringify(listaHist));
    }
    verificarIconoFavorito(url);
    if (document.getElementById('browser-sidebar')?.style.display === 'flex') renderizarFavoritosYHistorial();
}

function verificarIconoFavorito(url) {
    const btn = document.getElementById('btn-fav-actual');
    if (!btn) return;
    btn.innerText = listaFavs.includes(url) ? '★' : '⭐';
    btn.style.color = listaFavs.includes(url) ? '#eab308' : '#00d4ff';
}

function renderizarFavoritosYHistorial() {
    const fDiv = document.getElementById('lista-favoritos');
    const hDiv = document.getElementById('lista-historial');
    if(!fDiv || !hDiv) return;

    fDiv.innerHTML = listaFavs.length ? '' : '<span style="color:#555;font-size:10px;padding:4px;">Vacío</span>';
    listaFavs.forEach(url => {
        const item = document.createElement('div');
        item.style = "padding: 5px 4px; color: #cbd5e0; cursor: pointer; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size:11px; border-bottom:1px solid #1e293b;";
        item.innerText = url.replace('https://','').replace('http://','').replace('www.','');
        item.title = url;
        item.onclick = () => { document.getElementById('browser-url').value = url; irAUrl(); };
        fDiv.appendChild(item);
    });

    hDiv.innerHTML = listaHist.length ? '' : '<span style="color:#555;font-size:10px;padding:4px;">Vacío</span>';
    listaHist.forEach(url => {
        const item = document.createElement('div');
        item.style = "padding: 5px 4px; color: #a0aec0; cursor: pointer; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size:11px; border-bottom:1px solid #1e293b;";
        item.innerText = url.replace('https://','').replace('http://','').replace('www.','');
        item.title = url;
        item.onclick = () => { document.getElementById('browser-url').value = url; irAUrl(); };
        hDiv.appendChild(item);
    });
}

function limpiarHistorialCompleto() {
    listaHist = []; localStorage.setItem('br_historial', JSON.stringify(listaHist)); renderizarFavoritosYHistorial();
}

function crearNuevaPestanaWeb(urlInicial = 'https://google.com') {
    const idUnico = 'tab-' + Date.now();
    const nuevaPestana = { id: idUnico, url: urlInicial };
    navegadorPestanas.push(nuevaPestana);

    const contenedorWebviews = document.getElementById('browser-webviews-container');
    if (contenedorWebviews) {
        const nuevoWebview = document.createElement('webview');
        nuevoWebview.id = `wv-${idUnico}`;
        nuevoWebview.src = urlInicial;
        nuevoWebview.setAttribute('allowpopups', '');
        nuevoWebview.style.width = '100%';
        nuevoWebview.style.height = '100%';
        nuevoWebview.style.display = 'none';
        
        // 🔥 PARCHE DE SEGURIDAD INTEGRADO: listeners de carga blindados
        nuevoWebview.addEventListener('did-start-loading', () => {
            const inputUrl = document.getElementById('browser-url');
            if (idUnico === idPestanaActiva && inputUrl) {
                try {
                    if (typeof nuevoWebview.getWebContentsId === 'function' && nuevoWebview.getWebContentsId()) {
                        inputUrl.value = nuevoWebview.getURL();
                    } else {
                        inputUrl.value = nuevoWebview.src || '';
                    }
                } catch (e) {
                    inputUrl.value = nuevoWebview.src || '';
                }
            }
        });

        nuevoWebview.addEventListener('did-stop-loading', () => {
            try {
                if (typeof nuevoWebview.getWebContentsId === 'function' && nuevoWebview.getWebContentsId()) {
                    const urlActual = nuevoWebview.getURL();
                    if (!listaHist.includes(urlActual) && !urlActual.startsWith('data:')) {
                        registrarUrlEnHistorial(urlActual);
                    }
                }
            } catch (e) {
                console.warn("[Browser] Esperando montaje completo del proceso secundario.");
            }
        });
        
        nuevoWebview.addEventListener('did-navigate', (e) => {
            nuevaPestana.url = e.url;
            registrarUrlEnHistorial(e.url);
            if (idPestanaActiva === idUnico) {
                const inputUrl = document.getElementById('browser-url');
                if (inputUrl) inputUrl.value = e.url;
                localStorage.setItem('browser_ultima_url', e.url);
            }
        });

        contenedorWebviews.appendChild(nuevoWebview);
    }
    activarPestanaWeb(idUnico);
}

function activarPestanaWeb(idTab) {
    idPestanaActiva = idTab;
    navegadorPestanas.forEach(t => {
        const wv = document.getElementById(`wv-${t.id}`);
        if (wv) wv.style.display = (t.id === idTab) ? 'flex' : 'none';
    });

    const tabData = navegadorPestanas.find(t => t.id === idTab);
    if (tabData && document.getElementById('browser-url')) {
        document.getElementById('browser-url').value = tabData.url;
        verificarIconoFavorito(tabData.url);
    }
    renderizarBarraPestanas();
}

function cerrarPestanaWeb(idTab, event) {
    if (event) event.stopPropagation();
    const wv = document.getElementById(`wv-${idTab}`);
    if (wv) wv.remove();

    const indice = navegadorPestanas.findIndex(t => t.id === idTab);
    navegadorPestanas = navegadorPestanas.filter(t => t.id !== idTab);

    if (idPestanaActiva === idTab) {
        if (navegadorPestanas.length > 0) {
            activarPestanaWeb(navegadorPestanas[Math.max(0, indice - 1)].id);
        } else {
            idPestanaActiva = null;
            const inputUrl = document.getElementById('browser-url');
            if (inputUrl) inputUrl.value = '';
            renderizarBarraPestanas();
        }
    } else {
        renderizarBarraPestanas();
    }
}

function renderizarBarraPestanas() {
    const barra = document.getElementById('browser-tabs-bar');
    if (!barra) return;

    const botonNueva = barra.querySelector('button[onclick*="crearNuevaPestanaWeb"]');
    barra.innerHTML = '';

    navegadorPestanas.forEach(t => {
        const btnTab = document.createElement('div');
        const esActiva = (t.id === idPestanaActiva);
        btnTab.style = `display: flex; align-items: center; gap: 8px; padding: 3px 8px; font-size: 11px; cursor: pointer; border-radius: 3px 3px 0 0; font-family: monospace; transition: background 0.2s; border-right: 1px solid #1e293b;`;
        btnTab.style.background = esActiva ? '#243146' : '#1e293b';
        btnTab.style.color = esActiva ? '#00d4ff' : '#70a0e0';
        
        let tituloLimpio = t.url.replace('https://','').replace('http://','').replace('www.','');
        if (tituloLimpio.length > 18) tituloLimpio = tituloLimpio.substring(0, 15) + '...';
        if (t.url === 'https://google.com') tituloLimpio = 'Google';

        btnTab.innerHTML = `
            <span onclick="window.activarPestanaWeb('${t.id}')">${tituloLimpio}</span>
            <span onclick="window.cerrarPestanaWeb('${t.id}', event)" style="color: #ff5555; font-weight: bold; font-size: 12px; padding: 0 2px; border-radius: 2px; transition: background 0.2s;">×</span>
        `;
        barra.appendChild(btnTab);
    });

    if (botonNueva) barra.appendChild(botonNueva);
}

function navegadorPestana(accion) {
    if (!idPestanaActiva) return;
    const wv = document.getElementById(`wv-${idPestanaActiva}`);
    if (!wv) return;
    
    if (accion === 'back' && wv.canGoBack()) wv.goBack();
    if (accion === 'forward' && wv.canGoForward()) wv.goForward();
    if (accion === 'reload') wv.reload();
}

function irAUrl() {
    const inputUrl = document.getElementById('browser-url');
    if (!inputUrl || !idPestanaActiva) return;
    
    const wv = document.getElementById(`wv-${idPestanaActiva}`);
    if (!wv) return;

    let url = inputUrl.value.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    wv.src = url;
}

function navegarUrl(e) { if (e.key === 'Enter') irAUrl(); }

// =========================================================================
// 8. EXPOSICIÓN GLOBAL EXPLICITA AL ENTORNO (WINDOW)
// =========================================================================
window.cambiarVista = cambiarVista;
window.abrirSelectorCarpeta = abrirSelectorCarpeta;
window.crearNuevaNota = crearNuevaNota;
window.crearNuevaCarpetaNota = crearNuevaCarpetaNota;
window.guardarNotaObsidian = guardarNotaObsidian;
window.crearNuevoArchivoCode = crearNuevoArchivoCode;
window.crearNuevaCarpetaCode = crearNuevaCarpetaCode;
window.ejecutarCodigoActual = ejecutarCodigoActual;
window.procesarComando = procesarComando;
window.agregarAplaylist = agregarAplaylist;
window.reproducir = reproducir;
window.pausar = pausar;
window.detener = detener;
window.siguienteTrack = siguienteTrack;
window.anteriorTrack = anteriorTrack;
window.cambiarVolumen = cambiarVolumen;
window.alternarMute = alternarMute;
window.alternarLoop = alternarLoop;
window.limpiarPlaylist = limpiarPlaylist;
window.alternarPanelLateral = alternarPanelLateral;
window.alternarFavoritoActual = alternarFavoritoActual;
window.limpiarHistorialCompleto = limpiarHistorialCompleto;
window.crearNuevaPestanaWeb = crearNuevaPestanaWeb;
window.activarPestanaWeb = activarPestanaWeb;
window.cerrarPestanaWeb = cerrarPestanaWeb;
window.navegacionPestana = navegacionPestana;
window.irAUrl = irAUrl;
window.navegarUrl = navegarUrl;