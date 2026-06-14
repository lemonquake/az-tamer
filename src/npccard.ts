// ============================================================
// AZ Tamer — NPC identity cards. Click any NPC in the world to
// inspect them: guild members present their full Guild Card
// (sigil, rank, service record); everyone else carries a Haven
// City Citizen Card with their name and a life worth reading.
// ============================================================
import * as THREE from 'three';
import { HOUSES } from './data';
import { GUILD_LORE, guildIconCanvas, shade, roundRect, cardPattern, makeEffigy } from './guilds';
import { sfx } from './audio';
import { RANKS, rankBadgeCanvas } from './ranks';

// ---------------- profiles ----------------
export interface NpcPortrait {
  skin?: string; hair?: string; top?: string; cap?: string | null;
}

export interface NpcProfile {
  name: string;
  title?: string;                 // epithet under the name
  houseId?: string;               // one of the five Grand Houses → full guild card
  guild?: { name: string; color: string; epithet?: string };  // any other guild of the Compact
  rank?: string;
  cardNo?: string;
  motto?: string;
  bio?: string;
  stats?: [string, string][];     // service-record rows on the back
  portrait?: NpcPortrait;
}

/** Deterministic 32-bit hash — every NPC's "random" numbers never change. */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = <T,>(arr: T[], seed: number): T => arr[seed % arr.length];

function citizenCardNo(name: string): string {
  const h = hashOf(name);
  return `CIT-${(h & 0xffff).toString(16).toUpperCase().padStart(4, '0')}-${String((h >>> 16) % 1000).padStart(3, '0')}`;
}
function guildCardNo(prefix: string, name: string): string {
  const h = hashOf(name);
  return `${prefix.slice(0, 2).toUpperCase()}-${(h & 0xffff).toString(16).toUpperCase().padStart(4, '0')}-${String((h >>> 16) % 1000).padStart(3, '0')}`;
}

