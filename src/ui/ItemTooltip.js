import React from "react";
import { Flex, useAppContext, Text, Divider, Icon, TOOLTIP_STYLE } from "./";
import { Tooltip } from "react-tooltip";

const Label = (props) => <Text sx={{ fontWeight: "normal" }} {...props} />;

const ItemTooltip = ({ item, show }) => {
  const { hero } = useAppContext();
  const isSetActive = hero?.state?.activeSets?.includes?.(item?.setName);
  if (!item) return;
  return (
    <Tooltip id={item?.id} isOpen={show} style={TOOLTIP_STYLE}>
      <Flex
        sx={{
          fontWeight: "bold",
          whiteSpace: "nowrap",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          textTransform: "capitalize",
        }}
      >
        <Text>
          {item?.name}
          <Text color="gray.400" sx={{ ml: "2px" }}>
            {item?.amount > 1 && `(${item?.amount})`}
          </Text>
          {item?.slot == "spell" && <span> (Level {item?.ilvl})</span>}
        </Text>
        <Text color={item?.rarity}>
          {item?.rarity} {item?.base} {item?.setName ? "[" + item?.setName + "]" : ""}
        </Text>
        <Divider />
        {item?.slot !== "stackable" && (
          <Text>
            <Label>Slot:</Label> {item?.slot}
          </Text>
        )}
        {Object.keys(item?.stats).map((key) => {
          return (
            <Text>
              <Label>{key}:</Label> {item?.stats[key]}
            </Text>
          );
        })}
        {Object.keys(item?.percentStats).map((key) => {
          return (
            <Text>
              <Label>{key}:</Label> {item?.percentStats[key]}%
            </Text>
          );
        })}
        {Object.keys(item?.effects).map((key) => {
          if (key == "hp") {
            return (
              <Text>
                <Label>+</Label> {item?.effects[key]}% hp
              </Text>
            );
          }
        })}
        {item?.setBonus && <Divider />}
        {item?.setBonus &&
          Object.keys(item?.setBonus.percentStats).map((key) => {
            return (
              <Text color={isSetActive ? "set" : "gray.500"}>
                <Label>{key}:</Label> {item?.setBonus.percentStats[key]}%
              </Text>
            );
          })}
        {item?.setBonus &&
          Object.keys(item?.setBonus.stats).map((key) => {
            return (
              <Text color={isSetActive ? "set" : "gray.500"}>
                <Label>{key}:</Label> {item?.setBonus.stats[key]}
              </Text>
            );
          })}
        <Divider />
        <Flex sx={{ alignItems: "center", gap: 1 }}>
          <Icon icon="../assets/icons/gold.png" size={16} />
          {item?.cost * (item?.amount || 1) * (hero?.inflation || 1)}
        </Flex>
      </Flex>
    </Tooltip>
  );
};

export default ItemTooltip;
