




export const STORAGE_KEY = "lyrian-chronicles-character-suite-v2";
export const SAVE_SLOTS_KEY = "lyrian-chronicles-character-suite-slots-v1";
    export const ACTIVE_SAVE_SLOT_KEY = "lyrian-chronicles-character-suite-active-slot-v1";
    export const SELECTED_GAME_VERSION_KEY = "lyrian-chronicles-selected-game-version-v2";
    export const SELECTED_GAME_VERSION_LATEST_KEY = "lyrian-chronicles-selected-game-version-latest-v1";
    export const VERSION_STATUS_ENDPOINT = "/api/status";
    export const VERSION_CHECK_ENDPOINT = "/api/versions/check";
    export const VERSION_DOWNLOAD_ENDPOINT = "/api/versions/download";
    export const VERSION_LOCAL_ENDPOINT = "/api/versions/local";
    export const PDF_STATE_MARKER_START = "%%LYRIAN_STATE_BEGIN%%";
export const PDF_STATE_MARKER_END = "%%LYRIAN_STATE_END%%";
export const EMBEDDED_STATE_FORMAT = "LYRIAN_STATE_V2";
export const EMBEDDED_STATE_CHUNK_SIZE = 24000;
export const PDF_STATE_MANIFEST_FIELD = "_LyrianStateManifest";
export const PDF_STATE_CHUNK_FIELD_PREFIX = "_LyrianStateChunk_";
export const SPREADSHEET_META_SHEET = "_LyrianState";
export const SPREADSHEET_CELL_TEXT_LIMIT = 32000;
export const SPREADSHEET_TEMPLATE_ASSET = "assets/lyrian-google-template.xlsx";
export const PDF_VISIBLE_FIELD_TEXT_LIMIT = 6000;
export const PDF_TEMPLATE_ASSET = "assets/character-sheet-1.2.pdf";
export const PORTRAIT_NORMALIZE_THRESHOLD = 900000;
export const PORTRAIT_MAX_DIMENSION = 960;
export const PORTRAIT_JPEG_QUALITY = 0.82;
export const SAVE_SNAPSHOT_PORTRAIT_LIMIT = 1200000;
export const XLSX_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
export const XLSX_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
export const XLSX_OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const XLSX_WORKSHEET_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
export const XLSX_CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
export const XLSX_WORKSHEET_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
export const PAGE_BACKGROUNDS = {
      1: "assets/page-1.png",
      2: "assets/page-2.png",
      3: "assets/page-ability.png",
      4: "assets/page-ability.png",
      5: "assets/page-ability.png",
      6: "assets/page-ability.png"
    };
    export const STARTING_CLASS_EXP = 1000;
    export const STARTING_INTERLUDE_POINTS = 3;
    export const CLASS_PURCHASABLE_LEVELS = 7;
    export const CLASS_PASSIVE_SLOTS = {
      skills: 2,
      heart: 4,
      soul: 6
    };
    export const CLASS_GROUP_ROLE_ORDER = ["Controller", "Defender", "Healer", "Striker", "Support", "Utility", "Specialist", "Artisan", "Gatherer"];
    export const BUILDER_STEPS = [
      {
        id: "race",
        label: "Primary Race",
        short: "Species",
        title: "Choose a Primary Race",
        lead: "Start with the broad race choice that shapes the rest of the build. The detail panel shows the pulled Lyrian description, race benefits, and signature race abilities."
      },
      {
        id: "ancestry",
        label: "Ancestry / Sub Race",
        short: "Ancestry",
        title: "Choose an Ancestry or Sub Race",
        lead: "This step narrows the build into a more specific lineage. Options automatically filter to the selected primary race whenever the site data provides that relationship."
      },
      {
        id: "profile",
        label: "Name & Profile",
        short: "Profile",
        title: "Set the Character Identity",
        lead: "Enter the name and the core profile details that should follow the character through the builder and into the final sheet."
      },
      {
        id: "main-stats",
        label: "Main Stats",
        short: "Main Stats",
        title: "Assign the Main Stats",
        lead: "At character creation, main stats normally use Lyrian's fixed array of 5, 4, 4, 3, but you can also switch this step into custom entry mode when you want to type values manually. They are the base values that drive the derived combat numbers on the sheet."
      },
      {
        id: "secondary-stats",
        label: "Secondary Stats",
        short: "Secondary",
        title: "Assign the Secondary Stats",
        lead: "At character creation, secondary stats normally use Lyrian's fixed array of 5, 4, 3, 2, 1, but you can also switch this step into custom entry mode when you want manual values. They feed the character's skill checks and broader problem-solving profile."
      },
      {
        id: "breakthroughs",
        label: "Breakthroughs",
        short: "Breakthroughs",
        title: "Pick Breakthroughs",
        lead: "Choose the breakthroughs you want carried into the builder summary and the breakthrough section of the final sheet."
      },
      {
        id: "classes",
        label: "Classes",
        short: "Classes",
        title: "Choose Classes",
        lead: "Browse the full Lyrian class catalog with pulled descriptions, roles, requirements, and key abilities, then add the ones you want reflected on the sheet."
      },
      {
        id: "skills",
        label: "Skills",
        short: "Skills",
        title: "Assign Skills",
        lead: "Lyrian skill checks use the affiliated sub stat plus main skill plus expertise. This step lets you spend the 10-point creation pool on main skills and expertise while the total bonuses update live."
      },
      {
        id: "equipment",
        label: "Equipment",
        short: "Equipment",
        title: "Choose Equipment",
        lead: "Select the items you want the builder to seed into the combat inventory and the items notes page."
      },
      {
        id: "review",
        label: "Review & Finish",
        short: "Review",
        title: "Review the Character",
        lead: "Take one final pass over the build summary, then continue into the live character sheet."
      }
    ];
