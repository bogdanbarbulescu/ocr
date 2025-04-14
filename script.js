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
    startCameraBtn.disabled = !!stream || isProcessing; // Disable if stream active or processing
    stopCameraBtn.disabled = !stream || isProcessing;  // Disable if stream inactive or processing

    // Capture button needs stream AND Tesseract ready, and not processing
    captureRecognizeBtn.disabled = !stream || !tesseractReady || isProcessing;

    // Export needs an image captured (on canvas) and not processing
    exportImageBtn.disabled = !imageCaptured || isProcessing;

    // Copy needs text in the result area and not processing
    copyBtn.disabled = !resultText.value || isProcessing;

    // Handle spinner/text on Capture button
    if (isProcessing) {
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
    try {
        tesseractWorker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
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
        updateButtonStates(); // Update buttons now that Tesseract is ready

    } catch (error) {
        console.error("Error initializing Tesseract:", error);
        statusDiv.textContent = 'Error loading OCR Engine. Check console.';
        statusDiv.classList.replace('alert-info', 'alert-danger');
        tesseractReady = false;
        updateButtonStates();
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

        video.onloadedmetadata = () => { // Use onloadedmetadata or wait for play()
             console.log("Camera stream started.");
             statusDiv.textContent = 'Camera active. Point at text and capture.';
             isProcessing = false;
             updateButtonStates();
        }
         // Fallback if onloadedmetadata doesn't fire reliably after play()
         setTimeout(() => {
            if (!isProcessing) return; // Already handled by onloadedmetadata
            console.log("Camera stream started (via timeout).");
            statusDiv.textContent = 'Camera active. Point at text and capture.';
            isProcessing = false;
            updateButtonStates();
        }, 1000); // Wait 1 second


    } catch (err) {
        console.error("Error accessing camera:", err);
        statusDiv.textContent = `Error accessing camera: ${err.name}. Grant permissions & use HTTPS.`;
        statusDiv.classList.replace('alert-info', 'alert-danger');
        stream = null; // Ensure stream is null on error
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
    // Optionally clear the captured image display
    // capturedImage.style.display = 'none';
    // capturedImage.src = '#';
    // imageCaptured = false; // Reset if desired when camera stops

    console.log("Camera stream stopped.");
    statusDiv.textContent = 'Camera stopped. Press "Start Camera" to begin.';
    isProcessing = false;
    updateButtonStates();
}

// --- Capture & OCR ---
async function captureAndRecognize() {
    if (!stream || !tesseractReady || isProcessing) return;

    isProcessing = true;
    imageCaptured = false; // Reset capture state until successful draw
    updateButtonStates();
    resultText.value = ''; // Clear previous results

    statusDiv.textContent = 'Capturing frame...';
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (canvas.width === 0 || canvas.height === 0) {
         console.error("Video dimensions are zero. Cannot capture.");
         statusDiv.textContent = 'Error: Video dimensions are zero.';
         isProcessing = false;
         updateButtonStates();
         return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    imageCaptured = true; // Image is now on the canvas
    statusDiv.textContent = 'Image captured, starting recognition...';

    // --- Optional: Display captured image ---
    capturedImage.src = canvas.toDataURL('image/jpeg', 0.9); // Use JPEG for smaller size
    capturedImage.style.display = 'block';
    // --- End Optional Display ---


    try {
        const { data: { text } } = await tesseractWorker.recognize(canvas);
        resultText.value = text;
        statusDiv.textContent = 'Recognition complete.';
        statusDiv.classList.replace('alert-danger', 'alert-info');
    } catch (error) {
        console.error('OCR Error:', error);
        resultText.value = 'Error during OCR process.';
        statusDiv.textContent = 'Error during recognition. See console.';
        statusDiv.classList.replace('alert-info', 'alert-danger');
    } finally {
        isProcessing = false;
        updateButtonStates(); // Re-enable buttons (including Export if capture worked)
    }
}

// --- Export Image ---
function exportImage() {
    if (!imageCaptured || isProcessing || canvas.width === 0 || canvas.height === 0) {
        console.warn("Cannot export image - no valid image captured or currently processing.");
        return;
    }

    const dataUrl = canvas.toDataURL('image/png'); // Get PNG data URL
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `ocr_capture_${Date.now()}.png`; // Filename with timestamp

    // Trigger download
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link); // Clean up

    statusDiv.textContent = 'Image exported.';
}


// --- Copy Functionality ---
copyBtn.addEventListener('click', () => {
    if (!resultText.value || isProcessing) return;

    navigator.clipboard.writeText(resultText.value)
        .then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.textContent = 'Copy Text';
                copyBtn.classList.remove('copied');
                updateButtonStates(); // Ensure state is correct
            }, 1500);
        })
        .catch(err => {
            console.error('Failed to copy text: ', err);
            statusDiv.textContent = 'Failed to copy text.';
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
    // Don't start camera automatically
    initializeTesseract(); // Start loading OCR engine
    updateButtonStates(); // Set initial button states
});

// Optional: Clean up on page close
window.addEventListener('beforeunload', async () => {
    stopCameraStream(); // Try to stop camera
    if (tesseractWorker && tesseractReady) { // Check if worker exists and is ready
         try {
             await tesseractWorker.terminate();
             console.log("Tesseract worker terminated.");
         } catch (e) {
             console.error("Error terminating Tesseract worker:", e);
         }
    }
});
