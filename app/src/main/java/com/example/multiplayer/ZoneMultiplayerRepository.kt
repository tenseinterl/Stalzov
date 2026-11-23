package com.example.multiplayer

import android.content.Context
import com.example.R
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import java.util.UUID

class ZoneMultiplayerRepository(
    private val db: FirebaseFirestore,
    private val auth: FirebaseAuth = Firebase.auth
) {
    constructor(context: Context) : this(
        FirebaseFirestore.getInstance(
            context.applicationContext.getString(R.string.firestore_database_id)
        )
    )

    private var profileDocExists = false
    private val createdPresenceSectors = mutableSetOf<String>()

    private fun requireUserId(): String {
        val uid = auth.currentUser?.uid
        if (uid.isNullOrBlank()) {
            throw IllegalStateException("User must be signed in with Google before accessing Firestore.")
        }
        return uid
    }

    fun observeSectorPlayers(sectorId: String): Flow<List<SectorPlayer>> = flow {
        val uid = requireUserId()
        val safeSector = sanitizeSectorId(sectorId)
        val path = "sectors/$safeSector/players"
        emitAll(
            db.collection("sectors")
                .document(safeSector)
                .collection("players")
                .whereEqualTo("sectorId", safeSector)
                .whereEqualTo("online", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        SectorPlayer::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                }
                .catch { error ->
                    val firestoreError = generateSequence(error) { it.cause }
                        .filterIsInstance<FirebaseFirestoreException>()
                        .firstOrNull()
                    if (firestoreError == null && error is CancellationException) throw error
                    val exceptionToLog = firestoreError ?: (error as? Exception)
                    if (exceptionToLog != null && auth.currentUser?.uid == uid) {
                        handleFirestoreError(exceptionToLog, OperationType.LIST, path)
                    }
                    throw error
                }
        )
    }

    fun observeIncomingPvpHits(sectorId: String, targetUserId: String): Flow<List<PvpHitEvent>> = flow {
        val uid = requireUserId()
        check(uid == targetUserId) { "Signed-in user changed; refusing cross-user PvP listener." }
        val safeSector = sanitizeSectorId(sectorId)
        val path = "sectors/$safeSector/pvp_hits"
        emitAll(
            db.collection("sectors")
                .document(safeSector)
                .collection("pvp_hits")
                .whereEqualTo("targetUid", uid)
                .whereEqualTo("sectorId", safeSector)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        PvpHitEvent::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                }
                .catch { error ->
                    val firestoreError = generateSequence(error) { it.cause }
                        .filterIsInstance<FirebaseFirestoreException>()
                        .firstOrNull()
                    if (firestoreError == null && error is CancellationException) throw error
                    val exceptionToLog = firestoreError ?: (error as? Exception)
                    if (exceptionToLog != null && auth.currentUser?.uid == uid) {
                        handleFirestoreError(exceptionToLog, OperationType.LIST, path)
                    }
                    throw error
                }
        )
    }

    fun observeSectorChat(sectorId: String): Flow<List<SectorChatMessage>> = flow {
        val uid = requireUserId()
        val safeSector = sanitizeSectorId(sectorId)
        val path = "sectors/$safeSector/chat"
        emitAll(
            db.collection("sectors")
                .document(safeSector)
                .collection("chat")
                .whereEqualTo("sectorId", safeSector)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        SectorChatMessage::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    ).sortedBy { it.createdAt ?: Timestamp(0, 0) }
                        .takeLast(35)
                }
                .catch { error ->
                    val firestoreError = generateSequence(error) { it.cause }
                        .filterIsInstance<FirebaseFirestoreException>()
                        .firstOrNull()
                    if (firestoreError == null && error is CancellationException) throw error
                    val exceptionToLog = firestoreError ?: (error as? Exception)
                    if (exceptionToLog != null && auth.currentUser?.uid == uid) {
                        handleFirestoreError(exceptionToLog, OperationType.LIST, path)
                    }
                    throw error
                }
        )
    }

    suspend fun loadCloudProfile(): Result<CloudUserProfile?> {
        var docPath = "users/unauthenticated"
        return try {
            val uid = requireUserId()
            docPath = "users/$uid"
            val snap = db.collection("users").document(uid).get().await()
            if (snap.exists()) {
                profileDocExists = true
                Result.success(
                    snap.toObject(
                        CloudUserProfile::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                )
            } else {
                profileDocExists = false
                Result.success(null)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.GET, docPath)
            Result.failure(e)
        }
    }

    suspend fun syncCloudProfile(
        callsign: String,
        faction: String,
        money: Long,
        kills: Long,
        deaths: Long,
        artifactsFound: Long,
        primaryWeaponId: String,
        secondaryWeaponId: String,
        armorId: String,
        sectorId: String
    ): Result<Unit> {
        var docPath = "users/unauthenticated"
        return try {
            val uid = requireUserId()
            docPath = "users/$uid"
            val docRef = db.collection("users").document(uid)
            val safeCallsign = sanitizeCallsign(callsign)
            val safeFaction = sanitizeFaction(faction)
            val safeMoney = money.coerceIn(0L, 999_999_999L)
            val safeKills = kills.coerceIn(0L, 1_000_000L)
            val safeDeaths = deaths.coerceIn(0L, 1_000_000L)
            val safeArts = artifactsFound.coerceIn(0L, 1_000_000L)
            val safeArmor = sanitizeShortId(armorId, "leather")
            val safePrimary = sanitizeShortId(primaryWeaponId, "ak74m")
            val safeSecondary = sanitizeShortId(secondaryWeaponId, "pm")
            val safeSector = sanitizeSectorId(sectorId)

            if (!profileDocExists) {
                val snap = docRef.get().await()
                profileDocExists = snap.exists()
            }

            if (profileDocExists) {
                val updatePayload = mapOf(
                    "callsign" to safeCallsign,
                    "faction" to safeFaction,
                    "money" to safeMoney,
                    "kills" to safeKills,
                    "deaths" to safeDeaths,
                    "artifactsFound" to safeArts,
                    "armorId" to safeArmor,
                    "primaryWeaponId" to safePrimary,
                    "secondaryWeaponId" to safeSecondary,
                    "sectorId" to safeSector,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.update(updatePayload).await()
            } else {
                val createPayload = mapOf(
                    "userId" to uid,
                    "callsign" to safeCallsign,
                    "faction" to safeFaction,
                    "money" to safeMoney,
                    "kills" to safeKills,
                    "deaths" to safeDeaths,
                    "artifactsFound" to safeArts,
                    "armorId" to safeArmor,
                    "primaryWeaponId" to safePrimary,
                    "secondaryWeaponId" to safeSecondary,
                    "sectorId" to safeSector,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.set(createPayload).await()
                profileDocExists = true
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docPath)
            Result.failure(e)
        }
    }

    suspend fun upsertPlayerPresence(
        sectorId: String,
        callsign: String,
        faction: String,
        weaponId: String,
        x: Double,
        y: Double,
        z: Double,
        yaw: Double,
        hp: Long,
        moving: Boolean,
        firing: Boolean
    ): Result<Unit> {
        var docPath = "sectors/$sectorId/players/unauthenticated"
        return try {
            val uid = requireUserId()
            val safeSector = sanitizeSectorId(sectorId)
            val docRef = db.collection("sectors").document(safeSector).collection("players").document(uid)
            docPath = docRef.path

            val safeCallsign = sanitizeCallsign(callsign)
            val safeFaction = sanitizeFaction(faction)
            val safeWeapon = sanitizeShortId(weaponId, "ak74m")
            val safeX = x.coerceIn(-299.0, 299.0)
            val safeY = y.coerceIn(-19.0, 119.0)
            val safeZ = z.coerceIn(-299.0, 299.0)
            val safeYaw = yaw.coerceIn(-999.0, 999.0)
            val safeHp = hp.coerceIn(0L, 200L)

            if (!createdPresenceSectors.contains(safeSector)) {
                val snap = docRef.get().await()
                if (snap.exists()) {
                    createdPresenceSectors.add(safeSector)
                }
            }

            if (createdPresenceSectors.contains(safeSector)) {
                val updatePayload = mapOf(
                    "callsign" to safeCallsign,
                    "faction" to safeFaction,
                    "weaponId" to safeWeapon,
                    "x" to safeX,
                    "y" to safeY,
                    "z" to safeZ,
                    "yaw" to safeYaw,
                    "hp" to safeHp,
                    "moving" to moving,
                    "firing" to firing,
                    "online" to true,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.update(updatePayload).await()
            } else {
                val createPayload = mapOf(
                    "userId" to uid,
                    "sectorId" to safeSector,
                    "callsign" to safeCallsign,
                    "faction" to safeFaction,
                    "weaponId" to safeWeapon,
                    "x" to safeX,
                    "y" to safeY,
                    "z" to safeZ,
                    "yaw" to safeYaw,
                    "hp" to safeHp,
                    "moving" to moving,
                    "firing" to firing,
                    "online" to true,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.set(createPayload).await()
                createdPresenceSectors.add(safeSector)
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docPath)
            Result.failure(e)
        }
    }

    suspend fun setPlayerOffline(sectorId: String): Result<Unit> {
        var docPath = "sectors/$sectorId/players/unauthenticated"
        return try {
            val uid = auth.currentUser?.uid ?: return Result.success(Unit)
            val safeSector = sanitizeSectorId(sectorId)
            val docRef = db.collection("sectors").document(safeSector).collection("players").document(uid)
            docPath = docRef.path
            if (createdPresenceSectors.contains(safeSector)) {
                docRef.update(
                    mapOf(
                        "online" to false,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun sendPvpHit(
        sectorId: String,
        attackerName: String,
        attackerFaction: String,
        targetUid: String,
        damage: Long,
        headshot: Boolean,
        weapon: String
    ): Result<Unit> {
        var docPath = "sectors/$sectorId/pvp_hits"
        return try {
            val uid = requireUserId()
            val safeSector = sanitizeSectorId(sectorId)
            val safeTarget = targetUid.trim()
            if (safeTarget.isEmpty() || safeTarget == uid || !safeTarget.matches(Regex("^[a-zA-Z0-9_\\-]{1,128}$"))) {
                return Result.failure(IllegalArgumentException("Invalid PvP target UID"))
            }
            val hitId = "hit_${UUID.randomUUID().toString().replace("-", "")}"
            val docRef = db.collection("sectors").document(safeSector).collection("pvp_hits").document(hitId)
            docPath = docRef.path
            val payload = mapOf(
                "attackerUid" to uid,
                "attackerName" to sanitizeCallsign(attackerName),
                "attackerFaction" to sanitizeFaction(attackerFaction),
                "targetUid" to safeTarget,
                "sectorId" to safeSector,
                "damage" to damage.coerceIn(1L, 120L),
                "headshot" to headshot,
                "weapon" to sanitizeShortId(weapon, "АК-74М", 48),
                "createdAt" to FieldValue.serverTimestamp()
            )
            docRef.set(payload).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun consumePvpHit(sectorId: String, hitId: String): Result<Unit> {
        var docPath = "sectors/$sectorId/pvp_hits/$hitId"
        return try {
            requireUserId()
            val safeSector = sanitizeSectorId(sectorId)
            if (hitId.isBlank()) return Result.success(Unit)
            val docRef = db.collection("sectors").document(safeSector).collection("pvp_hits").document(hitId)
            docPath = docRef.path
            docRef.delete().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, docPath)
            Result.failure(e)
        }
    }

    suspend fun sendChatMessage(
        sectorId: String,
        callsign: String,
        faction: String,
        text: String
    ): Result<Unit> {
        var docPath = "sectors/$sectorId/chat"
        return try {
            val uid = requireUserId()
            val safeSector = sanitizeSectorId(sectorId)
            val cleanText = text.trim().take(160)
            if (cleanText.isEmpty()) return Result.success(Unit)
            val msgId = "msg_${UUID.randomUUID().toString().replace("-", "")}"
            val docRef = db.collection("sectors").document(safeSector).collection("chat").document(msgId)
            docPath = docRef.path
            val payload = mapOf(
                "userId" to uid,
                "sectorId" to safeSector,
                "callsign" to sanitizeCallsign(callsign),
                "faction" to sanitizeFaction(faction),
                "text" to cleanText,
                "createdAt" to FieldValue.serverTimestamp()
            )
            docRef.set(payload).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, docPath)
            Result.failure(e)
        }
    }
}
