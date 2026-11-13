'use strict';
// Configuración de bots (change panel-bots-custom, capability bots/management):
// única fuente de límites, catálogo de aspectos, defaults por comportamiento,
// preset clásico y validación estricta del alta/edición. Módulo puro: sin DB,
// sin red y sin estado.
const Skins = require('./skins.js');

const BOT_LIMITS = {
  maxActive: 5,
  hp: [1, 100],
  damage: [0, 20],
  reach: [1, 10],
  speed: [1, 30],
};

// Mismo formato que users: 3–16 letras, números, guion y guion bajo.
const BOT_NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;

// Catálogo de aspectos: los de jugador + robot (reservado para bots).
const BOT_SKINS = [...Skins.PLAYER_SKINS, 'robot'];

const BOT_DEFAULTS = {
  cazador: {
    skin: 'robot', hp: 10, damage: 6, reach: 4.6, speed: 28.8,
    flying: true, takesDamage: false,
  },
  merodeador: {
    skin: 'human', hp: 10, damage: 0, reach: 1, speed: 6,
    flying: false, takesDamage: false,
  },
  // Defiende su zona contra criaturas; necesita aguantar varios golpes de zombi.
  guardian: {
    skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 6,
    flying: false, takesDamage: true,
  },
  // Deambula y solo pelea si lo golpean: recibe daño para que la retaliación
  // tenga sentido y muera como cualquier otro avatar.
  neutral: {
    skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 6,
    flying: false, takesDamage: true,
  },
};

// Valores históricos del bot cazador externo: el panel los precarga y el admin
// confirma un alta normal (la API no crea nada con un flag `preset`).
const CLASSIC_HUNTER_PRESET = {
  behavior: 'cazador', skin: 'robot', hp: 10, damage: 6,
  reach: 4.6, speed: 28.8, flying: true, takesDamage: false,
};

const BEHAVIOR_IDS = Object.keys(BOT_DEFAULTS);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isIntIn = (v, [min, max]) => isNum(v) && Number.isInteger(v) && v >= min && v <= max;
// Paso 0.1 tolerante al error de coma flotante (4.6 * 10 = 46.00000000000001).
const isTenthIn = (v, [min, max]) => isNum(v) && v >= min && v <= max &&
  Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

const FIELD_LABELS = {
  name: 'nombre', behavior: 'comportamiento', skin: 'aspecto', hp: 'vida',
  damage: 'daño', reach: 'alcance', speed: 'velocidad', flying: 'vuelo',
  takesDamage: 'recibe daño',
};

function error(field, code, reason) {
  return { field, code, reason: reason || `${FIELD_LABELS[field] || field}: valor inválido` };
}

function validateName(name) {
  if (typeof name !== 'string' || !BOT_NAME_RE.test(name)) {
    return error('name', 'invalid_bot_name',
      'el nombre debe tener 3 a 16 caracteres: letras, números, guion y guion bajo');
  }
  return null;
}

function validateBehavior(behavior) {
  if (typeof behavior !== 'string' || !BEHAVIOR_IDS.includes(behavior)) {
    return error('behavior', 'invalid_behavior', `el comportamiento debe ser ${BEHAVIOR_IDS.join(' o ')}`);
  }
  return null;
}

function validateSkin(skin) {
  if (typeof skin !== 'string' || !BOT_SKINS.includes(skin)) {
    return error('skin', 'invalid_skin', 'ese aspecto no está en el catálogo de bots');
  }
  return null;
}

const NUM_RULES = {
  hp: [isIntIn, BOT_LIMITS.hp, 'invalid_hp', 'la vida debe ser un entero entre 1 y 100'],
  damage: [isIntIn, BOT_LIMITS.damage, 'invalid_damage', 'el daño debe ser un entero entre 0 y 20'],
  reach: [isTenthIn, BOT_LIMITS.reach, 'invalid_reach', 'el alcance debe ir de 1 a 10 con paso 0.1'],
  speed: [isTenthIn, BOT_LIMITS.speed, 'invalid_speed', 'la velocidad debe ir de 1 a 30 con paso 0.1'],
};