// ---------------- the dossier registry ----------------
/** Hand-written identities for the named souls of the world. */
const DOSSIERS: Record<string, Omit<NpcProfile, 'name'>> = {
  // ----- Haven City: the guild halls -----
  'Master Bren': {
    title: 'Grandmaster of House Pyrelight', houseId: 'pyrelight', rank: 'Grand Chief',
    bio: 'Lit his first campfire from the First Ember at age six and has, by his own account, never been cold since. Leads every recruit drill personally — first through the breach, loudest at the feast.',
    stats: [['Battles won', '1,204'], ['Recruits raised', '312'], ['Expeditions led', '88'], ['Years of service', '26'], ['Campfires lit from the Ember', 'all of them']],
    portrait: { top: '#b03a22', hair: '#55301a' },
  },
  'Mistress Sera': {
    title: 'Grandmaster of House Mistveil', houseId: 'mistveil', rank: 'Grand Chief',
    bio: 'Mapped forty drowned ruins before her thirtieth year. Speaks rarely; when she does, the room takes notes. Keeps a bowl of still water on her desk and reads it more often than her letters.',
    stats: [['Battles won', '986'], ['Ruins charted', '47'], ['Lives pulled from floods', '203'], ['Years of service', '31'], ['Words wasted', '0']],
    portrait: { top: '#2a6dc4', hair: '#d8d8e8' },
  },
  'Warden Oakes': {
    title: 'Grandmaster of House Thornward', houseId: 'thornward', rank: 'Grand Chief',
    bio: 'Grew the eastern greenway with his own hands. The Covenant\'s old saying — that a Thornward blade wins ten moves before it is drawn — was written about his grandmother. He insists it was about her stew.',
    stats: [['Battles won', '871'], ['Guardians healed', '2,440'], ['Gardens planted', '129'], ['Years of service', '34'], ['Feasts hosted', '402']],
    portrait: { top: '#3a7a2e', hair: '#6a4a2a' },
  },
  'Captain Vex': {
    title: 'Grandmaster of House Stormcall', houseId: 'stormcall', rank: 'Grand Chief',
    bio: 'Ran the Legion-era signal grid at nineteen. Her drills are timed to the half-second and her coffee is, by formal guild resolution, a hazard. Secretly frames every thank-you letter she receives.',
    stats: [['Battles won', '1,118'], ['War-engines decommissioned', '17'], ['Grid uptime', '99.97%'], ['Years of service', '24'], ['Drills run', '6,212']],
    portrait: { top: '#b09a22', hair: '#2a2a3a' },
  },
  'Keeper Nyx': {
    title: 'Grandmaster of House Duskwatch', houseId: 'duskwatch', rank: 'Grand Chief',
    bio: 'No record of joining the Order exists; the Order\'s records simply begin mentioning them. Carries lethal candy and offers it kindly. To be saved by Keeper Nyx is to wake up safe, with no memory of danger.',
    stats: [['Battles won', 'unrecorded'], ['Corruptions hunted', '61'], ['Secrets kept', 'yes'], ['Years of service', '——'], ['Moons counted', 'twice nightly']],
    portrait: { top: '#5a3a9a', hair: '#1a1a26' },
  },

  // ----- Haven City: streets & services -----
  'Guide Mara': {
    title: 'Guild Guide of Haven City', guild: { name: 'Haven Guild Authority', color: '#f2c14e', epithet: 'The Open Door' }, rank: 'Captain',
    bio: 'Greets every graduate the city receives — over four thousand and counting, every one remembered by name. The Grand Houses argue about everything except Mara.',
    stats: [['Graduates welcomed', '4,061'], ['Wrong turns prevented', '11,927'], ['Years of service', '14'], ['Houses trusted by', 'all five']],
    portrait: { top: '#d9a84a', hair: '#6a3a1a' },
  },
  'Pina': {
    title: 'Provisioner of Haven City',
    bio: 'Runs the bazaar her grandmother opened the year the walls went up. Claims to know what you need before you do, and is annoyingly correct. Her honey rolls have ended two trade disputes.',
    stats: [['Customers served', '88,400'], ['Tonics sold', '31,556'], ['Credit extended', 'too much'], ['Honey rolls baked', 'daily']],
    portrait: { top: '#d95a8a', hair: '#3a2a1a' },
  },
  'Dax': {
    title: 'Master Mechanic of the Garage', houseId: 'stormcall', rank: 'Captain',
    bio: 'The only civilian to whom Greggy the Stormheart still sends handwritten schematics. Dax frames them instead of building them — "some art is load-bearing" — then builds something better.',
    stats: [['Crawlers rebuilt', '1,872'], ['Parts invented', '23'], ['Schematics framed', '9'], ['Burns survived', '114'], ['Years of service', '19']],
    portrait: { top: '#e8843a', hair: '#2a2a3a' },
  },
  'Sanctum Keeper': {
    title: 'Keeper of the Healing Sanctum', guild: { name: 'The Verdant Charity', color: '#5ad88a', epithet: 'Hands That Mend' }, rank: 'Captain',
    bio: 'Has healed three generations of Haven City\'s Guardians and refuses payment from children, veterans, and anyone who cries. The Sanctum has never once closed its doors.',
    stats: [['Guardians healed', '52,118'], ['Nights on duty', '4,400'], ['Payment refused', '◆ 96,000'], ['Years of service', '29']],
    portrait: { top: '#5ad88a', hair: '#d8d8d8' },
  },
  'Madame Celeste': {
    title: 'Proprietor of the Boutique', houseId: 'duskwatch', rank: 'Professional',
    bio: 'Dressed two champions, one runaway princess, and — she will mention this — a Legendary Tamer\'s daughters. Considers beige a personal insult.',
    stats: [['Outfits tailored', '7,212'], ['Fashion crimes prevented', '30,915'], ['Silks imported', 'four continents'], ['Beige garments sold', '0']],
    portrait: { top: '#b18ae8', hair: '#d8b46a' },
  },

  // ----- Haven City: the townsfolk -----
  'Tilda the Baker': {
    title: 'Baker of the Morning Bell', houseId: 'pyrelight', rank: 'Beginner',
    bio: 'Her mother sold a honey roll to Aljay the Dawnflame; the coin he paid with hangs framed over the oven. Tilda\'s rolls are credited with at least one tamed Guardian and three marriages.',
    stats: [['Rolls baked', '212,400'], ['Guardians lured off rooftops', '31'], ['Framed legendary coins', '1'], ['Mornings missed', '2']],
    portrait: { top: '#d99a4a', hair: '#7a4a2a', cap: '#f2ead0' },
  },
  'Old Benn': {
    title: 'Legion War Veteran', guild: { name: 'The Lantern Row Veterans', color: '#c4822a', epithet: 'They Held the Ladders' }, rank: 'Veteran',
    bio: 'Held the ladder while Greggy built the coil that grounded Voltrazar — "best ladder-holding of my life." Teaches element matchups to anyone who stands still long enough.',
    stats: [['Battles survived', '67'], ['The sky over Ghandra, seen torn open', 'once'], ['Ladders held', 'the important one'], ['Years of service', '22']],
    portrait: { top: '#5a6a4a', hair: '#d8d8d8' },
  },
  'Joss the Courier': {
    title: 'Fastest Courier in Olivar', houseId: 'stormcall', rank: 'Expert',
    bio: 'Delivers to all five Grand Houses daily and is training, by his own admission, to outrun thunder. Has heard the Stormspire hum at night and wishes he hadn\'t.',
    stats: [['Parcels delivered', '40,118'], ['Terrace stairs climbed', '29,684'], ['Personal best, gate to terrace', '3m 41s'], ['Thunder outrun', 'not yet']],
    portrait: { top: '#3a8ad9', hair: '#2a2a3a', cap: '#d84a3a' },
  },
  'Sera Plum': {
    title: 'Keeper of the Flowerbeds', houseId: 'thornward', rank: 'Beginner',
    bio: 'Planted every flowerbed along the city roads from seeds blessed by Onnel the Worldroot. Leaves a flower on the Covenant\'s empty chair, sometimes, when no one is watching.',
    stats: [['Flowerbeds tended', '214'], ['Springs bloomed early', '15'], ['Verdant Guardians made to purr', '58'], ['Papers written about it', '0, and keep it that way']],
    portrait: { top: '#4ec45e', hair: '#a85a3a', cap: '#e8d8a8' },
  },
  'Marek the Wallguard': {
    title: 'Warden of the East Wall', guild: { name: 'Haven City Watch', color: '#8a93a8', epithet: 'The Wall Holds' }, rank: 'Elite',
    bio: 'Walks the wall the Legion War built. Believes, with documented sincerity, that the wall always needs another tower — and after fifteen years of quiet, he has stopped being teased about it.',
    stats: [['Watches stood', '5,110'], ['Gates held', '3'], ['Incidents beyond the wall', '212'], ['Towers requested', '9'], ['Towers granted', '2']],
    portrait: { top: '#6a6e8a', hair: '#3a2a1a', cap: '#8a93a8' },
  },
  'Nyla the Stargazer': {
    title: 'Astronomer of the Night Roads', houseId: 'duskwatch', rank: 'Professional',
    bio: 'Can name all nine Aether Guardians faster than most children, which is saying something. Checks Noruun\'s auroras every clear night. Last month, they flickered. She is still deciding who to tell.',
    stats: [['Nights charted', '3,066'], ['Aether beings named, in order', '9'], ['Auroras logged', '511'], ['Anomalies', '1, recent']],
    portrait: { top: '#9a5af2', hair: '#1a1a2e' },
  },
  'Little Pip': {
    title: 'Future Three-Guardian Champion (self-certified)', houseId: 'pyrelight', rank: 'Beginner',
    bio: 'Currently Aljay in all neighborhood reenactments; the broom is Firgara. Plans to graduate with a fire one, a lightning one AND a leaf one. Believes his gran about the apple. So do we.',
    stats: [['Legion battles reenacted', '388'], ['Brooms promoted to greatsword', '4'], ['Years until the Academy', '6'], ['Conviction', 'absolute']],
    portrait: { top: '#d84a3a', hair: '#6a3a1a', cap: '#f2d23a' },
  },
  'Ferryn the Miller': {
    title: 'Miller of the Windmill Hill', houseId: 'thornward', rank: 'Expert',
    bio: 'The mill has ground without missing a day since before the Legion War — her mother ran it straight through the dark years. Owns the best sunset seat in Haven City and guards the secret jealously.',
    stats: [['Sacks milled', '60,219'], ['War years worked', 'all of them'], ['Mouths fed from the hill', 'the city\'s'], ['Sunsets witnessed', 'nightly, best seat']],
    portrait: { top: '#c2b08a', hair: '#7a4a2a', cap: '#e8e0cc' },
  },
  'Reza the Angler': {
    title: 'Angler of the Worldroot Pond', houseId: 'mistveil', rank: 'Veteran',
    bio: 'Fishes the pond Onnel dug so the city would always have one quiet place. Once caught a forty-year-old love letter in a bottle and delivered it himself. She cried. Good week.',
    stats: [['Silverfin caught', '8,442'], ['Boots caught', '61'], ['Love letters delivered', '1'], ['Standing arrangement with ducks', 'they win']],
    portrait: { top: '#4a7a9a', hair: '#d8d8d8', cap: '#2a4a5a' },
  },
  'Captain Iria': {
    title: 'Captain, Coliseum Detail', guild: { name: 'Haven City Watch', color: '#8a93a8', epithet: 'The Wall Holds' }, rank: 'Captain',
    bio: 'Guards the Grand Coliseum\'s leaderboard on duty and, out of habit, off duty. Someone attempts to scratch their name onto it weekly. No one has succeeded on her watch.',
    stats: [['Finals nights secured', '44'], ['Leaderboard vandals foiled', '209'], ['Championships witnessed', '12'], ['Years of service', '16']],
    portrait: { top: '#8a3040', hair: '#2a2a3a', cap: '#c9a24a' },
  },
  'Bram the Mason': {
    title: 'Mason of the Grand Stairs', houseId: 'thornward', rank: 'Veteran',
    bio: 'Re-cut every step of the grand stairs with stone hauled from Tharkand by sand-crawler. When the old surveyor wanted the hills flattened, the Worldroot\'s covenant said no. Bram built around them, and is glad.',
    stats: [['Steps re-cut', '212'], ['Stone hauled', '900 tons'], ['Coliseum expansions', '1, doubled'], ['Hills flattened', '0, on principle']],
    portrait: { top: '#8a7a5a', hair: '#3a2a1a' },
  },
  'Wisp-Keeper Yola': {
    title: 'Lamplighter of Haven City', houseId: 'pyrelight', rank: 'Expert',
    bio: 'Tends every street lamp on every road — count them, they keep perfect spacing. Holds that the dusk fireflies are the lamps\' children, and refuses all other explanations on professional grounds.',
    stats: [['Lamps tended', '214'], ['Nights the city went dark', '0'], ['Fireflies (lamp-children) censused', '~4,100'], ['Years of service', '21']],
    portrait: { top: '#6a4a9a', hair: '#c9a24a' },
  },

  // ----- the Dawnflame's daughters -----
  'Azrin': {
    title: 'The Emberlark · Daughter of the Dawnflame', guild: { name: "The Dawnflame's Line", color: '#f2884e', epithet: 'Sunrise, Sudden and Everywhere' }, rank: 'Captain',
    bio: 'Aljay\'s elder daughter. Laughs first, apologizes never, fights like sunrise — sudden and everywhere at once. Has hunted rumors of her father across three continents, exactly as stubborn as the stories say he was.',
    stats: [['Continents searched', '3'], ['Corruption nests burned', '27'], ['Apologies issued', '0'], ['Honey rolls owed to her (by Azrael)', '1']],
    portrait: { top: '#f2884e', hair: '#8a3a1a' },
  },
  'Azrael': {
    title: 'The Nightwing · Daughter of the Dawnflame', guild: { name: "The Dawnflame's Line", color: '#9a6af2', epithet: 'The Lantern, Unlit, For Ghandra' }, rank: 'Captain',
    bio: 'The younger daughter. Quiet where her sister is loud, and the better strategist by her own measured admission. Keeps her father\'s old lantern on her belt, unlit. "For Ghandra," she says, and does not elaborate.',
    stats: [['Campaigns planned', '31'], ['Campaigns Azrin improvised anyway', '29'], ['Weeks under Noruun\'s ice', '1, deeply unpleasant'], ['The lantern', 'still his']],
    portrait: { top: '#6a4a9a', hair: '#241a2e' },
  },

  // ----- Leodones University -----
  'Receptionist Dana': {
    title: 'First Face of the University', houseId: 'mistveil', rank: 'Elite',
    bio: 'Every licensed tamer on the continent crossed her lobby once, usually wearing the same stunned expression. Keeps the notice board, the visitors\' ledger, and — unofficially — the entire institution.',
    stats: [['Graduates greeted', '12,406'], ['Stunned expressions catalogued', 'all of them'], ['Notice-board quests posted', '3,118'], ['Years at the desk', '17']],
    portrait: { top: '#e8e8e8', hair: '#6a3a1a', cap: '#e8e8e8' },
  },
  'Historian Veyl': {
    title: 'Historian of the Deep Charts', houseId: 'stormcall', rank: 'Lieutenant',
    bio: 'Smells of ink and thunderstorms, exactly as advertised. Spent nine years charting the seal\'s slow weakening before anyone agreed to listen. History, he notes, is watching you with considerable interest.',
    stats: [['Years of charts', '9'], ['Charts vindicated', 'one boat ride\'s worth'], ['Volumes authored', '14'], ['Storms smelled approaching', 'all of them']],
    portrait: { top: '#4a5a8a', hair: '#8a8a92' },
  },
  'Archivist Wren': {
    title: 'Keeper of the Restricted Stacks', houseId: 'duskwatch', rank: 'Lieutenant',
    bio: 'Knows where every book in the Archive sleeps, including the ones that pretend not to be there. There is a sandwich in chapter forty. Do not tell them. They are telling themself.',
    stats: [['Volumes shelved', '88,212'], ['Volumes that shelved themselves back wrong', '12'], ['Silence enforced', 'institutionally'], ['Sandwiches found in chapters', '1']],
    portrait: { top: '#5a3a9a', hair: '#c8c8d0' },
  },

  // ----- Agdao Island -----
  'Fisher Bayan': {
    title: 'Fisher of the Agdao Pier',
    bio: 'Sells hooks by the basket to a hermit who bends every one into little coils before reaching the gate. Some folk whittle. He... coils. Bayan asks no further questions; island rules.',
    stats: [['Catches landed', '19,330'], ['Hooks sold to the thunder-fellow', '2,400, all bent'], ['Gulls outwitted', 'net negative'], ['Years on the pier', '38']],
    portrait: { top: '#3a8ad9', hair: '#1a1a2e', cap: '#e8d9a8' },
  },
  'Mama Imee': {
    title: 'Keeper of the Stew-Fire', guild: { name: 'Circle of the First Fire', color: '#f2a64e', epithet: 'The Oldest Guild in the World' }, rank: 'Elite',
    bio: 'Feeds the whole island, one legend included — he eats like a thundercloud, just as the stories say. A guest\'s bowl is never washed until they\'ve eaten from it again. Island rules.',
    stats: [['Bowls served', 'all of them'], ['Legends fed', '1, regularly'], ['Unwashed guest bowls waiting', '3'], ['Questions asked free of charge', 'always']],
    portrait: { top: '#d87a4e', hair: '#4a3a2a' },
  },
  'Elder Toto': {
    title: 'Elder of the First Fire', guild: { name: 'Circle of the First Fire', color: '#f2a64e', epithet: 'The Oldest Guild in the World' }, rank: 'Grand Chief',
    bio: 'Keeps Aurelia\'s fire as his line has for seven hundred years. The Circle is forty members and has never needed forty-one. Reads mainland boots and over-heavy questions at a glance. Perspective, young tamer.',
    stats: [['Years keeping the fire', '61'], ['Circle members', '40, never 41'], ['The Compact, broken', 'never once'], ['Legends sheltered', '1, politely unfound']],
    portrait: { top: '#f2a64e', hair: '#d8d8d8' },
  },
  'Ring Guard': {
    title: 'Guardian of the Sealed Ring', guild: { name: 'Haven City Watch', color: '#8a93a8', epithet: 'The Wall Holds' }, rank: 'Lieutenant',
    bio: 'Stands where twenty-two championships were decided and lets precisely no one onto the stones between tournaments. Not even Grand House colors. ESPECIALLY not Grand House colors.',
    stats: [['Hours at the gate', '11,204'], ['Hopefuls turned away', '3,118'], ['Exceptions made', '0'], ['The Ring itself, touched', 'never — nobody dared']],
    portrait: { top: '#8a3040', hair: '#2a2a3a', cap: '#c9a24a' },
  },
  'Attendant Lyssa': {
    title: 'Tournament Registrar of the Grand Coliseum',
    bio: 'Keeps the brackets, the prize vault keys, and her patience — in that order. Has been asked "is registration open yet" eleven times this week by the same aspirant. The twelfth will not be the one.',
    stats: [['Tournaments administered', '14'], ['Slots promised', '1, to someone promising'], ['Broadcast crystals calibrated', '96'], ['Patience remaining', 'professional levels']],
    portrait: { top: '#5ab8e8', hair: '#6a3a1a' },
  },
  'Merchant Vesna': {
    title: 'Battle Provisioner of the Coliseum',
    bio: 'Stocks everything a tournament hopeful burns through, and remembers what every returning customer bought before their best fight. Superstition is free with every purchase.',
    stats: [['Tonics sold on finals nights', '9,212'], ['Lucky pre-match rituals witnessed', '404'], ['Refunds for cowardice', '0']],
    portrait: { top: '#d84a3a', hair: '#7a4a2a', cap: '#f2ead0' },
  },
  'Gemcutter Korr': {
    title: 'Gemcutter of Crystallized Essence',
    bio: 'Cuts stat gems from crystallized Guardian essence, one facet at a time. Claims champions are built the same way. Wears loupes the way other people wear moods.',
    stats: [['Gems faceted', '6,118'], ['Facets per champion (estimated)', 'many'], ['Essence wasted', 'an apprentice once, never again']],
    portrait: { top: '#9a5af2', hair: '#1a1a2e' },
  },

  // ----- Agdao Island village -----
  'Liko': {
    title: 'Keeper of the Left Gate', guild: { name: 'Circle of the First Fire', color: '#f2a64e', epithet: 'The Oldest Guild in the World' }, rank: 'Veteran',
    bio: 'Opens the west gate only on the Elder\'s word, and has held that post since he was tall enough to reach the latch. The cliff path beyond is his to watch, and he watches it the island way: patiently.',
    stats: [['Years on the gate', '22'], ['Gate opened without the Elder\'s word', '0'], ['Storms watched from the latch', 'all of them']],
    portrait: { top: '#c4763a', hair: '#2a2a3a' },
  },
  'Weaver Nita': {
    title: 'Weaver of the Village',
    bio: 'Weaves the sails, the baskets and — by general island consensus — half the village\'s gossip into something useful. Her patterns record storms the way mainland books record kings.',
    stats: [['Sails woven', '388'], ['Patterns that record real storms', 'all of them'], ['Secrets kept in the weave', 'ask the weave']],
    portrait: { top: '#d87a9a', hair: '#4a3a2a' },
  },
  'Pol': {
    title: 'Fruit-Seller of the Lagoon Path',
    bio: 'Sells the sweetest fruit on the island and gives the bruised ones to the gulls, which is why the gulls have never once raided his stall. Economics, island style.',
    stats: [['Mangoes sold', '40,212'], ['Stall raids by gulls', '0 — they\'re paid off'], ['Years at the stall', '31']],
    portrait: { top: '#4ec45e', hair: '#1a1a2e' },
  },
  'Kiko': {
    title: 'Fastest Kid on Agdao (disputed by Mai)',
    bio: 'Knows every shortcut, every tide-pool and exactly which rocks are slippery, mostly from personal experience. Gave the recovery team "the fright" once. Mama Imee invoiced for it.',
    stats: [['Shortcuts discovered', '61'], ['Slippery rocks confirmed', 'the hard way'], ['Frights given to adults', '1, billed']],
    portrait: { top: '#f2d23a', hair: '#1a1a2e' },
  },
  'Mai': {
    title: 'Fastest Kid on Agdao (disputed by Kiko)',
    bio: 'Holds the official record from the pier to the First Fire, where "official" means Elder Toto was watching and laughed. Collects wave-polished glass and opinions.',
    stats: [['Pier-to-Fire record', 'held, officially'], ['Sea-glass collected', '212 pieces'], ['Races lost to Kiko', 'zero THAT COUNTED']],
    portrait: { top: '#5ab8e8', hair: '#4a3a2a' },
  },
  'Old Sela': {
    title: 'Eldest Voice of the Village',
    bio: 'Remembers the monsoon her grandmother spoke of, whose grandmother spoke of the one before that, all the way back — the island keeps its history in grandmothers. Sits where the sun lands first.',
    stats: [['Monsoons remembered', '74'], ['Generations of grandmothers quoted', '9'], ['Best sunrise seat', 'hers, by right']],
    portrait: { top: '#b08a5a', hair: '#d8d8d8' },
  },
  'Dario': {
    title: 'Tender of the First Fire', guild: { name: 'Circle of the First Fire', color: '#f2a64e', epithet: 'The Oldest Guild in the World' }, rank: 'Expert',
    bio: 'One of the forty. Feeds Aurelia\'s fire its driftwood in the old order — salt-wood first, heart-wood at moonrise — and has never once let it lean without reading what the lean meant.',
    stats: [['Nights tending the fire', '4,400'], ['Times the fire went out', '0 in seven hundred years (team effort)'], ['Leans read', 'every one']],
    portrait: { top: '#f2a64e', hair: '#2a2a3a' },
  },

  // ----- New Salmonan — the valley of loud kitchens -----
  'Ivan Lawrence': {
    title: 'Four-Time Intercontinental Champion · The Man They Broke First', guild: { name: 'Hall of Legends', color: '#c4822a', epithet: 'Cleared. Loudly.' }, rank: 'Grand Chief',
    bio: 'Grew up three doors from Aljay the Dawnflame — first his rival, then his brother in everything but blood. "Someone has to lose finals to Aljay with style." Nine years ago he got too close to a Sponsor\'s books, so Foretales deleted him: sabotaged matches in his name, planted evidence, his face on every crystal under the word SHAME. He hid in the one valley the signal can\'t reach. Then a tamer with a stolen ledger climbed his hill — and the valley\'s battered relay tower told the truth to four continents.',
    stats: [['Intercontinental Championships', '4'], ['Finals lost to Aljay, with style', '3'], ['Years deleted', '9'], ['Name', 'cleared'], ['Rice wine owed to a certain tamer', 'a cellar']],
    portrait: { top: '#c4822a', hair: '#3a2a1a' },
  },
  'Maris Lawrence': {
    title: 'Keeper of the Hill House',
    bio: 'Married a champion, hid a ghost, raised a family on a hill where nobody asks questions — and never once let Ivan believe the broadcasts. Her porch table has fed half the valley and interrogated all of it.',
    stats: [['Years keeping the hill', '9'], ['Broadcasts believed', '0'], ['Porch dinners hosted', 'the whole valley, twice'], ['Doubts entertained', 'none worth repeating']],
    portrait: { top: '#d87a9a', hair: '#2a2a3a' },
  },
  'Liwa': {
    title: 'The Champion\'s Daughter',
    bio: 'Eleven years old and the valley\'s undefeated mock-bracket champion, fighting under the alias her father wore in hiding. Knew exactly who Dad was the whole time — "the mural by the gate has his NOSE, obviously."',
    stats: [['Mock-brackets won', '31'], ['Alias kept', 'nine years (she\'s eleven)'], ['Dad\'s nose, spotted in the mural', 'immediately']],
    portrait: { top: '#f2d23a', hair: '#1a1a2e' },
  },
  'Auntie Dalisay': {
    title: 'Matron of the Market Morning',
    bio: 'Runs the dawn market, the gossip exchange and — when the river floods — the evacuation, in that order of difficulty. Her nephew\'s festival crystal recorded the night the truth went out, and she has guarded it like a grandchild since.',
    stats: [['Market mornings run', '6,118'], ['Gossip verified before resale', 'always'], ['Crystals guarded', '1, like a grandchild'], ['Festivals catered', 'all of them']],
    portrait: { top: '#d84a3a', hair: '#d8d8d8', cap: '#f2ead0' },
  },
  'Relay-Keeper Esta': {
    title: 'Keeper of the Valley Relay', guild: { name: 'The Relay-Keepers\' Round', color: '#5ab8e8', epithet: 'The Signal Is Sacred' }, rank: 'Lieutenant',
    bio: 'Has climbed the battered tower every dawn for nineteen years to log what the signal did overnight. The night of Ivan\'s broadcast she logged her proudest entry; thirty-six hours later she logged the override that erased it — stamped FT-PRIME — and started making copies.',
    stats: [['Dawns on the tower', '6,940'], ['Log scrolls kept', 'every one'], ['Overrides witnessed', '1, stamped FT-PRIME'], ['Copies made', 'more than they\'d like']],
    portrait: { top: '#5ab8e8', hair: '#7a4a2a' },
  },
  'Ferryman Tono': {
    title: 'Ferryman of the River Piers',
    bio: 'Poles the flat-barge between the piers and claims the river tells him the news a day early — which, in this valley, lately makes him the most reliable broadcaster on four continents.',
    stats: [['Crossings poled', '88,400'], ['Passengers lost', '0'], ['News learned from the river', 'a day early'], ['Foretales subscriptions', 'cancelled, loudly']],
    portrait: { top: '#4ec45e', hair: '#2a2a3a', cap: '#c9a24a' },
  },
  'Innkeeper Bo': {
    title: 'Host of the Loud Kitchen Inn',
    bio: 'Runs the inn whose kitchen named the valley. Beds are free for tamers since "the broadcast night" — Bo\'s books record the policy as: paid in full, in advance, forever, by one evening of the truth.',
    stats: [['Stews simmered', 'continuously since founding'], ['Free beds for tamers', 'all of them, forever'], ['Kitchen volume', 'the valley\'s loudest'], ['Tabs forgiven on broadcast night', 'every single one']],
    portrait: { top: '#c4822a', hair: '#4a3a2a', cap: '#f2ead0' },
  },
  'Quill': {
    title: '"Traveling Sketch Artist" · Foretales Field Stringer',
    bio: 'Arrived three days after the broadcast with soft questions, a sketchbook full of the mural, and a courier ledger he really should have burned. Foretales calls his trade "continuity verification." The valley calls it something shorter.',
    stats: [['Cover stories used', '11'], ['Sketches of the mural', '14, annotated'], ['Children questioned', 'too many'], ['Assignment ledgers surrendered', '1, reluctantly']],
    portrait: { top: '#5a5a6a', hair: '#1a1a26' },
  },

  'Greggy the Stormheart': {
    title: 'Legendary Tamer · The Stormheart', guild: { name: 'Hall of Legends', color: '#f2d23a', epithet: 'Nine Lights Against Nine Generals' }, rank: 'Grand Chief',
    bio: 'Nine championships — the longest reign in Coliseum history — and the Legion\'s armies learned to fear distant thunder. Grounded the Storm-Tyrant with a coil built overnight. Now roosts on the closest land in the world to Ghandra\'s seal, listening. Lately, something is nibbling.',
    stats: [['World Championships', '9 (AE 17–28)'], ['Aether Guardians bonded', 'Raijura · Voltherion · Fulgrath'], ['Generals grounded', 'Voltrazar, personally'], ['Years on the bluff', '9'], ['Fishing hooks bent into coils', 'all of Bayan\'s']],
    portrait: { top: '#b09a22', hair: '#d8d8d8' },
  },

  // ----- Terra City — the Circuit-Crown of Tharkand -----
  'Stationmaster Kel': {
    title: 'Line-Keeper of the Terra Aetherline', houseId: 'devas', rank: 'Lieutenant',
    bio: 'Fifteen years she kept the dead Terra platform swept, the cradle oiled and the arrival board lit for a Pod that never came — "a line is only severed if you let it forget it is a line." The dawn the Olivar signal finally answered, she wept onto the console, then briskly filed the incident report.',
    stats: [['Years the line lay dark', '15'], ['Dawns the platform was swept anyway', 'all of them'], ['Pods welcomed home, day one', '1'], ['Reports filed while crying', '1']],
    portrait: { top: '#1c5a6a', hair: '#2a2a3a', cap: '#4fe0ff' },
  },
  'Engineer Vire': {
    title: 'Trace-Wright of the Filament Concord', houseId: 'quazor', rank: 'Professional',
    bio: 'Apprenticed at nine to the crews who poured Terra\'s first living circuit after the war. Can read a city block\'s health by the color of its traces the way a medic reads a pulse. Holds that the old empire built engines to take cities, and the Concord builds circuits to keep them.',
    stats: [['Trace-miles laid', '4,180'], ['Engine-spirits woken and bonded', '37'], ['Blackouts on her grid', '0'], ['Years rebuilding Terra', '15']],
    portrait: { top: '#2a8aa8', hair: '#3a2a1a' },
  },
  'Circuit-Marshal Tace': {
    title: 'Bracket-Marshal of the Worldring', houseId: 'devas', rank: 'Captain',
    bio: 'Runs the World Championship brackets to the second and the seat-map to the cushion. Spent fifteen years administering the title in exile in Haven and never once stopped calling them "away games." Has the Worldring\'s reopening date inked where her watch should be.',
    stats: [['Championships administered', '15, all in exile'], ['Brackets argued as scripture', 'every one'], ['Big Three finals officiated', '22'], ['Years until the crown comes home', '0']],
    portrait: { top: '#c89a2a', hair: '#2a2a3a', cap: '#f2c14e' },
  },
  'Big Bolt Ovan': {
    title: 'Stand Captain of the Voltwake Faithful', houseId: 'quazor', rank: 'Vice-Captain',
    bio: 'Leads the green end of the Worldring, where the chants are written and the foam fingers are union-made. Will tell you, unprompted, that twenty years of Big Three is "a crime against fairness" — then, in the same breath, that he has seen Aljay\'s Vulfenix live four times and would sell a kidney for a fifth.',
    stats: [['Finals attended', '19'], ['Chants authored', '64'], ['Voice lost, season-ending', 'annually'], ['Kidneys offered for Big Three seats', '1 (standing)']],
    portrait: { top: '#2a9a5a', hair: '#1a1a2e', cap: '#5aff9a' },
  },
  'Chef Lumen Doss': {
    title: 'Master Holo-Chef of the Lumen Table', houseId: 'devas', rank: 'Elite',
    bio: 'Plates light as readily as food — every dish arrives under a little hovering aurora keyed to its flavor. Believes a city of machines owes its travelers the warmest table they will ever sit at, and cooks like he is personally apologizing for the last fifteen cold years.',
    stats: [['Dishes plated under aurora', '92,000'], ['Lost-looking travelers fed free', 'all of them'], ['War-lost recipes rebuilt from memory', '211'], ['Beige food served', '0']],
    portrait: { top: '#d84a8a', hair: '#2a2a3a', cap: '#f2ead0' },
  },
  'Noodle-Master Tok': {
    title: 'Steam-Cook of Spark & Sizzle', houseId: 'noctus', rank: 'Veteran',
    bio: 'Runs the loudest, brightest noodle counter under the conduit-rails, where the broth has simmered since the year the lights came back on. Claims the secret ingredient is the neon. It is not the neon. He knows it is not the neon. He will, regardless, tell you it is the neon.',
    stats: [['Bowls pulled', 'nonstop since reopening'], ['Broth, hours unbroken', 'all of them'], ['Runners fed mid-race, no charge', 'the whole green legion'], ['The real secret ingredient', 'told to no one']],
    portrait: { top: '#e85a9a', hair: '#1a1a26', cap: '#ffd8ec' },
  },
  'Clerk Bizzy': {
    title: 'Night Clerk of the Volt-Mart', houseId: 'noctus', rank: 'Expert',
    bio: 'Works the 24-hour counter between conduit-races, which is to say always. Knows every traveler\'s slushie order before they reach the chiller, and every score from every continent before the boards post it. The Volt-Mart never closes; neither, apparently, does Bizzy.',
    stats: [['Hours the lights stay on', 'all of them'], ['Slushie flavors stocked', '17'], ['Scores known before the boards', 'all of them'], ['Naps taken on shift', 'denied']],
    portrait: { top: '#3aaa6a', hair: '#2a2a3a', cap: '#5aff9a' },
  },
  'Clerk Onla': {
    title: 'Counter-Tech of the Pulse Pantry', houseId: 'quazor', rank: 'Expert',
    bio: 'Keeps the corner store whose shelves are wired to restock themselves — when the conduit cooperates, which it mostly does, because Onla rewired it herself. Half provisioner, half engineer, entirely unimpressed by tourists who gasp at the self-stocking shelves. "It is a SHELF."',
    stats: [['Self-stocking shelves maintained', '40'], ['Conduit faults fixed at the counter', '1,902'], ['Tourists left unimpressed', 'all of them'], ['Years on the corner', '11']],
    portrait: { top: '#2a8aa8', hair: '#6a3a1a', cap: '#4fe0ff' },
  },
  'Elder Sema': {
    title: 'Eldest Voice of Terra', houseId: 'jurah', rank: 'Captain',
    bio: 'Remembers the old Terra — glass and trade and the dawn Pods leaving six ways at once — and remembers the night the Sundering took the lights, the roads, and the answer to "is anyone coming." She also remembers picking up the first trowel. "They mourned us in Haven," she says, not unkindly. "We were busy."',
    stats: [['Years remembered, before and after', '70-some'], ['Nights the city went truly dark', '1, the first'], ['Trowels picked up', '1, then 14 more'], ['Cities mourned while alive', '1, hers']],
    portrait: { top: '#3a6a7a', hair: '#d8d8d8' },
  },
  'Paxi': {
    title: 'Future Worldring Champion (self-declared)', houseId: 'devas', rank: 'Beginner',
    bio: 'Has never seen the Big Three lose and has therefore concluded the only way to beat them is to become them. Rehearses the Dawnflame\'s finishing stance in the plaza glow nightly. Knows they are from across the strait. Does not care. "Good is good, and I\'m gonna be gooder."',
    stats: [['Big Three losses witnessed', '0'], ['Finishing stances rehearsed', '8,000-ish'], ['Continents held against heroes', '0'], ['Years until eligible', 'lots, ugh']],
    portrait: { top: '#f2c14e', hair: '#1a1a2e' },
  },
  'Pilgrim Dass': {
    title: 'Olivar Traveler · First Pod East', guild: { name: 'Haven Guild Authority', color: '#f2c14e', epithet: 'Across the Strait' }, rank: 'Beginner',
    bio: 'Rode the Pod the day the Terra line reopened, half-expecting ruins. Walked out into a city of light and has not closed his mouth since. Keeps muttering that they told him Terra was lost. Terra, overhearing, keeps offering him a chair and a hot bowl.',
    stats: [['Expected ruins', 'yes'], ['Found ruins', 'no'], ['Jaw, current location', 'the floor'], ['Bowls accepted from strangers', '4 and counting']],
    portrait: { top: '#3a6aa8', hair: '#6a3a1a' },
  },
  // — Terra street crowd (named so their cards read true to the Circuit-Crown) —
  'Solder Jin': {
    title: 'Trace-Welder of the Lower Conduits', houseId: 'jurah', rank: 'Veteran',
    bio: 'Welds the copper that keeps the plaza glowing. Swears you can hear a healthy trace sing if the street is quiet, which in Terra it never is.',
    stats: [['Traces welded', '12,000'], ['Quiet streets found', '0'], ['Years on the conduits', '9']],
    portrait: { top: '#2a7a8a', hair: '#1a1a2e' },
  },
  'Neon Vey': {
    title: 'Sign-Painter in Light', houseId: 'quazor', rank: 'Expert',
    bio: 'Bends cold light into hot color for every shopfront on the strip. Has one rule: no sign she makes is allowed to be sad.',
    stats: [['Signs bent', '3,400'], ['Sad signs permitted', '0'], ['Favorite color', 'the loud one']],
    portrait: { top: '#e85a9a', hair: '#6a3a1a' },
  },
  'Cabla Ross': {
    title: 'Conduit-Rail Runner', houseId: 'noctus', rank: 'Veteran',
    bio: 'Delivers across the city on the live rails faster than the message crystals can. On finals nights, trades the satchel for a flag.',
    stats: [['Deliveries this year', '21,400'], ['Rails ridden', 'the live ones'], ['Flags waved', 'one, enormous']],
    portrait: { top: '#2a9a5a', hair: '#1a1a26' },
  },
  'Pixel Tam': {
    title: 'Holo-Busker of the Core Plaza', houseId: 'jurah', rank: 'Professional',
    bio: 'Sculpts little hovering light-creatures for coins by the core spire. The kids think they are real. Tam refuses, on artistic principle, to confirm or deny.',
    stats: [['Light-creatures sculpted', '6,000'], ['Children delighted', 'all of them'], ['Trade secrets revealed', '0']],
    portrait: { top: '#5a8ad8', hair: '#2a2a3a' },
  },
  'Fuse Dara': {
    title: 'Worldring Concessioner', houseId: 'jurah', rank: 'Expert',
    bio: 'Sold roasted nuts at the Worldring before the war and intends to sell them again the day the championship comes home. Has kept the cart polished for fifteen years.',
    stats: [['Years the cart waited', '15'], ['Cart, current shine', 'mirror'], ['Practice batches roasted in exile', 'weekly']],
    portrait: { top: '#c89a2a', hair: '#7a4a2a', cap: '#f2ead0' },
  },
  'Relay Bo': {
    title: 'Crystal-Caster of Terra', houseId: 'noctus', rank: 'Professional',
    bio: 'Runs the plaza broadcast crystal and, unlike a certain four-continent network, reports only what actually happened. A small, stubborn island of true news.',
    stats: [['Broadcasts cast', '40,000'], ['Stories invented', '0'], ['Foretales feeds carried', 'none, thanks']],
    portrait: { top: '#3a6a7a', hair: '#d8d8d8' },
  },
};

