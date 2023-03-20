import Player from "./Player";
import LootItem from "./LootItem";

function addPlayer(scene, user) {
  const player = new Player(scene, user);
  scene.add.existing(player);
  scene.players.add(player);
  return player;
}

function removePlayer(scene, socketId) {
  if (!scene.players) return;
  const player = getPlayer(scene, socketId);
  player?.destroy(true);
}

function resetEntities(scene) {
  scene?.map?.destroy?.(true);
  scene?.players?.destroy?.(true);
  scene?.npcs?.destroy?.(true);
  scene?.loots?.destroy?.(true);
  scene?.doors?.destroy?.(true);
  scene.players = scene.physics.add.group();
  scene.npcs = scene.physics.add.group();
  scene.loots = scene.physics.add.group();
  scene.doors = scene.physics.add.staticGroup();
}

function getPlayer(scene, socketId) {
  if (!scene.players) return;
  return scene.players.getChildren().find((player) => socketId === player.socketId);
}

function getNpc(scene, id) {
  if (!scene.npcs) return;
  return scene.npcs.getChildren().find((npc) => id === npc.id);
}

function getLoot(scene, id) {
  if (!scene.loots) return;
  return scene.loots.getChildren().find((loot) => id === loot.id);
}

function addLoot(scene, lootData) {
  const loot = new LootItem(scene, lootData);
  scene.add.existing(loot);
  scene.loots.add(loot);
  return loot;
}

function addNpc(scene, npcData) {
  const npc = new Player(scene, npcData);
  scene.add.existing(npc);
  scene.npcs.add(npc);
  return npc;
}

// Ensures sprite speed doesnt exceed maxVelocity while update is called (from Phaser example)
function constrainVelocity(sprite, maxVelocity) {
  if (!sprite || !sprite.body) return;

  var angle, currVelocitySqr, vx, vy;
  vx = sprite.body.velocity.x;
  vy = sprite.body.velocity.y;
  currVelocitySqr = vx * vx + vy * vy;

  if (currVelocitySqr > maxVelocity * maxVelocity) {
    angle = Math.atan2(vy, vx);
    vx = Math.cos(angle) * maxVelocity;
    vy = Math.sin(angle) * maxVelocity;
    sprite.body.velocity.x = vx;
    sprite.body.velocity.y = vy;
  }
}

function getSpinDirection(hero, point) {
  const dx = point.x - hero.x;
  const dy = point.y - hero.y;

  // determine which direction has the greatest distance
  if (Math.abs(dx) >= Math.abs(dy)) {
    // horizontal distance is greater than or equal to vertical distance
    if (dx > 0) {
      return "right";
    } else {
      return "left";
    }
  } else {
    // vertical distance is greater than horizontal distance
    if (dy > 0) {
      return "down";
    } else {
      return "up";
    }
  }
}

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  navigator.userAgent
);

function trimCanvas(c) {
  let ctx = c.getContext("2d"),
    pixels = ctx.getImageData(0, 0, c.width, c.height),
    l = pixels.data.length,
    i,
    bound = {
      top: null,
      left: null,
      right: null,
      bottom: null,
    },
    x,
    y;

  for (i = 0; i < l; i += 4) {
    if (pixels.data[i + 3] !== 0) {
      x = (i / 4) % c.width;
      y = ~~(i / 4 / c.width);

      if (bound.top === null) {
        bound.top = y;
      }

      if (bound.left === null) {
        bound.left = x;
      } else if (x < bound.left) {
        bound.left = x;
      }

      if (bound.right === null) {
        bound.right = x;
      } else if (bound.right < x) {
        bound.right = x;
      }

      if (bound.bottom === null) {
        bound.bottom = y;
      } else if (bound.bottom < y) {
        bound.bottom = y;
      }
    }
  }

  var trimHeight = bound.bottom + 1 - bound.top,
    trimWidth = bound.right + 1 - bound.left,
    trimmed = ctx.getImageData(bound.left, bound.top, trimWidth, trimHeight),
    copy = document.createElement("canvas").getContext("2d");

  copy.canvas.width = trimWidth;
  copy.canvas.height = trimHeight;
  copy.putImageData(trimmed, 0, 0);
  return copy.canvas;
}

const imageToCanvas = (image) => {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return canvas;
};

function tintCanvas(c, tint = "0xFFFFFF") {
  let ctx = c.getContext("2d"),
    copy = document.createElement("canvas").getContext("2d"),
    copy2 = document.createElement("canvas").getContext("2d"),
    copy3 = document.createElement("canvas").getContext("2d");

  const trimWidth = c?.width;
  const trimHeight = c?.height;

  const trimmed = ctx.getImageData(0, 0, trimWidth, trimHeight);

  copy.canvas.width = trimWidth;
  copy.canvas.height = trimHeight;
  copy2.canvas.width = trimWidth;
  copy2.canvas.height = trimHeight;
  copy3.canvas.width = trimWidth;
  copy3.canvas.height = trimHeight;

  copy.putImageData(trimmed, 0, 0);
  copy2.putImageData(trimmed, 0, 0);
  copy3.putImageData(trimmed, 0, 0);

  copy2.clearRect(0, 0, trimWidth, trimHeight);
  copy2.fillStyle = "#" + tint?.replace("0x", "");
  copy2.fillRect(0, 0, trimWidth, trimHeight);
  copy3.globalCompositeOperation = "source-in";
  copy3.drawImage(copy2.canvas, 0, 0, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);
  copy.globalCompositeOperation = "multiply";
  copy.drawImage(copy3.canvas, 0, 0, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);
  return copy.canvas;
}

function distanceTo(first, second) {
  let dx = second?.x - first?.x;
  let dy = second?.y - first?.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export {
  addPlayer,
  removePlayer,
  getPlayer,
  getNpc,
  addNpc,
  addLoot,
  getLoot,
  resetEntities,
  constrainVelocity,
  getSpinDirection,
  isMobile,
  trimCanvas,
  tintCanvas,
  imageToCanvas,
  distanceTo,
};
