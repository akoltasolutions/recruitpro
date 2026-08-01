package com.akolta.recruitpro;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.GeolocationPermissions;

/**
 * RecruitPro Android WebView — Native calling bridge (v1.2.0).
 *
 * <p>JavaScript bridge ("AndroidBridge") exposed to the web app:
 * <ul>
 *   <li>makeCall(phoneNumber)          — ACTION_CALL (direct dial, no dialer UI)</li>
 *   <li>hasCallPermission()            — returns "true"/"false" for runtime check</li>
 *   <li>requestCallPermission()        — proactively request CALL_PHONE permission</li>
 *   <li>openAppSettings()              — open app settings for permission management</li>
 * </ul>
 *
 * <p>Callbacks to web app:
 * <ul>
 *   <li>onCallResult(resultCode, message) — notifies web of call outcome</li>
 *   <li>showPostCallDisposition('')        — fires when user returns from a placed call</li>
 * </ul>
 *
 * <p>Call result codes:
 * <ul>
 *   <li>CALL_INITIATED               — Call was successfully initiated via ACTION_CALL</li>
 *   <li>PERMISSION_DENIED            — User denied permission (can ask again)</li>
 *   <li>PERMISSION_PERMANENTLY_DENIED — User permanently denied (must open Settings)</li>
 *   <li>CALL_FAILED                  — Call initiation failed (no SIM, carrier issue, etc.)</li>
 *   <li>INVALID_NUMBER               — Phone number is invalid</li>
 * </ul>
 */
public class MainActivity extends Activity {

    private static final int REQUEST_CALL_PHONE = 1001;
    private WebView webView;
    private String pendingCallNumber = null;
    private boolean callPlaced = false;

    // ─────────────────────────────────────────────────────────────────
    // JavaScript Interface — exposed as window.AndroidBridge
    // ─────────────────────────────────────────────────────────────────
    private class AndroidBridge {

        /**
         * Place a direct phone call (ACTION_CALL).
         * Requests runtime permission if not yet granted.
         * Notifies the web app of the result via onCallResult callback.
         *
         * @param phoneNumber The phone number to call (digits, optional leading +)
         */
        @JavascriptInterface
        public void makeCall(String phoneNumber) {
            if (phoneNumber == null || phoneNumber.isEmpty()) {
                notifyCallResult("INVALID_NUMBER", "Phone number is empty");
                return;
            }

            // Clean the number — keep digits and leading +
            String clean = phoneNumber.replaceAll("[^0-9+]", "");
            if (clean.length() < 7) {
                notifyCallResult("INVALID_NUMBER", "Phone number is too short (minimum 7 digits)");
                return;
            }

            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && checkSelfPermission(Manifest.permission.CALL_PHONE)
                        != PackageManager.PERMISSION_GRANTED) {
                    // Permission not yet granted — request it
                    pendingCallNumber = clean;
                    requestPermissions(
                            new String[]{Manifest.permission.CALL_PHONE},
                            REQUEST_CALL_PHONE);
                    return;
                }

