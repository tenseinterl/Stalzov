package com.example.auth

import android.content.Context
import android.database.sqlite.SQLiteConstraintException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.withContext
import java.util.Locale

class AccountRepository(
    context: Context,
    private val accountDao: AccountDao
) {
    private val prefs = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE
    )

    private val activeAccountIdFlow = MutableStateFlow(loadStoredAccountId())

    @OptIn(ExperimentalCoroutinesApi::class)
    val currentAccount: Flow<UserAccountEntity?> = activeAccountIdFlow.flatMapLatest { id ->
        if (id > 0L) accountDao.observeAccountById(id) else flowOf(null)
    }

    suspend fun verifyStoredSession(): UserAccountEntity? = withContext(Dispatchers.IO) {
        val storedId = activeAccountIdFlow.value
        if (storedId <= 0L) return@withContext null
        val account = accountDao.getAccountById(storedId)
        if (account == null) {
            clearStoredAccountId()
        }
        account
    }

    suspend fun register(
        rawUsername: String,
        rawPassword: String,
        rawConfirmPassword: String
    ): Result<UserAccountEntity> = withContext(Dispatchers.IO) {
        val username = rawUsername.trim()
        validateUsername(username)?.let { return@withContext Result.failure(IllegalArgumentException(it)) }
        validatePassword(rawPassword)?.let { return@withContext Result.failure(IllegalArgumentException(it)) }
        if (rawPassword != rawConfirmPassword) {
            return@withContext Result.failure(IllegalArgumentException("Пароли не совпадают"))
        }

        val normalized = normalizeUsername(username)
        val existing = accountDao.findByUsernameLower(normalized)
        if (existing != null) {
            return@withContext Result.failure(IllegalArgumentException("Этот логин уже занят"))
        }

        val passwordChars = rawPassword.toCharArray()
        val hashed = try {
            PasswordHasher.hash(passwordChars)
        } finally {
            passwordChars.fill('\u0000')
        }

        val now = System.currentTimeMillis()
        val entity = UserAccountEntity(
            username = username,
            usernameLower = normalized,
            passwordSalt = hashed.saltBase64,
            passwordHash = hashed.hashBase64,
            createdAt = now,
            updatedAt = now
        )

        return@withContext try {
            val newId = accountDao.insertAccount(entity)
            val saved = entity.copy(id = newId)
            saveStoredAccountId(newId)
            Result.success(saved)
        } catch (_: SQLiteConstraintException) {
            Result.failure(IllegalArgumentException("Этот логин уже занят"))
        } catch (_: Exception) {
            Result.failure(IllegalStateException("Не удалось создать аккаунт. Попробуйте снова."))
        }
    }

    suspend fun login(
        rawUsername: String,
        rawPassword: String
    ): Result<UserAccountEntity> = withContext(Dispatchers.IO) {
        val username = rawUsername.trim()
        if (username.isEmpty() || rawPassword.isEmpty()) {
            return@withContext Result.failure(IllegalArgumentException("Введите логин и пароль"))
        }

        val normalized = normalizeUsername(username)
        val account = accountDao.findByUsernameLower(normalized)
            ?: return@withContext Result.failure(IllegalArgumentException(INVALID_CREDENTIALS_MSG))

        val passwordChars = rawPassword.toCharArray()
        val verified = try {
            PasswordHasher.verify(passwordChars, account.passwordSalt, account.passwordHash)
        } finally {
            passwordChars.fill('\u0000')
        }

        if (!verified) {
            return@withContext Result.failure(IllegalArgumentException(INVALID_CREDENTIALS_MSG))
        }

        saveStoredAccountId(account.id)
        Result.success(account)
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        clearStoredAccountId()
    }

    suspend fun saveProfile(
        accountId: Long,
        faction: String,
        money: Long,
        kills: Long,
        deaths: Long,
        artifactsFound: Long,
        primaryWeaponId: String,
        secondaryWeaponId: String,
        armorId: String,
        sectorId: String
    ) = withContext(Dispatchers.IO) {
        if (accountId <= 0L) return@withContext
        val safeFaction = if (faction == "bandit") "bandit" else "stalker"
        val safeSector = if (sectorId == "zone_2") "zone_2" else "zone_1"
        accountDao.updateProfile(
            accountId = accountId,
            faction = safeFaction,
            money = money.coerceAtLeast(0L),
            kills = kills.coerceAtLeast(0L),
            deaths = deaths.coerceAtLeast(0L),
            artifactsFound = artifactsFound.coerceAtLeast(0L),
            primaryWeaponId = primaryWeaponId.take(32).ifBlank { "ak74m" },
            secondaryWeaponId = secondaryWeaponId.take(32).ifBlank { "pm" },
            armorId = armorId.take(32).ifBlank { "jacket" },
            sectorId = safeSector,
            updatedAt = System.currentTimeMillis()
        )
    }

    suspend fun updateSector(accountId: Long, sectorId: String) = withContext(Dispatchers.IO) {
        if (accountId <= 0L) return@withContext
        val safeSector = if (sectorId == "zone_2") "zone_2" else "zone_1"
        accountDao.updateSector(accountId, safeSector, System.currentTimeMillis())
    }

    private fun loadStoredAccountId(): Long {
        return prefs.getLong(KEY_ACTIVE_ACCOUNT_ID, -1L)
    }

    private fun saveStoredAccountId(accountId: Long) {
        prefs.edit().putLong(KEY_ACTIVE_ACCOUNT_ID, accountId).apply()
        activeAccountIdFlow.value = accountId
    }

    private fun clearStoredAccountId() {
        prefs.edit().remove(KEY_ACTIVE_ACCOUNT_ID).apply()
        activeAccountIdFlow.value = -1L
    }

    private fun normalizeUsername(username: String): String {
        return username.trim().lowercase(Locale.ROOT)
    }

    private fun validateUsername(username: String): String? {
        if (username.length < 3 || username.length > 20) {
            return "Логин должен быть от 3 до 20 символов"
        }
        val valid = username.all { ch ->
            ch.isLetterOrDigit() || ch == '_' || ch == '-'
        }
        if (!valid) {
            return "Логин может содержать только буквы, цифры, _ и -"
        }
        return null
    }

    private fun validatePassword(password: String): String? {
        if (password.length < 6) {
            return "Пароль должен содержать минимум 6 символов"
        }
        if (password.length > 64) {
            return "Пароль слишком длинный (максимум 64 символа)"
        }
        return null
    }

    companion object {
        private const val PREFS_NAME = "stalzone_session_prefs"
        private const val KEY_ACTIVE_ACCOUNT_ID = "active_account_id"
        private const val INVALID_CREDENTIALS_MSG = "Неверный логин или пароль"
    }
}
