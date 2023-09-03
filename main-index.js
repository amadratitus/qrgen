// Your company logo image URL
var logoUrl = "gdsclogo.png"; // Replace with your logo's URL
// Get the form element
const form = document.getElementById("myForm");

// Add a submit event listener to the form
form.addEventListener("submit", function (e) {
    e.preventDefault(); // Prevent the form from submitting

    // Get input values
    const urlInput = document.getElementById("urlInput").value;
    const textInput = document.getElementById("universityName").value;

    // Validate URL format
    const urlPattern = /^(http|https):\/\/[^ "]+$/;
    const isValidUrl = urlPattern.test(urlInput);

    // Validate text input (not empty)
    const isValidText = textInput.trim() !== "";
    // Display modal if all inputs are correct, else display error messages
    const validationResult = document.getElementById("validationResult");
    validationResult.innerHTML = "";

    if (isValidUrl && isValidText) {
        // Show the Bootstrap modal
        $('#myModal').modal('show');
        // Set the modal content
        document.querySelector(".modal-title").textContent = "Success Your Qr Code Is Generated.";
        validationResult.innerHTML = "";
        //CreateAndDisplayQr();
         // Text or data you want to encode
         //var text = "Hello, World!";

         // Your company logo image URL
         var logoUrl = "gdsclogo.png"; // Replace with your logo's URL
 
         // Create a new QRCode instance
         var qrcode = new QRCode("qrcode", {
             urlInput: urlInput,
             width: 200, // Width of the QR code
             height: 200, // Height of the QR code
         });
 
         // Load the logo image
         var logoImg = new Image();
         logoImg.src = logoUrl;
         logoImg.onload = function () {
             // Calculate the position to center the logo in the QR code
             var qrWidth = qrcode._htOption.width;
             var qrHeight = qrcode._htOption.height;
             var logoWidth = logoImg.width;
             var logoHeight = logoImg.height;
 
             // Calculate the scaling factor to make the logo smaller
             var scaleFactor = 0.5; // Adjust this value to change the logo size
 
             // Calculate the new dimensions for the logo
             var newLogoWidth = logoWidth * scaleFactor;
             var newLogoHeight = logoHeight * scaleFactor;
 
             // Calculate the position to center the scaled logo
             var xPos = (qrWidth - newLogoWidth) / 2;
             var yPos = (qrHeight - newLogoHeight) / 2;
 
             // Create a canvas element to overlay the logo on the QR code
             var canvas = document.createElement("canvas");
             canvas.width = qrWidth;
             canvas.height = qrHeight;
             var ctx = canvas.getContext("2d");
 
             // Draw the QR code on the canvas
             qrcode.makeCode(urlInput);
             ctx.drawImage(qrcode._el.firstChild, 0, 0);
 
             // Draw the scaled logo at the calculated position
             ctx.drawImage(logoImg, xPos, yPos, newLogoWidth, newLogoHeight);
 
             // Replace the QR code container element with the canvas
             var qrcodeContainer = document.getElementById("qrcode");
             qrcodeContainer.innerHTML = "";
             qrcodeContainer.appendChild(canvas);
 
             // Update the QR code in the modal
             var qrcodeModalContainer = document.getElementById("qrcode-modal");
             qrcodeModalContainer.innerHTML = "";
             qrcodeModalContainer.appendChild(canvas);
 
             // Add functionality to download the QR code
             var downloadQRButton = document.getElementById("downloadQr");
             downloadQRButton.addEventListener("click", function () {
                 var downloadLink = document.createElement("a");
                 downloadLink.href = canvas.toDataURL("image/png");
                 downloadLink.download = textInput+"_"+"custom_qr_code.png";
                 downloadLink.click();
             });
         };


        // Clear the form inputs
        form.reset();
    } else {
        if (!isValidUrl) {
            validationResult.innerHTML += "Please enter a valid URL.<br>";
        }

        if (!isValidText) {
            validationResult.innerHTML += "Enter your university name.<br>";
        }
    }
});

//function to display time
function displayTimeByUserTimezone() {
    // Get the user's local timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Get the current time in the user's timezone
    const currentTime = new Date().toLocaleString("en-US", {
        timeZone: userTimezone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
    });
    
    // Display the time in the specified element
    document.getElementById("time").textContent = currentTime;
}

// Update the time every second
setInterval(displayTimeByUserTimezone, 1000);

// Initial display
displayTimeByUserTimezone();


// Typing text
  // script.js
  document.addEventListener("DOMContentLoaded", function () {
    const text = "Hi, Welcome!"; // Your desired text

    const typingSpeed = 100; // Adjust typing speed (milliseconds)
    const loopDelay = 5000; // Loop delay in milliseconds (5 seconds)
    const typingTextElement = document.querySelector(".typing-text");

    function type() {
        let charIndex = 0;
        const textLength = text.length;

        function typeNextCharacter() {
            if (charIndex < textLength) {
                typingTextElement.textContent += text.charAt(charIndex);
                charIndex++;
                setTimeout(typeNextCharacter, typingSpeed);
            } else {
                // Text typing is complete, wait for the loopDelay and reset
                setTimeout(resetText, loopDelay);
            }
        }

        typeNextCharacter();
    }

    function resetText() {
        typingTextElement.textContent = "";
        setTimeout(type, typingSpeed); // Start typing again
    }

    type(); // Initial start
});