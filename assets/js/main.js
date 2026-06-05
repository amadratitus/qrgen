/**
 * assets/js/main.js
 *
 * Uses qrcode-generator by kazuhikoarase — window.qrcode(typeNumber, ecLevel)
 * Fully synchronous canvas rendering; no CDN 404, no undefined globals.
 *
 * Flow:
 *   form submit → validateAll() → buildQR() → renderToCanvas() → overlayLogo()? → showModal()
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

// ── Validation constants ──────────────────────────────────────────────────────
var CONTENT_MAX_CHARS = 2953;   // QR Type 40-H binary capacity (bytes ≈ chars for ASCII)
var LABEL_MAX_CHARS   = 60;
var LABEL_NEAR_LIMIT  = 50;
var LOGO_MAX_BYTES    = 5 * 1024 * 1024;   // 5 MB

// ── DOM refs ──────────────────────────────────────────────────────────────────
var form            = document.getElementById('qr-form');
var contentInput    = document.getElementById('qr-content');
var labelInput      = document.getElementById('qr-filename-label');
var fgColorInput    = document.getElementById('qr-fg-color');
var bgColorInput    = document.getElementById('qr-bg-color');
var sizeRange       = document.getElementById('qr-size-range');
var sizeDisplay     = document.getElementById('qr-size-display');
var ecLevelSelect   = document.getElementById('qr-ec-level');
var logoFileInput   = document.getElementById('logo-file-input');
var logoPreview     = document.getElementById('logo-preview');
var uploadHint      = document.getElementById('upload-hint-text');
var removeLogoBtn   = document.getElementById('remove-logo-btn');
var logoUploadZone  = document.getElementById('logo-upload-zone');
var logoEcTip       = document.getElementById('logo-ec-tip');
var generateBtn     = document.getElementById('generate-btn');
var modalCanvasWrap = document.getElementById('modal-canvas-wrap');
var modalQrLabel    = document.getElementById('modal-qr-label');
var downloadBtn     = document.getElementById('download-btn');
var resultModal     = document.getElementById('result-modal');
// Validation output elements
var contentError    = document.getElementById('content-error');
var contentCounter  = document.getElementById('content-counter');
var labelError      = document.getElementById('label-error');
var labelCounter    = document.getElementById('label-counter');
var logoError       = document.getElementById('logo-error');
var colorsError     = document.getElementById('colors-error');

// ── State ─────────────────────────────────────────────────────────────────────
var logoDataUrl  = null;
var activeCanvas = null;

// ── Validation helpers ────────────────────────────────────────────────────────
function setInvalid(inputEl, errorEl, message) {
    if (inputEl) {
        inputEl.classList.remove('is-valid', 'is-warning');
        inputEl.classList.add('is-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
    }
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.className = 'field-error-msg';
    }
}

function setWarning(inputEl, errorEl, message) {
    if (inputEl) {
        inputEl.classList.remove('is-valid', 'is-invalid');
        inputEl.classList.add('is-warning');
        inputEl.removeAttribute('aria-invalid');
    }
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.className = 'field-warn-msg';
    }
}

function setValid(inputEl, errorEl) {
    if (inputEl) {
        inputEl.classList.remove('is-invalid', 'is-warning');
        inputEl.classList.add('is-valid');
        inputEl.removeAttribute('aria-invalid');
    }
    if (errorEl) {
        errorEl.textContent = '';
    }
}

function clearField(inputEl, errorEl) {
    if (inputEl) {
        inputEl.classList.remove('is-invalid', 'is-warning', 'is-valid');
        inputEl.removeAttribute('aria-invalid');
    }
    if (errorEl) errorEl.textContent = '';
}

function updateCounter(el, current, max) {
    if (!el) return;
    el.textContent = current.toLocaleString() + ' / ' + max.toLocaleString();
    el.className = 'field-counter';
    if (current > max)            el.classList.add('over');
    else if (current > max * 0.9) el.classList.add('warn');
}

// ── Field validators ──────────────────────────────────────────────────────────

/**
 * Validate the content (URL / text) field.
 * @param {boolean} touched  true = show "required" error; false = only re-validate if already invalid
 */
