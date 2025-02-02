import path from "path";
import { config } from "dotenv";
import GameServer from "./GameServer";
import { initDatabase } from "./db";
import { initFakeDatabase } from "./db/fake";
import { calculateStats, getFullCharacterState } from "./utils";
import { PeerServer, PeerServerEvents } from "peer";
import { default as http, Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

config({ path: path.join(__dirname, "/../.env") });
const cors = require("cors");
const express = require("express");

const PEER_SERVER_PORT = parseInt(process.env.PEER_SERVER_PORT);
const PORT = process.env.PORT;
const MONGO_URL = process.env.MONGO_URL;
const SERVER_URL = process.env.SERVER_URL;
const SERVER_FPS = process.env.SERVER_FPS;

class AppServer {
  private app;
  private httpServer: Server;
  private peerServer: PeerServerEvents;

  constructor() {
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.peerServer = PeerServer({ port: PEER_SERVER_PORT }, (e) => {
      console.log(`💻 Peerserver @ /peerjs:${PEER_SERVER_PORT}`);
    });
  }

  async initialize() {
    // can run in offline mode. we don't connect to any DB or save anything.
    const db = process.env.MONGO_URL
      ? await initDatabase(process.env.MONGO_URL)
      : await initFakeDatabase();

    const app = this.app;
    const httpServer = this.httpServer;
    const aetherServer = new GameServer({ httpServer, db });

    app.use(
      cors({
        origin: "*", // Replace with your allowed origin
      })
    );

    app.use(express.static(path.join(__dirname, process.env.PUBLIC_DIR)));

    // app.get("/metrics/players", (req, res) => {
    //   const scene = aetherServer?.game?.scene?.scenes?.[0] as ServerScene;
    //   const { players } = scene ?? {};
    //   const playerStates = Object.values(players).map(getFullCharacterState);
    //   res.json(playerStates);
    // });

    app.get("/keepers/all", async (req, res) => {
      const scene = aetherServer?.game?.scene?.scenes?.[0] as ServerScene;
      const { npcs } = scene ?? {};

      // Pagination parameters
      const { page = 1, pageSize = 10 } = req.query;

      // Filter and map keeper states as before
      const keeperStates = Object.values(npcs)
        ?.filter((n) => n?.kind === "keeper" && n?.profile?.race === "human")
        .map(getFullCharacterState);

      // Calculate the start and end indices for the current page
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      // Get the current page of data
      const currentPageData = keeperStates.slice(startIndex, endIndex);

      // Calculate hasNextPage based on whether there is more data
      const hasNextPage = endIndex < keeperStates.length;

      // Create the pageInfo object
      const pageInfo = {
        nextPage: hasNextPage ? parseInt(page) + 1 : null,
        hasNextPage,
        pageSize: Number(pageSize),
        currentPage: Number(page),
        totalCount: keeperStates.length,
      };

      // Return the current page data along with pageInfo
      res.json({ data: currentPageData, pageInfo });
    });

    // Define an API route that supports pagination
    app.get("/players/all", async (req, res) => {
      const { page = 1, pageSize = 20, sortBy = "updatedAt" } = req.query;

      const players = await db.getAllUsers({
        page: Number(page),
        pageSize: Number(pageSize),
        sortBy,
      });

      const ret = players.map((player) => {
        calculateStats(player, false);
        return {
          id: player?._id,
          charClass: player?.charClass,
          stats: player?.stats,
          state: player?.state,
          abilities: player?.abilities,
          equipment: player?.equipment,
          inventory: player?.inventory,
          activeItemSlots: player?.activeItemSlots,
          profile: player?.profile,
          updatedAt: player?.updatedAt,
          quests: player?.quests,
        };
      });

      // Assuming you have the total count of users in the database
      const totalCount = await db.countAllUsers();

      // Calculate pagination information
      const hasNextPage = page * pageSize < totalCount;
      const nextPage = hasNextPage ? parseInt(page) + 1 : null;

      // Create the pageInfo object
      const pageInfo = {
        nextPage,
        hasNextPage,
        pageSize: Number(pageSize),
        currentPage: Number(page),
        totalCount,
      };

      // Return the data along with pageInfo
      res.json({ data: ret, pageInfo });
    });

    app.get("/metrics", async (req, res) => {
      const scene = aetherServer?.game?.scene?.scenes?.[0] as ServerScene;
      const totalPlayers = await db.countAllUsers();
      const { players, npcs, loots, doors } = scene ?? {};

      const endTime = Date.now();
      const clientTimestamp = req?.query?.timestamp
        ? parseInt(req?.query?.timestamp as string, 10)
        : endTime;

      const metrics: ServerMetrics = {
        playersOnline: Object.keys(players).length,
        totalPlayers: totalPlayers ?? 0,
        npcsLoaded: Object.keys(npcs).length,
        doorsLoaded: Object.keys(doors).length,
        lootsOnGround: Object.keys(loots).length,
        serverSpawnTime: aetherServer?.spawnTime,
        ping: endTime - clientTimestamp,
        serverTime: new Date().toString(),
        upTime: aetherServer?.getUptime(),
      };

      res.json(metrics);
    });

    app.get("/players/prune", async (_, res) => {
      await db.pruneNoobs();
      res.json({ string: "ok" });
    });

    app.get("/health", (_, res) => {
      res.status(200).json({ status: "ok" });
    });

    // app.get("/players/pruneItem", async (req, res) => {
    //   await db.pruneItemByKey("voltball");
    //   res.json({ string: "ok" });
    // });

    // app.get("/players/updateUsersMaxExp", async (req, res) => {
    //   await db.updateUsersMaxExp();
    //   res.json({ string: "ok" });
    // });

    // Set up the proxy middleware to route /peerjs to the PeerJS server
    app.use(
      "/peerjs",
      createProxyMiddleware({
        target: `http://localhost:${PEER_SERVER_PORT}/peerjs`,
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying if PeerJS uses WebSockets
        pathRewrite: { "^/peerjs": "" },
      })
    );

    httpServer.listen(PORT, () => {
      console.log(
        `💻 Running ${MONGO_URL ? "[online]" : "[offline]"} on ${SERVER_URL} @ ${SERVER_FPS}fps`
      );
    });
  }
}

process.on("SIGINT", function () {
  process.exit();
});

process.once("SIGUSR2", function () {
  process.exit();
});

const server = new AppServer();

server.initialize();