// pools for the unnamed crowd — deterministic per NPC, so a face keeps its name
const CROWD_FIRST = ['Arlen', 'Betta', 'Coss', 'Dovey', 'Ezzo', 'Fenna', 'Garrik', 'Hally', 'Ines', 'Jorvik', 'Kessa', 'Lunet', 'Mott', 'Nila', 'Orrin', 'Petta', 'Quill', 'Rasmus', 'Senna', 'Tobbel', 'Ulla', 'Vasco', 'Wenna', 'Yarrow', 'Zev'];
const CROWD_LAST = ['of the Lanes', 'Tallchimney', 'Brightmantle', 'of the Terrace', 'Pondwatcher', 'Greenhand', 'Stairclimber', 'of the Market', 'Lampfriend', 'Hillwalker', 'Twosacks', 'of the Wall', 'Duskmender', 'Quickboots', 'of the Bazaar'];
const CROWD_HOBBY: [string, string][] = [
  ['Favorite spot', 'the fountain steps'], ['Favorite spot', 'the windmill hill'], ['Favorite spot', 'the pond pier'],
  ['Best subject', 'element matchups'], ['Best subject', 'Guardian gossip'], ['Best subject', 'Coliseum standings'],
  ['Often found', 'queueing at Pina\'s'], ['Often found', 'watching the bounty board'], ['Often found', 'cheering at the Coliseum'],
];

