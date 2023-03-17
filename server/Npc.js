import Character from "./Character";
import { getCharacterDirection, distanceTo } from "./utils";
const START_AGGRO_RANGE = 150;

class Npc extends Character {
  constructor(scene, args) {
    super(scene, args);
    this.scene = scene;
    this.state.isRobot = true;
    this.respawnTime = 10000;
  }
  setDead() {
    this.state.isDead = true;
    this.state.deadTime = Date.now();
    this.state.lockedPlayerId = null;
    this.bubbleMessage = null;
    this.vx = 0;
    this.vy = 0;
    this.body.setVelocity(this.vx, this.vy);
  }
  tryRespawn() {
    if (!this.state.isDead) return;
    if (Date.now() - this.state.deadTime >= this.respawnTime) {
      this.state.isDead = false;
      this.stats.hp = this.stats.maxHp;
      this.scene.io.to(this.room.name).emit("respawnNpc", this?.id);
    }
  }
  update(time) {
    const { state } = this || {};
    this.doRegen();
    this.tryRespawn();
    if (state.isDead) return;
    if (state.isAggro && !state.lockedPlayerId) {
      state.lockedPlayerId = this.room?.playerManager?.getNearestPlayer(this)?.socketId;
    }
    const targetPlayer = this.scene?.players?.[this?.state?.lockedPlayerId];
    const isNearPlayer = targetPlayer && distanceTo(this, targetPlayer) <= START_AGGRO_RANGE;
    if (targetPlayer && isNearPlayer) {
      this.moveTowardPlayer(targetPlayer);
    } else {
      state.lockedPlayerId = null;
      this.moveRandomly(time);
    }
  }
  moveTowardPlayer(player) {
    const speed = this.stats.speed;
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    this.vx = speed * Math.cos(angle);
    this.vy = speed * Math.sin(angle);
    this.bubbleMessage = "!";
    this.body.setVelocity(this.vx, this.vy);
    this.direction = getCharacterDirection(this, { x: this?.x + this.vx, y: this.y + this.vy });
  }
  moveRandomly(time) {
    if (time % 4 > 1) return;
    const randNumber = Math.floor(Math.random() * 6 + 1);
    const speed = this.stats.speed / 2;
    switch (randNumber) {
      case 1:
        this.vx = -speed;
        this.direction = "left";
        break;
      case 2:
        this.vx = speed;
        this.direction = "right";
        break;
      case 3:
        this.vy = -speed;
        this.direction = "up";
        break;
      case 4:
        this.vy = speed;
        this.direction = "down";
        break;
      default:
        this.vy = 0;
        this.vx = 0;
    }
    this.bubbleMessage = null;
    this.body.setVelocity(this.vx, this.vy);
  }
}

export default Npc;