                // Permission granted — direct call via ACTION_CALL
                placeCall(clean);
            });
        }

        /**
         * Returns "true" if CALL_PHONE runtime permission is granted.
         */
        @JavascriptInterface
        public String hasCallPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return checkSelfPermission(Manifest.permission.CALL_PHONE)
                        == PackageManager.PERMISSION_GRANTED ? "true" : "false";
            }
            // Pre-Marshmallow: permission is granted at install time
            return "true";
        }

        /**
         * Proactively request CALL_PHONE permission.
         * The result is delivered via onCallResult callback.
         */
        @JavascriptInterface
        public void requestCallPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (checkSelfPermission(Manifest.permission.CALL_PHONE)
                            == PackageManager.PERMISSION_GRANTED) {
                        // Already granted
                        notifyCallResult("CALL_INITIATED", "Permission already granted");
                    } else {
                        requestPermissions(
                                new String[]{Manifest.permission.CALL_PHONE},
                                REQUEST_CALL_PHONE);
                    }
                } else {
                    // Pre-Marshmallow: permission is granted at install time
                    notifyCallResult("CALL_INITIATED", "Permission already granted");
                }
            });
        }

        /**
         * Open this app's system Settings page.
         * Used when CALL_PHONE permission is permanently denied.
         */
        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#047857"));
        getWindow().setNavigationBarColor(Color.parseColor("#059669"));

        webView = new WebView(this);
        setContentView(webView);

        // ── WebView settings ─────────────────────────────────────────
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);

        // ── Expose JavaScript bridge ─────────────────────────────────
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        // ── URL interception ─────────────────────────────────────────
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return false;

                // Allow app's own URLs to load inside WebView
                if (url.startsWith("https://app.akolta.com")) {
                    return false;
                }

                // tel: — let the AndroidBridge.makeCall handle direct calling.
                // If somehow a raw tel: link is clicked (not via bridge),
                // fall back to ACTION_DIAL (opens dialer).
                if (url.startsWith("tel:")) {
                    try {
                        String number = url.substring(4).trim();
                        Intent intent = new Intent(Intent.ACTION_DIAL,
                                Uri.parse("tel:" + number));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    return true;
                }

                // sms: — open native SMS app
                if (url.startsWith("sms:")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW,
                                Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    return true;
                }

                // whatsapp: — open WhatsApp
                if (url.startsWith("whatsapp://")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW,
                                Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        // WhatsApp not installed — try Play Store
                        try {
                            Intent store = new Intent(Intent.ACTION_VIEW,
                                    Uri.parse("https://play.google.com/store/apps/details?id=com.whatsapp"));
                            startActivity(store);
                        } catch (Exception ignored) {}
                    }
                    return true;
                }

                // All other external URLs — open in system browser
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
                return true;
            }
        });

        // ── Chrome client (geolocation, etc.) ────────────────────────
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.loadUrl("https://app.akolta.com/");
    }

    // ─────────────────────────────────────────────────────────────────
    // Return-from-call detection
    // ─────────────────────────────────────────────────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();

            // Only notify the web app if a call was actually placed.
            // This prevents false disposition triggers when:
            //   - Permission was denied (no call was made)
            //   - User temporarily left the app for other reasons
            if (callPlaced) {
                callPlaced = false;
                webView.postDelayed(() -> {
                    try {
                        webView.evaluateJavascript(
                                "if(typeof showPostCallDisposition==='function') showPostCallDisposition('');",
                                null
                        );
                    } catch (Exception e) {
                        // WebView not ready yet — ignore
                    }
                }, 300);
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    // ─────────────────────────────────────────────────────────────────
    // Runtime permission result
    // ─────────────────────────────────────────────────────────────────
    @Override
    public void onRequestPermissionsResult(int requestCode,
            String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_CALL_PHONE) {
            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED
                    && pendingCallNumber != null) {
                // Permission granted — place the pending call
                String number = pendingCallNumber;
                pendingCallNumber = null;
                placeCall(number);
            } else {
                // Permission denied — determine if permanently denied
                pendingCallNumber = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (shouldShowRequestPermissionRationale(Manifest.permission.CALL_PHONE)) {
                        // User denied but can be asked again
                        notifyCallResult("PERMISSION_DENIED",
                                "Phone call permission is required to place calls directly from Akolta Dialer.");
                    } else {
                        // User checked "Don't ask again" or this is the first denial
                        // on a device that doesn't show rationale before first request.
                        // Treat as permanently denied — user must go to Settings.
                        notifyCallResult("PERMISSION_PERMANENTLY_DENIED",
                                "Phone call permission has been permanently denied. "
                                + "Please enable it in App Settings to place calls directly.");
                    }
                } else {
                    notifyCallResult("PERMISSION_DENIED",
                            "Phone call permission is required.");
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Helper: place a call using ACTION_CALL (direct, no dialer UI)
    // ─────────────────────────────────────────────────────────────────
    private void placeCall(String phoneNumber) {
        try {
            // ACTION_CALL = direct call (no dialer UI)
            // Requires CALL_PHONE permission (declared in AndroidManifest + runtime grant)
            Intent callIntent = new Intent(Intent.ACTION_CALL,
                    Uri.parse("tel:" + phoneNumber));
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(callIntent);

            // Mark that a call was placed — onResume will use this to
            // fire showPostCallDisposition when the user returns.
            callPlaced = true;

            // Notify web app that the call was initiated successfully
            notifyCallResult("CALL_INITIATED", "Call placed to " + phoneNumber);

        } catch (SecurityException e) {
            // ACTION_CALL failed due to missing permission
            callPlaced = false;
            notifyCallResult("PERMISSION_PERMANENTLY_DENIED",
                    "Permission denied. Please grant phone call permission in App Settings.");
        } catch (android.content.ActivityNotFoundException e) {
            // No telephony/calling app available on the device
            callPlaced = false;
            notifyCallResult("CALL_FAILED",
                    "No calling app available on this device. Please ensure a SIM card is inserted.");
        } catch (Exception e) {
            callPlaced = false;
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            if (msg.contains("no sim") || msg.contains("no_sim")
                    || msg.contains("not attached") || msg.contains("call_phone")
                    || msg.contains("not available")) {
                notifyCallResult("CALL_FAILED",
                        "Unable to place call. Please check if a SIM card is inserted "
                        + "and your device can make calls.");
            } else {
                notifyCallResult("CALL_FAILED",
                        "Failed to place call: " + (e.getMessage() != null ? e.getMessage() : "Unknown error"));
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Helper: send a callback to the web app
    // ─────────────────────────────────────────────────────────────────
    private void notifyCallResult(final String resultCode, final String message) {
        if (webView == null) return;

        // Escape special characters for safe JavaScript string embedding
        String escaped = message != null
                ? message.replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\'", "\\'")
                        .replace("\n", "\\n")
                        .replace("\r", "\\r")
                : "";

        final String js = String.format(
                "if(typeof onCallResult==='function') onCallResult(\"%s\",\"%s\");",
                resultCode, escaped);

        runOnUiThread(() -> {
            try {
                webView.evaluateJavascript(js, null);
            } catch (Exception e) {
                // WebView not ready — ignore silently
            }
        });
    }
}