/** A name for an unnamed background NPC, stable across sessions. */
export function crowdName(seed: string): string {
  const h = hashOf(seed);
  return `${pick(CROWD_FIRST, h)} ${pick(CROWD_LAST, h >>> 7)}`;
}

/** Tag a 3D character so the click-picker knows who they are. */
export function tagNpc(obj: THREE.Object3D, name: string): void {
  obj.userData.npcName = name;
}

/** Resolve the full card profile for a clicked name. */
export function profileFor(name: string): NpcProfile {
  const d = DOSSIERS[name];
  if (d) {
    const prefix = d.houseId ?? d.guild?.name ?? 'HV';
    return { name, cardNo: (d.houseId || d.guild) ? guildCardNo(prefix, name) : citizenCardNo(name), ...d };
  }
  // every Grand House hall attendant carries their house's card
  const att = HOUSES.find(h => name === `${h.name} Attendant`);
  if (att) {
    return {
      name, houseId: att.id, rank: 'Elite',
      title: `Keeper of ${GUILD_LORE[att.id].hall}`,
      cardNo: guildCardNo(att.id, name),
      bio: `Keeps the hall warm, the banners straight and the recruits pointed the right way. The master commands ${att.name}; the attendant runs it — and everyone, including the master, knows it.`,
      stats: [['Recruits guided', `${800 + (hashOf(name) % 900)}`], ['Tips dispensed', 'daily'], ['Hall inspections passed', 'all'], ['Years of service', `${4 + (hashOf(name) % 14)}`]],
      portrait: { top: att.color, hair: '#4a3a2a' },
    };
  }
  // an honest citizen of Haven City — the registry still knows them
  const h = hashOf(name);
  const years = 2 + (h % 38);
  const battles = (h >>> 4) % 90;
  const hobby = pick(CROWD_HOBBY, h >>> 9);
  return {
    name,
    title: pick(['Citizen of Haven City', 'Resident of the Capital', 'Free Tamer of Olivar', 'Citizen of the Compact'], h >>> 3),
    cardNo: citizenCardNo(name),
    bio: pick([
      'No guild sigil, no grand deeds on record — just one of the thousands of honest lives the walls were built to keep. The registry notes they pay their lamp-tax on time.',
      'The Compact\'s ledgers list no guild for this citizen, which suits them fine. The city runs on exactly this kind of person, and the city knows it.',
      'Unaffiliated, unbothered, and usually somewhere comfortable when the weather turns. The registry has nothing dramatic to report, which is the point of walls.',
    ], h >>> 5),
    stats: [
      ['Years in Haven City', `${years}`],
      ['Battles witnessed (from a safe distance)', `${battles}`],
      [hobby[0], hobby[1]],
      ['Guild affiliation', 'none — by choice'],
      ['Lamp-tax status', 'paid'],
    ],
  };
}

