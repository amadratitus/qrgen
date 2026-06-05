// ── Logo upload handling ──────────────────────────────────────────────────────
let userLogoDataUrl = null;

const logoFile       = document.getElementById("logoFile");
const logoPreview    = document.getElementById("logoPreview");
const uploadText     = document.getElementById("uploadText");
const clearLogoBtn   = document.getElementById("clearLogo");
const logoUploadArea = document.getElementById("logoUploadArea");

logoFile.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        userLogoDataUrl = e.target.result;
        logoPreview.src = userLogoDataUrl;
        logoPreview.style.display = "block";
        uploadText.textContent = file.name;
        clearLogoBtn.style.display = "inline";
    };
    reader.readAsDataURL(file);
});

clearLogoBtn.addEventListener("click", function () {
    userLogoDataUrl = null;
    logoPreview.style.display = "none";
    logoPreview.src = "";
    uploadText.textContent = "Click or drag to upload a logo";
    clearLogoBtn.style.display = "none";
    logoFile.value = "";
});

// Drag-and-drop support
logoUploadArea.addEventListener("dragover", function (e) {
    e.preventDefault();
    this.style.borderColor = "var(--primary)";
    this.style.background  = "#f5f3ff";
});
logoUploadArea.addEventListener("dragleave", function () {
    this.style.borderColor = "";
    this.style.background  = "";
});
logoUploadArea.addEventListener("drop", function (e) {
    e.preventDefault();
    this.style.borderColor = "";
    this.style.background  = "";
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
        const dt = new DataTransfer();
        dt.items.add(file);
        logoFile.files = dt.files;
        logoFile.dispatchEvent(new Event("change"));
    }
});

// ── Size slider label ─────────────────────────────────────────────────────────
const qrSizeInput = document.getElementById("qrSize");
document.getElementById("sizeValue").textContent = qrSizeInput.value;
qrSizeInput.addEventListener("input", function () {
    document.getElementById("sizeValue").textContent = this.value;
});

// ── Form submit ───────────────────────────────────────────────────────────────
const form             = document.getElementById("myForm");
const validationResult = document.getElementById("validationResult");

form.addEventListener("submit", function (e) {
    e.preventDefault();

    const rawInput  = document.getElementById("urlInput").value.trim();
    const labelText = document.getElementById("labelInput").value.trim();
    const fgColor   = document.getElementById("fgColor").value;
    const bgColor   = document.getElementById("bgColor").value;
    const qrSize    = parseInt(qrSizeInput.value, 10);
    const ecLevel   = document.getElementById("ecLevel").value;

    validationResult.innerHTML = "";

    // Validation
    const errors = [];
    if (!rawInput) errors.push("Please enter a URL or text to encode.");
    if (!labelText) errors.push("Please enter a label for the filename.");

    if (errors.length) {
        validationResult.innerHTML = errors
            .map(msg => `<div class="alert alert-warning">${msg}</div>`)
            .join("");
        return;
    }

    generateQR({ text: rawInput, label: labelText, fgColor, bgColor, qrSize, ecLevel });
});

// ── QR generation ─────────────────────────────────────────────────────────────
function generateQR({ text, label, fgColor, bgColor, qrSize, ecLevel }) {
    const scratchDiv = document.getElementById("qrcode");
    scratchDiv.innerHTML = "";

    const ecMap = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };

    new QRCode(scratchDiv, {
        text:           text,
        width:          qrSize,
        height:         qrSize,
        colorDark:      fgColor,
        colorLight:     bgColor,
        correctLevel:   ecMap[ecLevel] || QRCode.CorrectLevel.M,
    });

    // QRCode.js renders asynchronously via an img/canvas; wait one tick
    setTimeout(function () {
        const srcCanvas = scratchDiv.querySelector("canvas");
        const srcImg    = scratchDiv.querySelector("img");

        if (!srcCanvas && !srcImg) {
            showError("QR generation failed. Please try again.");
            return;
        }

        // Compose final canvas (QR + optional logo)
        const finalCanvas = document.createElement("canvas");
        finalCanvas.width  = qrSize;
        finalCanvas.height = qrSize;
        const ctx = finalCanvas.getContext("2d");

        function drawLogo(baseCanvas) {
            if (!userLogoDataUrl) {
                placeInModal(finalCanvas, label);
                return;
            }
            const logo = new Image();
            logo.onload = function () {
                // Logo occupies ~22% of QR width, centered
                const logoSize = qrSize * 0.22;
                const padding  = 4;
                const x = (qrSize - logoSize) / 2;
                const y = (qrSize - logoSize) / 2;

                // White rounded background behind logo for readability
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.roundRect(x - padding, y - padding, logoSize + padding * 2, logoSize + padding * 2, 8);
                ctx.fill();

                ctx.drawImage(logo, x, y, logoSize, logoSize);
                placeInModal(finalCanvas, label);
            };
            logo.onerror = function () {
                // If logo fails, still show QR without it
                placeInModal(finalCanvas, label);
            };
            logo.src = userLogoDataUrl;
        }

        if (srcCanvas) {
            ctx.drawImage(srcCanvas, 0, 0, qrSize, qrSize);
            drawLogo(finalCanvas);
        } else {
            // Fallback: img element
            const tmpImg = new Image();
            tmpImg.onload = function () {
                ctx.drawImage(tmpImg, 0, 0, qrSize, qrSize);
                drawLogo(finalCanvas);
            };
            tmpImg.src = srcImg.src;
        }
    }, 100);
}

function placeInModal(canvas, label) {
    const modalContainer = document.getElementById("qrcode-modal");
    modalContainer.innerHTML = "";
    modalContainer.appendChild(canvas);

    document.getElementById("modalLabel").textContent = label ? `Label: ${label}` : "";

    // Bind download (fresh each time — no listener stacking)
    const dlBtn = document.getElementById("downloadQr");
    const newDlBtn = dlBtn.cloneNode(true);
    dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);
    newDlBtn.addEventListener("click", function () {
        const link = document.createElement("a");
        link.href     = canvas.toDataURL("image/png");
        link.download = sanitizeFilename(label) + "_qrcode.png";
        link.click();
    });

    $('#myModal').modal('show');

    // Reset form after successful generation
    document.getElementById("myForm").reset();
    document.getElementById("sizeValue").textContent = "256";
}

function sanitizeFilename(str) {
    return str.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase() || "qrcode";
}

function showError(msg) {
    validationResult.innerHTML = `<div class="alert alert-danger">${msg}</div>`;
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
    const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date().toLocaleString("en-US", {
        timeZone: tz,
        weekday: "short", year: "numeric", month: "short",
        day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
    });
    document.getElementById("time").textContent = now;
}
setInterval(updateClock, 1000);
updateClock();

// ── Typing animation ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
    const phrases     = ["Generate QR codes instantly.", "Add your own logo.", "Free and open source.", "Works for URLs, text, and more."];
    const el          = document.querySelector(".typing-text");
    let phraseIndex   = 0;
    let charIndex     = 0;
    let isDeleting    = false;

    function tick() {
        const current = phrases[phraseIndex];

        if (isDeleting) {
            el.textContent = current.substring(0, --charIndex);
        } else {
            el.textContent = current.substring(0, ++charIndex);
        }

        let delay = isDeleting ? 40 : 70;

        if (!isDeleting && charIndex === current.length) {
            delay = 2000;
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            phraseIndex = (phraseIndex + 1) % phrases.length;
            delay = 400;
        }

        setTimeout(tick, delay);
    }

    tick();
});
