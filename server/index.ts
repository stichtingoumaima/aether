import path from "path";
import { config } from "dotenv";
import "@geckos.io/phaser-on-nodejs";
config({ path: path.join(__dirname, "/../.env") });
import { mapList } from "../shared/Maps";
import skinTints from "../shared/data/skinTints.json";
import hairTints from "../shared/data/hairTints.json";
import spellDetails from "../shared/data/spellDetails.json";
import { Socket, Server } from "socket.io";
import crypto from "crypto";
import {
  handlePlayerInput,
  getFullCharacterState,
  getRoomState,
  getTickRoomState,
  getDoor,
  removePlayer,
  cloneObject,
  checkSlotsMatch,
  SHOP_INFLATION,
  getBuffRoomState,
} from "./utils";
import { initDatabase } from "./db";
import RoomManager from "./RoomManager";
import Phaser from "phaser";
import QuestBuilder from "./QuestBuilder";
import ItemBuilder from "./ItemBuilder";
const { SnapshotInterpolation } = require("@geckos.io/snapshot-interpolation");

const express = require("express");
const app = express();
const http = require("http");
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const SI = new SnapshotInterpolation();
global.phaserOnNodeFPS = parseInt(process.env.SERVER_FPS);

app.use(express.static(path.join(__dirname, "../public")));

class ServerScene extends Phaser.Scene implements ServerScene {
  public doors: Record<string, Door>;
  public loots: Record<string, Loot>;
  public npcs: Record<string, Npc>;
  public quests: Record<string, Quest>;
  public players: Record<string, Player>;
  public roomManager: RoomManager;
  public spells: any;
  public db: any;
  public io: any;

