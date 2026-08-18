# Angel Sword Owlbear Extension Architecture

## Product decision

Ship one installed extension named **Angel Sword Companion**. Keep its features
as separate code modules so they can be developed and tested independently,
but do not make a GM install separate Dice, Character, Initiative, Movement,
and Conditions extensions.

The one-extension model prevents duplicate character bindings, incompatible
module versions, competing state updates, and multiple setup links. A separate
Angel Sword Dice product should only be considered later if there is a real use
case for tables that do not use the Lyrian Chronicles character system.

## Authority model

The Angel Sword builder remains authoritative for character creation and rules.
Owlbear provides the shared room, map, players, tokens, and extension runtime.
The extension stores only the compact state required for table interaction:

- character ID and display name;
- owning Owlbear player;
- bound Owlbear token;
- current/max combat resources required by later modules;
- movement speed;
- resolved roll events and a short room log.

It does not copy the full rulebook, lore, monster catalog, or complete builder
source into Owlbear.

## Version 0.2 milestone

Version 0.2 proves the shared identity and event backbone:

1. Import a builder Character JSON or official `.aschar.json` file.
2. Normalize it to the compact versioned character contract in `owlbear/core.js`.
3. Select one Owlbear item on the Character layer.
4. Bind the player, character, and token with namespaced Owlbear metadata.
5. Share complete roll records through a namespaced Owlbear broadcast channel.
6. Keep a deduplicated short roll history in room metadata.
7. Relay other players' room rolls back toward an open builder log on a
   best-effort basis.

The extension includes a persistent `background_url` so the room relay does not
depend on the action panel remaining open.

The official Owlbear SDK is bundled into `owlbear/dist/` during the project
build. The installed extension does not fetch executable SDK code from a
separate CDN at runtime.

## Important browser boundary

A normal builder tab and an extension iframe embedded under Owlbear can occupy
different browser storage partitions. `BroadcastChannel` between those contexts
must therefore remain marked Alpha until it passes a physical two-browser room
test. The extension's own character import, token metadata, connection-test
roll, room broadcast, and room log use Owlbear's SDK and do not depend on that
cross-site channel.

If external-sheet synchronization is not reliable in the target browsers, the
safe next choices are:

1. put the compact combat controls directly in the extension; or
2. add a deliberately designed synchronization service.

Do not silently promote local `BroadcastChannel` behavior into a cloud-sync
claim.

## Planned internal modules

| Module | Purpose | Release order |
|---|---|---|
| Core identity | Character import and player/token binding | 0.2 |
| Roll log | Room broadcasts, deduplication, short history | 0.2 |
| Visual dice | Mirrored Angel Sword dice with one authoritative result | Later |
| Combat state | Damage, healing, conditions, resource changes | Later |
| Fluid initiative | Lyrian encounter timing and reset rules | Later |
| Movement | Distance used, remaining movement, warnings, GM undo | Last |

## Dice authority

Do not run two independent random rolls. The first visual-dice milestone should
be sheet-authoritative: the builder determines the individual results and total,
then Owlbear mirrors the same outcome. A later design may make Owlbear physics
authoritative, but only if the builder can wait for and safely recover from that
result.

Studying or forking Owlbear's Dice project is a separate licensing and technical
decision. If GPL-covered code is incorporated, preserve its notices and publish
the corresponding extension source. Do not communicate with another installed
dice extension through undocumented internals.

## Explicitly out of scope for 0.2

- changing HP or healing from a token menu;
- conditions and Dodge markers;
- action/resource consumption;
- Lyrian fluid initiative;
- movement accounting or movement prevention;
- synchronized 3D dice;
- permanent cloud character storage;
- claiming that remote-player deployment works before the public manifest is
  hosted and physically tested.

## Release gate

The 0.2 milestone is not ready to leave Alpha until a GM and a player on two
separate browser sessions verify:

- both receive the enabled extension through the normal Owlbear room;
- each can import and bind their own character token;
- another player cannot overwrite a binding they do not own;
- a GM can correct a binding;
- connection-test and real character-sheet rolls appear once for everyone;
- reconnecting retains the binding and short room log;
- closing the panel does not stop the background relay;
- Chrome, Edge, Firefox, and Safari behavior is recorded, including whether
  external-sheet roll return works through their storage partitioning.

## Official Owlbear references

- [Extension architecture and manifest](https://docs.owlbear.rodeo/extensions/getting-started/)
- [Manifest `background_url`](https://docs.owlbear.rodeo/extensions/reference/manifest/)
- [Player identity, role, selection, and metadata](https://docs.owlbear.rodeo/extensions/apis/player/)
- [Scene item reads and metadata updates](https://docs.owlbear.rodeo/extensions/apis/scene/items/)
- [Room broadcast API](https://docs.owlbear.rodeo/extensions/apis/broadcast/)
- [Metadata namespacing](https://docs.owlbear.rodeo/extensions/reference/metadata/)
