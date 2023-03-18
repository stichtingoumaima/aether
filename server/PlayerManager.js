import Player from "./Player";
import { distanceTo } from "./utils";
class PlayerManager {
  constructor(scene, room) {
    this.scene = scene;
    this.room = room;
    this.players = scene.physics.add.group();
  }
  create(user) {
    const { scene, room } = this;
    const socketId = user?.socketId;
    scene.players[socketId] = new Player(scene, {
      ...user,
      id: socketId,
      room,
      roomName: room?.name,
    });
    scene.add.existing(scene.players[socketId]);
    this.players.add(scene.players[socketId]);
    return scene.players[socketId];
  }
  add(socketId) {
    const { scene, room } = this;
    scene.players[socketId].room = room;
    scene.players[socketId].roomName = room?.name;
    this.players.add(scene.players[socketId]);
  }
  remove(socketId) {
    const { scene } = this;
    if (!scene?.players?.[socketId]) {
      return console.log("❌ Could not remove player");
    }
    scene.players[socketId].room = null;
    scene.players[socketId].roomName = null;
    this.players.remove(scene.players[socketId]);
  }
  getNearestPlayer(player1) {
    const players = this.players?.getChildren();

    let closestPlayer;
    let closestDistance = Infinity;

    players.forEach((player2) => {
      const distance = distanceTo(player2, player1);
      if (distance < closestDistance) {
        closestPlayer = player2;
        closestDistance = distance;
      }
    });

    return closestPlayer;
  }
}

export default PlayerManager;
