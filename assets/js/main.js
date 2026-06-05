/**
 * qr-generator.js
 *
 * Uses qrcode-generator by kazuhikoarase — window.qrcode(typeNumber, ecLevel)
 * Fully synchronous canvas rendering; no CDN 404, no undefined globals.
 *
 * Flow:
 *   form submit → validate → buildQR() → renderToCanvas() → overlayLogo()? → showModal()
 */

'use strict';

// ── roundRect polyfill (Chrome <99, Firefox <112, Safari <15.4) ───────────────
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y,     x + w, y + h, r);
        this.arcTo(x + w, y + h, x,     y + h, r);
        this.arcTo(x,     y + h, x,     y,     r);
        this.arcTo(x,     y,     x + w, y,     r);
        this.closePath();
        return this;
    };
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const form           = document.getElementById('qr-form');
const contentInput   = document.getElementById('qr-content');
const labelInput     = document.getElementById('qr-filename-label');
const fgColorInput   = document.getElementById('qr-fg-color');
const bgColorInput   = document.getElementById('qr-bg-color');
const sizeRange      = document.getElementById('qr-size-range');
const sizeDisplay    = document.getElementById('qr-size-display');
const ecLevelSelect  = document.getElementById('qr-ec-level');
const logoFileInput  = document.getElementById('logo-file-input');
const logoPreview    = document.getElementById('logo-preview');
const uploadHint     = document.getElementById('upload-hint-text');
const removeLogoBtn  = document.getElementById('remove-logo-btn');
const logoUploadZone = document.getElementById('logo-upload-zone');
const logoEcTip      = document.getElementById('logo-ec-tip');
const errorBox       = document.getElementById('error-box');
const generateBtn    = document.getElementById('generate-btn');
const modalCanvasWrap = document.getElementById('modal-canvas-wrap');
const modalQrLabel   = document.getElementById('modal-qr-label');
const downloadBtn    = document.getElementById('download-btn');

// ── State ─────────────────────────────────────────────────────────────────────
let logoDataUrl   = null;   // base64 data URL of the uploaded logo, or null
let activeCanvas  = null;   // the canvas currently shown in the modal

// ── Logo upload ───────────────────────────────────────────────────────────────
function loadLogoFromFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        logoDataUrl              = e.target.result;
        logoPreview.src          = logoDataUrl;
        logoPreview.style.display = 'block';
        uploadHint.textContent   = file.name;
        removeLogoBtn.style.display = 'inline';
        ecLevelSelect.value      = 'H';   // bump EC to High for logo safety
        logoEcTip.classList.add('visible');
    };
    reader.readAsDataURL(file);
}

function clearLogo() {
    logoDataUrl              = null;
    logoFileInput.value      = '';
    logoPreview.src          = '';
    logoPreview.style.display = 'none';
    uploadHint.textContent   = 'Click or drag an image here';
    removeLogoBtn.style.display = 'none';
    logoEcTip.classList.remove('visible');
}

logoFileInput.addEventListener('change', function () {
    loadLogoFromFile(this.files[0]);
});

removeLogoBtn.addEventListener('click', clearLogo);

// Drag-and-drop on the upload zone
logoUploadZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    this.classList.add('drag-over');
});
logoUploadZone.addEventListener('dragleave', function () {
    this.classList.remove('drag-over');
});
logoUploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    loadLogoFromFile(e.dataTransfer.files[0]);
});

// ── Size slider ───────────────────────────────────────────────────────────────
sizeRange.addEventListener('input', function () {
    sizeDisplay.textContent = this.value;
});

// ── Form submission ───────────────────────────────────────────────────────────
form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.innerHTML = '';

    const content = contentInput.value.trim();
    const label   = labelInput.value.trim();

    const errors = [];
    if (!content) errors.push('Please enter a URL or text to encode.');
    if (!label)   errors.push('Please enter a label for the download filename.');

    if (errors.length) {
        errorBox.innerHTML = errors
            .map(msg => `<div class="alert alert-warning mb-1">${msg}</div>`)
            .join('');
        return;
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating…';

    buildQR({
        content:  content,
        label:    label,
        fgColor:  fgColorInput.value,
        bgColor:  bgColorInput.value,
        size:     parseInt(sizeRange.value, 10),
        ecLevel:  ecLevelSelect.value,
    });
});

// ── QR build ──────────────────────────────────────────────────────────────────
/**
 * Uses qrcode-generator (kazuhikoarase) — window.qrcode(typeNumber, ecLevel).
 * typeNumber 0 = auto-select smallest type that fits the data.
 * Rendering to canvas is fully synchronous; only the logo overlay is async.
 */
function buildQR({ content, label, fgColor, bgColor, size, ecLevel }) {
    function resetButton() {
        generateBtn.disabled  = false;
        generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate QR Code';
    }

    // --- Synchronous QR matrix generation ---
    var canvas;
    try {
        var qr = qrcode(0, ecLevel);   // 0 = auto type number
        qr.addData(content);
        qr.make();
        canvas = renderToCanvas(qr, fgColor, bgColor, size);
    } catch (err) {
        showFormError('QR generation failed: ' + (err.message || String(err)));
        resetButton();
        return;
    }

    // --- Optional async logo overlay ---
    if (logoDataUrl) {
        overlayLogo(canvas, logoDataUrl, bgColor)
            .then(function ()  { showModal(canvas, label); })
            .catch(function () { showModal(canvas, label); })  // show without logo on error
            .then(resetButton);
    } else {
        showModal(canvas, label);
        resetButton();
    }
}

