import Phaser from "phaser";

class Character extends Phaser.GameObjects.Container {
  constructor(scene, args) {
    const {
      x,
      y,
      socketId,
      id,
      isHero = false,
      room,
      equipment = {},
      inventory = [],
      profile,
      stats = {},
      bubbleMessage,
      kind,
      roomName,
      baseStats = {},
      direction,
      state = {},
    } = args;
    super(scene, x, y, []);
    this.startingCoords = { x, y };
    this.socketId = socketId;
    this.id = id;
    this.isHero = isHero;
    this.roomName = roomName;
    this.room = room;
    this.action = "stand";
    this.direction = direction || "down";
    this.currentSpeed = 0;
    this.vx = 0;
    this.vy = 0;
    this.kind = kind;
    this.state = {
      isRobot: false,
      isAggro: false,
      doHpRegen: false,
      doMpRegen: false,
      lastTeleport: Date.now(),
      deadTime: Date.now(),
      lastHpRegen: Date.now(),
      lastMpRegen: Date.now(),
      lastCombat: Date.now(),
      lastRegen: Date.now(),
      lastAttack: Date.now(),
      lastFlash: Date.now(),
      setFlash: false,
      isIdle: true,
      isAttacking: false,
      hasWeaponRight: false,
      hasWeaponLeft: false,
      isDead: false,
      activeSets: [],
      ...state,
    };
    this.profile = profile;
    this.equipment = equipment;
    this.inventory = inventory;
    this.baseStats = baseStats;
    this.stats = stats;
    this.bubbleMessage = bubbleMessage;
    scene.physics.add.existing(this);
    const bodySize = 8 * (this?.profile?.scale || 1);
    this.body.setCircle(bodySize, -bodySize, -bodySize);
  }
  modifyStat(key, amount) {
    const stat = this?.stats?.[key];
    const maxStat = this?.stats?.["max" + capitalize(key)];
    if (typeof stat === undefined) return;
    if (typeof maxStat === undefined) return;
    if (stat + amount > maxStat) {
      this.stats[key] = maxStat;
      return;
    }
    if (stat + amount < 0) {
      this.stats[key] = 0;
      return;
    }
    this.stats[key] += amount;
  }
  destroy() {
    if (this.scene) this.scene.events.off("update", this.update, this);
    if (this.scene) this.scene.physics.world.disable(this);
    super.destroy(true);
  }
}

function capitalize(str) {
  if (str.length == 0) return str;
  return str[0].toUpperCase() + str.substr(1);
}

export default Character;
