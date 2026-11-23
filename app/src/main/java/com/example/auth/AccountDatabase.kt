package com.example.auth

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(
    tableName = "user_accounts",
    indices = [Index(value = ["usernameLower"], unique = true)]
)
data class UserAccountEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    val username: String,
    val usernameLower: String,
    val passwordSalt: String,
    val passwordHash: String,
    val faction: String = "stalker",
    val money: Long = 2500L,
    val kills: Long = 0L,
    val deaths: Long = 0L,
    val artifactsFound: Long = 0L,
    val primaryWeaponId: String = "ak74m",
    val secondaryWeaponId: String = "pm",
    val armorId: String = "jacket",
    val sectorId: String = "zone_1",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

@Dao
interface AccountDao {
    @Query("SELECT * FROM user_accounts WHERE id = :accountId LIMIT 1")
    fun observeAccountById(accountId: Long): Flow<UserAccountEntity?>

    @Query("SELECT * FROM user_accounts WHERE id = :accountId LIMIT 1")
    suspend fun getAccountById(accountId: Long): UserAccountEntity?

    @Query("SELECT * FROM user_accounts WHERE usernameLower = :usernameLower LIMIT 1")
    suspend fun findByUsernameLower(usernameLower: String): UserAccountEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertAccount(account: UserAccountEntity): Long

    @Query(
        """
        UPDATE user_accounts
        SET faction = :faction,
            money = :money,
            kills = :kills,
            deaths = :deaths,
            artifactsFound = :artifactsFound,
            primaryWeaponId = :primaryWeaponId,
            secondaryWeaponId = :secondaryWeaponId,
            armorId = :armorId,
            sectorId = :sectorId,
            updatedAt = :updatedAt
        WHERE id = :accountId
        """
    )
    suspend fun updateProfile(
        accountId: Long,
        faction: String,
        money: Long,
        kills: Long,
        deaths: Long,
        artifactsFound: Long,
        primaryWeaponId: String,
        secondaryWeaponId: String,
        armorId: String,
        sectorId: String,
        updatedAt: Long
    )

    @Query("UPDATE user_accounts SET sectorId = :sectorId, updatedAt = :updatedAt WHERE id = :accountId")
    suspend fun updateSector(accountId: Long, sectorId: String, updatedAt: Long)
}

@Database(
    entities = [UserAccountEntity::class],
    version = 1,
    exportSchema = false
)
abstract class StalzoneDatabase : RoomDatabase() {
    abstract fun accountDao(): AccountDao

    companion object {
        @Volatile
        private var INSTANCE: StalzoneDatabase? = null

        fun getInstance(context: Context): StalzoneDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    StalzoneDatabase::class.java,
                    "stalzone_accounts.db"
                ).build().also { INSTANCE = it }
            }
        }
    }
}