export const NAME_FIELDS = ["Name", "Name2", "Name3", "Name4", "Name5", "Name6"];
export const MULTILINE_FIELDS = new Set(["Injuries", "Personality", "Appearance", "Items", "Proficiencies", "BName", "BDescription"]);
export const SUBSTAT_OPTIONS = ["Fitness", "Cunning", "Reason", "Awareness", "Presence"];
export const SKILL_OPTIONS = [
      "Athletics", "Riding", "Deception", "Roguecraft", "Stealth", "Artifice", "Appraise",
      "Common Knowledge", "Flight", "History", "Linguistics", "Magic", "Medicine", "Religion",
      "Animal Husbandry", "Insight", "Perception", "Survival", "Art", "Intimidation", "Negotiation"
    ];
export const SKILL_DEFINITIONS = [
      { name: "Athletics", stat: "Fitness" },
      { name: "Riding", stat: "Fitness" },
      { name: "Deception", stat: "Cunning" },
      { name: "Roguecraft", stat: "Cunning" },
      { name: "Stealth", stat: "Cunning" },
      { name: "Artifice", stat: "Reason" },
      { name: "Appraise", stat: "Reason" },
      { name: "Common Knowledge", stat: "Reason" },
      { name: "Flight", stat: "Reason" },
      { name: "History", stat: "Reason" },
      { name: "Linguistics", stat: "Reason" },
      { name: "Magic", stat: "Reason" },
      { name: "Medicine", stat: "Reason" },
      { name: "Religion", stat: "Reason" },
      { name: "Animal Husbandry", stat: "Awareness" },
      { name: "Insight", stat: "Awareness" },
      { name: "Perception", stat: "Awareness" },
      { name: "Survival", stat: "Awareness" },
      { name: "Art", stat: "Presence" },
      { name: "Intimidation", stat: "Presence" },
      { name: "Negotiation", stat: "Presence" },
      { name: "Alchemy", stat: "Reason", group: "crafting" },
      { name: "Armorsmithing", stat: "Fitness", group: "crafting" },
      { name: "Art Magic", stat: "Presence" },
      { name: "Blacksmithing", stat: "Fitness", group: "crafting" },
      { name: "Carpentry", stat: "Fitness", group: "crafting" },
      { name: "Culinary", stat: "Presence", group: "crafting" },
      { name: "Expert Knowledge", stat: "Reason" },
      { name: "Farming", stat: "Awareness", group: "gathering" },
      { name: "Foraging", stat: "Awareness", group: "gathering" },
      { name: "Magic Perception", stat: "Awareness" },
      { name: "Mining", stat: "Fitness", group: "gathering" }
    ];
