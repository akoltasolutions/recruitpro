package com.yourpackage.app  // ⚠️ CHANGE THIS to your actual package name

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Custom WebViewClient that:
 * 1. Opens phone dialer for tel: links
 * 2. Sets a flag when dialer is opened
 * 3. Does NOT reload the WebView when returning from dialer
 */
class DialerWebViewClient(private val context: Context) : WebViewClient() {

    companion object {
        // Flag to track if phone dialer was just opened
        @Volatile
        var isCallInProgress: Boolean = false

        // The phone number being called (for logging)
        var currentCallPhone: String = ""
    }

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val url = request?.url?.toString() ?: return false

        // Handle tel: links — open the phone dialer
        if (url.startsWith("tel:")) {
            isCallInProgress = true
            currentCallPhone = url.removePrefix("tel:")
            println("[DialerWebView] Opening phone dialer for: $currentCallPhone")

            try {
                val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                    data = Uri.parse(url)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(dialIntent)
            } catch (e: Exception) {
                println("[DialerWebView] Failed to open dialer: ${e.message}")
                isCallInProgress = false
            }

            // Return true = we handled it, don't let WebView navigate
            return true
        }

        // Handle sms: links — open SMS app
        if (url.startsWith("sms:")) {
            try {
                val smsIntent = Intent(Intent.ACTION_SENDTO).apply {
                    data = Uri.parse(url)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(smsIntent)
            } catch (e: Exception) {
                println("[DialerWebView] Failed to open SMS: ${e.message}")
            }
            return true
        }

        // Let WebView handle all other URLs normally
        return false
    }

    /**
     * Reset the call flag (called after disposition popup is shown)
     */
    fun resetCallFlag() {
        isCallInProgress = false
        currentCallPhone = ""
        println("[DialerWebView] Call flag reset")
    }
}
