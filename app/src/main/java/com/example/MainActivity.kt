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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.credentials.CredentialManager
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.multiplayer.SectorChatMessage
import com.example.multiplayer.SectorPlayer
import com.example.multiplayer.UiState
import com.example.multiplayer.ZoneAuthScreen
import com.example.multiplayer.ZoneMultiplayerRepository
import com.example.multiplayer.ZoneMultiplayerViewModel
import com.example.multiplayer.authStateFlow
import com.example.multiplayer.sanitizeCallsign
import com.example.multiplayer.signOutFromZone
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.theme.ZoneAmber
import com.example.ui.theme.ZoneBorder
import com.example.ui.theme.ZoneGunmetal
import com.example.ui.theme.ZoneTextMuted
import com.example.ui.theme.ZoneTextPrimary
import com.example.ui.theme.ZoneVoid
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

class MainActivity : ComponentActivity() {

    private var webViewRef: WebView? = null
    private var onPauseCleanup: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        setContent {
            MyApplicationTheme {
                StalzoneAppRoot(
                    onWebViewReady = { webViewRef = it },
                    onRegisterPauseCleanup = { onPauseCleanup = it },
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
        onPauseCleanup?.invoke()
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

@Composable
private fun StalzoneAppRoot(
    onWebViewReady: (WebView?) -> Unit,
    onRegisterPauseCleanup: ((() -> Unit)?) -> Unit,
    onExitApp: () -> Unit
) {
    val auth = remember { Firebase.auth }
    val currentUser by auth.authStateFlow().collectAsStateWithLifecycle(initialValue = auth.currentUser)
    val user = currentUser

    if (user == null) {
        LaunchedEffect(Unit) {
            onWebViewReady(null)
            onRegisterPauseCleanup(null)
        }
        ZoneAuthScreen(onAuthSuccess = { /* AuthStateFlow automatically transitions UI */ })
    } else {
        val uid = user.uid
        val initialCallsign = remember(uid, user.displayName, user.email) {
            val raw = user.displayName?.takeIf { it.isNotBlank() }
                ?: user.email?.substringBefore("@")?.takeIf { it.isNotBlank() }
                ?: "Сталкер_${uid.take(5)}"
            sanitizeCallsign(raw)
        }
        key(uid) {
            StalzoneHostScreen(
                currentUserId = uid,
                initialCallsign = initialCallsign,
                onWebViewReady = onWebViewReady,
                onRegisterPauseCleanup = onRegisterPauseCleanup,
                onExitApp = onExitApp
            )
        }
    }
}

private class StalzoneBridge(
    private val context: Context,
    private val onReady: () -> Unit,
    private val onRequestExit: () -> Unit,
    private val onSyncOnlineState: (String, Double, Double, Double, Double, Long, String, Boolean, Boolean) -> Unit,
    private val onSendPvpHit: (String, String, Long, Boolean, String) -> Unit,
    private val onSaveCloudProfile: (String, Long, Long, Long, Long, String, String, String) -> Unit,
    private val onSetOnlineSector: (String) -> Unit,
    private val onSendChatMessage: (String, String) -> Unit,
    private val onRequestSignOut: () -> Unit
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
    fun syncOnlineState(
        faction: String,
        x: Double,
        y: Double,
        z: Double,
        yaw: Double,
        hp: Int,
        weaponId: String,
        moving: Boolean,
        firing: Boolean
    ) {
        onSyncOnlineState(faction, x, y, z, yaw, hp.toLong(), weaponId, moving, firing)
    }

    @JavascriptInterface
    fun sendPvpHit(
        attackerFaction: String,
        targetUid: String,
        damage: Int,
        headshot: Boolean,
        weapon: String
    ) {
        onSendPvpHit(attackerFaction, targetUid, damage.toLong(), headshot, weapon)
    }

    @JavascriptInterface
    fun saveCloudProfile(
        faction: String,
        money: Int,
        kills: Int,
        deaths: Int,
        artifactsFound: Int,
        primaryWeapon: String,
        secondaryWeapon: String,
        armorId: String
    ) {
        onSaveCloudProfile(
            faction,
            money.toLong(),
            kills.toLong(),
            deaths.toLong(),
            artifactsFound.toLong(),
            primaryWeapon,
            secondaryWeapon,
            armorId
        )
    }

    @JavascriptInterface
    fun setOnlineSector(sectorId: String) {
        onSetOnlineSector(sectorId)
    }

    @JavascriptInterface
    fun sendChatMessage(faction: String, text: String) {
        onSendChatMessage(faction, text)
    }

    @JavascriptInterface
    fun requestSignOut() {
        onRequestSignOut()
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
    currentUserId: String,
    initialCallsign: String,
    onWebViewReady: (WebView?) -> Unit,
    onRegisterPauseCleanup: ((() -> Unit)?) -> Unit,
    onExitApp: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val credentialManager = remember(context) { CredentialManager.create(context) }

    val multiplayerViewModel: ZoneMultiplayerViewModel = viewModel(
        key = currentUserId,
        factory = viewModelFactory {
            initializer {
                val app = checkNotNull(this[APPLICATION_KEY]) {
                    "APPLICATION_KEY missing from CreationExtras"
                }
                val databaseId = app.getString(R.string.firestore_database_id)
                val db = FirebaseFirestore.getInstance(databaseId)
                ZoneMultiplayerViewModel(
                    repository = ZoneMultiplayerRepository(db),
                    currentUserId = currentUserId,
                    initialCallsign = initialCallsign
                )
            }
        }
    )

    val sectorPlayersState by multiplayerViewModel.sectorPlayersState.collectAsStateWithLifecycle()
    val incomingHitsState by multiplayerViewModel.incomingPvpHitsState.collectAsStateWithLifecycle()
    val sectorChatState by multiplayerViewModel.sectorChatState.collectAsStateWithLifecycle()
    val activeSectorId by multiplayerViewModel.activeSectorId.collectAsStateWithLifecycle()
    val callsign by multiplayerViewModel.callsign.collectAsStateWithLifecycle()
    val cloudProfile by multiplayerViewModel.cloudProfile.collectAsStateWithLifecycle()

    var isGameReady by remember { mutableStateOf(false) }
    var showExitDialog by remember { mutableStateOf(false) }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }

    DisposableEffect(multiplayerViewModel) {
        onRegisterPauseCleanup {
            scope.launch { multiplayerViewModel.goOfflineNow() }
        }
        onDispose {
            onRegisterPauseCleanup(null)
            scope.launch { multiplayerViewModel.goOfflineNow() }
            webViewInstance?.destroy()
        }
    }

    // Push remote players & online meta into WebView whenever sector snapshot updates
    LaunchedEffect(isGameReady, sectorPlayersState, activeSectorId, callsign) {
        val wv = webViewInstance ?: return@LaunchedEffect
        if (!isGameReady) return@LaunchedEffect

        val players: List<SectorPlayer> = when (val state = sectorPlayersState) {
            is UiState.Success -> state.data
            else -> emptyList()
        }
        val nowMs = System.currentTimeMillis()
        val remoteArray = JSONArray()
        var activeOnlineCount = 1
        for (p in players) {
            if (p.userId == currentUserId || p.id == currentUserId) continue
            val updatedMs = p.updatedAt?.toDate()?.time ?: nowMs
            if (nowMs - updatedMs > 90_000L) continue
            activeOnlineCount++
            remoteArray.put(
                JSONObject().apply {
                    put("uid", p.userId)
                    put("name", p.callsign)
                    put("faction", p.faction)
                    put("weapon", p.weaponId)
                    put("x", p.x)
                    put("y", p.y)
                    put("z", p.z)
                    put("yaw", p.yaw)
                    put("hp", p.hp)
                    put("moving", p.moving)
                    put("firing", p.firing)
                }
            )
        }

        val metaJson = JSONObject().apply {
            put("connected", sectorPlayersState !is UiState.Error)
            put("sectorId", activeSectorId)
            put("callsign", callsign)
            put("uid", currentUserId)
            put("onlineCount", activeOnlineCount)
        }

        val js = "window.STALZONE_REMOTE_PLAYERS && window.STALZONE_REMOTE_PLAYERS($remoteArray);" +
            "window.STALZONE_ONLINE_META && window.STALZONE_ONLINE_META($metaJson);"
        wv.evaluateJavascript(js, null)
    }

    // Push PDA radio chat messages into WebView
    LaunchedEffect(isGameReady, sectorChatState) {
        val wv = webViewInstance ?: return@LaunchedEffect
        if (!isGameReady) return@LaunchedEffect
        val messages: List<SectorChatMessage> = (sectorChatState as? UiState.Success)?.data ?: return@LaunchedEffect
        val chatArray = JSONArray()
        for (msg in messages) {
            chatArray.put(
                JSONObject().apply {
                    put("id", msg.id)
                    put("callsign", msg.callsign)
                    put("faction", msg.faction)
                    put("text", msg.text)
                }
            )
        }
        wv.evaluateJavascript("window.STALZONE_CHAT_UPDATE && window.STALZONE_CHAT_UPDATE($chatArray);", null)
    }

    // Push cloud profile once loaded into WebView
    LaunchedEffect(isGameReady, cloudProfile) {
        val wv = webViewInstance ?: return@LaunchedEffect
        val profile = cloudProfile ?: return@LaunchedEffect
        if (!isGameReady) return@LaunchedEffect
        val json = JSONObject().apply {
            put("callsign", profile.callsign)
            put("faction", profile.faction)
            put("money", profile.money)
            put("kills", profile.kills)
            put("deaths", profile.deaths)
            put("artifactsFound", profile.artifactsFound)
            put("armorId", profile.armorId)
            put("primaryWeapon", profile.primaryWeaponId)
            put("secondaryWeapon", profile.secondaryWeaponId)
            put("sectorId", profile.sectorId)
        }
        wv.evaluateJavascript("window.STALZONE_CLOUD_PROFILE && window.STALZONE_CLOUD_PROFILE($json);", null)
    }

    // Relay incoming PvP hits to WebView and delete consumed Firestore docs
    LaunchedEffect(isGameReady, incomingHitsState) {
        val wv = webViewInstance ?: return@LaunchedEffect
        if (!isGameReady) return@LaunchedEffect
        val hits = (incomingHitsState as? UiState.Success)?.data ?: return@LaunchedEffect
        for (hit in hits) {
            if (multiplayerViewModel.markHitProcessedAndConsume(hit)) {
                val hitJson = JSONObject().apply {
                    put("attackerUid", hit.attackerUid)
                    put("attackerName", hit.attackerName)
                    put("attackerFaction", hit.attackerFaction)
                    put("damage", hit.damage)
                    put("headshot", hit.headshot)
                    put("weapon", hit.weapon)
                }
                wv.evaluateJavascript("window.STALZONE_PVP_HIT && window.STALZONE_PVP_HIT($hitJson);", null)
            }
        }
    }

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
                        onRequestExit = { post { showExitDialog = true } },
                        onSyncOnlineState = { faction, x, y, z, yaw, hp, weaponId, moving, firing ->
                            multiplayerViewModel.syncPlayerPosition(
                                faction, x, y, z, yaw, hp, weaponId, moving, firing
                            )
                        },
                        onSendPvpHit = { attackerFaction, targetUid, damage, headshot, weapon ->
                            multiplayerViewModel.sendPvpHit(
                                attackerFaction, targetUid, damage, headshot, weapon
                            )
                        },
                        onSaveCloudProfile = { faction, money, kills, deaths, artifactsFound, primaryWpn, secondaryWpn, armorId ->
                            multiplayerViewModel.syncCloudProfile(
                                faction, money, kills, deaths, artifactsFound, primaryWpn, secondaryWpn, armorId
                            )
                        },
                        onSetOnlineSector = { sectorId ->
                            multiplayerViewModel.switchSector(sectorId)
                        },
                        onSendChatMessage = { faction, text ->
                            multiplayerViewModel.sendChatMessage(faction, text)
                        },
                        onRequestSignOut = {
                            post {
                                signOutFromZone(
                                    credentialManager = credentialManager,
                                    scope = scope,
                                    beforeSignOut = { multiplayerViewModel.goOfflineNow() }
                                )
                            }
                        }
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
                                        assetPath.endsWith(".jpg") || assetPath.endsWith(".jpeg") -> "image/jpeg"
                                        assetPath.endsWith(".webp") -> "image/webp"
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
                            scope.launch {
                                multiplayerViewModel.goOfflineNow()
                                showExitDialog = false
                                onExitApp()
                            }
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
