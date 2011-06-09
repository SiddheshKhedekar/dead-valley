// Firearm

define(['game', 'BulletHit'], function (game, BulletHit) {

  var Firearm = function () {
  };

  Firearm.prototype.damage = 1;
  Firearm.prototype.range = 1000;

  Firearm.prototype.fire = function (start, end) {
    if (this.hasAmmo()) {
      this.decrementAmmo();
      game.map.rayTrace(start, end, this.range, function (result, sprite) {
        if (result) { // hit!
          game.sprites.push(new BulletHit(result));
        }
      });
      return true;
    }
    return false;
  };

  Firearm.prototype.hasAmmo = function () {
    return this.ammo > 0;
  };

  Firearm.prototype.decrementAmmo = function () {
    this.ammo--;
  };

  Firearm.prototype.reload = function () {
    this.ammo = this.ammoCapacity;
  };

  return Firearm;
});
