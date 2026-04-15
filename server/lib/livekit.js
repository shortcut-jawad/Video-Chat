import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

/**
 * Create a LiveKit access token for a user to join a specific room.
 *
 * @param {string} userId   – unique participant identity
 * @param {string} roomName – the room to grant access to
 * @param {string} [name]   – human-readable display name
 * @returns {Promise<string>} signed JWT
 */
export async function createRoomToken(userId, roomName, name) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error(
      "Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET environment variables"
    );
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    name: name ?? userId,
    ttl: "1h"
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  return await token.toJwt();
}
