package com.example.multiplayer

import androidx.annotation.Keep
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.ServerTimestamp

sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
}

@Keep
@IgnoreExtraProperties
data class CloudUserProfile(
    @DocumentId val id: String = "",
    val userId: String = "",
    val callsign: String = "Сталкер",
    val faction: String = "stalker",
    val money: Long = 8500L,
    val kills: Long = 0L,
    val deaths: Long = 0L,
    val artifactsFound: Long = 0L,
    val armorId: String = "leather",
    val primaryWeaponId: String = "ak74m",
    val secondaryWeaponId: String = "pm",
    val sectorId: String = DEFAULT_SECTOR_ID,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class SectorPlayer(
    @DocumentId val id: String = "",
    val userId: String = "",
    val sectorId: String = DEFAULT_SECTOR_ID,
    val callsign: String = "Сталкер",
    val faction: String = "stalker",
    val weaponId: String = "ak74m",
    val x: Double = 0.0,
    val y: Double = 0.0,
    val z: Double = 0.0,
    val yaw: Double = 0.0,
    val hp: Long = 100L,
    val moving: Boolean = false,
    val firing: Boolean = false,
    val online: Boolean = true,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class PvpHitEvent(
    @DocumentId val id: String = "",
    val attackerUid: String = "",
    val attackerName: String = "Сталкер",
    val attackerFaction: String = "stalker",
    val targetUid: String = "",
    val sectorId: String = DEFAULT_SECTOR_ID,
    val damage: Long = 15L,
    val headshot: Boolean = false,
    val weapon: String = "АК-74М",
    @ServerTimestamp val createdAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class SectorChatMessage(
    @DocumentId val id: String = "",
    val userId: String = "",
    val sectorId: String = DEFAULT_SECTOR_ID,
    val callsign: String = "Сталкер",
    val faction: String = "stalker",
    val text: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null
)

const val DEFAULT_SECTOR_ID = "zone_1"

fun sanitizeCallsign(raw: String?): String {
    val cleaned = (raw ?: "Сталкер").trim().replace(Regex("\\s+"), " ")
    return if (cleaned.isEmpty()) "Сталкер" else cleaned.take(32)
}

fun sanitizeFaction(raw: String?): String = if (raw == "bandit") "bandit" else "stalker"

fun sanitizeShortId(raw: String?, fallback: String, maxLen: Int = 40): String {
    val cleaned = (raw ?: fallback).trim().take(maxLen)
    return if (cleaned.isEmpty()) fallback else cleaned
}

fun sanitizeSectorId(raw: String?): String {
    val cleaned = (raw ?: DEFAULT_SECTOR_ID).trim()
    return if (cleaned.matches(Regex("^[a-zA-Z0-9_\\-]{1,64}$"))) cleaned else DEFAULT_SECTOR_ID
}