// ---------------- card artwork ----------------
const CARD_W = 640, CARD_H = 960;

function portraitCanvas(p: NpcProfile, accent: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const look = p.portrait ?? {};
  const h = hashOf(p.name);
  const skin = look.skin ?? pick(['#e8b48a', '#d9a070', '#c08552', '#9a6a42'], h);
  const hair = look.hair ?? pick(['#35261a', '#6a3a1a', '#d8d8d8', '#2a2a3a', '#a85a3a'], h >>> 5);
  const top = look.top ?? pick(['#2a5ad8', '#3a7a2e', '#8a3040', '#b09a22', '#5a3a9a'], h >>> 9);
  const cap = look.cap === undefined ? (h % 3 === 0 ? top : null) : look.cap;

  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, shade(accent, -0.25));
  bg.addColorStop(1, '#10121f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 256);
  // voxel face, same dialect as the player's default portrait
  ctx.fillStyle = skin; ctx.fillRect(58, 70, 140, 130);            // head
  ctx.fillStyle = hair; ctx.fillRect(50, 50, 156, 40);             // hair top
  ctx.fillRect(50, 50, 18, 90); ctx.fillRect(188, 50, 18, 90);     // hair sides
  if (cap) { ctx.fillStyle = cap; ctx.fillRect(46, 38, 164, 26); } // cap brim
  ctx.fillStyle = '#ffffff'; ctx.fillRect(86, 118, 28, 22); ctx.fillRect(142, 118, 28, 22);
  ctx.fillStyle = '#2a2a3a'; ctx.fillRect(94, 122, 14, 16); ctx.fillRect(150, 122, 14, 16);
  ctx.fillStyle = shade(skin, -0.35); ctx.fillRect(106, 168, 44, 10);  // mouth
  ctx.fillStyle = top; ctx.fillRect(40, 200, 176, 56);             // shoulders
  return c;
}

