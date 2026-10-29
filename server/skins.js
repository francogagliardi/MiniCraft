'use strict';
// Escala de jugabilidad de los aspectos (change aspectos-jugador): el servidor necesita el
// mismo factor que el cliente para validar los alcances de los golpes. `human`/`zombie` valen
// 1 (valores históricos intactos); un aspecto desconocido también cae en 1. Las alturas son las
// del catálogo de index.html (`/* skins:start */`), test/skins.mjs verifica que no deriven.

const BASE_H = 1.97; // top real del rig humano (cabellera incluida)

const SKIN_SIZE = {
  human: 1,
  fat: 1.70 / BASE_H,
  giant: 5.00 / BASE_H,
  small: 0.90 / BASE_H,
  zombie: 1,
  robot: 1.90 / BASE_H,
};

// Factor de tamaño del aspecto; cualquier valor ausente o desconocido se comporta como human.
function sizeFactor(skin) {
  return Object.prototype.hasOwnProperty.call(SKIN_SIZE, skin) ? SKIN_SIZE[skin] : 1;
}

// Alcance del golpe de espada a otra criatura/jugador (base 4.6) escalado por el aspecto.
function swordReach(skin) {
  return 4.6 * sizeFactor(skin);
}

module.exports = { BASE_H, SKIN_SIZE, sizeFactor, swordReach };