export let SKILL_EXPERTISE_OPTIONS = {
      Athletics: ["Swimming", "Jumping", "Climbing", "Basketball"],
      Riding: ["Horses", "Raptors", "Giant Rabbits"],
      Deception: ["Distraction", "Lying"],
      Roguecraft: ["Lockpicking", "Jury Rigging", "Traps"],
      Stealth: ["Forests", "Urban", "Snow"],
      Artifice: ["Craftsmanship", "Swords", "Guns", "Manufacturers"],
      Appraise: ["Gemstone Grading", "Antique Weapons", "Merchant Guild Valuations", "Forgery Detection"],
      "Common Knowledge": ["Airships", "Forests", "Physics", "Chemistry"],
      Flight: ["Cruiser-Class Airships", "Aerial Staves", "Airship Shields", "Airship Engines", "Airship Navigation", "Leyline Cartography"],
      History: ["Westrian History", "Northi Noble Houses", "Royal Etiquette", "Battlefield Command"],
      Linguistics: ["Cyphers"],
      Magic: ["Dispel", "Magic Hacking", "Fire Magic", "Magic Traps"],
      Medicine: ["Natural Medicines", "Biology: Humans"],
      Religion: ["Faith Spell Identification", "Church of Westria"],
      "Animal Husbandry": ["Horses", "Hawks", "Raptors"],
      Insight: ["Body Language", "Handwriting"],
      Perception: ["Urban", "Forest", "Snow", "Hearing"],
      Survival: ["Improvised Cooking", "Wayfinding", "Forest Survival", "Fishing"],
      Art: ["Cartography", "Memory Drawing", "Singing", "Dancing"],
      Intimidation: ["Mercantile", "Nobility", "Commonfolk"],
      Negotiation: ["Mercantile", "Nobility", "Commonfolk"],
      Alchemy: ["Flasks", "Elixirs", "Potions", "Poisons", "Salves"],
      Armorsmithing: ["Clothing", "Light Armor", "Medium Armor", "Heavy Armor", "Shields"],
      Artificing: ["Pistol", "Shotgun", "Musket", "Sniper Rifle", "Airships", "Weapon Artifice", "Assist Artifice", "Basic Artifice"],
      Blacksmithing: [
        "Small Weapons", "Polearms", "Light Swords", "Longsword", "Dueling Weapons",
        "Axes", "Bludgeoning Weapons", "Katana", "Heavy Blades", "Twinblade",
        "Thrown", "Set of Missiles", "Bow", "Crossbow", "Musket", "Tools",
        "Artisan Weapons"
      ],
      Carpentry: ["Bows", "Crossbows", "Staves", "Wands", "Slings", "Whips", "Buildings"],
      Culinary: ["Food", "Alchemy Units", "Herbs"]
    };
    export const SKILL_ALIASES = new Map([
      ["artificing", "Artifice"]
    ]);
    export const OFFICIAL_LANGUAGE_OPTIONS = [
      "Common",
      "Sorthen",
      "Sylvan",
      "Kiraran",
      "Chimera sub-race dialect"
    ];
export const COMMON_WEAPON_GROUP_OPTIONS = [
      "Small Weapons",
      "Polearms",
      "Light Swords",
      "Longsword",
      "Dueling Weapons",
      "Axes",
      "Bludgeoning Weapons",
      "Katana",
      "Heavy Blades",
      "Twinblade",
      "Thrown",
      "Set of Missiles",
      "Bow",
      "Crossbow",
      "Musket",
      "Sling"
    ];
export const SPECIALITY_WEAPON_GROUP_OPTIONS = [
      "Pistol",
      "Shotgun",
      "Sniper Rifle",
      "Saboteur Thread Daggers",
      "Lance",
      "Whip",
      "Gauntlets",
      "Wand",
      "Magic Staff",
      "Scythe",
      "Giant Scissors",
      "Pickaxe",
      "Hori",
      "Sickle",
      "Smith's Hammer"
    ];
