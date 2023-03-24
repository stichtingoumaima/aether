import { resolveAsset } from "../shared/Assets";
class LootItem extends Phaser.GameObjects.Container {
  constructor(scene, loot) {
    super(scene, loot.x, loot.y);
    this.scene = scene;
    this.item = loot.item;
    this.id = loot.id;
    scene.physics.add.existing(this);
    const bodySize = 8 * (this?.scale || 1);
    this.body.setCircle(bodySize, -bodySize, -bodySize);
    this.addLootSprite(loot);
    this.setDepth(95 + this.y + this?.body?.height);
    scene.events.on("update", this.update, this);
    scene.events.once("shutdown", this.destroy, this);
  }
  addLootSprite(loot) {
    let asset = resolveAsset(loot.item, this.scene.hero);
    this.lootShadow = new Phaser.GameObjects.Sprite(this.scene, 0, 4, asset.texture, "preview");
    this.lootShadow.setTint(0x000000).setAlpha(0.1);
    this.lootSprite = new Phaser.GameObjects.Sprite(this.scene, 0, 0, asset.texture, "preview");
    if (this.item.tint) this.lootSprite.setTint(this.item.tint);
    this.add(this.lootShadow);
    this.add(this.lootSprite);
  }
  destroy() {
    if (this.scene) this.scene.events.off("update", this.update, this);
    super.destroy();
  }
}

export default LootItem;