/** Monogram shield emblem for guilds outside the five Grand Houses. */
function guildMonogramCanvas(name: string, color: string, size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const s = size, m = s / 2;
  const bg = ctx.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, shade(color, 0.25));
  bg.addColorStop(1, shade(color, -0.55));
  ctx.beginPath();
  ctx.moveTo(m, s * 0.04);
  ctx.lineTo(s * 0.92, s * 0.2);
  ctx.lineTo(s * 0.86, s * 0.62);
  ctx.quadraticCurveTo(s * 0.82, s * 0.86, m, s * 0.97);
  ctx.quadraticCurveTo(s * 0.18, s * 0.86, s * 0.14, s * 0.62);
  ctx.lineTo(s * 0.08, s * 0.2);
  ctx.closePath();
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = s * 0.035; ctx.strokeStyle = shade(color, 0.5); ctx.stroke();
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = s * 0.12;
  ctx.fillStyle = '#fff6e8';
  // laurel arcs
  ctx.strokeStyle = '#fff6e8'; ctx.lineWidth = s * 0.03;
  ctx.beginPath(); ctx.arc(m, s * 0.52, s * 0.27, Math.PI * 0.65, Math.PI * 1.35, false); ctx.stroke();
  ctx.beginPath(); ctx.arc(m, s * 0.52, s * 0.27, Math.PI * -0.35, Math.PI * 0.35, false); ctx.stroke();
  // the monogram letter
  ctx.font = `bold ${Math.floor(s * 0.4)}px Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name.replace(/^the /i, '').charAt(0).toUpperCase(), m, s * 0.52);
  ctx.restore();
  return c;
}

/** Tower-and-diamond crest of the Haven City citizen registry. */
function cityCrestCanvas(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const s = size, m = s / 2;
  const color = '#7a8ab0';
  const bg = ctx.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, shade(color, 0.2));
  bg.addColorStop(1, shade(color, -0.6));
  ctx.beginPath(); ctx.arc(m, m, s * 0.46, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = s * 0.035; ctx.strokeStyle = shade(color, 0.5); ctx.stroke();
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = s * 0.1;
  ctx.fillStyle = '#fff6e8';
  // the wall and gate tower
  ctx.fillRect(s * 0.22, s * 0.56, s * 0.56, s * 0.12);
  ctx.fillRect(s * 0.42, s * 0.3, s * 0.16, s * 0.32);
  ctx.fillRect(s * 0.40, s * 0.26, s * 0.05, s * 0.07);
  ctx.fillRect(s * 0.475, s * 0.26, s * 0.05, s * 0.07);
  ctx.fillRect(s * 0.55, s * 0.26, s * 0.05, s * 0.07);
  // the shard-diamond above
  ctx.beginPath();
  ctx.moveTo(m, s * 0.10); ctx.lineTo(s * 0.56, s * 0.185); ctx.lineTo(m, s * 0.27); ctx.lineTo(s * 0.44, s * 0.185);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  return c;
}

/** Soft civic pattern for citizen cards — lamplight rows and wall courses. */
function citizenPattern(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = '#aab8e0';
  ctx.lineWidth = 2;
  for (let y = 80; y < CARD_H; y += 110) {
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(CARD_W - 30, y); ctx.stroke();
    for (let x = 60; x < CARD_W - 30; x += 90) {
      ctx.beginPath(); ctx.arc(x + (y % 220 === 80 ? 0 : 45), y - 12, 4, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

interface CardTheme {
  color: string;
  org: string;          // big header line
  epithet: string;
  cardKind: string;     // "— Ember Sigil —" etc.
  emblem: HTMLCanvasElement;
  motto: string;
  pattern: (ctx: CanvasRenderingContext2D) => void;
  footer: string;
  isGuild: boolean;
}

function themeFor(p: NpcProfile): CardTheme {
  const house = p.houseId ? HOUSES.find(h => h.id === p.houseId) : null;
  if (house) {
    const lore = GUILD_LORE[house.id];
    return {
      color: house.color, org: house.name, epithet: lore.epithet,
      cardKind: lore.cardName, emblem: guildIconCanvas(house.id, 256),
      motto: house.motto, pattern: ctx => cardPattern(ctx, house.id, house.color),
      footer: `${lore.hall} · Registered by the Leodones University of Aurel`, isGuild: true,
    };
  }
  if (p.guild) {
    const g = p.guild;
    return {
      color: g.color, org: g.name, epithet: g.epithet ?? 'A Guild of the Compact',
      cardKind: 'Compact Sigil', emblem: guildMonogramCanvas(g.name, g.color),
      motto: g.epithet ?? 'No bond by force, no Guardian in chains.',
      pattern: ctx => {
        ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = shade(g.color, 0.4); ctx.lineWidth = 2.5;
        for (let i = 0; i < 7; i++) {
          ctx.beginPath(); ctx.arc(CARD_W / 2, CARD_H + 200, 320 + i * 90, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        }
        ctx.restore();
      },
      footer: 'Sworn to the Guild Compact · every guildhall a sanctuary', isGuild: true,
    };
  }
  return {
    color: '#7a8ab0', org: 'HAVEN CITY', epithet: 'Citizen Registry of the Capital',
    cardKind: 'Citizen Card', emblem: cityCrestCanvas(),
    motto: 'The wall holds, and the lamps walk with you.',
    pattern: citizenPattern,
    footer: 'Office of the Registry · Haven City, Olivar', isGuild: false,
  };
}

function drawNpcFront(p: NpcProfile, th: CardTheme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, CARD_W * 0.4, CARD_H);
  grad.addColorStop(0, shade(th.color, -0.6));
  grad.addColorStop(0.45, th.isGuild ? shade(th.color, -0.78) : '#0c1020');
  grad.addColorStop(1, '#05060c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  th.pattern(ctx);

  // double frame with corner brackets — the registry's common dialect
  ctx.strokeStyle = shade(th.color, 0.35); ctx.lineWidth = 8;
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = shade(th.color, 0.6);
  roundRect(ctx, 30, 30, CARD_W - 60, CARD_H - 60, 18); ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeStyle = '#e9d9a8';
  for (const [cx, cy, sx, sy] of [[34, 34, 1, 1], [CARD_W - 34, 34, -1, 1], [34, CARD_H - 34, 1, -1], [CARD_W - 34, CARD_H - 34, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 44 * sy); ctx.lineTo(cx, cy); ctx.lineTo(cx + 44 * sx, cy);
    ctx.stroke();
  }

  // header
  ctx.drawImage(th.emblem, CARD_W / 2 - 64, 52, 128, 128);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(th.org.toUpperCase(), CARD_W / 2, 232);
  ctx.fillStyle = shade(th.color, 0.45);
  ctx.font = 'italic 23px Georgia, serif';
  ctx.fillText(th.epithet, CARD_W / 2, 268);
  ctx.fillStyle = '#9aa0b8';
  ctx.font = '17px Georgia, serif';
  ctx.fillText(`— ${th.cardKind} —`, CARD_W / 2, 298);

  // portrait
  const px = CARD_W / 2 - 120, py = 330, ps = 240;
  ctx.save();
  roundRect(ctx, px - 8, py - 8, ps + 16, ps + 16, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
  ctx.strokeStyle = '#e9d9a8'; ctx.lineWidth = 4; ctx.stroke();
  roundRect(ctx, px, py, ps, ps, 10);
  ctx.clip();
  ctx.drawImage(portraitCanvas(p, th.color), px, py, ps, ps);
  ctx.restore();

  // name plaque + title
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 90, 606, CARD_W - 180, 74, 12); ctx.fill();
  ctx.strokeStyle = shade(th.color, 0.4); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${p.name.length > 16 ? 32 : 40}px Georgia, serif`;
  ctx.fillText(p.name, CARD_W / 2, 656);

  if (p.title) {
    ctx.fillStyle = shade(th.color, 0.5);
    ctx.font = 'italic 21px Georgia, serif';
    ctx.fillText(p.title, CARD_W / 2, 706);
  }

  // Draw rank and ID line. If it's an official rank, render its badge and color.
  const rIdx = p.rank ? RANKS.findIndex(r => r.name.toLowerCase() === p.rank!.toLowerCase()) : -1;
  if (rIdx !== -1) {
    const rankName = RANKS[rIdx].name.toUpperCase();
    ctx.font = 'bold 22px Georgia, serif';
    const textW = ctx.measureText(rankName).width;
    const totalW = textW + 42;
    const startX = (CARD_W - totalW) / 2;
    ctx.drawImage(rankBadgeCanvas(rIdx, 128), startX, 720, 32, 32);
    ctx.fillStyle = RANKS[rIdx].color;
    ctx.textAlign = 'left';
    ctx.fillText(rankName, startX + 42, 744);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9aa0b8';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText(`NO. ${p.cardNo ?? '—'}`, CARD_W / 2, 774);
  } else {
    ctx.fillStyle = '#9aa0b8';
    ctx.font = '20px "Courier New", monospace';
    ctx.textAlign = 'center';
    const idLine = `${p.rank ? p.rank.toUpperCase() + ' · ' : ''}NO. ${p.cardNo ?? '—'}`;
    ctx.fillText(idLine, CARD_W / 2, 748);
  }

  // motto ribbon
  ctx.fillStyle = shade(th.color, -0.25);
  ctx.beginPath();
  ctx.moveTo(70, 790); ctx.lineTo(CARD_W - 70, 790); ctx.lineTo(CARD_W - 96, 824); ctx.lineTo(CARD_W - 70, 858);
  ctx.lineTo(70, 858); ctx.lineTo(96, 824);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText(`“${th.motto}”`, CARD_W / 2, 832);

  ctx.fillStyle = '#787e96';
  ctx.font = '16px Georgia, serif';
  ctx.fillText(th.footer, CARD_W / 2, 906);
  return c;
}

