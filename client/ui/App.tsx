import React, { useEffect, useState, createContext, useContext } from "react";
import {
  theme,
  MenuHud,
  ModalRespawn,
  ModalDropAmount,
  HUD_CONTAINER_ID,
  ModalLogin,
  ModalSign,
  ModalError,
  MenuBar,
} from "./";
import { ThemeProvider, Box, useViewportSizeEffect, Modal } from "@aether/ui";
import { getSpinDirection, calculateZoomLevel } from "../utils";
import "react-tooltip/dist/react-tooltip.css";
import { Theme } from "theme-ui";
import { Socket } from "socket.io-client";

interface AppContextValue {
  isLoggedIn: boolean;
  isConnected: boolean;
  isLoaded: boolean;
  showButtonChat: boolean;
  setShowButtonChat: React.Dispatch<React.SetStateAction<boolean>>;
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  setTabEquipment: React.Dispatch<React.SetStateAction<boolean>>;
  setTabInventory: React.Dispatch<React.SetStateAction<boolean>>;
  setTabKeeper: React.Dispatch<React.SetStateAction<boolean>>;
  setKeeper: React.Dispatch<React.SetStateAction<undefined>>;
  setTabChat: React.Dispatch<React.SetStateAction<boolean>>;
  setTabProfile: React.Dispatch<React.SetStateAction<boolean>>;
  setTabStats: React.Dispatch<React.SetStateAction<boolean>>;
  setTabSocial: React.Dispatch<React.SetStateAction<boolean>>;
  setTabQuests: React.Dispatch<React.SetStateAction<boolean>>;
  setDropItem: React.Dispatch<React.SetStateAction<Item | null | false>>;
  setTabAbilities: React.Dispatch<React.SetStateAction<boolean>>;
  toggleBagState: React.Dispatch<React.SetStateAction<any>>;
  setCooldowns: React.Dispatch<React.SetStateAction<any>>;
  setSign: React.Dispatch<React.SetStateAction<any>>;
  setError: React.Dispatch<React.SetStateAction<any>>;
  error: any;
  sign: Sign | null;
  bagState: Array<string>;
  cooldowns: Record<string, any>;
  messages: Message[];
  bottomOffset: number;
  dropItem: any;
  tabEquipment: boolean;
  tabQuests: boolean;
  tabInventory: boolean;
  tabChat: boolean;
  tabProfile: boolean;
  tabStats: boolean;
  tabSocial: boolean;
  tabAbilities: boolean;
  keeper: any; // data related to NPC you are chatting with
  tabKeeper: boolean;
  hero: FullCharacterState;
  players: Array<FullCharacterState>;
  partyInvites: Array<PartyInvite>;
  setPartyInvites: React.Dispatch<React.SetStateAction<Array<PartyInvite>>>;
  party: any;
  socket: Socket;
  debug: boolean;
  game: Phaser.Game;
  zoom: any;
  currentTooltipId: string;
  setCurrentTooltipId: React.Dispatch<React.SetStateAction<any>>;
}

const AppContext = createContext<AppContextValue>({} as AppContextValue);

export const useAppContext = () => {
  return useContext(AppContext);
};

const getHudZoom = () => {
  const viewportArea = window.innerWidth * window.innerHeight;
  return calculateZoomLevel({
    viewportArea,
    baseZoom: 0.75,
    maxZoom: 2,
    divisor: 3000000,
  });
};

