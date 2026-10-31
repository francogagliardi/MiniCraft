# Spec Delta

## ADDED Requirements

### Requirement: Declaración de bot en el hello

El bot SHALL declarar `bot:true` en su mensaje `hello`, además de su `mode:'player'` y su aspecto, para que el servidor pueda excluirlo del quórum de sueño sin cambiar el resto de su contrato de jugador.

#### Scenario: El bot se identifica como bot

- **WHEN** el bot se conecta o se reconecta
- **THEN** su `hello` incluye `bot:true` y el servidor lo registra como bot

#### Scenario: Un cliente humano sigue siendo real

- **WHEN** un cliente no envía `bot:true` en su `hello`
- **THEN** el servidor lo trata como jugador real para el quórum de sueño

#### Scenario: El bot no duerme ni bloquea

- **WHEN** el bot está conectado durante la noche y hay jugadores reales durmiendo
- **THEN** el bot no aparece en el contador de durmientes, no suma al total necesario y no impide el salto al amanecer