function validateContent(touched) {
    var val = contentInput.value.trim();
    var len = val.length;

    updateCounter(contentCounter, len, CONTENT_MAX_CHARS);

    if (!val) {
        if (touched) {
            setInvalid(contentInput, contentError, 'Please enter a URL or text to encode.');
        } else {
            clearField(contentInput, contentError);
        }
        return false;
    }

    if (len > CONTENT_MAX_CHARS) {
        setInvalid(contentInput, contentError,
            'Too long — max ' + CONTENT_MAX_CHARS.toLocaleString() +
            ' characters (' + len.toLocaleString() + ' entered).');
        return false;
    }

    // If it contains a scheme (://), validate it as a URL
    if (val.indexOf('://') !== -1) {
        try {
            new URL(val);
        } catch (e) {
            setWarning(contentInput, contentError,
                'This looks like a URL but appears malformed. Double-check the address.');
            return true;  // warn but don't block generation
        }
    } else if (/^www\./i.test(val)) {
        // Missing scheme
        setWarning(contentInput, contentError,
            'Looks like a URL — did you mean https://' + val + '?');
        return true;
    }

    setValid(contentInput, contentError);
    return true;
}

/**
 * Validate the label (filename) field.
 */
function validateLabel(touched) {
    var val = labelInput.value.trim();
    var len = val.length;

    updateCounter(labelCounter, len, LABEL_MAX_CHARS);

    if (!val) {
        if (touched) {
            setInvalid(labelInput, labelError, 'Please enter a label for the download filename.');
        } else {
            clearField(labelInput, labelError);
        }
        return false;
    }

    if (len > LABEL_MAX_CHARS) {
        setInvalid(labelInput, labelError,
            'Label too long — max ' + LABEL_MAX_CHARS + ' characters (' + len + ' entered).');
        return false;
    }

    setValid(labelInput, labelError);
    return true;
}

/**
 * Validate that foreground and background colors differ.
 */
function validateColors() {
    if (fgColorInput.value.toLowerCase() === bgColorInput.value.toLowerCase()) {
        setInvalid(null, colorsError,
            'Foreground and background colours are identical — the QR code will be invisible. ' +
            'Use contrasting colours (e.g. dark on light).');
        return false;
    }
    clearField(null, colorsError);
    return true;
}

/**
 * Validate an uploaded logo file.
 * Returns true if no file is provided (logo is optional).
 */
function validateLogoFile(file) {
    if (!file) return true;

    if (!file.type.startsWith('image/')) {
        setInvalid(logoUploadZone, logoError,
            'Only image files are accepted (PNG, JPG, GIF, SVG, WebP…).');
        return false;
    }
    if (file.size > LOGO_MAX_BYTES) {
        setInvalid(logoUploadZone, logoError,
            'File too large (' + (file.size / 1048576).toFixed(1) + ' MB). Maximum size is 5 MB.');
        return false;
    }

    clearField(logoUploadZone, logoError);
    return true;
}

/**
 * Run all validators and return true only if every required field passes.
 * Always marks fields as "touched" so errors are visible.
 */
function validateAll() {
    var ok = true;
    if (!validateContent(true))  ok = false;
    if (!validateLabel(true))    ok = false;
    if (!validateColors())       ok = false;
    // Logo file: validate the current file input (if any file selected but not yet loaded)
    if (logoFileInput.files[0] && !validateLogoFile(logoFileInput.files[0])) ok = false;
    return ok;
}