export const DEMON_CLAN_SKILL_OPTIONS = {
      wi: ["Deception", "Roguecraft", "Stealth"],
      lir: ["Insight", "Religion", "Magic"],
      d: ["Athletics", "Survival", "Intimidation"],
      ar: ["History", "Common Knowledge", "Insight"],
      lu: ["Magic", "Religion", "Common Knowledge"],
      ni: ["Artifice", "Flight", "Appraise", "Common Knowledge"],
      un: ["Art", "Negotiation", "Perception", "Common Knowledge"],
      vi: ["Medicine", "Insight", "Religion"],
      none: ["Common Knowledge", "Linguistics", "Negotiation"]
    };
export const CREATION_SKILL_POINT_BUDGET = 10;
export const BREAKTHROUGH_CREATION_BUDGET = 300;
export const BASE_STARTING_CLIM = 3000;
export const DEFAULT_CHARACTER_START_MODE = "standard";
export const MIRANE_START_MODE_ID = "mirane";
export const MIRANE_STARTING_CLIM_BONUS = 1000;
export const MIRANE_RAW_MATERIAL_CLIM_LIMIT = 2500;
export const MIRANE_SINGLE_MATERIAL_CLIM_LIMIT = 1000;
export const MIRANE_CRAFTING_INTERLUDE_EXP = 20;
export const MIRANE_JOB_BASE_CLIM = 150;
export const MIRANE_JOB_ARTISAN_BONUS_CLIM = 50;
export const MIRANE_GATHER_BASE_UNITS = 300;
export const MIRANE_GATHER_MASTERY_BONUS_UNITS = 300;
export const MIRANE_IP_SHOP_PRICE_CAP = 4000;
export const MIRANE_IP_SHOP_SLOT_LIMIT = 10;
export const MIRANE_IP_SHOP_SALE_PERCENT_CAP = 130;
export const CHARACTER_START_MODES = [
      {
        id: DEFAULT_CHARACTER_START_MODE,
        label: "Standard Play",
        summary: "Rules-as-written character creation with the normal 3000 starting Clim."
      },
      {
        id: MIRANE_START_MODE_ID,
        label: "Mirane Expedition",
        summary: "Standard character creation plus 1000 Clim and Mirane's restricted-creation and starting-material rules."
      }
    ];
export const MAIN_STAT_CREATION_ARRAY = [5, 4, 4, 3];
export const SECONDARY_STAT_CREATION_ARRAY = [5, 4, 3, 2, 1];
export const MAIN_STATS = [
      { key: "Focus", description: "Increases the accuracy of your attacks and raises the difficulty of saves against your effects." },
      { key: "Power", description: "Increases the damage dealt by attacks and increases your max Mana." },
      { key: "Agility", description: "Increases your Evasion, RP, and Initiative." },
      { key: "Toughness", description: "Increases your HP, Save bonus, and Guard value." }
    ];
export const SECONDARY_STATS = [
      { key: "Fitness", description: "Pairs with physically forceful skill applications." },
      { key: "Cunning", description: "Pairs with stealth, trickery, and subtle execution." },
      { key: "Reason", description: "Pairs with learned, analytical, and magical problem solving." },
      { key: "Awareness", description: "Pairs with perception, survival, and environmental awareness." },
      { key: "Presence", description: "Pairs with social pressure, persuasion, and force of personality." }
    ];
export const PLAY_BASIC_ACTIONS = [
      { id: "light-attack", label: "Light Attack", costLabel: "1 AP", summary: "Quick offensive action using your current light attack bonus.", rollType: "lightAttack", tags: ["Attack"] },
      { id: "heavy-attack", label: "Heavy Attack", costLabel: "2 AP", summary: "A stronger attack using your current heavy attack bonus.", rollType: "heavyAttack", tags: ["Attack"] },
      { id: "precise-attack", label: "Precise Attack", costLabel: "2 AP", summary: "Accuracy-focused strike using your current precise attack bonus.", rollType: "preciseAttack", tags: ["Attack"] },
      { id: "move", label: "Move", costLabel: "1 AP", summary: "Move up to your current Speed value.", valueType: "speed", tags: ["Movement"] },
      { id: "double-move", label: "Double Move", costLabel: "2 AP", summary: "Move twice your current Speed value this turn.", valueType: "speedDouble", tags: ["Movement"] },
      { id: "dodge", label: "Dodge", costLabel: "1 RP", summary: "Use your current Dodge value as your reactive defense baseline.", valueType: "dodge", tags: ["Reaction"] },
      { id: "block", label: "Block", costLabel: "1 RP", summary: "Use your current Block value as your reactive defense baseline.", valueType: "block", tags: ["Reaction"] }
    ];