function drawNpcBack(p: NpcProfile, th: CardTheme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, '#0b0d18');
  grad.addColorStop(1, shade(th.color, -0.7));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CARD_W, CARD_H);
  th.pattern(ctx);

  ctx.strokeStyle = shade(th.color, 0.35); ctx.lineWidth = 8;
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26); ctx.stroke();

  // watermark emblem
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.drawImage(th.emblem, CARD_W / 2 - 230, CARD_H / 2 - 230, 460, 460);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4e8c8';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(th.isGuild ? 'SERVICE RECORD' : 'CITIZEN RECORD', CARD_W / 2, 84);
  ctx.fillStyle = shade(th.color, 0.5);
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText(`${p.name}${p.rank ? ' · ' + p.rank : ''}`, CARD_W / 2, 118);
  ctx.strokeStyle = shade(th.color, 0.4); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(80, 140); ctx.lineTo(CARD_W - 80, 140); ctx.stroke();

  const rows = p.stats ?? [];
  ctx.font = '22px Georgia, serif';
  rows.forEach(([k, v], i) => {
    const y = 192 + i * 56;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aab0c8';
    ctx.fillText(k, 90, y, CARD_W * 0.52);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText(v, CARD_W - 90, y, CARD_W * 0.4);
    ctx.font = '22px Georgia, serif';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(90, y + 16); ctx.lineTo(CARD_W - 90, y + 16); ctx.stroke();
  });

  // biography block
  if (p.bio) {
    const top = 192 + rows.length * 56 + 28;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4e8c8';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText(th.isGuild ? 'IN THE LEDGER' : 'AS THE NEIGHBORS TELL IT', CARD_W / 2, top);
    // wrap the bio
    ctx.font = 'italic 19px Georgia, serif';
    ctx.fillStyle = '#cfd4e8';
    const words = p.bio.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (ctx.measureText(probe).width > CARD_W - 170 && line) { lines.push(line); line = w; }
      else line = probe;
    }
    if (line) lines.push(line);
    lines.slice(0, 9).forEach((l, i) => ctx.fillText(l, CARD_W / 2, top + 36 + i * 28));
  }

  ctx.fillStyle = '#787e96';
  ctx.font = '15px Georgia, serif';
  ctx.fillText(th.footer, CARD_W / 2, 922);
  return c;
}

