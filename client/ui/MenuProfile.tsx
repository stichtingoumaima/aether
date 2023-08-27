import { Menu, MenuHeader, useAppContext, Portrait, MenuButton, MENU_MAX_WIDTH } from "./";
import { Flex, Text, Input } from "@aether/ui";

const MenuPicker = ({ children, onPlus = () => {}, onMinus = () => {} }) => {
  return (
    <Flex
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        bg: "shadow.10",
        p: 1,
      }}
    >
      <MenuButton
        size={16}
        sx={{ "& .icon": { transform: "rotate(90deg) scaleY(-1)" } }}
        onClick={onMinus}
      />
      <Text>{children}</Text>
      <MenuButton size={19} sx={{ "& .icon": { transform: "rotate(90deg)" } }} onClick={onPlus} />
    </Flex>
  );
};

const MenuProfile = () => {
  const { tabProfile, setTabProfile, hero, socket } = useAppContext();

  return (
    <Menu
      sx={{
        display: tabProfile ? "flex" : "none",
      }}
    >
      <MenuHeader icon={`./assets/icons/mirror.png`} onClick={() => setTabProfile(false)}>
        Profile
      </MenuHeader>
      <Flex sx={{ gap: 4, flexWrap: "wrap", justifyContent: "end", maxWidth: MENU_MAX_WIDTH }}>
        <Flex
          sx={{
            flex: 1,
            justifyContent: "center",
            gap: 2,
            alignItems: "center",
            flexDirection: ["column", "column", "row"],
          }}
        >
          <Portrait
            scale={2.25}
            player={hero}
            size={150}
            topOffset={48}
            filteredSlots={["accessory", "helmet", "boots", "hands", "gloves"]}
          />
          <Input
            sx={{ width: 150, fontSize: 4 }}
            defaultValue={hero?.profile?.userName}
            onBlur={(e) => {
              /* Hack to send if `Done` button is pushed */
              const userName = e?.target?.value;
              if (userName?.trim() !== "") socket.emit("updateProfile", { userName });
            }}
          />
        </Flex>
        <Flex sx={{ flexDirection: "column", gap: 1 }}>
          <MenuPicker
            onPlus={() => socket.emit("updateProfile", { hair: { texture: 1 } })}
            onMinus={() => socket.emit("updateProfile", { hair: { texture: -1 } })}
          >
            Hair Style
          </MenuPicker>
          <MenuPicker
            onPlus={() => socket.emit("updateProfile", { hair: { tint: 1 } })}
            onMinus={() => socket.emit("updateProfile", { hair: { tint: -1 } })}
          >
            Hair Color
          </MenuPicker>
          <MenuPicker
            onPlus={() => socket.emit("updateProfile", { whiskers: { texture: 1 } })}
            onMinus={() => socket.emit("updateProfile", { whiskers: { texture: -1 } })}
          >
            Whiskers
          </MenuPicker>
          <MenuPicker
            onPlus={() => socket.emit("updateProfile", { whiskers: { tint: 1 } })}
            onMinus={() => socket.emit("updateProfile", { whiskers: { tint: -1 } })}
          >
            Whiskers Color
          </MenuPicker>
          <MenuPicker
            onPlus={() => socket.emit("updateProfile", { face: { texture: 1 } })}
            onMinus={() => socket.emit("updateProfile", { face: { texture: -1 } })}
          >
            Face
          </MenuPicker>
          <MenuPicker
            onPlus={() => socket.emit("updateProfile", { skin: { tint: 1 } })}
            onMinus={() => socket.emit("updateProfile", { skin: { tint: -1 } })}
          >
            Skin
          </MenuPicker>
          <MenuPicker
            onPlus={() => socket.emit("updateProfile", { body: 1 })}
            onMinus={() => socket.emit("updateProfile", { body: -1 })}
          >
            Body
          </MenuPicker>
        </Flex>
      </Flex>
    </Menu>
  );
};

export default MenuProfile;
