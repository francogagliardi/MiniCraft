'use strict';
// Lógica pura del sueño multijugador: quién cuenta para el quórum y cuánto avanzar
// el reloj para caer justo después del amanecer. Sin red, sin estado global.

// Exentos: el bot (declara `bot:true` en el hello) y el admin. No suman al total
// necesario ni al contador de durmientes.
function isExempt(p) {
  return !!p && (p.bot === true || p.mode === 'admin');
}

// `players`: array de registros {mode, bot, dead, sleeping}.
// - Los muertos no cuentan (ni en need ni como durmientes): no pueden dormir y
//   bloquearían la noche para siempre.
// - `ready` exige al menos un durmiente no-bot y que duerman todos los reales vivos.
//   Con need 0 (solo admin/bot) alcanza con que el admin duerma: está exento de la
//   obligación, pero no hay nadie más a quien esperar.
function quorum(players) {
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  const real = list.filter(p => !isExempt(p) && !p.dead);
  const count = real.filter(p => p.sleeping === true).length;
  const anySleeper = list.some(p => p.sleeping === true && p.bot !== true && !p.dead);
  return { need: real.length, count, ready: anySleeper && count === real.length };
}

// Milisegundos a sumar al reloj para que la fase caiga ≈1 s después del amanecer
// (fase 0). `phase` está en [0,1) y `cycleMs` es la duración total del ciclo.
function dawnAdvanceMs(phase, cycleMs) {
  const p = +phase, c = +cycleMs;
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0) return 0;
  return (1 - p) * c + 1000;
}

module.exports = { isExempt, quorum, dawnAdvanceMs };
