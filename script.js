const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const captureBtnText = document.getElementById('captureBtnText');
const initSpinner = document.getElementById('initSpinner');
const resultText = document.getElementById('resultText');
const copyBtn = document.getElementById('copyBtn');
const statusDiv = document.getElementById('status');

let stream = null;
let tesseractWorker = null;
let tesseractReady = false;

// --- Tesseract Initialization ---
async function initializeTesseract() {
    statusDiv.textContent = 'Loading OCR Engine...';
    try {
        // Use Tesseract.createWorker('eng', 1, { // Older syntax
        tesseractWorker = await Tesseract.createWorker('eng', 1, { // v5 syntax uses options object
            logger: m => {
                // console.log(m); // Detailed progress
                if (m.status === 'recognizing text') {
                    statusDiv.textContent = `Recognizing... ${Math.round(m.progress * 100)}%`;
                } else if (m.status.startsWith('loading') || m.status.startsWith('downloading')) {
                     statusDiv.textContent = `Loading model: ${m.status}`;
                } else {
                    statusDiv.textContent = m.status;
                }
            },
            // Optional: Specify cache path or disable cache
            // cacheMethod: 'none' // If you want to force download each time
            // workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/worker.min.js' // If needed
            // corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.0.5/tesseract-core.wasm.js'
            // langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast' // Language data path
        });
        // await tesseractWorker.loadLanguage('eng'); // Already done by createWorker
        // await tesseractWorker.initialize('eng'); // Already done by createWorker
        console.log('Tesseract worker created and initialized.');
        tesseractReady = true;
        statusDiv.textContent = 'OCR Engine Ready. Camera active.';
        enableCaptureButton();

    } catch (error) {
        console.error("Error initializing Tesseract:", error);
        statusDiv.textContent = 'Error loading OCR Engine. Check console.';
        statusDiv.classList.replace('alert-info', 'alert-danger');
        disableCaptureButton('OCR Failed');
    }
}

// --- Camera Setup ---
async function startCamera() {
    statusDiv.textContent = 'Requesting camera access...';
    try {
        // Prefer the rear camera ('environment')
        const constraints = {
            video: {
                facingMode: 'environment',
                 // Optional: Add resolution constraints if needed
                 // width: { ideal: 1280 },
                 // height: { ideal: 720 }
            },
            audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            console.log("Camera stream started.");
            // Only enable capture *after* tesseract is also ready
            if (tesseractReady) {
                enableCaptureButton();
                statusDiv.textContent = 'Camera and OCR ready. Point at text and capture.';
            } else {
                 statusDiv.textContent = 'Camera ready. Waiting for OCR Engine...';
                 // Button text remains 'Initializing...'
            }
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
        statusDiv.textContent = `Error accessing camera: ${err.name}. Ensure permissions are granted and using HTTPS.`;
        statusDiv.classList.replace('alert-info', 'alert-danger');
        disableCaptureButton('Camera Error');
    }
}

function enableCaptureButton() {
    captureBtn.disabled = false;
    initSpinner.style.display = 'none';
    captureBtnText.textContent = 'Capture & Recognize Text';
}

function disableCaptureButton(reason = 'Processing...') {
     captureBtn.disabled = true;
     initSpinner.style.display = 'inline-block'; // Show spinner if needed
     captureBtnText.textContent = reason;
     if (reason === 'Initializing...') {
        initSpinner.style.display = 'inline-block';
     } else {
         initSpinner.style.display = 'none'; // Hide spinner for Processing/Error
     }
}


// --- Capture & OCR ---
captureBtn.addEventListener('click', async () => {
    if (!stream || !tesseractReady || !tesseractWorker) {
        console.warn('Camera stream or Tesseract not ready.');
        statusDiv.textContent = 'Please wait for initialization.';
        return;
    }

    disableCaptureButton('Processing...');
    copyBtn.disabled = true; // Disable copy while processing
    resultText.value = ''; // Clear previous results

    const context = canvas.getContext('2d');
    // Set canvas dimensions to match the video's intrinsic dimensions for higher quality capture
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current video frame onto the canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    statusDiv.textContent = 'Image captured, starting recognition...';

    try {
        // Perform OCR on the canvas image data
        const { data: { text } } = await tesseractWorker.recognize(canvas);

        resultText.value = text;
        statusDiv.textContent = 'Recognition complete.';
        statusDiv.classList.replace('alert-danger', 'alert-info'); // Reset status style if it was error
        copyBtn.disabled = !text; // Enable copy only if text was found

    } catch (error) {
        console.error('OCR Error:', error);
        resultText.value = 'Error during OCR process.';
        statusDiv.textContent = 'Error during recognition. See console.';
        statusDiv.classList.replace('alert-info', 'alert-danger');
        copyBtn.disabled = true;
    } finally {
        // Re-enable capture button regardless of success or failure
        enableCaptureButton();
    }
});

// --- Copy Functionality ---
copyBtn.addEventListener('click', () => {
    if (!resultText.value) return;

    navigator.clipboard.writeText(resultText.value)
        .then(() => {
            // Visual feedback
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.textContent = 'Copy Text';
                copyBtn.classList.remove('copied');
            }, 1500); // Reset after 1.5 seconds
        })
        .catch(err => {
            console.error('Failed to copy text: ', err);
            statusDiv.textContent = 'Failed to copy text.';
            statusDiv.classList.replace('alert-info', 'alert-danger');
        });
});


// --- Initial Load ---
window.addEventListener('load', () => {
    // Start camera and Tesseract initialization in parallel
    startCamera();
    initializeTesseract();
});

// Optional: Clean up when the page is closed (might not always fire reliably)
// window.addEventListener('beforeunload', async () => {
//     if (stream) {
//         stream.getTracks().forEach(track => track.stop());
//     }
//     if (tesseractWorker) {
//         await tesseractWorker.terminate();
//     }
// });