// ---------------- the 3D card viewer ----------------
/** Present an NPC's card in the full-screen rotating viewer. Resolves on close. */
export function openNpcCard(profile: NpcProfile): Promise<void> {
  return new Promise(resolve => {
    const th = themeFor(profile);

    const overlay = document.createElement('div');
    overlay.id = 'gcard-overlay'; // reuse the guild-card viewer's look wholesale
    overlay.innerHTML = `
      <div id="gcard-head">
        <div id="gcard-title" style="color:${shade(th.color, 0.45)}">${th.cardKind.toUpperCase()}</div>
        <div id="gcard-sub">${th.org} · ${profile.rank ? profile.rank + ' ' : ''}${profile.name}</div>
      </div>
      <canvas id="gcard-canvas"></canvas>
      <div id="gcard-hint">🖱 drag to rotate — their record is on the back</div>
      <div id="gcard-lore">
        <b style="color:${shade(th.color, 0.5)}">${profile.title ?? th.epithet}</b><br>${profile.bio ?? th.motto}
      </div>
      <div id="gcard-actions">
        <button class="ui-btn primary" id="gcard-close">Close (Esc)</button>
      </div>`;
    document.getElementById('app')!.appendChild(overlay);

    const canvas = overlay.querySelector<HTMLCanvasElement>('#gcard-canvas')!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    camera.position.set(0, 0.1, 6.4);
    const size = () => {
      renderer.setSize(overlay.clientWidth, overlay.clientHeight);
      camera.aspect = overlay.clientWidth / overlay.clientHeight;
      camera.updateProjectionMatrix();
    };

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const accent = parseInt(shade(th.color, 0).match(/\d+/g)!.map(n => (+n).toString(16).padStart(2, '0')).join(''), 16);
    const rim = new THREE.PointLight(accent, 30, 14);
    rim.position.set(-4, -1, 3);
    scene.add(rim);

    // dust motes in the card's color
    const moteGeo = new THREE.BufferGeometry();
    const motes = new Float32Array(180);
    for (let i = 0; i < motes.length; i += 3) {
      motes[i] = (Math.random() - 0.5) * 10;
      motes[i + 1] = (Math.random() - 0.5) * 7;
      motes[i + 2] = -2 - Math.random() * 4;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
    scene.add(new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: accent, size: 0.045, transparent: true, opacity: 0.6 })));

    // the card itself
    const cardGroup = new THREE.Group();
    scene.add(cardGroup);
    const edgeMat = new THREE.MeshStandardMaterial({ color: th.isGuild ? 0xc9a24a : 0x8a93b0, metalness: 0.85, roughness: 0.3 });
    const frontTex = new THREE.CanvasTexture(drawNpcFront(profile, th));
    frontTex.colorSpace = THREE.SRGBColorSpace;
    const backTex = new THREE.CanvasTexture(drawNpcBack(profile, th));
    backTex.colorSpace = THREE.SRGBColorSpace;
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.35, metalness: 0.15 });
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.35, metalness: 0.15 });
    const card = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.3, 0.045),
      [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    cardGroup.add(card);

    // Grand House members get their guild's effigy hovering beside the card
    let effigy: THREE.Group | null = null;
    if (profile.houseId) {
      effigy = makeEffigy(profile.houseId);
      effigy.scale.setScalar(0.85);
      effigy.position.set(2.5, -1.5, -0.4);
      scene.add(effigy);
    }

    // drag to rotate, idle lazy-spin
    let dragging = false, lastX = 0, lastY = 0;
    let velY = 0.35, rotX = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      cardGroup.rotation.y += dx * 0.011;
      rotX = Math.max(-0.9, Math.min(0.9, rotX + dy * 0.008));
      velY = dx * 0.6;
    });
    const releaseDrag = () => { dragging = false; };
    canvas.addEventListener('pointerup', releaseDrag);
    canvas.addEventListener('pointercancel', releaseDrag);

    let active = true;
    const close = () => {
      active = false;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', size);
      frontTex.dispose(); backTex.dispose();
      renderer.dispose();
      overlay.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', size);
    overlay.querySelector<HTMLElement>('#gcard-close')!.onclick = close;

    let last = performance.now();
    const loop = (now: number) => {
      if (!active) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragging) {
        cardGroup.rotation.y += velY * dt;
        velY += (0.35 - velY) * Math.min(1, dt * 0.8);
        rotX += (Math.sin(now * 0.0006) * 0.08 - rotX) * Math.min(1, dt * 1.2);
      }
      cardGroup.rotation.x = rotX;
      cardGroup.position.y = Math.sin(now * 0.0009) * 0.08;
      if (effigy) {
        effigy.rotation.y += dt * 0.6;
        effigy.position.y = -1.5 + Math.sin(now * 0.0012) * 0.07;
        effigy.traverse(o => {
          if (o.name === 'fx-spin') o.rotation.z += dt * 1.6;
          if (o.name === 'fx-float') o.position.y += Math.sin(now * 0.002) * 0.0006;
          if (o.name === 'fx-pulse') o.scale.setScalar(1 + Math.sin(now * 0.004) * 0.12);
        });
      }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    size();
    requestAnimationFrame(loop);
  });
}

// ---------------- the click-picker ----------------
export interface NpcPickerOpts {
  camera: () => THREE.Camera;
  /** root objects to raycast — only tagged NPCs (or their children) respond */
  roots: () => THREE.Object3D[];
  /** clicks are ignored while dialogue/menus/cutscenes hold the stage */
  blocked?: () => boolean;
}

let popupEl: HTMLDivElement | null = null;
function closeNpcPopup(): void {
  popupEl?.remove();
  popupEl = null;
}

function npcNameAt(e: { clientX: number; clientY: number }, opts: NpcPickerOpts): string | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(
    (e.clientX / innerWidth) * 2 - 1,
    -(e.clientY / innerHeight) * 2 + 1,
  ), opts.camera());
  const roots = opts.roots().filter(Boolean);
  if (!roots.length) return null;
  for (const hit of ray.intersectObjects(roots, true)) {
    let o: THREE.Object3D | null = hit.object;
    while (o) {
      if (typeof o.userData.npcName === 'string') return o.userData.npcName;
      o = o.parent;
    }
  }
  return null;
}

/**
 * Attach the NPC click-picker to a scene. Left-click an NPC to get a small
 * identity popup with the option to view their card. Returns a detach fn.
 */
export function attachNpcPicker(opts: NpcPickerOpts): () => void {
  let downX = 0, downY = 0, downOnWorld = false;
  let cardBusy = false;
  let hoverT = 0;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    downOnWorld = (e.target as HTMLElement)?.classList?.contains('game-canvas') ?? false;
    downX = e.clientX; downY = e.clientY;
  };

  const onMove = (e: PointerEvent) => {
    // light hover affordance, throttled
    const now = performance.now();
    if (now - hoverT < 90 || cardBusy || opts.blocked?.()) return;
    hoverT = now;
    if (!(e.target as HTMLElement)?.classList?.contains('game-canvas')) return;
    const name = npcNameAt(e, opts);
    document.body.style.cursor = name ? 'pointer' : '';
  };

  const onUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!downOnWorld || cardBusy) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;  // it was a drag
    if (opts.blocked?.()) return;
    closeNpcPopup();
    const name = npcNameAt(e, opts);
    if (!name) return;

    const profile = profileFor(name);
    const th = themeFor(profile);
    sfx('blip');
    const pop = document.createElement('div');
    pop.className = 'npc-popup panel';
    pop.innerHTML = `
      <div class="npc-popup-name" style="color:${shade(th.color, 0.5)}">${profile.name}</div>
      ${profile.title ? `<div class="npc-popup-title">${profile.title}</div>` : ''}
      <button class="ui-btn primary npc-popup-view">🪪 View ${th.isGuild ? 'Guild Card' : 'Citizen Card'}</button>`;
    document.getElementById('app')!.appendChild(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.min(innerWidth - r.width - 12, Math.max(12, e.clientX - r.width / 2))}px`;
    pop.style.top = `${Math.min(innerHeight - r.height - 12, Math.max(12, e.clientY - r.height - 18))}px`;
    popupEl = pop;

    pop.querySelector<HTMLElement>('.npc-popup-view')!.onclick = async () => {
      closeNpcPopup();
      cardBusy = true;
      sfx('open');
      await openNpcCard(profile);
      cardBusy = false;
    };
  };

  // any click that is not the popup dismisses it
  const onGlobalDown = (e: PointerEvent) => {
    if (popupEl && !popupEl.contains(e.target as Node)) closeNpcPopup();
  };

  window.addEventListener('pointerdown', onGlobalDown, true);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  return () => {
    closeNpcPopup();
    document.body.style.cursor = '';
    window.removeEventListener('pointerdown', onGlobalDown, true);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
}