// ── Logo upload ───────────────────────────────────────────────────────────────
function loadLogoFromFile(file) {
    if (!file) return;

    if (!validateLogoFile(file)) return;   // reject invalid files early

    var reader = new FileReader();
    reader.onload = function (e) {
        logoDataUrl               = e.target.result;
        logoPreview.src           = logoDataUrl;
        logoPreview.style.display = 'block';
        uploadHint.textContent    = file.name;
        removeLogoBtn.style.display = 'inline';
        ecLevelSelect.value       = 'H';
        logoEcTip.classList.add('visible');
        clearField(logoUploadZone, logoError);
        logoUploadZone.classList.remove('is-invalid');
    };
    reader.readAsDataURL(file);
}

function clearLogo() {
    logoDataUrl               = null;
    logoFileInput.value       = '';
    logoPreview.src           = '';
    logoPreview.style.display = 'none';
    uploadHint.textContent    = 'Click or drag an image here';
    removeLogoBtn.style.display = 'none';
    logoEcTip.classList.remove('visible');
    clearField(logoUploadZone, logoError);
    logoUploadZone.classList.remove('is-invalid');
}

logoFileInput.addEventListener('change', function () {
    loadLogoFromFile(this.files[0]);
});
removeLogoBtn.addEventListener('click', clearLogo);

// Drag-and-drop
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

// ── Real-time validation ──────────────────────────────────────────────────────

// Validate on blur (first time user leaves the field)
contentInput.addEventListener('blur', function () { validateContent(true); });
labelInput.addEventListener('blur',   function () { validateLabel(true); });

// Re-validate while typing — only if the field already shows an error (clears it as soon as fixed)
contentInput.addEventListener('input', function () {
    updateCounter(contentCounter, this.value.trim().length, CONTENT_MAX_CHARS);
    if (this.classList.contains('is-invalid') || this.classList.contains('is-warning')) {
        validateContent(true);
    }
});
labelInput.addEventListener('input', function () {
    updateCounter(labelCounter, this.value.trim().length, LABEL_MAX_CHARS);
    if (this.classList.contains('is-invalid')) {
        validateLabel(true);
    }
});

// Color pickers: validate immediately on every change
fgColorInput.addEventListener('input', validateColors);
bgColorInput.addEventListener('input', validateColors);

// ── Size slider ───────────────────────────────────────────────────────────────
sizeRange.addEventListener('input', function () {
    sizeDisplay.textContent = this.value;
});

// ── Form submission ───────────────────────────────────────────────────────────
form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (!validateAll()) {
        // Scroll to and focus the first invalid field
        var firstInvalid = form.querySelector('.is-invalid');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstInvalid.focus();
        }
        return;
    }

    generateBtn.disabled  = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating…';

    buildQR({
        content: contentInput.value.trim(),
        label:   labelInput.value.trim(),
        fgColor: fgColorInput.value,
        bgColor: bgColorInput.value,
        size:    parseInt(sizeRange.value, 10),
        ecLevel: ecLevelSelect.value,
    });
});

// ── QR build ──────────────────────────────────────────────────────────────────
function buildQR(opts) {
    function resetButton() {
        generateBtn.disabled  = false;
        generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate QR Code';
    }

    var canvas;
    try {
        var qr = qrcode(0, opts.ecLevel);
        qr.addData(opts.content);
        qr.make();
        canvas = renderToCanvas(qr, opts.fgColor, opts.bgColor, opts.size);
    } catch (err) {
        setInvalid(contentInput, contentError,
            'QR generation failed: ' + (err.message || String(err)) +
            ' — try shorter content or a higher error-correction level.');
        resetButton();
        return;
    }

    if (logoDataUrl) {
        overlayLogo(canvas, logoDataUrl, opts.bgColor)
            .then(function ()  { showModal(canvas, opts.label); })
            .catch(function () { showModal(canvas, opts.label); })
            .then(resetButton);
    } else {
        showModal(canvas, opts.label);
        resetButton();
    }
}

