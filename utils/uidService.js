const pool = require("../config/db");

function normalizeUid(uid) {
    return String(uid || "").trim();
}

function isUniqueViolation(error, constraintName) {
    return error?.code === "23505" && (!constraintName || error?.constraint === constraintName);
}

async function getUserUID(discordId) {
    const result = await pool.query(
        `SELECT discord_id, uid, registered_by, registered_at, updated_by, updated_at
         FROM users
         WHERE discord_id = $1
           AND uid IS NOT NULL
           AND uid <> ''`,
        [discordId]
    );

    return result.rows[0] || null;
}

async function findUID(uid) {
    const result = await pool.query(
        `SELECT discord_id, uid, registered_by, registered_at, updated_by, updated_at
         FROM users
         WHERE uid = $1`,
        [normalizeUid(uid)]
    );

    return result.rows[0] || null;
}

async function registerUID({ targetId, uid, performedById }) {
    const normalizedUid = normalizeUid(uid);
    if (!normalizedUid) {
        const error = new Error("UID cannot be empty");
        error.code = "INVALID_UID";
        throw error;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existingUser = await client.query(
            `SELECT discord_id, uid
             FROM users
             WHERE discord_id = $1`,
            [targetId]
        );
        if (existingUser.rows.length > 0 && existingUser.rows[0].uid) {
            const error = new Error("Target already has a UID");
            error.code = "TARGET_HAS_UID";
            throw error;
        }

        const existingUID = await client.query(
            `SELECT 1 FROM users WHERE uid = $1`,
            [normalizedUid]
        );
        if (existingUID.rows.length > 0) {
            const error = new Error("UID already exists");
            error.code = "UID_EXISTS";
            throw error;
        }

        const upsertResult = await client.query(
            `INSERT INTO users (discord_id, uid, registered_by, registered_at, updated_by, updated_at)
             VALUES ($1, $2, $3, NOW(), NULL, NULL)
             ON CONFLICT (discord_id) DO UPDATE
             SET uid = EXCLUDED.uid,
                 registered_by = EXCLUDED.registered_by,
                 registered_at = EXCLUDED.registered_at,
                 updated_by = NULL,
                 updated_at = NULL
             RETURNING discord_id, uid, registered_by, registered_at, updated_by, updated_at`,
            [targetId, normalizedUid, performedById]
        );

        await client.query(
            `INSERT INTO uid_logs (discord_id, old_uid, new_uid, action, performed_by, performed_at)
             VALUES ($1, $2, $3, 'REGISTER_UID', $4, NOW())`,
            [targetId, null, normalizedUid, performedById]
        );

        await client.query("COMMIT");
        return upsertResult.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
            const dbError = new Error("UID already exists");
            dbError.code = "UID_EXISTS";
            throw dbError;
        }
        throw error;
    } finally {
        client.release();
    }
}

async function changeUID({ targetId, uid, performedById }) {
    const normalizedUid = normalizeUid(uid);
    if (!normalizedUid) {
        const error = new Error("UID cannot be empty");
        error.code = "INVALID_UID";
        throw error;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const currentUserResult = await client.query(
            `SELECT discord_id, uid, registered_by, registered_at, updated_by, updated_at
             FROM users
             WHERE discord_id = $1`,
            [targetId]
        );
        const currentUser = currentUserResult.rows[0];
        if (!currentUser) {
            const error = new Error("Target does not have a UID");
            error.code = "TARGET_NO_UID";
            throw error;
        }

        const existingUID = await client.query(
            `SELECT discord_id FROM users WHERE uid = $1`,
            [normalizedUid]
        );
        if (existingUID.rows.length > 0 && existingUID.rows[0].discord_id !== targetId) {
            const error = new Error("UID already belongs to another user");
            error.code = "UID_EXISTS";
            throw error;
        }

        const result = await client.query(
            `UPDATE users
             SET uid = $1,
                 updated_by = $2,
                 updated_at = NOW()
             WHERE discord_id = $3
             RETURNING discord_id, uid, registered_by, registered_at, updated_by, updated_at`,
            [normalizedUid, performedById, targetId]
        );

        await client.query(
            `INSERT INTO uid_logs (discord_id, old_uid, new_uid, action, performed_by, performed_at)
             VALUES ($1, $2, $3, 'CHANGE_UID', $4, NOW())`,
            [targetId, currentUser.uid, normalizedUid, performedById]
        );

        await client.query("COMMIT");
        return { currentUser, updatedUser: result.rows[0] };
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
            const dbError = new Error("UID already exists");
            dbError.code = "UID_EXISTS";
            throw dbError;
        }
        throw error;
    } finally {
        client.release();
    }
}

async function getUserInfoByDiscordId(discordId) {
    const result = await pool.query(
        `SELECT u.discord_id, u.uid, u.registered_by, u.registered_at, u.updated_by, u.updated_at
         FROM users u
         WHERE u.discord_id = $1`,
        [discordId]
    );

    return result.rows[0] || null;
}

async function getUserInfoByUID(uid) {
    const result = await pool.query(
        `SELECT u.discord_id, u.uid, u.registered_by, u.registered_at, u.updated_by, u.updated_at
         FROM users u
         WHERE u.uid = $1`,
        [normalizeUid(uid)]
    );

    return result.rows[0] || null;
}

module.exports = {
    normalizeUid,
    isUniqueViolation,
    getUserUID,
    findUID,
    registerUID,
    changeUID,
    getUserInfoByDiscordId,
    getUserInfoByUID,
};
