package com.yourpackage.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.speech.RecognizerIntent
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsControllerCompat
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.DownloadListener
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File


/**
 * ===================================================================
 * COMPLETE MainActivity.kt — SINGLE FILE, NO OTHER FILES NEEDED
 * ===================================================================
 *
 * HOW TO USE THIS FILE:
 * 1. Open your Android Studio project
 * 2. In the LEFT panel, go to: app > java > com > yourcompany > yourapp
 * 3. Open MainActivity.kt (double-click it)
 * 4. SELECT ALL text in that file (Ctrl+A)
 * 5. DELETE it (Delete key)
 * 6. COPY this ENTIRE file content and PASTE it
 * 7. Change "com.yourpackage.app" on line 1 to YOUR package name
 *    (see SETUP-GUIDE.txt for how to find your package name)
 * 8. Change "https://your-app-url.com" on line ~70 to YOUR web app URL
 * 9. Click Build > Rebuild Project
 * 10. Click the green Run button
 *
 * WHAT THIS FILE DOES:
 * - Opens phone dialer when user taps "Call" button in the web app
 * - Detects when user returns from phone call
 * - Shows Post Call Disposition popup automatically
 * - Does NOT reload the web page when returning from dialer
 * - Enables full-screen immersive mode for maximum viewport
 * - Injects viewport fix JavaScript on every page load
 * - Provides native speech recognition via Android Bridge
 * - Handles SMS and WhatsApp intent links
 * - Requests RECORD_AUDIO permission at runtime (Android 6.0+)
 * ===================================================================
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())

    // Modern ActivityResultLauncher for speech recognition (replaces deprecated startActivityForResult)
    private lateinit var speechLauncher: ActivityResultLauncher<Intent>
    // Modern ActivityResultLauncher for runtime permissions (RECORD_AUDIO)
    private lateinit var permissionLauncher: ActivityResultLauncher<String>

    // Flag to remember we need to start speech after permission is granted
    private var pendingSpeechAfterPermission = false

    // =============================================================
    //   CHANGE THIS to your actual web app URL
    //   Example: "https://recruitpro.example.com"
    // =============================================================
    private val APP_URL = "https://your-app-url.com"

    // Track if phone dialer was opened (used in onResume)
    private var isCallInProgress = false
    private var currentCallPhone = ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ========== STEP 0: Enable fullscreen immersive mode ==========
        enableImmersiveMode()

        // ========== STEP 0.5: Register ActivityResultLaunchers ==========
        // Speech recognition result launcher
        speechLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            if (result.resultCode == RESULT_OK && result.data != null) {
                val results = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                val transcript = results?.firstOrNull() ?: ""
                val escaped = transcript
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\n", "\\n")
                Log.d("[Voice]", "Speech result: $transcript")
                webView.evaluateJavascript("window.__onSpeechResult('$escaped', null);", null)
            } else {
                Log.d("[Voice]", "Speech cancelled (resultCode=${result.resultCode})")
                webView.evaluateJavascript("window.__onSpeechResult(null, 'cancelled');", null)
            }
        }

        // Runtime permission launcher for RECORD_AUDIO
        permissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->
            if (granted) {
                Log.d("[Voice]", "RECORD_AUDIO permission granted")
                launchSpeechRecognizer()
            } else {
                Log.d("[Voice]", "RECORD_AUDIO permission denied")
                webView.evaluateJavascript("window.__onSpeechResult(null, 'permission_denied');", null)
                pendingSpeechAfterPermission = false
            }
        }

        // ========== STEP 1: Create WebView ==========
        webView = WebView(this)
        setContentView(webView)

        // ========== STEP 2: Enable JavaScript & Settings ==========
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportMultipleWindows(false)

            // --- IMPORTANT: Viewport & scroll fixes for bottom-sheet popups ---
            setLayoutAlgorithm(WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING)
            setBuiltInZoomControls(false)
            displayZoomControls = false
        }

        // --- Enable smooth scrolling ---
        webView.isVerticalScrollBarEnabled = true
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER

        // ========== STEP 2.5: Handle file downloads (Excel, PDF, etc.) ==========
        webView.setDownloadListener(object : DownloadListener {
            override fun onDownloadStart(
                url: String?,
                userAgent: String?,
                contentDisposition: String?,
                mimetype: String?,
                contentLength: Long
            ) {
                if (url == null) {
                    Log.e("[Download]", "Download URL is null")
                    return
                }

                Log.d("[Download]", "Download requested: $url")

                try {
                    val fileName = contentDisposition?.let {
                        val regex = Regex("filename\\*?=(?:\"|UTF-8'')(.*?)(?:\"|$)")
                        regex.find(it)?.groupValues?.get(1)?.trim()
                    } ?: URLUtil.guessFileName(url, contentDisposition, mimetype)

                    Log.d("[Download]", "Saving as: $fileName")

                    val request = DownloadManager.Request(Uri.parse(url)).apply {
                        setMimeType(mimetype)
                        addRequestHeader("User-Agent", userAgent)
                        setDescription("Downloading $fileName")
                        setTitle(fileName)
                        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        allowScanningByMediaScanner()
                    }

                    val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    dm.enqueue(request)
                    Log.d("[Download]", "Download enqueued: $fileName")
                } catch (e: Exception) {
                    Log.e("[Download]", "Download FAILED: ${e.message}")
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        startActivity(intent)
                    } catch (e2: Exception) {
                        Log.e("[Download]", "Browser fallback also FAILED: ${e2.message}")
                    }
                }
            }
        })

        // ========== STEP 3: WebViewClient — handles tel:/sms:/wa.me links + viewport fix ==========
        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false

                // ---------- HANDLE tel: LINKS (Phone Dialer) ----------
                if (url.startsWith("tel:")) {
                    val phone = url.removePrefix("tel:")
                    isCallInProgress = true
                    currentCallPhone = phone

                    Log.d("[Dialer]", "Opening phone dialer for: $phone")

                    try {
                        val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                            data = Uri.parse(url)
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        startActivity(dialIntent)
                    } catch (e: Exception) {
                        Log.e("[Dialer]", "FAILED to open dialer: ${e.message}")
                        isCallInProgress = false
                        currentCallPhone = ""
                    }
                    return true
                }

                // ---------- HANDLE sms: LINKS (SMS App) ----------
                if (url.startsWith("sms:")) {
                    Log.d("[Dialer]", "Opening SMS for: $url")
                    try {
                        val smsIntent = Intent(Intent.ACTION_SENDTO).apply {
                            data = Uri.parse(url)
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        startActivity(smsIntent)
                    } catch (e: Exception) {
                        Log.e("[Dialer]", "FAILED to open SMS: ${e.message}")
                    }
                    return true
                }

                // ---------- HANDLE WhatsApp links ----------
                if (url.contains("wa.me") || url.startsWith("whatsapp://")) {
                    Log.d("[Dialer]", "Opening WhatsApp: $url")
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        startActivity(intent)
                    } catch (e: Exception) {
                        Log.e("[Dialer]", "FAILED to open WhatsApp: ${e.message}")
                    }
                    return true
                }

                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d("[Dialer]", "Page loaded: $url")

                // Inject JavaScript to fix viewport height for bottom-sheet popups.
                view?.evaluateJavascript("""
                    (function() {
                        setTimeout(function() {
                            window.dispatchEvent(new Event('resize'));
                            console.log('[ViewportFix] Resize dispatched, innerHeight=' + window.innerHeight);
                        }, 300);
                        setTimeout(function() {
                            window.dispatchEvent(new Event('resize'));
                            console.log('[ViewportFix] Second resize, innerHeight=' + window.innerHeight);
                        }, 1000);
                    })();
                """.trimIndent(), null)

                // After page loads, if we have a pending call, trigger disposition
                if (isCallInProgress && currentCallPhone.isNotEmpty()) {
                    handler.postDelayed({
                        triggerDispositionPopup(currentCallPhone)
                    }, 800)
                }
            }
        }

        // ========== STEP 4: WebChromeClient (console.log + permission requests) ==========
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage?): Boolean {
                Log.d("[WebView]", "${message?.message()}")
                return true
            }

            // Handle WebView-internal permission requests (microphone for getUserMedia)
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request != null) {
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        Log.d("[WebView]", "Granting microphone permission for getUserMedia")
                        request.grant(request.resources)
                    } else {
                        request.deny()
                    }
                }
            }
        }

        // ========== STEP 5: JavaScript Interface for Voice Input ==========
        // Exposes native Android speech recognition to the web app.
        // Web Speech API (webkitSpeechRecognition) is NOT available inside WebView.
        // Instead, the web app calls window.AndroidBridge.startSpeechRecognition(),
        // which launches the Android system speech recognizer and returns results
        // via window.__onSpeechResult(transcript, error) callback.
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun startSpeechRecognition() {
                runOnUiThread {
                    // Check RECORD_AUDIO permission (required on Android 6.0+)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                        ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        Log.d("[Voice]", "Requesting RECORD_AUDIO runtime permission")
                        pendingSpeechAfterPermission = true
                        permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        return@runOnUiThread
                    }

                    launchSpeechRecognizer()
                }
            }
        }, "AndroidBridge")

        // ========== STEP 6: Load Your Web App ==========
        Log.d("[Dialer]", "Loading app: $APP_URL")
        webView.loadUrl(APP_URL)
    }

    /**
     * Launch the Android system speech recognizer intent.
     * Uses the modern ActivityResultLauncher API.
     */
    private fun launchSpeechRecognizer() {
        try {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak now...")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            speechLauncher.launch(intent)
            Log.d("[Voice]", "Speech recognition intent launched")
        } catch (e: Exception) {
            Log.e("[Voice]", "Speech recognition failed: ${e.message}")
            webView.evaluateJavascript("window.__onSpeechResult(null, 'not_available');", null)
            pendingSpeechAfterPermission = false
        }
    }

    /**
     * Enable immersive sticky mode — hides status bar and navigation bar.
     */
    private fun enableImmersiveMode() {
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        )

        // Modern WindowInsetsController API (Android 11+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            WindowInsetsControllerCompat(window, window.decorView).let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
    }

    /**
     * Re-apply immersive mode when activity resumes.
     */
    override fun onResume() {
        super.onResume()
        enableImmersiveMode()

        Log.d("[Dialer]", "onResume called. isCallInProgress=$isCallInProgress, phone=$currentCallPhone")

        if (isCallInProgress && currentCallPhone.isNotEmpty()) {
            val phone = currentCallPhone

            // Reset flags immediately
            isCallInProgress = false
            currentCallPhone = ""

            Log.d("[Dialer]", "User returned from dialer for: $phone — showing disposition popup")

            handler.postDelayed({
                triggerDispositionPopup(phone)
            }, 500)
        }
    }

    /**
     * Call JavaScript function in WebView to open the Post Call Disposition popup.
     */
    private fun triggerDispositionPopup(phoneNumber: String) {
        try {
            // Escape special characters to prevent JS injection
            val escaped = phoneNumber
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
            val jsCode = """
                if (typeof window.showPostCallDisposition === 'function') {
                    window.showPostCallDisposition('$escaped');
                    true;
                } else {
                    console.log('showPostCallDisposition not found — saving to sessionStorage');
                    var data = { phone: '$escaped', timestamp: Date.now() };
                    sessionStorage.setItem('__trigger_disposition', JSON.stringify(data));
                    window.dispatchEvent(new CustomEvent('show-disposition-from-dialer', { detail: data }));
                    true;
                }
            """.trimIndent()

            webView.evaluateJavascript(jsCode) { result ->
                Log.d("[Dialer]", "evaluateJavascript result: $result")
            }
        } catch (e: Exception) {
            Log.e("[Dialer]", "evaluateJavascript FAILED: ${e.message}")
        }
    }

    // ========== HANDLE BACK BUTTON ==========
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        try {
            webView.evaluateJavascript("""
                (function() {
                    window.dispatchEvent(new CustomEvent('close-all-modals'));
                    var overlays = document.querySelectorAll('[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"], .fixed.inset-0.bg-black');
                    if (overlays.length > 0) return true;
                    return false;
                })();
            """.trimIndent()) { result ->
                if (result == "true") {
                    Log.d("[Dialer]", "Closed modal via back button")
                } else {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        @Suppress("DEPRECATION")
                        super.onBackPressed()
                    }
                }
            }
        } catch (e: Exception) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    // ========== CLEANUP ==========
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        webView.destroy()
        super.onDestroy()
        Log.d("[Dialer]", "MainActivity destroyed")
    }
}