export const PLAY_ROLLS = [
      { id: "initiative", label: "Roll Initiative", type: "initiative" },
      { id: "save-bonus", label: "Roll Saving Throw", type: "saveBonus" },
      { id: "light-roll", label: "Roll Light Attack", type: "lightAttack" },
      { id: "heavy-roll", label: "Roll Heavy Attack", type: "heavyAttack" },
      { id: "precise-roll", label: "Roll Precise Attack", type: "preciseAttack" }
    ];
export const DICE_TRAY_TYPES = [
      { sides: 20, label: "d20" },
      { sides: 12, label: "d12" },
      { sides: 100, label: "d100" },
      { sides: 10, label: "d10" },
      { sides: 8, label: "d8" },
      { sides: 6, label: "d6" },
      { sides: 4, label: "d4" }
    ];
export const DICE_SOUND_ASSETS = {
      rollBeds: ["assets/sounds/dice-roll-bed-142528.mp3"],
      impacts: ["assets/sounds/dice-impact-95077.mp3"]
    };
    export const DICE_PREVIEW_FALLBACK_URL = "assets/dice/dice-coming-soon.svg";
    export const DICE_SETS = [
      {
        id: "new-angelsword",
        name: "Angel Sword Dice",
        description: "High-detail ivory, gold, sky-blue, and angelic sword dice.",
        basePath: "assets/dice/new-angelsword",
        imageExtension: "png",
        preview: "selection-preview.png",
        available: true
      },
      {
        id: "leaflit",
        name: "Leaflit Dice",
        description: "Downloadable dice pack planned for a future update.",
        basePath: "assets/dice",
        imageExtension: "svg",
        preview: "dice-coming-soon.svg",
        available: false,
        availabilityLabel: "Coming soon"
      },
      {
        id: "asari",
        name: "Asari Dice",
        description: "Downloadable dice pack planned for a future update.",
        basePath: "assets/dice",
        imageExtension: "svg",
        preview: "dice-coming-soon.svg",
        available: false,
        availabilityLabel: "Coming soon"
      }
    ];
    export const DEFAULT_DICE_SET_ID = "new-angelsword";
    export const DICE_SET_ID_ALIASES = {
      "angels-sword": "new-angelsword",
      angels_sword: "new-angelsword",
      new_angelsword: "new-angelsword",
      angelssword: "new-angelsword"
    };
    export const MAX_DICE_TRAY_DICE = 24;
export const ENABLE_ACCURATE_DICE_ROLLS = true;
export const ENABLE_WEBGL_DICE_ROLLS = false;
export const PASSIVE_READ_ONLY_FIELDS = new Set([
      ...Array.from({ length: 27 }, (_, index) => `Skill${index + 1}`),
      ...Array.from({ length: 27 }, (_, index) => `Stat${index + 1}`)
    ]);
export const CLICKABLE_ROLL_FIELDS = new Set(
      Array.from({ length: 27 }, (_, index) => `Bonus${index + 1}`)
    );
export const CLASS_ROWS = Array.from(new Set(
      window.LYRIAN_FORM_MAP.pages.flatMap((page) =>
        page.fields
          .map((field) => /^Class(\d+)$/.exec(field.name))
          .filter(Boolean)
          .map((match) => Number(match[1]))
      )
    )).sort((a, b) => a - b);
export const INVENTORY_ROWS = Array.from(new Set(
      window.LYRIAN_FORM_MAP.pages.flatMap((page) =>
        page.fields
          .map((field) => /^CombatInventory(\d+)$/.exec(field.name))
          .filter(Boolean)
          .map((match) => Number(match[1]))
      )
    )).sort((a, b) => a - b);

