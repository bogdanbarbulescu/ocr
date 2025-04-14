// --- DOM Elements ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const capturedImage = document.getElementById('capturedImage'); // Added img element
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const captureRecognizeBtn = document.getElementById('captureRecognizeBtn');
const captureBtnText = document.getElementById('captureBtnText'); // Text part of the button
const ocrSpinner = document.getElementById('ocrSpinner'); // Spinner element
const exportImageBtn = document.getElementById('exportImageBtn');
const resultText = document.getElementById('resultText');
const copyBtn = document.getElementById('copyBtn');
const statusDiv = document.getElementById('status');

// --- State Variables ---
let stream = null;
let tesseractWorker = null;
let tesseractReady = false;
let isProcessing = false; // Flag to prevent concurrent operations
let imageCaptured = false; // Flag to track if an image is ready for export

// --- Update Button States ---
function updateButtonStates() {
    // Determine if camera should be considered 'active' for UI purposes
    const cameraActive = !!stream;

    startCameraBtn.disabled = cameraActive || isProcessing; // Disable if stream active or processing
    stopCameraBtn.disabled = !cameraActive || isProcessing;  // Disable if stream inactive or processing

    // Capture button needs stream AND Tesseract ready, and not processing
    captureRecognizeBtn.disabled = !cameraActive || !tesseractReady || isProcessing;

    // Export needs an image captured (on canvas) and not processing
    exportImageBtn.disabled = !imageCaptured || isProcessing;

    // Copy needs text in the result area and not processing
    copyBtn.disabled = !resultText.value || isProcessing;

    // Handle spinner/text on Capture button
    if (isProcessing && captureRecognizeBtn.disabled) { // Check if this button is the one causing processing
        captureRecognizeBtn.classList.add('processing');
        ocrSpinner.style.display = 'inline-block';
        captureBtnText.textContent = 'Processing...';
    } else {
        captureRecognizeBtn.classList.remove('processing');
        ocrSpinner.style.display = 'none';
        captureBtnText.textContent = 'Capture & Recognize';
    }
}


// --- Tesseract Initialization ---
async function initializeTesseract() {
    statusDiv.textContent = 'Loading OCR Engine...';
    isProcessing = true; // Prevent actions while loading
    updateButtonStates();
    try {
        tesseractWorker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                // console.log(m); // Optional: detailed logs
                if (m.status === 'recognizing text') {
                    statusDiv.textContent = `Recognizing... ${Math.round(m.progress * 100)}%`;
                } else if (m.status.startsWith('loading') || m.status.startsWith('downloading')) {
                     statusDiv.textContent = `Loading model: ${m.status}`;
                } else {
                    statusDiv.textContent = m.status;
                }
            },
            // cacheMethod: 'none' // Optional: force download
        });
        console.log('Tesseract worker ready.');
        tesseractReady = true;
        statusDiv.textContent = 'OCR Engine Ready. Press "Start Camera".';


    } catch (error) {
        console.error("Error initializing Tesseract:", error);
        statusDiv.textContent = 'Error loading OCR Engine. Check console.';
        statusDiv.classList.replace('alert-info', 'alert-danger');
        tesseractReady = false;

    } finally {
        isProcessing = false; // Done loading (or failed)
        updateButtonStates(); // Update buttons now that Tesseract is ready (or failed)
    }
}

// --- Camera Start ---
async function startCamera() {
    if (stream) return; // Already running

    statusDiv.textContent = 'Requesting camera access...';
    isProcessing = true; // Briefly disable buttons during startup
    updateButtonStates();

    try {
        const constraints = { video: { facingMode: 'environment' }, audio: false };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play(); // Ensure video plays

        // Using a promise wrapper for loadedmetadata for cleaner async handling
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = reject; // Handle potential errors loading metadata
             // Add a timeout safeguard in case metadata never loads
             setTimeout(() => reject(new Error("Video metadata load timed out")), 3000);
        });

        console.log("Camera stream started.");
        statusDiv.textContent = 'Camera active. Point at text and capture.';
        isProcessing = false;
        updateButtonStates();

    } catch (err) {
        console.error("Error accessing or starting camera:", err);
        statusDiv.textContent = `Error accessing camera: ${err.name}. Grant permissions & use HTTPS.`;
        statusDiv.classList.replace('alert-info', 'alert-danger');
        stream = null; // Ensure stream is null on error
        video.srcObject = null; // Clear video source
        isProcessing = false;
        updateButtonStates();
    }
}

// --- Camera Stop ---
function stopCameraStream() {
    if (!stream) return; // Already stopped

    isProcessing = true; // Disable buttons during stop
    updateButtonStates();

    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    stream = null;
    // Optionally clear the captured image display and reset flag
    capturedImage.style.display = 'none';
    capturedImage.src = '#'; // Use '#' or an empty string
    imageCaptured = false;

    console.log("Camera stream stopped.");
    statusDiv.textContent = 'Camera stopped. Press "Start Camera" to begin.';
    isProcessing = false;
    updateButtonStates();
}