const KNOWN_FIELDS = ['name', 'behavior', 'skin', 'hp', 'damage', 'reach', 'speed', 'takesDamage', 'flying'];
const ALIASES = { takes_damage: 'takesDamage' };

/**
 * Normaliza el cuerpo de alta (`partial:false`) o de edición (`partial:true`).
 * Devuelve `{ ok, value, errors }`. En alta exige `name` y `behavior` y aplica
 * los defaults del comportamiento; en edición solo valida/devolvera lo enviado.
 * Un código por campo (`errors[]`); el router usa el primero para el HTTP.
 */
function normalizeBotInput(body, { partial = false } = {}) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { ok: false, value: {}, errors: [error('body', 'invalid_request', 'el cuerpo debe ser un objeto JSON')] };
  }

  const input = {};
  for (const [rawKey, rawValue] of Object.entries(body)) {
    const key = ALIASES[rawKey] || rawKey;
    if (!KNOWN_FIELDS.includes(key)) {
      errors.push(error(rawKey, 'invalid_field', `${rawKey}: campo no permitido (el estado se cambia con Lanzar/Detener)`));
      continue;
    }
    input[key] = rawValue;
  }

  const value = {};

  if (!partial || input.name !== undefined) {
    const e = validateName(input.name);
    if (e) errors.push(e); else value.name = input.name;
  }
  if (!partial || input.behavior !== undefined) {
    const e = validateBehavior(input.behavior);
    if (e) errors.push(e); else value.behavior = input.behavior;
  }

  // Defaults por comportamiento (solo alta o cuando el edit envía uno).
  const behaviorForDefaults = BEHAVIOR_IDS.includes(input.behavior) ? input.behavior : null;
  const defaults = behaviorForDefaults ? BOT_DEFAULTS[behaviorForDefaults] : null;

  if (!partial || input.skin !== undefined) {
    if (input.skin !== undefined) {
      const e = validateSkin(input.skin);
      if (e) errors.push(e); else value.skin = input.skin;
    } else if (defaults) {
      value.skin = defaults.skin;
    }
  }

  for (const field of ['hp', 'damage', 'reach', 'speed']) {
    if (!partial || input[field] !== undefined) {
      if (input[field] !== undefined) {
        const [check, range, code, reason] = NUM_RULES[field];
        if (!check(input[field], range)) errors.push(error(field, code, reason));
        else value[field] = input[field];
      } else if (defaults) {
        value[field] = defaults[field];
      }
    }
  }

  for (const field of ['flying', 'takesDamage']) {
    if (!partial || input[field] !== undefined) {
      if (input[field] !== undefined) {
        if (typeof input[field] !== 'boolean') {
          errors.push(error(field, 'invalid_flag', `${FIELD_LABELS[field]}: debe ser true o false`));
        } else {
          value[field] = input[field];
        }
      } else if (defaults) {
        value[field] = defaults[field];
      }
    }
  }

  return { ok: errors.length === 0, value, errors };
}

/**
 * Proyección pública de un bot. `runtime` (opcional) es estado vivo del runtime
 * ({ online, hp, pos }) y NUNCA se persiste.
 */
function botView(row, runtime = null) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    behavior: row.behavior,
    skin: row.skin,
    hp: row.hp,
    damage: row.damage,
    reach: row.reach,
    speed: row.speed,
    takesDamage: row.takesDamage === true,
    flying: row.flying === true,
    active: row.active === true,
    runtime: runtime || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = {
  BOT_LIMITS, BOT_NAME_RE, BOT_SKINS, BOT_DEFAULTS, CLASSIC_HUNTER_PRESET,
  BEHAVIOR_IDS, normalizeBotInput, botView,
};