/**
 * Draws the QR matrix onto a new <canvas> and returns it.
 * Adds a quiet-zone margin of 2 modules on all sides.
 */
function renderToCanvas(qr, fgColor, bgColor, targetSize) {
    var margin      = 2;
    var moduleCount = qr.getModuleCount();
    var totalCells  = moduleCount + margin * 2;
    var cellSize    = Math.max(2, Math.floor(targetSize / totalCells));
    var canvasSize  = cellSize * totalCells;

    var canvas  = document.createElement('canvas');
    canvas.width  = canvasSize;
    canvas.height = canvasSize;

    var ctx = canvas.getContext('2d');

    // Fill background (quiet zone + light modules)
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Draw dark modules
    ctx.fillStyle = fgColor;
    for (var row = 0; row < moduleCount; row++) {
        for (var col = 0; col < moduleCount; col++) {
            if (qr.isDark(row, col)) {
                ctx.fillRect(
                    (col + margin) * cellSize,
                    (row + margin) * cellSize,
                    cellSize,
                    cellSize
                );
            }
        }
    }

    return canvas;
}

// ── Logo overlay ──────────────────────────────────────────────────────────────
/**
 * Draws a logo centred on a QR canvas.
 * Returns a Promise that resolves when drawing is complete.
 *
 * The logo is kept to ≤22% of the QR width so enough modules remain
 * scannable. Error correction H (30%) can survive up to ~30% damage,
 * so this is safe when EC is set to H.
 */
function overlayLogo(canvas, dataUrl, bgColor) {
    return new Promise(function (resolve, reject) {
        const img = new Image();

        img.onload = function () {
            const ctx     = canvas.getContext('2d');
            const qrSize  = canvas.width;

            // Logo area: 22% of QR size
            const logoSz  = Math.round(qrSize * 0.22);
            const pad     = 6;
            const x       = Math.round((qrSize - logoSz) / 2);
            const y       = Math.round((qrSize - logoSz) / 2);

            // Draw a padded, rounded white (or bg-coloured) backing rect
            ctx.save();
            ctx.fillStyle = bgColor || '#ffffff';
            ctx.beginPath();
            ctx.roundRect(x - pad, y - pad, logoSz + pad * 2, logoSz + pad * 2, 10);
            ctx.fill();
            ctx.restore();

            // Draw the logo itself
            ctx.drawImage(img, x, y, logoSz, logoSz);

            resolve();
        };

        img.onerror = function () {
            // Logo failed to load — resolve without logo rather than blocking
            console.warn('QR Generator: logo image could not be loaded; skipping overlay.');
            resolve();
        };

        img.src = dataUrl;
    });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(canvas, label) {
    activeCanvas = canvas;

    // Clear previous QR and insert new one
    modalCanvasWrap.innerHTML = '';
    modalCanvasWrap.appendChild(canvas);

    modalQrLabel.textContent = label ? 'Label: ' + label : '';

    // Rebind download button (clone-swap removes any stale listeners)
    const freshBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(freshBtn, downloadBtn);
    freshBtn.addEventListener('click', function () {
        downloadCanvas(activeCanvas, label);
    });

    $('#result-modal').modal('show');
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadCanvas(canvas, label) {
    const filename = sanitizeFilename(label) + '_qrcode.png';
    const link     = document.createElement('a');
    link.download  = filename;
    link.href      = canvas.toDataURL('image/png');
    link.click();
}

function sanitizeFilename(str) {
    return (str || 'qrcode')
        .trim()
        .replace(/[^a-z0-9_\-\s]/gi, '')
        .replace(/\s+/g, '_')
        .toLowerCase()
        || 'qrcode';
}

// ── Inline error helper ───────────────────────────────────────────────────────
function showFormError(msg) {
    errorBox.innerHTML = `<div class="alert alert-danger mb-1">${msg}</div>`;
}

// ── Live clock ────────────────────────────────────────────────────────────────
(function initClock() {
    const clockEl = document.getElementById('clock');
    function tick() {
        clockEl.textContent = new Date().toLocaleString(undefined, {
            weekday: 'short', year: 'numeric', month: 'short',
            day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
        });
    }
    tick();
    setInterval(tick, 1000);
}());

// ── Typing animation ──────────────────────────────────────────────────────────
(function initTyping() {
    const el      = document.getElementById('typing-text');
    const phrases = [
        'Generate QR codes instantly.',
        'Add your own logo.',
        'Custom colors & sizes.',
        'Free and open source.',
        'Works for URLs, text, Wi-Fi, and more.',
    ];
    let phraseIdx = 0;
    let charIdx   = 0;
    let deleting  = false;

    function tick() {
        const phrase = phrases[phraseIdx];

        if (deleting) {
            el.textContent = phrase.slice(0, --charIdx);
        } else {
            el.textContent = phrase.slice(0, ++charIdx);
        }

        let delay = deleting ? 35 : 65;

        if (!deleting && charIdx === phrase.length) {
            delay    = 2200;
            deleting = true;
        } else if (deleting && charIdx === 0) {
            deleting  = false;
            phraseIdx = (phraseIdx + 1) % phrases.length;
            delay     = 350;
        }

        setTimeout(tick, delay);
    }

    tick();
}());