// --- Capture & OCR ---
async function captureAndRecognize() {
    // Ensure camera is active, Tesseract is ready, and not already processing
    if (!stream || !tesseractReady || isProcessing) {
         console.warn("Cannot capture/recognize: Stream inactive, Tesseract not ready, or already processing.");
         return;
    }

    isProcessing = true;
    imageCaptured = false; // Reset capture state until successful draw
    updateButtonStates();
    resultText.value = ''; // Clear previous results

    statusDiv.textContent = 'Capturing frame...';
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Check for valid dimensions before drawing
    if (canvas.width === 0 || canvas.height === 0) {
         console.error("Video dimensions are zero. Cannot capture. Try restarting camera.");
         statusDiv.textContent = 'Error: Video dimensions are zero. Try restarting camera.';
         statusDiv.classList.replace('alert-info', 'alert-danger');
         isProcessing = false;
         updateButtonStates();
         return;
    }

    try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        imageCaptured = true; // Image is now valid on the canvas
        statusDiv.textContent = 'Image captured, starting recognition...';

        // --- Display captured image ---
        // Use try-catch for toDataURL as it can fail in some edge cases (e.g., tainted canvas, though unlikely here)
        try {
             capturedImage.src = canvas.toDataURL('image/jpeg', 0.9); // Use JPEG for smaller size
             capturedImage.style.display = 'block';
        } catch (imgError) {
             console.error("Error creating data URL for captured image:", imgError);
             capturedImage.style.display = 'none'; // Hide if failed
        }
        // --- End Display ---

        // Perform OCR
        const { data: { text } } = await tesseractWorker.recognize(canvas);
        resultText.value = text;
        statusDiv.textContent = 'Recognition complete.';
        statusDiv.classList.replace('alert-danger', 'alert-info'); // Reset status style if it was error

    } catch (error) {
        console.error('Capture or OCR Error:', error);
        resultText.value = 'Error during capture or OCR process.';
        statusDiv.textContent = 'Error during recognition. See console.';
        statusDiv.classList.replace('alert-info', 'alert-danger');
        // Ensure imageCaptured reflects potential failure points if needed
        // imageCaptured = false; // Keep it true if canvas draw worked but OCR failed? Depends on desired export behavior.
    } finally {
        isProcessing = false;
        updateButtonStates(); // Re-enable buttons (including Export if capture worked)
    }
}

// --- Export Image ---
function exportImage() {
    if (!imageCaptured || isProcessing || canvas.width === 0 || canvas.height === 0) {
        console.warn("Cannot export image - no valid image captured or currently processing.");
        statusDiv.textContent = 'No valid image captured to export.';
        return;
    }

    try {
        const dataUrl = canvas.toDataURL('image/png'); // Get PNG data URL
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `ocr_capture_${Date.now()}.png`; // Filename with timestamp

        // Trigger download
        document.body.appendChild(link); // Required for Firefox consistency
        link.click();
        document.body.removeChild(link); // Clean up the temporary link

        statusDiv.textContent = 'Image exported.';
        statusDiv.classList.replace('alert-danger', 'alert-info'); // Ensure info style

    } catch (error) {
        console.error("Error exporting image:", error);
        statusDiv.textContent = 'Error exporting image.';
        statusDiv.classList.replace('alert-info', 'alert-danger');
    }
}


// --- Copy Functionality ---
copyBtn.addEventListener('click', () => {
    if (!resultText.value || isProcessing) return;

    navigator.clipboard.writeText(resultText.value)
        .then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            // Temporarily disable copy button after successful copy for feedback
            copyBtn.disabled = true;

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove('copied');
                updateButtonStates(); // Re-evaluate and potentially re-enable copy button
            }, 1500);
        })
        .catch(err => {
            console.error('Failed to copy text: ', err);
            statusDiv.textContent = 'Failed to copy text to clipboard.';
            statusDiv.classList.replace('alert-info', 'alert-danger');
        });
});


// --- Event Listeners ---
startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCameraStream);
captureRecognizeBtn.addEventListener('click', captureAndRecognize);
exportImageBtn.addEventListener('click', exportImage);


// --- Initial Load ---
window.addEventListener('load', () => {
    // Initialize Tesseract first
    initializeTesseract();
    // Set initial button states (most will be disabled until Tesseract/Camera ready)
    updateButtonStates();
});

// --- Cleanup on Page Close ---
window.addEventListener('beforeunload', async (event) => {
    // Attempt to stop the camera stream cleanly
    if (stream) {
        stopCameraStream(); // Use the existing function
    }

    // Attempt to terminate the Tesseract worker
    if (tesseractWorker) {
         console.log("Terminating Tesseract worker...");
         try {
             // Note: Worker termination might not fully complete before unload in some browsers
             await tesseractWorker.terminate();
             console.log("Tesseract worker terminated.");
             tesseractWorker = null; // Clear reference
             tesseractReady = false;
         } catch (e) {
             console.error("Error terminating Tesseract worker during unload:", e);
         }
    }
     // Standard practice for beforeunload (optional, may not always show)
     // event.preventDefault();
     // event.returnValue = ''; // For older browsers
});