  constructor() {
    super({ key: "ServerScene" });
  }
  async preload() {
    /* Need to install plugins here in headless mode */
    // this.game.plugins.installScenePlugin("x", X, "x", this.scene.scene, true);
    mapList.forEach((asset: MapAsset) => {
      this.load.tilemapTiledJSON(asset?.name, path.join(__dirname, `../public/${asset.json}`));
    });
    this.db = await initDatabase(process.env.MONGO_URL);
  }
  create() {
    const scene = this;
    this.io = io;
    this.players = {};
    this.doors = {};
    this.npcs = {};
    this.loots = {};
    this.spells = {};
    this.quests = QuestBuilder.buildAllQuests();
    this.roomManager = new RoomManager(scene);

    io.on("connection", (socket: Socket) => {
      const socketId = socket.id;

      socket.on("login", async ({ email, password } = {}) => {
        let user = await scene.db.getUserByLogin({ email, password });
        if (!user) return socket.emit("formError", { error: "Invalid login" });

        // disconnect the sockets that are logged in as this user.
        for (const [socketId, player] of Object.entries(this?.players)) {
          if (player?.email === user?.email) {
            io?.sockets?.sockets?.get?.(socketId)?.disconnect?.();
            // get a fresh user TODO: sometimes this is too slow.. need to think of an await
            user = await scene.db.getUserByLogin({ email, password });
          }
        }

        const player = scene.roomManager.rooms[user.roomName].playerManager.create({
          socketId,
          ...user,
        });

        const roomName = player?.room?.name;

        roomName
          ? console.log(`🔌 ${player?.profile?.userName} connected`)
          : console.log("❌ Missing player roomName");

        if (!roomName) return;

        socket.join(roomName);
        socket.emit(
          "heroInit",
          {
            ...getRoomState(scene, roomName),
            socketId,
          },
          { isLogin: true }
        );
        socket.to(roomName).emit("playerJoin", getFullCharacterState(player), { isLogin: true });
      });

      socket.on("register", async ({ email, password, charClass } = {}) => {
        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email)) {
          return socket.emit("formError", { error: "Invalid email format" });
        }

        // Check if email is already in use
        const user = await scene.db.getUserByEmail({ email });
        if (user) {
          return socket.emit("formError", { error: "Email already in use" });
        }

        //Validate password strength
        const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/;
        if (password?.length < 4) {
          return socket.emit("formError", {
            error: "Weak password",
          });
        }

        // Create user if email and password are valid
        const isCreated = await scene.db.createUser({ email, password, charClass });
        if (!isCreated) {
          return socket.emit("formError", { error: "Error creating user" });
        }

        // Send success message
        socket.emit("formSuccess", { success: "Account created", email });
      });

      socket.on("attack", ({ count, direction } = {}) => {
        const player = scene.players[socketId];
        if (player?.state?.isDead) return;
        socket.to(player?.roomName).emit("playerAttack", { socketId, count, direction });
      });

      socket.on("castSpell", ({ abilitySlot, castAngle } = {}) => {
        const player = scene.players[socketId];
        const { ilvl, base, mpCost = 0 } = player?.abilities?.[abilitySlot] || {};
        //if the ability slotId is not in the activeItemSlots return
        if (!player?.activeItemSlots?.includes?.(`${abilitySlot}`)) return;
        if (player?.state?.isDead || !ilvl || !base) return;
        if (!player.canCastSpell(abilitySlot)) return;
        if (!player.checkCastReady()) return;
        // use the mana
        player.state.lastCast = Date.now();
        player.modifyStat("mp", -mpCost);
        io.to(player?.roomName).emit("modifyPlayerStat", {
          socketId,
          type: "mp",
          amount: -mpCost,
        });

        // TODO: spell and attacks for players is handled clientSide. How can we fix it?
        socket.to(player?.roomName).emit("playerCastSpell", { socketId, base, ilvl, castAngle });
      });

      socket.on("grabLoot", ({ lootId, direction } = {}) => {
        const player = scene.players[socketId];
        const loot = cloneObject(scene.loots[lootId]);
        const item = loot?.item;
        if (!loot || !player || !item) return;
        if (player?.state?.isDead) return;
        /* Face the loot */
        player.direction = direction;
        /* Check where to put loot */
        if (item.type == "stackable") {
          let foundItem =
            player.findAbilityById(item.id)?.["item"] || player.findInventoryItemById(item.id);
          if (foundItem) {
            /* Delete loot from server */
            scene.roomManager.rooms[player?.roomName].lootManager.remove(lootId);
            /* TODO: a function that handles setting an items amount
            - Needs to handle strings and nullish values
             */
            foundItem.amount = parseInt(foundItem.amount || 0) + parseInt(item?.amount || 0);
          } else {
            /* If our inventory is full we do not pick it up */
            if (player.isInventoryFull()) return console.log("❌ Inventory full.");
            /* Delete loot from server */
            scene.roomManager.rooms[player?.roomName].lootManager.remove(lootId);
            player.addInventoryItem(item);
          }
        } else {
          /* If our inventory is full we do not pick it up */
          if (player.isInventoryFull()) return console.log("❌ Inventory full.");
          /* Delete loot from server */
          scene.roomManager.rooms[player?.roomName].lootManager.remove(lootId);
          player.addInventoryItem(item);
        }
        /* Save player */
        scene.db.updateUser(player);
        io.to(player?.roomName).emit("lootGrabbed", {
          socketId,
          lootId,
          player: getFullCharacterState(player),
        });
      });

      socket.on("respawn", () => {
        const player = scene.players[socketId];
        player.state.isDead = false;
        player.stats.hp = Math.floor(player.stats.maxHp);
        // if (player.stats.exp > 0) {
        //   player.stats.exp = Math.floor(player.stats.exp * 0.9);
        // }
        scene.db.updateUser(scene.players?.[socketId]);
        io.to(player?.roomName).emit("respawnPlayer", player?.socketId);
      });

      socket.on("changeDirection", (direction) => {
        const player = scene.players[socketId];
        player.direction = direction;
        io.to(player?.roomName).emit("changeDirection", { socketId, direction });
      });

      socket.on("hit", ({ ids, abilitySlot } = {}) => {
        // ability slot will be null for attacks
        const hero: Player = scene.players[socketId];
        if (!hero || hero?.state?.isDead) return;
        const roomName: string = hero?.roomName;
        const abilityName = hero?.abilities?.[abilitySlot]?.base || "attack_left";
        const allowedTargets = spellDetails?.[abilityName]?.allowedTargets;

        /* Create hitList for npcs */
        let hitList: Array<Hit> = [];
        let totalExpGain: number = 0;
        const npcs: Array<Npc> = scene.roomManager.rooms[roomName]?.npcManager?.getNpcs();
        const players: Array<Player> =
          scene.roomManager.rooms[roomName]?.playerManager?.getPlayers();

        for (const npc of npcs) {
          /* TODO: verify location of hit before we consider it a hit */
          if (!ids?.includes(npc.id)) continue;
          // only allow spells to hit intended targets
          if (!allowedTargets?.includes("enemy")) continue;
          const newHits = abilitySlot
            ? hero.calculateSpellDamage(npc, abilitySlot)
            : hero.calculateDamage(npc);
          /* If we kill the NPC */
          if (newHits?.find?.((h: Hit) => h?.type === "death")) {
            npc.dropLoot(hero?.stats?.magicFind);
            /* Add EXP, check if we leveled */
            totalExpGain += parseInt(npc?.stats?.expValue) || 0;
            /* Add the npc to the players kill list */
            hero.addNpcKill(npc);
          }
          if (newHits?.length > 0) hitList = [...hitList, ...newHits];
        }
        /* Send exp update to client */
        if (hitList?.some((hit) => hit.type === "death")) {
          const didLevel = hero.assignExp(totalExpGain);
          if (didLevel) {
            io.to(roomName).emit("playerUpdate", getFullCharacterState(hero), { didLevel });
          } else {
            io.to(roomName).emit("modifyPlayerStat", {
              socketId,
              type: "exp",
              amount: totalExpGain,
            });
          }
        }
        for (const player of players) {
          /* TODO: verify location of hit before we consider it a hit */
          if (!ids?.includes(player.id)) continue;
          // only allow spells to hit intended targets
          if (!allowedTargets?.includes("self")) {
            if (player.id === hero.id) continue;
          }
          const newHits = abilitySlot
            ? hero.calculateSpellDamage(player, abilitySlot)
            : hero.calculateDamage(player);
          if (newHits?.length > 0) hitList = [...hitList, ...newHits];
        }

        // anyone who got buffed needs to have their state updated.
        const buffedEntityIds = hitList?.filter((h) => h?.type === "buff")?.map((h) => h?.to);

        // send each buffed hero and npc their new state
        if (buffedEntityIds?.length > 0) {
          const roomState = getRoomState(scene, roomName);
          io.to(roomName).emit("buffUpdate", {
            npcs: roomState?.npcs?.filter((n) => buffedEntityIds?.includes(n?.id)),
            players: roomState?.players?.filter((n) => buffedEntityIds?.includes(n?.id)),
          });
        }

        io.to(roomName).emit("assignDamage", hitList);
      });

      socket.on("enterDoor", (doorName) => {
        const player = scene.players[socketId];
        const oldRoom = player.room.name;
        const prev = getDoor(scene, oldRoom, doorName)?.getProps();
        const next = getDoor(scene, prev.destMap, prev.destDoor)?.getProps();

        player.x = next.centerPos.x;
        player.y = next.centerPos.y;

        if (oldRoom !== prev.destMap) {
          socket.leave(oldRoom);
          socket.join(prev.destMap);
          socket.to(oldRoom).emit("remove", socketId);
        }

        scene.roomManager.rooms[oldRoom].playerManager.remove(socketId);
        scene.roomManager.rooms[prev.destMap].playerManager.add(socketId);

        socket.to(prev.destMap).emit("playerJoin", getFullCharacterState(player), {
          isDoor: true,
          lastTeleport: Date.now(),
        });

        socket.emit("heroInit", {
          ...getRoomState(scene, prev.destMap),
          socketId,
        });
      });

      socket.on("disconnect", () => {
        const player = scene.players?.[socketId];
        scene.db.updateUser(scene.players?.[socketId]);
        console.log(`🔌 ${player?.profile?.userName} disconnected`);
        removePlayer(scene, socketId);
        io.emit("remove", socketId);
      });

      socket.on("dropItem", ({ location, item, ...rest } = {}) => {
        const amount = Math.abs(parseInt(rest?.amount)) || 1;
        const player = scene?.players?.[socketId];
        let found = null;
        let dropAmount: integer;
        /* If the item was dropped from equipment find it and what slot it came from */
        if (location === "equipment") {
          const { item: f, slotName } = player?.findEquipmentById(item?.id);
          found = f;
          /* Remove it from the players equipment */
          player?.clearEquipmentSlot(slotName);
        }

        /* If the item was dropped from equipment find it and what slot it came from */
        if (location === "abilities") {
          const { item: f, slotName } = player?.findAbilityById(item?.id);
          found = f;
          /* Remove it from the players equipment */
          player?.clearAbilitySlot(slotName);
        }

        /* If the item was dropped from inventory find it and what slot it came from */
        if (location === "inventory") {
          found = player?.findInventoryItemById(item?.id);
          if (amount >= found?.amount) {
            dropAmount = found?.amount;
            player?.deleteInventoryItemAtId(item?.id);
          } else {
            dropAmount = player?.subtractInventoryItemAtId(item?.id, amount);
            if (!dropAmount) return;
          }
        }

        if (!found) return;

        player?.calculateStats();

        /* Make the item pop up where they dropped it */
        const coords: Coordinate = { x: player?.x, y: player?.y };
        if (player?.direction === "left") coords.x -= 16;
        if (player?.direction === "right") coords.x += 16;
        if (player?.direction === "up") coords.y -= 16;
        if (player?.direction === "down") coords.y += 16;

        /* Spawn the loot on the server */
        scene.roomManager.rooms[player?.roomName].lootManager.create({
          ...coords,
          item: { ...found, ...(dropAmount ? { amount: dropAmount } : {}) },
          npcId: null,
        });
        /* Save the users data */
        scene.db.updateUser(player);
        io.to(player?.roomName).emit("playerUpdate", getFullCharacterState(player));
      });

      socket.on("moveItem", ({ to, from } = {}) => {
        const player = scene?.players?.[socketId];
        let toItem, fromItem;
        /* Clone the items we are interacting with */
        if (from?.location === "inventory") {
          from.itemId = player?.inventory?.[from?.slot]?.id;
          fromItem = cloneObject(player?.findInventoryItemById(from?.itemId));
        }
        if (from?.location === "equipment") {
          from.itemId = player?.equipment?.[from?.slot]?.id;
          fromItem = cloneObject(player?.findEquipmentById(from?.itemId))?.item;
        }
        if (from?.location === "abilities") {
          from.itemId = player?.abilities?.[from?.slot]?.id;
          fromItem = cloneObject(player?.findAbilityById(from?.itemId))?.item;
        }
        if (from?.location === "shop") {
          const npcId = player?.state?.targetNpcId;
          const shopSlot = scene?.npcs?.[npcId]?.keeperData?.shop?.[from?.slot];
          if (!npcId) return;
          if (!shopSlot?.stock) return;
          if (to?.location === "shop") return;
          from.itemId = shopSlot?.item?.id;
          fromItem = cloneObject({
            ...(shopSlot?.item || {}),
            id: crypto.randomUUID(),
          });
        }
        if (to?.location === "inventory") {
          to.itemId = player?.inventory?.[to?.slot]?.id;
          toItem = cloneObject(player?.findInventoryItemById(to?.itemId));
        }
        if (to?.location === "equipment") {
          to.itemId = player?.equipment?.[to?.slot]?.id;
          toItem = cloneObject(player?.findEquipmentById(to?.itemId))?.item;
        }
        if (to?.location === "abilities") {
          to.itemId = player?.abilities?.[to?.slot]?.id;
          toItem = cloneObject(player?.findAbilityById(to?.itemId))?.item;
        }

        /* Same item, return */
        if (from.itemId === to.itemId) return;

        /* Inventory -> Inventory */
        if (from?.location === "inventory" && to?.location === "inventory") {
          player?.deleteInventoryItemAtId(from?.itemId);
          player.inventory[to?.slot] = fromItem;
          player.inventory[from?.slot] = toItem;
        }

        /* Equipment -> Inventory */
        if (from?.location === "equipment" && to?.location === "inventory") {
          /* Slots don't match */
          if (toItem && !checkSlotsMatch(toItem?.slot, from?.slot)) return;
          player?.clearEquipmentSlot(from?.slot);
          player.inventory[to?.slot] = fromItem;
          player.equipment[from?.slot] = toItem;
        }

        /* Abilities -> Inventory */
        if (from?.location === "abilities" && to?.location === "inventory") {
          if (toItem && !checkSlotsMatch(toItem?.type, fromItem?.type)) return;
          player?.clearAbilitySlot(from?.slot);
          player.inventory[to?.slot] = fromItem;
          player.abilities[from?.slot] = toItem;
        }

        /* Inventory -> Equipment */
        if (from?.location === "inventory" && to?.location === "equipment") {
          /* Slots don't match */
          if (fromItem && !checkSlotsMatch(fromItem?.slot, to?.slot)) return;
          player?.deleteInventoryItemAtId(from?.itemId);
          player.equipment[to?.slot] = fromItem;
          player.inventory[from?.slot] = toItem;
        }

        /* Inventory -> Abilities */
        if (from?.location === "inventory" && to?.location === "abilities") {
          if (!["spell", "stackable"].includes(fromItem?.type)) return;
          player?.deleteInventoryItemAtId(from?.itemId);
          player.abilities[to?.slot] = fromItem;
          player.inventory[from?.slot] = toItem;
        }

        /* Equipment -> Equipment */
        if (from?.location === "equipment" && to?.location === "equipment") {
          /* Slots don't match */
          if (!checkSlotsMatch(fromItem?.slot, to?.slot)) return;
          player?.clearEquipmentSlot(from?.slot);
          player.equipment[to?.slot] = fromItem;
          player.equipment[from?.slot] = toItem;
        }

        /* Abilities -> Abilities */
        if (from?.location === "abilities" && to?.location === "abilities") {
          player?.clearAbilitySlot(from?.slot);
          player.abilities[to?.slot] = fromItem;
          player.abilities[from?.slot] = toItem;
        }

        /* Abilities -> Shop */
        if (from?.location === "abilities" && to?.location === "shop") {
          let sellQty = Math.abs(parseInt(from?.amount)) || 1;
          const cost = Math.abs(parseInt(fromItem?.cost)) || 1;
          if (sellQty >= fromItem?.amount) {
            player?.deleteAbilityAtId(from?.itemId);
          } else {
            player?.subtractAbilityAtId(from?.itemId, sellQty);
          }
          player.gold += sellQty * cost;
        }

        /* Inventory -> Shop */
        if (from?.location === "inventory" && to?.location === "shop") {
          let sellQty = Math.abs(parseInt(from?.amount)) || 1;
          const cost = Math.abs(parseInt(fromItem?.cost)) || 1;
          if (sellQty >= fromItem?.amount) {
            player?.deleteInventoryItemAtId(from?.itemId);
          } else {
            player?.subtractInventoryItemAtId(from?.itemId, sellQty);
          }
          player.gold += sellQty * cost;
        }

        /* Equipment -> Shop */
        if (from?.location === "equipment" && to?.location === "shop") {
          let sellQty = Math.abs(parseInt(from?.amount)) || 1;
          const cost = Math.abs(parseInt(fromItem?.cost)) || 1;
          player?.clearEquipmentSlot(from?.slot);
          player.gold += sellQty * cost;
        }

        /* Shop -> Inventory */
        if (from?.location === "shop" && to?.location === "inventory") {
          /* Always need a free slot */
          if (toItem) return;
          if (player.gold < fromItem?.cost) {
            return socket.emit("message", {
              type: "error",
              message: "You cannot afford this item",
            });
          }
          player.gold -= fromItem?.cost || 1;
          /* Remove inflation cost */
          fromItem.cost = Math.floor(fromItem.cost / SHOP_INFLATION);
          player.inventory[to?.slot] = fromItem;
        }

        /* Shop -> Equipment */
        if (from?.location === "shop" && to?.location === "equipment") {
          /* Always need a free slot */
          if (toItem) return;
          if (fromItem && !checkSlotsMatch(fromItem?.slot, to?.slot)) return;
          if (player.gold < fromItem?.cost) {
            return socket.emit("message", {
              type: "error",
              message: "You cannot afford this item",
            });
          }
          player.gold -= fromItem?.cost || 1;
          /* Remove inflation cost */
          fromItem.cost = Math.floor(fromItem.cost / SHOP_INFLATION);
          player.equipment[to?.slot] = fromItem;
        }

        /* Shop -> Abilities */
        if (from?.location === "shop" && to?.location === "abilities") {
          /* Always need a free slot */
          if (toItem) return;
          if (!["spell", "stackable"].includes(fromItem?.type)) return;
          if (player.gold < fromItem?.cost) {
            return socket.emit("message", {
              type: "error",
              message: "You cannot afford this item",
            });
          }
          player.gold -= fromItem?.cost || 1;
          /* Remove inflation cost */
          fromItem.cost = Math.floor(fromItem.cost / SHOP_INFLATION);
          player.abilities[to?.slot] = fromItem;
        }

        player?.calculateStats();
        /* Save the users data */
        scene.db.updateUser(player);
        io.to(player?.roomName).emit("playerUpdate", getFullCharacterState(player));
      });

      socket.on("consumeItem", ({ location, item } = {}) => {
        const player = scene?.players?.[socketId];
        let playerItem: Item;
        if (player?.state?.isDead) return;
        if (!["inventory", "abilities"].includes(location)) return;
        /* Using an item from the inventory */
        if (location === "inventory") {
          playerItem = player?.findInventoryItemById(item?.id);
          if (playerItem?.base !== "food") return;
          if (!playerItem?.amount) return;
          if (playerItem?.amount <= 1) {
            player?.deleteInventoryItemAtId(item?.id);
          } else {
            player?.subtractInventoryItemAtId(item?.id, 1);
          }
        }
        /* Using an item from abilities */
        if (location === "abilities") {
          const { item: found } = player?.findAbilityById(item?.id);
          playerItem = found;
          if (playerItem?.base !== "food") return;
          if (!playerItem?.amount) return;
          if (playerItem?.amount <= 1) {
            player?.deleteAbilityAtId(item?.id);
          } else {
            player?.subtractAbilityAtId(item?.id, 1);
          }
        }
        /* Apply item effects to hero */
        if (playerItem?.effects?.hp) {
          const hp = (parseInt(playerItem?.effects?.hp) / 100) * player?.stats?.maxHp;
          player.modifyStat("hp", hp);
        }
        if (playerItem?.effects?.mp) {
          const mp = (parseInt(playerItem?.effects?.mp) / 100) * player?.stats?.maxMp;
          player.modifyStat("mp", mp);
        }

        player?.calculateStats();
        /* Save the users data */
        scene.db.updateUser(player);
        io.to(player?.roomName).emit("playerUpdate", getFullCharacterState(player));
      });

      socket.on("playerInput", (input) => {
        handlePlayerInput(scene, socketId, input); //defined in utilites.js
      });

      socket.on("chatNpc", ({ npcId } = {}) => {
        const player = scene?.players?.[socketId];
        const npc = scene?.npcs?.[npcId];
        npc.talkingIds.push(socketId);
        player.state.targetNpcId = npcId;
        socket.emit("keeperDataUpdate", {
          npcId: npc?.id,
          keeperData: npc?.keeperData,
        });
      });

      socket.on("message", (args) => {
        if (!args?.message) return;
        const player = scene?.players?.[socketId];
        // chat bubble
        if (args.message.charAt(0) === "!" && args.message.length > 1) {
          player.state.lastBubbleMessage = Date.now();
          player.state.bubbleMessage = args.message.substr(1);
          return;
        }
        if (args.message.charAt(0) === "/") {
          const command = args.message.substr(1).split(" ");
          switch (command[0]) {
            case "drop":
              const item = command?.[1]?.split("-");
              return scene.roomManager.rooms[player?.roomName].lootManager.create({
                x: player?.x,
                y: player?.y,
                item: ItemBuilder.buildItem(item[0], item[1], item[2]) as Item,
                npcId: null,
              });
            case "coords":
              return socket.emit("message", {
                type: "info",
                message: `x: ${Math.round(player.x)} y: ${Math.round(player.y)}`,
              });
            case "guns":
              let gunItem = null;
              const rarity = command?.[1];
              if (!["unique", "common", "set", "rare", "magic"]?.includes(rarity)) return;
              do {
                gunItem = ItemBuilder.rollDrop(100, 50);
              } while (gunItem?.rarity !== rarity);
              if (gunItem) {
                scene.roomManager.rooms[player?.roomName].lootManager.create({
                  x: player?.x,
                  y: player?.y,
                  item: ItemBuilder.buildItem(gunItem.type, gunItem.rarity, gunItem.key) as Item,
                  npcId: null,
                });
              }
              return;
          }
        }
        io.to(player?.roomName).emit("message", {
          from: player?.profile?.userName,
          type: "chat",
          message: args.message,
        });
      });

      socket.on("acceptQuest", (questId: string) => {
        const player: Player = scene?.players?.[socketId];
        const currentQuest = scene.quests?.[questId];
        const foundQuest = player?.getPlayerQuestStatus(currentQuest);
        /* If the quest wasnt there, we can accept it */
        if (!foundQuest) {
          player?.addQuest(currentQuest);
          /* Save the users data */
          scene.db.updateUser(player);
          io.to(player?.roomName).emit("playerUpdate", getFullCharacterState(player));
        }
      });

      socket.on("completeQuest", (questId: string) => {
        const player: Player = scene?.players?.[socketId];
        const currentQuest = scene.quests?.[questId];
        const foundQuest = player?.getPlayerQuestStatus(currentQuest);
        /* If the quest is ready, we turn it in */
        if (foundQuest?.isReady) {
          const questResults = player?.completeQuest(currentQuest);
          /* Quest failed */
          if (questResults?.error) {
            const message: Message = {
              type: "error",
              message: questResults.error,
            };
            return socket.emit("message", message);
          }
          /* Save the users data */
          player.calculateStats();
          scene.db.updateUser(player);
          io.to(player?.roomName).emit("playerUpdate", getFullCharacterState(player), {
            didLevel: questResults?.didLevel,
          });
        }
      });

      socket.on("updateProfile", (args) => {
        const hairTextures = ["hair-1", "hair-2", "hair-3", "hair-4"];
        const faceTextures = ["face-1", "face-2", "face-3"];
        const genders = ["male", "female"];
        const player = scene?.players?.[socketId];
        if (!player) return;

        const currentHairTextureIndex = hairTextures.indexOf(player?.profile?.hair?.texture);
        const currentFaceTextureIndex = faceTextures.indexOf(player?.profile?.face?.texture);
        const currentSkinTintIndex = skinTints.indexOf(player?.profile?.tint);
        const currentHairTintIndex = hairTints.indexOf(player?.profile?.hair?.tint);
        const currentGenderIndex = genders.indexOf(player?.profile?.gender);
        let nextHairTextureIndex = currentHairTextureIndex;
        let nextFaceTextureIndex = currentFaceTextureIndex;
        let nextSkinTintIndex = currentSkinTintIndex;
        let nextHairTintIndex = currentSkinTintIndex;
        let nextGenderIndex = currentGenderIndex;

        if (args?.hair?.texture === 1) {
          nextHairTextureIndex = (currentHairTextureIndex + 1) % hairTextures.length;
        } else if (args?.hair?.texture === -1) {
          nextHairTextureIndex =
            (currentHairTextureIndex - 1 + hairTextures.length) % hairTextures.length;
        }

        if (args?.face?.texture === 1) {
          nextFaceTextureIndex = (currentFaceTextureIndex + 1) % faceTextures.length;
        } else if (args?.face?.texture === -1) {
          nextFaceTextureIndex =
            (currentFaceTextureIndex - 1 + faceTextures.length) % faceTextures.length;
        }

        if (args?.skin?.tint === 1) {
          nextSkinTintIndex = (currentSkinTintIndex + 1) % skinTints.length;
        } else if (args?.skin?.tint === -1) {
          nextSkinTintIndex = (currentSkinTintIndex - 1 + skinTints.length) % skinTints.length;
        }

        if (args?.hair?.tint === 1) {
          nextHairTintIndex = (currentHairTintIndex + 1) % hairTints.length;
        } else if (args?.hair?.tint === -1) {
          nextHairTintIndex = (currentHairTintIndex - 1 + hairTints.length) % hairTints.length;
        }

        if (args?.body === 1) {
          nextGenderIndex = (currentGenderIndex + 1) % genders.length;
        } else if (args?.body === -1) {
          nextGenderIndex = (currentGenderIndex - 1 + genders.length) % genders.length;
        }

        const userName = args?.userName.substring(0, 16);

        if (args?.userName) player.profile.userName = userName;
        if (args?.hair?.texture) player.profile.hair.texture = hairTextures[nextHairTextureIndex];
        if (args?.face?.texture) player.profile.face.texture = faceTextures[nextFaceTextureIndex];
        if (args?.skin?.tint) player.profile.tint = skinTints[nextSkinTintIndex];
        if (args?.hair?.tint) player.profile.hair.tint = hairTints[nextHairTintIndex];
        if (args?.body) player.profile.gender = genders[nextGenderIndex];

        /* Save the user's data */
        scene.db.updateUser(player);
        io.to(player?.roomName).emit("playerUpdate", getFullCharacterState(player));
      });
    });
  }
  update(time: number, delta: number) {
    const scene = this;
    for (const room of Object.values(scene.roomManager.rooms)) {
      const roomState = getTickRoomState(scene, room.name);
      const snapshot = SI.snapshot.create(roomState);

      room.lootManager.expireLoots();
      room.spellManager.expireSpells();

      room.vault.add(snapshot);
      io.to(room.name).emit("update", room.vault.get());

      /* Expire buffs */
      if ([...roomState?.npcs, ...roomState?.players]?.some((n) => n?.state.hasExpiredBuffs)) {
        io.to(room.name).emit("buffUpdate", getBuffRoomState(scene, room.name));
      }
    }
  }
}

new Phaser.Game({
  type: Phaser.HEADLESS,
  width: 1280,
  height: 720,
  banner: false,
  audio: {
    disableWebAudio: true,
    noAudio: true,
  },
  fps: {
    target: parseInt(process.env.SERVER_FPS),
  },
  roundPixels: false,
  physics: {
    default: "arcade",
    arcade: {
      gravity: {
        y: 0,
      },
    },
  },
  scene: [new ServerScene()],
});

httpServer.listen(process.env.PORT, () => {
  console.log(`💻 Running on ${process.env.SERVER_URL} @ ${process.env.SERVER_FPS}fps`);
});

process.on("SIGINT", function () {
  process.exit();
});

process.once("SIGUSR2", function () {
  process.exit();
});
