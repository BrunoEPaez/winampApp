// ==========================================
// CONTROLADOR DE NAVEGACIÓN MULTI-PESTAÑA REAL
// ==========================================

window.pestanasWeb = [];
window.pestanaWebActivaId = null;
window.historialWeb = [];


window.crearNuevaPestanaWeb = function(urlInicial = 'https://www.google.com') {
    const id = 'wp-' + Date.now();
    window.pestanasWeb.push({ id: id, url: urlInicial, titulo: 'Cargando...' });

    const barra = document.getElementById('browser-tabs-bar');
    if (barra) {
        const botonNueva = barra.lastElementChild;
        const btnTab = document.createElement('div');
        btnTab.id = `btn-${id}`;
        btnTab.className = 'browser-tab-item';
        btnTab.style = 'background: #1e293b; color: #cbd5e0; border: 1px solid #3d4f6e; padding: 4px 10px; font-size: 11px; cursor: pointer; border-radius: 3px 3px 0 0; display: flex; align-items: center; gap: 6px; margin-bottom: 2px;';
        btnTab.innerHTML = `
            <span onclick="window.activarPestanaWeb('${id}')" class="tab-url-title" style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Nueva pestaña</span>
            <span onclick="window.cerrarPestanaWeb('${id}', event)" style="color: #ff5555; font-weight: bold; cursor: pointer;">×</span>
        `;
        if (botonNueva) barra.insertBefore(btnTab, botonNueva);
        else barra.appendChild(btnTab);
    }

    const contenedorWebviews = document.getElementById('browser-webviews-container');
    if (contenedorWebviews) {
        const wv = document.createElement('webview');
        wv.id = `webview-${id}`;
        wv.src = urlInicial;
        
        wv.style.position = 'absolute';
        wv.style.top = '0'; wv.style.left = '0';
        wv.style.width = '100%'; wv.style.height = '100%';
        wv.style.background = '#161f2c';
        wv.style.display = 'none';
        wv.setAttribute('allowpopups', '');
        
        wv.addEventListener('new-window', (e) => {
            e.preventDefault(); 
            window.crearNuevaPestanaWeb(e.url); 
        });

        wv.addEventListener('did-navigate', (e) => {
            if (window.pestanaWebActivaId === id) {
                const inputUrl = document.getElementById('browser-url-input');
                if (inputUrl) inputUrl.value = e.url;
            }
        });

        wv.addEventListener('page-title-updated', (e) => {
            const spanTitulo = document.querySelector(`#btn-${id} .tab-url-title`);
            if (spanTitulo) spanTitulo.innerText = e.title;
        });

        contenedorWebviews.appendChild(wv);
    }
    window.activarPestanaWeb(id);
};

window.activarPestanaWeb = function(id) {
    window.pestanaWebActivaId = id;

    document.querySelectorAll('.browser-tab-item').forEach(t => {
        t.style.background = '#1e293b';
        t.style.color = '#cbd5e0';
    });
    
    const contenedor = document.getElementById('browser-webviews-container');
    if (contenedor) {
        const wvs = contenedor.getElementsByTagName('webview');
        for (let wv of wvs) { 
            wv.style.setProperty('display', 'none', 'important'); 
        }
    }

    const btnActivo = document.getElementById(`btn-${id}`);
    if (btnActivo) {
        btnActivo.style.background = '#00d4ff';
        btnActivo.style.color = '#1e293b';
    }

    const wvActivo = document.getElementById(`webview-${id}`);
    if (wvActivo) {
        wvActivo.style.setProperty('display', 'block', 'important');
        wvActivo.style.setProperty('width', '100%', 'important');
        wvActivo.style.setProperty('height', '100%', 'important');

        const inputUrl = document.getElementById('browser-url-input');
        if (inputUrl) inputUrl.value = wvActivo.src;
    }
};

window.cerrarPestanaWeb = function(id, event) {
    if (event) event.stopPropagation();
    window.pestanasWeb = window.pestanasWeb.filter(p => p.id !== id);
    
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.remove();
    
    const wv = document.getElementById(`webview-${id}`);
    if (wv) wv.remove();

    if (window.pestanaWebActivaId === id && window.pestanasWeb.length > 0) {
        window.activarPestanaWeb(window.pestanasWeb[window.pestanasWeb.length - 1].id);
    } else if (window.pestanasWeb.length === 0) {
        window.crearNuevaPestanaWeb('https://www.google.com');
    }
};

window.irAUrl = function() {
    const input = document.getElementById('browser-url-input');
    if (!input || !window.pestanaWebActivaId) return;
    
    let url = input.value.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
    }
    
    const wv = document.getElementById(`webview-${window.pestanaWebActivaId}`);
    if (wv) wv.src = url;
};

window.navegacionPestana = function(accion) {
    if (!window.pestanaWebActivaId) return;
    const wv = document.getElementById(`webview-${window.pestanaWebActivaId}`);
    if (!wv) return;
    if (accion === 'back' && wv.canGoBack()) wv.goBack();
    if (accion === 'forward' && wv.canGoForward()) wv.goForward();
    if (accion === 'reload') wv.reload();
};

window.alternarPanelLateral = function() {
    const sidebar = document.getElementById('browser-sidebar');
    if (!sidebar) return;
    sidebar.style.display = (sidebar.style.display === 'none') ? 'flex' : 'none';
};

// ==========================================
// 🔥 MOTOR DE FUERZA BRUTA: PURGA ABSOLUTA DEL WEBVIEW
// ==========================================
window.reiniciarMotorBrowser = function() {
    console.log("[Core] Purgando hilos de Chromium corruptos...");
    const contenedor = document.getElementById('browser-webviews-container');
    if (contenedor) {
        contenedor.innerHTML = ''; 
        window.pestanasWeb = [];
        window.pestanaWebActivaId = null;
        
        const barra = document.getElementById('browser-tabs-bar');
        if (barra) {
            // Borramos los botones viejos dejando solo el botón de "+ Nueva"
            const items = barra.querySelectorAll('.browser-tab-item');
            items.forEach(i => i.remove());
        }

        setTimeout(() => {
            window.crearNuevaPestanaWeb('https://www.google.com');
            console.log("[Core] Entorno web reseteado con éxito.");
        }, 150);
    }
};