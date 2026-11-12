'use strict';
// Descriptions and editors for well-known server.properties keys.
// Keys that exist in a server's file but are not listed here still show up
// (group "Other") so newer Minecraft versions keep working.

const META = {
  motd: { group: 'Players', type: 'text', desc: 'Message shown in the multiplayer server list' },
  'max-players': { group: 'Players', type: 'int', desc: 'How many players can be online at once' },
  'white-list': { group: 'Players', type: 'bool', desc: 'Only players on the whitelist can join' },
  'enforce-whitelist': { group: 'Players', type: 'bool', desc: 'Kick online players who are not on the whitelist when it reloads' },
  'online-mode': { group: 'Players', type: 'bool', desc: 'Check that every player has a real Minecraft account' },
  'op-permission-level': { group: 'Players', type: 'enum', options: ['1', '2', '3', '4'], desc: 'Default power level for operators (4 = everything)' },
  'function-permission-level': { group: 'Players', type: 'enum', options: ['1', '2', '3', '4'], desc: 'Permission level for datapack functions' },
  'player-idle-timeout': { group: 'Players', type: 'int', desc: 'Kick idle players after this many minutes (0 = never)' },
  'hide-online-players': { group: 'Players', type: 'bool', desc: 'Hide the player list in the server list' },
  'prevent-proxy-connections': { group: 'Players', type: 'bool', desc: 'Block players connecting through a VPN or proxy' },

  gamemode: { group: 'Gameplay', type: 'enum', options: ['survival', 'creative', 'adventure', 'spectator'], desc: 'Game mode for new players' },
  'force-gamemode': { group: 'Gameplay', type: 'bool', desc: 'Put players back in the default mode every time they join' },
  difficulty: { group: 'Gameplay', type: 'enum', options: ['peaceful', 'easy', 'normal', 'hard'], desc: 'How hard the world is' },
  hardcore: { group: 'Gameplay', type: 'bool', desc: 'One life only; players become spectators when they die' },
  pvp: { group: 'Gameplay', type: 'bool', desc: 'Players can damage each other' },
  'allow-flight': { group: 'Gameplay', type: 'bool', desc: 'Do not kick players for flying (needed for some mods)' },
  'spawn-protection': { group: 'Gameplay', type: 'int', desc: 'Radius around spawn that only operators can build in' },
  'enable-command-block': { group: 'Gameplay', type: 'bool', desc: 'Allow command blocks to run' },
  'spawn-monsters': { group: 'Gameplay', type: 'bool', desc: 'Hostile mobs can spawn' },
  'spawn-animals': { group: 'Gameplay', type: 'bool', desc: 'Animals can spawn' },
  'spawn-npcs': { group: 'Gameplay', type: 'bool', desc: 'Villagers can spawn' },

  'level-name': { group: 'World', type: 'text', desc: 'Folder name of the world to load' },
  'level-seed': { group: 'World', type: 'text', desc: 'Seed for new worlds (empty = random)' },
  'level-type': { group: 'World', type: 'enum', options: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:single_biome_surface'], desc: 'Generator used for new worlds' },
  'generate-structures': { group: 'World', type: 'bool', desc: 'Generate villages, temples and other structures' },
  'generator-settings': { group: 'World', type: 'text', desc: 'Extra JSON settings for flat or single-biome worlds' },
  'allow-nether': { group: 'World', type: 'bool', desc: 'Players can travel to the Nether' },
  'view-distance': { group: 'World', type: 'int', desc: 'Chunks sent to players (lower = less lag)' },
  'simulation-distance': { group: 'World', type: 'int', desc: 'Chunks around players where mobs and crops update' },
  'max-world-size': { group: 'World', type: 'int', desc: 'World border radius in blocks' },
  'initial-enabled-packs': { group: 'World', type: 'text', desc: 'Datapacks enabled when a world is created' },
  'initial-disabled-packs': { group: 'World', type: 'text', desc: 'Datapacks disabled when a world is created' },

  'server-port': { group: 'Network', type: 'int', desc: 'Port players connect to' },
  'server-ip': { group: 'Network', type: 'text', desc: 'Bind to a specific IP (empty = all)' },
  'enable-status': { group: 'Network', type: 'bool', desc: 'Show the server as online in the server list' },
  'enable-rcon': { group: 'Network', type: 'bool', desc: 'Remote console access over the network' },
  'rcon.port': { group: 'Network', type: 'int', desc: 'Port for RCON' },
  'rcon.password': { group: 'Network', type: 'text', secret: true, desc: 'Password for RCON (required to enable it)' },
  'broadcast-rcon-to-ops': { group: 'Network', type: 'bool', desc: 'Show RCON command output to online operators' },
  'broadcast-console-to-ops': { group: 'Network', type: 'bool', desc: 'Show console command output to online operators' },
  'enable-query': { group: 'Network', type: 'bool', desc: 'Answer GameSpy4 query requests' },
  'query.port': { group: 'Network', type: 'int', desc: 'Port for query' },
  'network-compression-threshold': { group: 'Network', type: 'int', desc: 'Compress packets bigger than this many bytes' },
  'rate-limit': { group: 'Network', type: 'int', desc: 'Max packets per second before a player is kicked (0 = off)' },
  'management-server-enabled': { group: 'Network', type: 'bool', desc: 'Enable the server management protocol (JSON-RPC)' },

  'enforce-secure-profile': { group: 'Advanced', type: 'bool', desc: 'Require players to have signed chat keys' },
  'sync-chunk-writes': { group: 'Advanced', type: 'bool', desc: 'Write chunks to disk synchronously (safer, slower)' },
  'max-tick-time': { group: 'Advanced', type: 'int', desc: 'Crash the server if one tick takes longer (ms, -1 = off)' },
  'max-chained-neighbor-updates': { group: 'Advanced', type: 'int', desc: 'Limit on chained block updates' },
  'entity-broadcast-range-percentage': { group: 'Advanced', type: 'int', desc: 'How far away entities are sent to players (%)' },
  'log-ips': { group: 'Advanced', type: 'bool', desc: 'Write player IP addresses into the log' },
  'use-native-transport': { group: 'Advanced', type: 'bool', desc: 'Use faster Linux networking when available' },
  'resource-pack': { group: 'Advanced', type: 'text', desc: 'URL of a resource pack players download' },
  'resource-pack-sha1': { group: 'Advanced', type: 'text', desc: 'SHA-1 checksum of the resource pack' },
  'resource-pack-id': { group: 'Advanced', type: 'text', desc: 'UUID of the resource pack' },
  'resource-pack-prompt': { group: 'Advanced', type: 'text', desc: 'Message shown when asking to download the pack' },
  'require-resource-pack': { group: 'Advanced', type: 'bool', desc: 'Kick players who decline the resource pack' },
  'text-filtering-config': { group: 'Advanced', type: 'text', desc: 'Chat filtering service settings' },
  'enable-jmx-monitoring': { group: 'Advanced', type: 'bool', desc: 'Expose JMX performance metrics' },
  'bug-report-link': { group: 'Advanced', type: 'text', desc: 'Link shown in the disconnect screen for bug reports' }
};

function describe(key, value) {
  const m = META[key];
  if (m) return Object.assign({ key }, m);
  const isBool = value === 'true' || value === 'false';
  return { key, group: 'Other', type: isBool ? 'bool' : /^-?\d+$/.test(value) ? 'int' : 'text', desc: 'Not a standard setting (added by a newer version, a mod, or by hand)' };
}

module.exports = { META, describe };
