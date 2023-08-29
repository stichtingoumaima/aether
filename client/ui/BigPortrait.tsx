import { Flex, Box, PlayerRender } from "@aether/ui";

export default function BigPortrait({
  player,
  filteredSlots,
  width = 160,
  height,
  showShadow = true,
}) {
  return (
    <Box
      sx={{
        position: "relative",
        width: width,
        maxWidth: width,
        alignSelf: "end",
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          bottom: 0,
          height: height ?? width * 1.5,
          width: width,
          overflow: "hidden",
          position: "absolute",
          zIndex: 2,
        }}
      >
        <PlayerRender
          player={player}
          filteredSlots={filteredSlots}
          sx={{ transform: `translate(-50%, 0) scale(3)`, top: "50%", left: "50%" }}
        />
      </Box>
      {showShadow && (
        <Box
          sx={{
            zIndex: 0,
            background: "shadow.10",
            borderRadius: "12px",
            width: "100%",
            height: width / 4,
            bottom: 0,
            position: "absolute",
          }}
        />
      )}
    </Box>
  );
}
