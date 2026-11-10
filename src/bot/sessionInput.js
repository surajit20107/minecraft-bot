import { logger } from "../utils/logger.js";

// Bedrock servers expect exactly one player_auth_input per server tick (50 ms) once the
// player has spawned. Without it the server-side player is considered idle/desynced and
// can be removed from the session, which makes Aternos start its "empty server" stop
// countdown even though the process still thinks it is connected.
const TICK_MS = 50;
const MAX_CATCHUP_TICKS = 4;
const EYE_HEIGHT = 1.62;
const LOOK_INTERVAL_MS = 12_000;
const LOOK_STEP_DEG = 1.2;
const PITCH_STEP_DEG = 0.6;
const MIN_PITCH = -25;
const MAX_PITCH = 25;

function isVec3(value) {
  return (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function approachAngle(current, target, step) {
  const diff = ((target - current + 540) % 360) - 180;
  if (Math.abs(diff) <= step) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(diff) * step);
}

function approach(current, target, step) {
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

function viewDirection(yaw, pitch) {
  // Bedrock wire yaw/pitch are degrees with the Java ("notchian") convention.
  const yawRad = (yaw * Math.PI) / 180;
  const pitchRad = (pitch * Math.PI) / 180;
  const cosPitch = Math.cos(pitchRad);
  return {
    x: -Math.sin(yawRad) * cosPitch,
    y: Math.sin(pitchRad),
    z: -Math.cos(yawRad) * cosPitch,
  };
}

/**
 * Keeps a Bedrock session alive by sending the per-tick player_auth_input packet the
 * vanilla client normally sends. Also performs lightweight anti-AFK looking so the
 * session does not look completely static to server-side idle checks.
 */
export class SessionInput {
  #getClient;
  #client = null;
  #listeners = [];
  #timer = null;
  #running = false;
  #anchorTick = 0n;
  #anchorTime = 0;
  #lastTick = null;
  #position = null; // eye-level wire position
  #onGround = true;
  #yaw = 0;
  #pitch = 0;
  #targetYaw = 0;
  #targetPitch = 0;
  #lastLookChange = 0;
  #packetsSent = 0;
  #startedAt = 0;
  #lastLogAt = 0;
  #handledTeleport = false;

  constructor(getClient) {
    this.#getClient = getClient;
  }

  get isRunning() {
    return this.#running;
  }

  get packetsSent() {
    return this.#packetsSent;
  }

  attach(client) {
    this.detach();
    if (!client) return;

    this.#client = client;
    this.#anchorTick = 0n;
    this.#anchorTime = performance.now();
    this.#lastTick = null;
    this.#position = null;
    this.#onGround = true;
    this.#handledTeleport = false;

    const add = (event, handler) => {
      client.on(event, handler);
      this.#listeners.push([event, handler]);
    };

    add("start_game", (packet) => {
      this.#anchor(packet.current_tick ?? 0n);
      // start_game rotation is a vec2f: { x: pitch, z: yaw }.
      if (packet.rotation) {
        this.#readRotation({
          x: packet.rotation.x,
          y: packet.rotation.y ?? packet.rotation.z,
        });
      }
      // start_game.y is often the spawn-search height (e.g. 32769), not the real
      // position. The real eye-level position arrives in respawn state 1.
      const p = packet.player_position;
      if (isVec3(p) && Math.abs(p.y) < 1000) {
        this.#setPosition({ x: p.x, y: p.y + EYE_HEIGHT, z: p.z });
      }
    });

    add("respawn", (packet) => {
      // state 1 = ready to spawn, carries the real eye-level position.
      if (Number(packet.state) !== 1) return;
      if (isVec3(packet.position)) this.#setPosition(packet.position);
    });

    add("move_player", (packet) => {
      const selfId = client.entityId;
      if (selfId == null) return;
      let isSelf = false;
      try {
        isSelf = BigInt(packet.runtime_id) === BigInt(selfId);
      } catch (_) {
        isSelf = packet.runtime_id === selfId;
      }
      if (!isSelf) return;
      if (packet.mode !== "rotation" && isVec3(packet.position)) {
        this.#setPosition(packet.position);
      }
      if (packet.mode === "teleport" || packet.mode === "reset") {
        this.#handledTeleport = true;
      }
      this.#onGround =
        typeof packet.on_ground === "boolean" ? packet.on_ground : this.#onGround;
      this.#readRotation({ x: packet.pitch, y: packet.yaw });
      this.#maybeAnchorAhead(packet.tick);
    });

    add("correct_player_move_prediction", (packet) => {
      if (packet.prediction_type === "vehicle") return;
      if (isVec3(packet.position)) this.#setPosition(packet.position);
      if (typeof packet.on_ground === "boolean") this.#onGround = packet.on_ground;

      // If the server clock is ahead of our estimate, move our anchor forward. This
      // keeps tick numbers inside the server's rewind window after long uptimes.
      this.#maybeAnchorAhead(packet.tick);
    });
  }

  detach() {
    this.stop();
    if (this.#client) {
      for (const [event, handler] of this.#listeners) {
        this.#client.removeListener(event, handler);
      }
    }
    this.#listeners = [];
    this.#client = null;
    this.#position = null;
    this.#lastTick = null;
    this.#handledTeleport = false;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#packetsSent = 0;
    this.#startedAt = performance.now();
    this.#lastLogAt = this.#startedAt;
    // Pick the first look target immediately instead of waiting a full interval.
    this.#lastLookChange = this.#startedAt - LOOK_INTERVAL_MS;
    this.#lastTick = null;

    this.#pump();
    this.#timer = setInterval(() => this.#pump(), TICK_MS);
    this.#timer.unref?.();
    logger.info(
      "Session input heartbeat started (1 player_auth_input per server tick) to keep the Bot session alive."
    );
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.#running) {
      logger.info(
        `Session input heartbeat stopped after ${this.#packetsSent} packets.`
      );
    }
    this.#running = false;
    this.#lastTick = null;
  }

  #anchor(tick, at = performance.now()) {
    this.#anchorTick = BigInt(tick ?? 0);
    this.#anchorTime = at;
  }

  #currentTick(at = performance.now()) {
    return (
      this.#anchorTick + BigInt(Math.round((at - this.#anchorTime) / TICK_MS))
    );
  }

  #maybeAnchorAhead(tick) {
    if (tick == null) return;
    let serverTick;
    try {
      serverTick = BigInt(tick);
    } catch (_) {
      return;
    }
    if (serverTick > this.#currentTick()) {
      this.#anchor(serverTick, performance.now());
    }
  }

  #setPosition(position) {
    this.#position = {
      x: Number(position.x),
      y: Number(position.y),
      z: Number(position.z),
    };
  }

  #readRotation(rotation) {
    if (!rotation) return;
    if (Number.isFinite(rotation.y)) {
      this.#yaw = normalizeAngle(rotation.y);
      this.#targetYaw = this.#yaw;
    }
    if (Number.isFinite(rotation.x)) {
      this.#pitch = rotation.x;
      this.#targetPitch = this.#pitch;
    }
  }

  #pump() {
    if (!this.#running) return;
    const client = this.#getClient();
    if (!client) return;

    const now = performance.now();
    const target = this.#currentTick(now);

    // No authoritative position yet (still loading). Keep the clock moving so we do
    // not send a burst of stale ticks once the position arrives.
    if (!this.#position) {
      if (this.#lastTick === null || target > this.#lastTick) {
        this.#lastTick = target;
      }
      return;
    }

    if (this.#lastTick === null) this.#lastTick = target - 1n;
    let first = this.#lastTick + 1n;
    if (target < first) return;

    if (target - first + 1n > BigInt(MAX_CATCHUP_TICKS)) {
      first = target - BigInt(MAX_CATCHUP_TICKS) + 1n;
    }

    for (let tick = first; tick <= target; tick++) {
      this.#send(client, tick, now);
      this.#lastTick = tick;
    }

    if (now - this.#lastLogAt >= 5 * 60_000) {
      this.#lastLogAt = now;
      const minutes = Math.max(1, Math.round((now - this.#startedAt) / 60_000));
      logger.info(
        `Session input heartbeat alive: ${this.#packetsSent} packets in ${minutes}m, ` +
          `position ${this.#position.x.toFixed(1)},${this.#position.y.toFixed(1)},${this.#position.z.toFixed(1)}.`
      );
    }
  }

  #updateLook(now) {
    if (now - this.#lastLookChange >= LOOK_INTERVAL_MS) {
      this.#lastLookChange = now;
      // Look somewhere nearby, not a full spin, so movement stays plausible.
      this.#targetYaw = normalizeAngle(this.#yaw + (Math.random() * 120 - 60));
      this.#targetPitch =
        MIN_PITCH + Math.random() * (MAX_PITCH - MIN_PITCH);
    }

    this.#yaw = approachAngle(this.#yaw, this.#targetYaw, LOOK_STEP_DEG);
    this.#pitch = approach(this.#pitch, this.#targetPitch, PITCH_STEP_DEG);
    this.#pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.#pitch));
  }

  #send(client, tick, now) {
    this.#updateLook(now);

    // 1.26.40 changed input_data from a bitfield to a string array. Sending an empty
    // bitfield keeps the packet valid for older versions too.
    const listInputs =
      typeof client.versionGreaterThanOrEqualTo === "function" &&
      client.versionGreaterThanOrEqualTo("1.26.40");
    const inputData = listInputs
      ? [
          "block_breaking_delay_enabled",
          ...(this.#onGround ? ["vertical_collision"] : []),
          ...(this.#handledTeleport ? ["handled_teleport"] : []),
        ]
      : 0;
    this.#handledTeleport = false;

    try {
      client.queue("player_auth_input", {
        pitch: this.#pitch,
        yaw: this.#yaw,
        position: this.#position,
        move_vector: { x: 0, z: 0 },
        head_yaw: this.#yaw,
        input_data: inputData,
        input_mode: "mouse",
        play_mode: "normal",
        interaction_model: "crosshair",
        interact_rotation: { x: this.#pitch, z: this.#yaw },
        tick,
        delta: { x: 0, y: 0, z: 0 },
        analogue_move_vector: { x: 0, z: 0 },
        camera_orientation: viewDirection(this.#yaw, this.#pitch),
        raw_move_vector: { x: 0, z: 0 },
      });
      this.#packetsSent++;
    } catch (err) {
      logger.error("Failed to send player_auth_input:", err?.message ?? err);
    }
  }
}