function App({ socket, debug, game }) {
  const [currentTooltipId, setCurrentTooltipId] = useState(null);
  const [partyInvites, setPartyInvites] = useState<Array<PartyInvite>>([]);
  const [party, setParty] = useState<any>();
  const [players, setPlayers] = useState<Array<FullCharacterState>>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dropItem, setDropItem] = useState();
  const [hero, setHero] = useState<FullCharacterState>(null);
  const [keeper, setKeeper] = useState();
  const [messages, setMessages] = useState([]);
  const [tabKeeper, setTabKeeper] = useState(false);
  const [tabEquipment, setTabEquipment] = useState(false);
  const [tabInventory, setTabInventory] = useState(false);
  const [tabChat, setTabChat] = useState(false);
  const [tabProfile, setTabProfile] = useState(false);
  const [tabStats, setTabStats] = useState(false);
  const [tabSocial, setTabSocial] = useState(false);
  const [tabQuests, setTabQuests] = useState(false);
  const [tabAbilities, setTabAbilities] = useState(false);
  const [showButtonChat, setShowButtonChat] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [zoom, setZoom] = useState(getHudZoom());
  const [bagState, setBagState] = useState([]);
  const [sign, setSign] = useState(null);
  const [error, setError] = useState(null);
  const [cooldowns, setCooldowns] = useState({});

  /* Is the bag open or closed */
  const toggleBagState = (id: string) => {
    setBagState((prev) => {
      if (prev.includes(id)) {
        // If id is already present, remove it from the array
        return prev.filter((itemId) => itemId !== id);
      } else {
        // If id is not present, add it to the array
        return [...prev, id];
      }
    });
  };

  const addMessage = (payload: Message) => {
    setMessages((prev) => [...prev, { ...payload, timestamp: Date.now() }]);
  };

  const onConnect = () => {
    setIsConnected(true);
  };

  const onDisconnect = () => {
    setIsConnected(false);
    setIsLoggedIn(false);
    setTabKeeper(false);
    setMessages([]);
    setPlayers([]);
    setParty([]);
    setPartyInvites([]);
    setHero(null);
    setKeeper(null);
    setSign(null);
  };

  const onPlayerJoin = (player, args) => {
    /* Keep room list updated */
    setPlayers((prev = []) => {
      const playerExists = prev.some((p) => p?.id === player?.id);
      return !playerExists ? prev.concat(player) : prev;
    });

    /* Only show player join message if the user logged in, not if entered door */
    if (args?.isLogin) addMessage({ type: "info", message: "A player has joined the game." });
  };

  const onPlayerLeave = (socketId) => {
    setPlayers((prev) => prev.filter((player) => player.socketId !== socketId));
  };

  const onHeroInit = (payload: { players: Array<FullCharacterState>; socketId: string }, args) => {
    const { players, socketId } = payload;
    const player: FullCharacterState = players?.find((p) => p?.socketId === socketId);
    //TODO: get rid of this session storage reference. i think we can just use a state callback here
    sessionStorage.setItem("socketId", socketId);
    setPlayers(players);
    setHero(player);
    if (args?.isLogin) setIsLoggedIn(true);
  };

  const onBuffUpdate = (payload: {
    players: Array<FullCharacterState>;
    socketId: string;
    playerIdsThatLeveled?: Array<string>;
  }) => {
    const { players, playerIdsThatLeveled } = payload;
    const socketId = sessionStorage.getItem("socketId");
    const player: FullCharacterState = players?.find((p) => p?.socketId === socketId);
    /* Keep the hero updated */
    setHero((prev) => ({ ...prev, ...player }));
    /* Show a message if the hero leveled */
    if (playerIdsThatLeveled?.includes(player?.id)) {
      addMessage({ type: "success", message: `You are now level ${player?.stats?.level}!` });
    }
    /* Merge updates into player */
    setPlayers((prev) => {
      return prev.map((p: any) => {
        const foundPlayer = players?.find((x) => p?.id === x?.id);
        const newPlayerState = foundPlayer ? { ...p, ...foundPlayer } : p;
        return newPlayerState as FullCharacterState;
      });
    });
  };

  const onPlayerUpdate = (player: FullCharacterState, args) => {
    const currentPlayerSocketId = sessionStorage.getItem("socketId");
    const isCurrentPlayer = currentPlayerSocketId === player.socketId;

    setPlayers((prev) => {
      return prev.map((p) => (p.id === player.id ? player : p));
    });

    if (isCurrentPlayer) {
      setHero(player);
      if (args?.didLevel) {
        addMessage({ type: "success", message: `You are now level ${player.stats?.level}!` });
      }
    }
  };

  const onKeeperDataUpdate = (args) => {
    const scene = game.scene.getScene("SceneMain");
    const hero = scene.hero;
    const npc = scene.npcs.getChildren().find((n) => n?.id === args?.npcId);
    if (hero?.state?.targetNpcId === args?.npcId) {
      setKeeper({ ...npc, keeperData: args?.keeperData });
      setHero((prev) => ({ ...prev, quests: args?.playerQuests }));
      setTabKeeper(true);
    }
  };

  const onHeroChatNpc = () => {
    const scene = game.scene.getScene("SceneMain");
    const hero = scene.hero;
    const npcId = scene?.hero?.state?.targetNpcId;
    const npcs = scene.npcs.getChildren();
    const signs = scene.signs.getChildren();

    const target = [...npcs, ...signs].find((n) => n?.id === npcId);

    if (!target) {
      return addMessage({ type: "error", message: "Who are you talking to?" });
    }

    if (target.kind === "keeper") {
      return setTabKeeper((prev) => {
        if (prev) return false; //already talking
        socket.emit("chatNpc", { npcId: hero?.state?.targetNpcId });
      });
    }

    if (target.kind === "sign") {
      setSign(target);
    }

    const direction = getSpinDirection(hero, target);
    if (hero?.direction !== direction) socket.emit("changeDirection", { direction });
  };

  const onLootGrabbed = ({ player, loot }) => {
    const socketId = sessionStorage.getItem("socketId");
    // only affect the player that grabbed the loot
    if (socketId === player?.socketId) {
      if (loot?.grabMessage) {
        const item = loot?.item;
        addMessage({ type: "success", message: `Found ${item?.name} x${item?.amount || 1}` });
      }
      /* Both quests and inventory only need to be updated when we pick an item */
      setHero((prev) => ({
        ...prev,
        inventory: player?.inventory,
        quests: player?.quests,
        abilities: player?.abilities,
      }));
    }
  };

  const onUpdateHud = () => {
    const hero: FullCharacterState = game.scene.getScene("SceneMain").hero;
    setHero((prev) => ({ ...prev, state: hero?.state, stats: hero?.stats }));
  };

  /* Splice in some updates for keeping the party UI in sync */
  const onUpdateRoomPlayers = (e) => {
    const otherPlayers = e?.detail?.players?.filter((p) => !p.isHero);

    setPlayers((players) => {
      return players.map((player) => {
        if (otherPlayers.some((p) => p.id === player.id)) {
          const foundPlayer = otherPlayers?.find((p) => p.id === player.id);
          return {
            ...player,
            stats: foundPlayer?.stats,
            equipment: foundPlayer?.equipment,
            profile: foundPlayer?.profile,
          };
        } else {
          return player;
        }
      });
    });
  };

  const onPartyInvite = (inviteData: PartyInvite) => {
    // Check if the party invite already exists
    const existingInvite = partyInvites.find((invite) => invite.partyId === inviteData.partyId);
    // Party invite already exists, do not add it again
    if (existingInvite) return;
    addMessage({
      type: "party",
      message: `${inviteData?.inviter?.profile?.userName} has invited you to their party.`,
    });
    // Party invite doesn't exist, add it to the list
    setPartyInvites((prevInvites) => [...prevInvites, inviteData]);
  };

  const onPartyUpdate = ({ message, party, partyId }) => {
    // remove the invite
    setPartyInvites([]);
    setParty(party);
    if (message) {
      addMessage({ type: "party", message });
    }
  };

  const onNearNpc = (e) => {
    setShowButtonChat(!!e?.detail);
    if (!e?.detail) {
      setTabKeeper(false);
      setSign(false);
    }
  };

  const onStartCooldown = (e) => {
    const { spellName, duration, startTime, sharedDuration } = e?.detail ?? {};
    setCooldowns((prev) => {
      // spellName !== 'attack', 'potion' update the shared base cooldown
      if (sharedDuration) {
        prev["global"] = { duration: sharedDuration, startTime };
      }
      return { ...prev, [spellName]: { duration, startTime } };
    });
  };

  const onLoadError = () => {
    setError({
      title: "Error",
      description:
        "There was a problem loading some assets.  This is probably because I'm in the process of deploying a new version.  Refresh and come back later if stuff isn't loading.",
    });
  };

  const onGameLoaded = () => {
    setIsLoaded(true);
  };

  useEffect(() => {
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("heroInit", onHeroInit);
    socket.on("buffUpdate", onBuffUpdate);
    socket.on("playerUpdate", onPlayerUpdate);
    socket.on("lootGrabbed", onLootGrabbed);
    socket.on("keeperDataUpdate", onKeeperDataUpdate);
    socket.on("message", addMessage);
    socket.on("playerJoin", onPlayerJoin);
    socket.on("remove", onPlayerLeave);
    socket.on("partyInvite", onPartyInvite);
    socket.on("partyUpdate", onPartyUpdate);
    window.addEventListener("HERO_NEAR_NPC", onNearNpc);
    window.addEventListener("HERO_CHAT_NPC", onHeroChatNpc);
    window.addEventListener("UPDATE_HUD", onUpdateHud);
    window.addEventListener("UPDATE_ROOM_PLAYERS", onUpdateRoomPlayers);
    window.addEventListener("HERO_RESPAWN", onUpdateHud);
    window.addEventListener("LOAD_ERROR", onLoadError);
    window.addEventListener("GAME_LOADED", onGameLoaded);
    window.addEventListener("HERO_START_COOLDOWN", onStartCooldown);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("heroInit", onHeroInit);
      socket.off("buffUpdate", onBuffUpdate);
      socket.off("playerUpdate", onPlayerUpdate);
      socket.off("lootGrabbed", onLootGrabbed);
      socket.off("keeperDataUpdate", onKeeperDataUpdate);
      socket.off("message", addMessage);
      socket.off("playerJoin", onPlayerJoin);
      socket.off("partyInvite", onPartyInvite);
      socket.off("partyUpdate", onPartyUpdate);
      socket.off("remove", onPlayerLeave);
      window.removeEventListener("HERO_NEAR_NPC", onNearNpc);
      window.removeEventListener("HERO_CHAT_NPC", onHeroChatNpc);
      window.removeEventListener("UPDATE_HUD", onUpdateHud);
      window.removeEventListener("UPDATE_ROOM_PLAYERS", onUpdateRoomPlayers);
      window.removeEventListener("HERO_RESPAWN", onUpdateHud);
      window.removeEventListener("LOAD_ERROR", onLoadError);
      window.removeEventListener("GAME_LOADED", onGameLoaded);
      window.removeEventListener("HERO_START_COOLDOWN", onStartCooldown);
    };
  }, []);

  useViewportSizeEffect(() => {
    const windowHeight = window.innerHeight;
    const bodyHeight = window.visualViewport.height;
    let offset = windowHeight - bodyHeight;
    setBottomOffset(offset > 0 ? offset : 0);
    setZoom(getHudZoom());
  });

  const showLogin = !isLoggedIn && isLoaded;

  return (
    <ThemeProvider theme={theme as Theme}>
      <AppContext.Provider
        value={{
          isLoaded,
          setIsLoaded,
          isConnected,
          showButtonChat,
          setShowButtonChat,
          setIsConnected,
          isLoggedIn,
          setIsLoggedIn,
          setTabEquipment,
          setTabInventory,
          setTabKeeper,
          setKeeper,
          setTabChat,
          setDropItem,
          setTabProfile,
          setTabStats,
          setTabSocial,
          setTabQuests,
          setTabAbilities,
          toggleBagState,
          setCooldowns,
          setSign,
          setError,
          error,
          sign,
          cooldowns,
          bagState,
          players,
          tabSocial,
          tabQuests,
          tabAbilities,
          tabStats,
          messages,
          bottomOffset,
          dropItem,
          tabEquipment,
          tabInventory,
          tabProfile,
          tabChat,
          keeper,
          tabKeeper,
          hero,
          partyInvites,
          setPartyInvites,
          party,
          socket,
          debug,
          game,
          zoom,
          currentTooltipId,
          setCurrentTooltipId,
        }}
      >
        <Box
          sx={{
            inset: 0,
            position: "fixed",
            backgroundColor: "black",
            opacity: showLogin ? 1 : 0,
            transition: "opacity 1s ease-out",
            pointerEvents: "none",
            zIndex: "modal",
            transitionDelay: "0.5s",
          }}
        >
          <Modal.Overlay sx={{ backgroundImage: "url(./assets/images/bg.jpg)" }} />
          {!isLoggedIn && <ModalLogin />}
          {error && <ModalError />}
        </Box>
        {isLoggedIn && (
          <Box
            id={HUD_CONTAINER_ID}
            sx={{
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {hero?.state?.isDead && <ModalRespawn />}
            {dropItem && <ModalDropAmount />}
            {sign && <ModalSign />}
            <MenuHud />
            <MenuBar />
          </Box>
        )}
      </AppContext.Provider>
    </ThemeProvider>
  );
}

export default App;
