import mapList from "./data/mapList.json";
import mapImageList from "./data/mapImageList.json";

const getMapByName = (name) => {
  return mapList?.find((m) => m?.mapName === name);
};

export { mapList, mapImageList, getMapByName };
