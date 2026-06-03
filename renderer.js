// renderer.js - CONFIGURADO PARA TU ARBOL DE CARPETAS ACTUAL
window.nodeRequire = require;
const fs = require('fs');
const path = require('path');

function cargarMódulo(id) {
    try {
        const contenedor = document.getElementById(`vista-${id}`);
        if (!contenedor) return;

        // Buscamos el HTML directamente suelto en la carpeta tabs/ (ej: tabs/audio.html)
        const rutaHtml = path.join(__dirname, 'tabs', `${id}.html`);

        if (fs.existsSync(rutaHtml)) {
            contenedor.innerHTML = fs.readFileSync(rutaHtml, 'utf-8');
            console.log(`[CyberCore] ¡${id}.html cargado con éxito!`);
        } else {
            console.error(`[CyberCore] No se encontró el archivo: ${rutaHtml}`);
        }
    } catch (err) {
        console.error(`Error cargando la pestaña [${id}]:`, err);
    }
}

// Inicializamos todas tus pestañas
const modulos = ['audio', 'video', 'editor', 'browser', 'obsidian', 'type-training', 'bmo', 'ai-tasks'];
modulos.forEach(cargarMódulo);

// Evita conflictos con Monaco Editor
window.require = undefined;

// Sistema de navegación interactivo para tus botones
window.cambiarVista = function(idVista, botonActivo) {
    document.querySelectorAll('.view-section').forEach(seccion => seccion.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const vistaObjetivo = document.getElementById(`vista-${idVista}`);
    if (vistaObjetivo) {
        vistaObjetivo.classList.add('active');
        console.log(`[Navegación] Cambiando a vista: ${idVista}`);
    }
    if (botonActivo) {
        botonActivo.classList.add('active');
    }
};