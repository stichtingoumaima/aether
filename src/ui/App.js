import React, { useEffect, useState, createContext, useContext } from "react";
import { isTouchScreen } from "../utils";
import { ThemeProvider, Box, Button, theme, Flex, Icon, MenuEquipment } from "./";

const AppContext = createContext();

const TAB_EQUIPMENT = "TAB_EQUIPMENT";
const TAB_INVENTORY = "TAB_INVENTORY";

export const useAppContext = () => {
  return useContext(AppContext);
};

function App({ socket, debug }) {
  const [isConnected, setIsConnected] = useState(true);
  const [currentTab, setCurrentTab] = useState();
  const [player, setPlayer] = useState({});

  const toggleTab = (tab) => {
    if (currentTab === tab) {
      return setCurrentTab(null);
    }
    return setCurrentTab(tab);
  };

  useEffect(() => {
    socket.on("connect", () => {
      setIsConnected(true);
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
    });
    socket.on("heroInit", (payload = {}) => {
      const { socketId, players } = payload;
      const player = players?.find((p) => p?.socketId === socketId);
      setPlayer(player);
    });
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <AppContext.Provider
        value={{
          isConnected,
          setIsConnected,
          currentTab,
          currentTabEquipment: currentTab === TAB_EQUIPMENT,
          toggleTab,
          setCurrentTab,
          player,
          socket,
          debug,
        }}
      >
        <GameWrapper>
          <MenuBar />
          {!currentTab && isTouchScreen && <AttackPad />}
        </GameWrapper>
      </AppContext.Provider>
    </ThemeProvider>
  );
}

const GameWrapper = (props) => {
  return (
    <Box
      sx={{
        inset: "0 0 0 0",
        position: "fixed",
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
        {...props}
      />
    </Box>
  );
};

const AttackPad = () => {
  return (
    <Button
      variant="menu"
      onTouchStart={(e) => {
        window.dispatchEvent(new Event("hero_attack"));
      }}
      sx={{
        bottom: 74,
        right: 20,
        p: 44,
        borderRadius: "100%",
        position: "absolute",
      }}
    >
      <Icon icon="../assets/icons/handRight.png" />
    </Button>
  );
};

const MenuBar = () => {
  const { isConnected, toggleTab, currentTabEquipment } = useAppContext();
  return (
    <Flex
      sx={{
        bottom: 0,
        right: 0,
        left: 0,
        flexDirection: "column",
        position: "fixed",
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    >
      <MenuEquipment />
      <Flex sx={{ gap: 1, alignItems: "center", bg: "shadow.10", p: 2 }}>
        <Box>
          {isConnected ? (
            <Icon icon="../assets/icons/success.png" sx={{ opacity: 0.5 }} />
          ) : (
            <Icon icon="../assets/icons/danger.png" sx={{ opacity: 0.5 }} />
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="menu"
          className={currentTabEquipment ? "active" : ""}
          onClick={() => toggleTab(TAB_EQUIPMENT)}
        >
          <Icon icon="../assets/icons/helmet.png" />
        </Button>
        <Button variant="menu" onClick={() => toggleTab(TAB_INVENTORY)}>
          <Icon icon="../assets/icons/bag.png" />
        </Button>
      </Flex>
    </Flex>
  );
};

export default App;
