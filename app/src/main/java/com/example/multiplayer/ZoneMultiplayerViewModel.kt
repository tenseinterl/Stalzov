package com.example.multiplayer

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalCoroutinesApi::class)
class ZoneMultiplayerViewModel(
    private val repository: ZoneMultiplayerRepository,
    val currentUserId: String,
    initialCallsign: String
) : ViewModel() {

    private val _activeSectorId = MutableStateFlow(DEFAULT_SECTOR_ID)
    val activeSectorId: StateFlow<String> = _activeSectorId.asStateFlow()

    private val _callsign = MutableStateFlow(sanitizeCallsign(initialCallsign))
    val callsign: StateFlow<String> = _callsign.asStateFlow()

    private val _cloudProfile = MutableStateFlow<CloudUserProfile?>(null)
    val cloudProfile: StateFlow<CloudUserProfile?> = _cloudProfile.asStateFlow()

    private val _statusError = MutableStateFlow<String?>(null)
    val statusError: StateFlow<String?> = _statusError.asStateFlow()

    private val processedHitIds = mutableSetOf<String>()

    val sectorPlayersState: StateFlow<UiState<List<SectorPlayer>>> = _activeSectorId
        .flatMapLatest { sectorId ->
            repository.observeSectorPlayers(sectorId)
                .map<List<SectorPlayer>, UiState<List<SectorPlayer>>> { players ->
                    UiState.Success(players)
                }
                .catch { error ->
                    val firestoreError = generateSequence(error) { it.cause }
                        .filterIsInstance<FirebaseFirestoreException>()
                        .firstOrNull()
                    if (firestoreError == null && error is CancellationException) throw error
                    val rootError = firestoreError ?: error
                    Log.w(TAG, "Error observing sector players", rootError)
                    emit(UiState.Error(rootError.message ?: "Ошибка синхронизации сектора"))
                }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = UiState.Loading
        )

    val incomingPvpHitsState: StateFlow<UiState<List<PvpHitEvent>>> = _activeSectorId
        .flatMapLatest { sectorId ->
            repository.observeIncomingPvpHits(sectorId, currentUserId)
                .map<List<PvpHitEvent>, UiState<List<PvpHitEvent>>> { hits ->
                    UiState.Success(hits)
                }
                .catch { error ->
                    val firestoreError = generateSequence(error) { it.cause }
                        .filterIsInstance<FirebaseFirestoreException>()
                        .firstOrNull()
                    if (firestoreError == null && error is CancellationException) throw error
                    val rootError = firestoreError ?: error
                    Log.w(TAG, "Error observing PvP hits", rootError)
                    emit(UiState.Error(rootError.message ?: "Ошибка PvP-канала"))
                }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = UiState.Loading
        )

    val sectorChatState: StateFlow<UiState<List<SectorChatMessage>>> = _activeSectorId
        .flatMapLatest { sectorId ->
            repository.observeSectorChat(sectorId)
                .map<List<SectorChatMessage>, UiState<List<SectorChatMessage>>> { msgs ->
                    UiState.Success(msgs)
                }
                .catch { error ->
                    val firestoreError = generateSequence(error) { it.cause }
                        .filterIsInstance<FirebaseFirestoreException>()
                        .firstOrNull()
                    if (firestoreError == null && error is CancellationException) throw error
                    val rootError = firestoreError ?: error
                    Log.w(TAG, "Error observing sector radio chat", rootError)
                    emit(UiState.Error(rootError.message ?: "Ошибка радиочата"))
                }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = UiState.Loading
        )

    init {
        viewModelScope.launch {
            repository.loadCloudProfile()
                .onSuccess { profile ->
                    if (profile != null) {
                        _cloudProfile.value = profile
                        _callsign.value = sanitizeCallsign(profile.callsign)
                        _activeSectorId.value = sanitizeSectorId(profile.sectorId)
                    }
                }
                .onFailure { err ->
                    _statusError.value = err.localizedMessage
                }
        }
    }

    fun switchSector(newSectorId: String) {
        val safeNew = sanitizeSectorId(newSectorId)
        val oldSector = _activeSectorId.value
        if (safeNew == oldSector) return
        viewModelScope.launch {
            repository.setPlayerOffline(oldSector)
            processedHitIds.clear()
            _activeSectorId.value = safeNew
        }
    }

    fun syncPlayerPosition(
        faction: String,
        x: Double,
        y: Double,
        z: Double,
        yaw: Double,
        hp: Long,
        weaponId: String,
        moving: Boolean,
        firing: Boolean
    ) {
        val sector = _activeSectorId.value
        val name = _callsign.value
        viewModelScope.launch {
            repository.upsertPlayerPresence(
                sectorId = sector,
                callsign = name,
                faction = faction,
                weaponId = weaponId,
                x = x,
                y = y,
                z = z,
                yaw = yaw,
                hp = hp,
                moving = moving,
                firing = firing
            ).onFailure { err ->
                _statusError.value = err.localizedMessage
            }
        }
    }

    fun syncCloudProfile(
        faction: String,
        money: Long,
        kills: Long,
        deaths: Long,
        artifactsFound: Long,
        primaryWeaponId: String,
        secondaryWeaponId: String,
        armorId: String
    ) {
        val sector = _activeSectorId.value
        val name = _callsign.value
        viewModelScope.launch {
            repository.syncCloudProfile(
                callsign = name,
                faction = faction,
                money = money,
                kills = kills,
                deaths = deaths,
                artifactsFound = artifactsFound,
                primaryWeaponId = primaryWeaponId,
                secondaryWeaponId = secondaryWeaponId,
                armorId = armorId,
                sectorId = sector
            ).onFailure { err ->
                _statusError.value = err.localizedMessage
            }
        }
    }

    fun sendPvpHit(
        attackerFaction: String,
        targetUid: String,
        damage: Long,
        headshot: Boolean,
        weapon: String
    ) {
        val sector = _activeSectorId.value
        val name = _callsign.value
        viewModelScope.launch {
            repository.sendPvpHit(
                sectorId = sector,
                attackerName = name,
                attackerFaction = attackerFaction,
                targetUid = targetUid,
                damage = damage,
                headshot = headshot,
                weapon = weapon
            )
        }
    }

    fun sendChatMessage(faction: String, text: String) {
        val sector = _activeSectorId.value
        val name = _callsign.value
        viewModelScope.launch {
            repository.sendChatMessage(
                sectorId = sector,
                callsign = name,
                faction = faction,
                text = text
            )
        }
    }

    fun markHitProcessedAndConsume(hit: PvpHitEvent): Boolean {
        if (hit.id.isBlank() || !processedHitIds.add(hit.id)) return false
        val sector = _activeSectorId.value
        viewModelScope.launch {
            repository.consumePvpHit(sector, hit.id)
        }
        return true
    }

    suspend fun goOfflineNow() {
        withContext(NonCancellable) {
            repository.setPlayerOffline(_activeSectorId.value)
        }
    }

    private companion object {
        const val TAG = "ZoneMultiplayerVM"
        const val STOP_TIMEOUT_MILLIS = 5000L
    }
}
