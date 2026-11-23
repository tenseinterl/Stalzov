package com.example.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AuthMode {
    LOGIN,
    REGISTER
}

sealed interface AuthSessionState {
    data object Checking : AuthSessionState
    data object SignedOut : AuthSessionState
    data class SignedIn(val account: UserAccountEntity) : AuthSessionState
}

data class AuthFormState(
    val mode: AuthMode = AuthMode.LOGIN,
    val username: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isBusy: Boolean = false,
    val errorMessage: String? = null
)

data class LocalRadioMessage(
    val id: String,
    val callsign: String,
    val faction: String,
    val text: String
)

class AuthViewModel(
    private val repository: AccountRepository
) : ViewModel() {

    private val _sessionReady = MutableStateFlow(false)
    private val _formState = MutableStateFlow(AuthFormState())
    val formState: StateFlow<AuthFormState> = _formState.asStateFlow()

    private val _activeSectorId = MutableStateFlow("zone_1")
    val activeSectorId: StateFlow<String> = _activeSectorId.asStateFlow()

    private val _radioMessages = MutableStateFlow<List<LocalRadioMessage>>(emptyList())
    val radioMessages: StateFlow<List<LocalRadioMessage>> = _radioMessages.asStateFlow()

    val sessionState: StateFlow<AuthSessionState> = combine(
        _sessionReady,
        repository.currentAccount
    ) { ready, account ->
        when {
            !ready -> AuthSessionState.Checking
            account == null -> AuthSessionState.SignedOut
            else -> AuthSessionState.SignedIn(account)
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000L),
        initialValue = AuthSessionState.Checking
    )

    init {
        viewModelScope.launch {
            val existing = repository.verifyStoredSession()
            if (existing != null) {
                _activeSectorId.value = existing.sectorId
            }
            _sessionReady.value = true
        }
    }

    fun selectMode(mode: AuthMode) {
        _formState.update {
            it.copy(
                mode = mode,
                password = "",
                confirmPassword = "",
                errorMessage = null
            )
        }
    }

    fun onUsernameChanged(value: String) {
        _formState.update { it.copy(username = value.take(24), errorMessage = null) }
    }

    fun onPasswordChanged(value: String) {
        _formState.update { it.copy(password = value.take(64), errorMessage = null) }
    }

    fun onConfirmPasswordChanged(value: String) {
        _formState.update { it.copy(confirmPassword = value.take(64), errorMessage = null) }
    }

    fun submit() {
        val current = _formState.value
        if (current.isBusy) return

        viewModelScope.launch {
            _formState.update { it.copy(isBusy = true, errorMessage = null) }
            val result = when (current.mode) {
                AuthMode.LOGIN -> repository.login(current.username, current.password)
                AuthMode.REGISTER -> repository.register(
                    current.username,
                    current.password,
                    current.confirmPassword
                )
            }
            result.onSuccess { account ->
                _activeSectorId.value = account.sectorId
                _radioMessages.value = emptyList()
                _formState.value = AuthFormState()
            }.onFailure { error ->
                _formState.update {
                    it.copy(
                        isBusy = false,
                        errorMessage = error.message ?: "Ошибка авторизации"
                    )
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
            _radioMessages.value = emptyList()
            _formState.value = AuthFormState()
        }
    }

    fun saveProfile(
        accountId: Long,
        faction: String,
        money: Long,
        kills: Long,
        deaths: Long,
        artifactsFound: Long,
        primaryWeaponId: String,
        secondaryWeaponId: String,
        armorId: String
    ) {
        viewModelScope.launch {
            repository.saveProfile(
                accountId = accountId,
                faction = faction,
                money = money,
                kills = kills,
                deaths = deaths,
                artifactsFound = artifactsFound,
                primaryWeaponId = primaryWeaponId,
                secondaryWeaponId = secondaryWeaponId,
                armorId = armorId,
                sectorId = _activeSectorId.value
            )
        }
    }

    fun switchSector(accountId: Long, sectorId: String) {
        val safeSector = if (sectorId == "zone_2") "zone_2" else "zone_1"
        _activeSectorId.value = safeSector
        viewModelScope.launch {
            repository.updateSector(accountId, safeSector)
        }
    }

    fun addLocalRadioMessage(callsign: String, faction: String, text: String) {
        val cleaned = text.trim().take(160)
        if (cleaned.isEmpty()) return
        val safeFaction = if (faction == "bandit") "bandit" else "stalker"
        val msg = LocalRadioMessage(
            id = "local_${System.currentTimeMillis()}",
            callsign = callsign,
            faction = safeFaction,
            text = cleaned
        )
        _radioMessages.update { (it + msg).takeLast(30) }
    }
}