// ── Canvas renderer ───────────────────────────────────────────────────────────
function renderToCanvas(qr, fgColor, bgColor, targetSize) {
    var margin      = 2;
    var moduleCount = qr.getModuleCount();
    var totalCells  = moduleCount + margin * 2;
    var cellSize    = Math.max(2, Math.floor(targetSize / totalCells));
    var canvasSize  = cellSize * totalCells;

    var canvas    = document.createElement('canvas');
    canvas.width  = canvasSize;
    canvas.height = canvasSize;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.fillStyle = fgColor;
    for (var row = 0; row < moduleCount; row++) {
        for (var col = 0; col < moduleCount; col++) {
            if (qr.isDark(row, col)) {
                ctx.fillRect(
                    (col + margin) * cellSize,
                    (row + margin) * cellSize,
                    cellSize, cellSize
                );
            }
        }
    }

    return canvas;
}

// ── Logo overlay ──────────────────────────────────────────────────────────────
function overlayLogo(canvas, dataUrl, bgColor) {
    return new Promise(function (resolve) {
        var img   = new Image();
        img.onload = function () {
            var ctx    = canvas.getContext('2d');
            var qrSize = canvas.width;
            var logoSz = Math.round(qrSize * 0.22);
            var pad    = 6;
            var x      = Math.round((qrSize - logoSz) / 2);
            var y      = Math.round((qrSize - logoSz) / 2);

            ctx.save();
            ctx.fillStyle = bgColor || '#ffffff';
            ctx.beginPath();
            ctx.roundRect(x - pad, y - pad, logoSz + pad * 2, logoSz + pad * 2, 10);
            ctx.fill();
            ctx.restore();

            ctx.drawImage(img, x, y, logoSz, logoSz);
            resolve();
        };
        img.onerror = function () {
            console.warn('QR Generator: logo could not be loaded — skipping overlay.');
            resolve();
        };
        img.src = dataUrl;
    });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(canvas, label) {
    activeCanvas = canvas;

    modalCanvasWrap.innerHTML = '';
    modalCanvasWrap.appendChild(canvas);
    modalQrLabel.textContent = label ? 'Label: ' + label : '';

    // Clone-swap removes any stale download listener
    var freshBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(freshBtn, downloadBtn);
    freshBtn.addEventListener('click', function () {
        downloadCanvas(activeCanvas, label);
    });

    $('#result-modal').modal('show');
}

// ── Accessibility: move focus before Bootstrap sets aria-hidden ───────────────
// Bootstrap 4 sets aria-hidden="true" on the modal when it starts to hide.
// If a button inside the modal still has focus at that moment, browsers log
// "Blocked aria-hidden on an element because its descendant retained focus."
// Returning focus to generateBtn before the hide animation starts prevents this.
$(resultModal).on('hide.bs.modal', function () {
    if (resultModal.contains(document.activeElement)) {
        generateBtn.focus();
    }
});

// ── Download ──────────────────────────────────────────────────────────────────
function downloadCanvas(canvas, label) {
    var link      = document.createElement('a');
    link.download = sanitizeFilename(label) + '_qrcode.png';
    link.href     = canvas.toDataURL('image/png');
    link.click();
}

function sanitizeFilename(str) {
    return (str || 'qrcode')
        .trim()
        .replace(/[^a-z0-9_\-\s]/gi, '')
        .replace(/\s+/g, '_')
        .toLowerCase() || 'qrcode';
}

// ── Live clock ────────────────────────────────────────────────────────────────
(function initClock() {
    var clockEl = document.getElementById('clock');
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
    var el      = document.getElementById('typing-text');
    var phrases = [
        'Generate QR codes instantly.',
        'Add your own logo.',
        'Custom colours & sizes.',
        'Free and open source.',
        'Works for URLs, text, Wi-Fi, and more.',
    ];
    var phraseIdx = 0;
    var charIdx   = 0;
    var deleting  = false;

    function tick() {
        var phrase = phrases[phraseIdx];

        if (deleting) {
            el.textContent = phrase.slice(0, --charIdx);
        } else {
            el.textContent = phrase.slice(0, ++charIdx);
        }

        var delay = deleting ? 35 : 65;

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
