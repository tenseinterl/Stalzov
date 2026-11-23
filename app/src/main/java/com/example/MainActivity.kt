package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.theme.ZoneAmber
import com.example.ui.theme.ZoneBorder
import com.example.ui.theme.ZoneGunmetal
import com.example.ui.theme.ZoneTextMuted
import com.example.ui.theme.ZoneTextPrimary
import com.example.ui.theme.ZoneVoid
import java.io.ByteArrayInputStream

class MainActivity : ComponentActivity() {

    private var webViewRef: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        setContent {
            MyApplicationTheme {
                StalzoneHostScreen(
                    onWebViewReady = { webViewRef = it },
                    onExitApp = { finish() }
                )
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemBars()
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        webViewRef?.onResume()
    }

    override fun onPause() {
        webViewRef?.evaluateJavascript("window.STALZONE_SAVE && window.STALZONE_SAVE();", null)
        webViewRef?.onPause()
        super.onPause()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }
}

private class StalzoneBridge(
    private val context: Context,
    private val onReady: () -> Unit,
    private val onRequestExit: () -> Unit
) {
    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    @JavascriptInterface
    fun onGameReady() {
        onReady()
    }

    @JavascriptInterface
    fun requestExit() {
        onRequestExit()
    }

    @JavascriptInterface
    fun haptic(kind: String) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return
        try {
            val (durationMs, amplitude) = when (kind) {
                "shot" -> 18L to 120
                "heavy_shot" -> 34L to 210
                "hit" -> 14L to 150
                "headshot" -> 28L to 255
                "radar" -> 22L to 90
                "damage" -> 45L to 220
                "explosion" -> 90L to 255
                "ui" -> 10L to 65
                else -> 16L to 100
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(durationMs, amplitude))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(durationMs)
            }
        } catch (_: Exception) {
            // Ignore haptic errors on devices without vibration support
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun StalzoneHostScreen(
    onWebViewReady: (WebView) -> Unit,
    onExitApp: () -> Unit
) {
    val context = LocalContext.current
    var isGameReady by remember { mutableStateOf(false) }
    var showExitDialog by remember { mutableStateOf(false) }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }

    BackHandler(enabled = true) {
        val wv = webViewInstance
        if (wv != null) {
            wv.evaluateJavascript("window.STALZONE_BACK ? window.STALZONE_BACK() : 'exit';") { result ->
                if (result == "\"exit\"" || result == "exit" || result == "null") {
                    showExitDialog = true
                }
            }
        } else {
            showExitDialog = true
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewInstance?.destroy()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ZoneVoid)
            .testTag("stalzone_root")
    ) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .testTag("stalzone_webview"),
            factory = { ctx ->
                WebView(ctx).apply {
                    setBackgroundColor(Color.parseColor("#0B0E0D"))
                    setLayerType(View.LAYER_TYPE_HARDWARE, null)
                    overScrollMode = View.OVER_SCROLL_NEVER
                    isHapticFeedbackEnabled = false

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        allowFileAccess = true
                        allowContentAccess = true
                        mediaPlaybackRequiresUserGesture = false
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        builtInZoomControls = false
                        displayZoomControls = false
                        setSupportZoom(false)
                        cacheMode = WebSettings.LOAD_DEFAULT
                    }

                    val bridge = StalzoneBridge(
                        context = ctx,
                        onReady = { post { isGameReady = true } },
                        onRequestExit = { post { showExitDialog = true } }
                    )
                    addJavascriptInterface(bridge, "AndroidBridge")

                    webChromeClient = object : WebChromeClient() {
                        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                            return true
                        }
                    }

                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView?,
                            request: WebResourceRequest?
                        ): WebResourceResponse? {
                            val uri = request?.url ?: return null
                            if (uri.host == "stalzone.local") {
                                val rawPath = uri.path ?: "/index.html"
                                val assetPath = "stalzone" + if (rawPath == "/" || rawPath.isEmpty()) "/index.html" else rawPath
                                return try {
                                    val stream = ctx.assets.open(assetPath)
                                    val mime = when {
                                        assetPath.endsWith(".html") -> "text/html"
                                        assetPath.endsWith(".js") -> "application/javascript"
                                        assetPath.endsWith(".css") -> "text/css"
                                        assetPath.endsWith(".json") -> "application/json"
                                        assetPath.endsWith(".svg") -> "image/svg+xml"
                                        assetPath.endsWith(".png") -> "image/png"
                                        else -> "application/octet-stream"
                                    }
                                    WebResourceResponse(
                                        mime,
                                        "UTF-8",
                                        200,
                                        "OK",
                                        mapOf(
                                            "Access-Control-Allow-Origin" to "*",
                                            "Cache-Control" to "no-cache"
                                        ),
                                        stream
                                    )
                                } catch (_: Exception) {
                                    WebResourceResponse(
                                        "text/plain",
                                        "UTF-8",
                                        404,
                                        "Not Found",
                                        emptyMap(),
                                        ByteArrayInputStream("Not Found".toByteArray())
                                    )
                                }
                            }
                            return super.shouldInterceptRequest(view, request)
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            postDelayed({ isGameReady = true }, 600)
                        }
                    }

                    loadUrl("https://stalzone.local/index.html")
                    webViewInstance = this
                    onWebViewReady(this)
                }
            }
        )

        AnimatedVisibility(
            visible = !isGameReady,
            exit = fadeOut()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(ZoneGunmetal, ZoneVoid)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    modifier = Modifier
                        .border(1.dp, ZoneBorder, RoundedCornerShape(4.dp))
                        .background(ZoneGunmetal.copy(alpha = 0.92f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 36.dp, vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "STALZONE",
                        color = ZoneAmber,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 6.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.loading_zone),
                        color = ZoneTextPrimary,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 2.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    LinearProgressIndicator(
                        modifier = Modifier
                            .width(260.dp)
                            .height(4.dp),
                        color = ZoneAmber,
                        trackColor = ZoneBorder
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = stringResource(R.string.loading_sub),
                        color = ZoneTextMuted,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        if (showExitDialog) {
            AlertDialog(
                onDismissRequest = { showExitDialog = false },
                containerColor = ZoneGunmetal,
                titleContentColor = ZoneAmber,
                textContentColor = ZoneTextPrimary,
                title = {
                    Text(
                        text = stringResource(R.string.exit_dialog_title),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                },
                text = {
                    Text(
                        text = stringResource(R.string.exit_dialog_message),
                        style = MaterialTheme.typography.bodyMedium
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            webViewInstance?.evaluateJavascript(
                                "window.STALZONE_SAVE && window.STALZONE_SAVE();",
                                null
                            )
                            showExitDialog = false
                            onExitApp()
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ZoneAmber,
                            contentColor = ZoneVoid
                        ),
                        modifier = Modifier.testTag("exit_confirm_button")
                    ) {
                        Text(
                            text = stringResource(R.string.exit_confirm),
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                },
                dismissButton = {
                    OutlinedButton(
                        onClick = { showExitDialog = false },
                        modifier = Modifier.testTag("exit_cancel_button")
                    ) {
                        Text(
                            text = stringResource(R.string.exit_cancel),
                            color = ZoneTextPrimary,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            )
        }
    }
}
