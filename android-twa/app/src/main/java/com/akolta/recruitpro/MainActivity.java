package com.akolta.recruitpro;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.GeolocationPermissions;

/**
 * RecruitPro Android WebView — Native calling bridge.
 *
 * JavaScript bridge ("AndroidBridge") exposed to the web app:
 *   - makeCall(phoneNumber)  → ACTION_CALL (direct dial, no dialer UI)
 *   - hasCallPermission()    → returns "true"/"false" for runtime check
 *
 * When the user returns from the phone dialer/sms/whatsapp,
 * onResume() fires evaluateJavascript("showPostCallDisposition('')")
 * so the web app can show the disposition modal.
 */
public class MainActivity extends Activity {

    private static final int REQUEST_CALL_PHONE = 1001;
    private WebView webView;
    private String pendingCallNumber = null;

    // ─────────────────────────────────────────────────────────────────
    // JavaScript Interface — exposed as window.AndroidBridge
    // ─────────────────────────────────────────────────────────────────
    private class AndroidBridge {
        /**
         * Place a direct phone call (ACTION_CALL).
         * Falls back to ACTION_DIAL if CALL_PHONE permission is not granted.
         */
        @JavascriptInterface
        public void makeCall(String phoneNumber) {
            if (phoneNumber == null || phoneNumber.isEmpty()) return;

            // Clean the number — keep digits and leading +
            String clean = phoneNumber.replaceAll("[^0-9+]", "");
            if (clean.length() < 7) return;

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
    // Return-from-dialer detection
    // ─────────────────────────────────────────────────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            // Notify web app that user returned from phone dialer/sms/whatsapp.
            // The web app's showPostCallDisposition() will open the disposition modal.
            // Use a short delay to let the WebView finish resuming.
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
                // Permission denied — fall back to ACTION_DIAL (opens dialer)
                pendingCallNumber = null;
                if (webView != null) {
                    webView.evaluateJavascript(
                            "console.log('[AndroidBridge] CALL_PHONE permission denied, using tel: fallback');",
                            null
                    );
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Helper: place a call
    // ─────────────────────────────────────────────────────────────────
    private void placeCall(String phoneNumber) {
        try {
            // ACTION_CALL = direct call (no dialer UI)
            // Requires CALL_PHONE permission (declared in AndroidManifest + runtime grant)
            Intent callIntent = new Intent(Intent.ACTION_CALL,
                    Uri.parse("tel:" + phoneNumber));
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(callIntent);
        } catch (SecurityException e) {
            // ACTION_CALL failed (no permission) — fall back to ACTION_DIAL
            try {
                Intent dialIntent = new Intent(Intent.ACTION_DIAL,
                        Uri.parse("tel:" + phoneNumber));
                dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(dialIntent);
            } catch (Exception ignored) {}
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}