import '@zedit/upf';
import type { RecordHandle } from 'xelib';

export = 0;

/**
 * Figure out if a lvln record conatins all one gender and which
 */
enum ListGender {
  /**
   * Every list entry is female
   */
  Female,
  /**
   * Every list entry is male
   * */
  Male,
  /**
   * Neither all female nor all male
   */
  Mixed,
}
/**
 * What I used to decide about keeping a list/entry?
 */
type ListInfo = {
  /**
   * Aggregate gender of list
   */
  gender: ListGender;
  /**
   * Wether list contains entries of races we care about
   */
  hasRaces: boolean;
};

/**
 * Settings for zFem
 */
type Settings = {
  /**
   * Set to true to remove females instead
   *
   * @default false
   */
  deFem: boolean;
  /**
   * Races to feminize
   * @todo Add UI for setting these
   */
  races: string[];
};

type Locals = {
  memos: Map<string, ListInfo>;
};

// this patcher doesn't do anything useful, it's just a heavily commented
// example of how to create a UPF patcher.
registerPatcher<Locals, Settings>({
  info: info,
  gameModes: [
    xelib.gmSSE,
    xelib.gmTES5,
    xelib.gmTES4,
    xelib.gmFO4,
    xelib.gmFNV,
    xelib.gmFO3,
  ],
  settings: {
    label: 'zFem Patcher',
    templateUrl: `${patcherUrl}/partials/settings.html`,
    defaultSettings: {
      // Remove males by default
      deFem: false,
      // All the "people" races for Skyrim basially (i.e., not creatures)
      races: [
        'NordRace',
        'BretonRace',
        'DarkElfRace',
        'HighElfRace',
        'ImperialRace',
        'OrcRace',
        'RedguardRace',
        'WoodElfRace',
        'ElderRace',
        'NordRaceVampire',
        'BretonRaceVampire',
        'DarkElfRaceVampire',
        'HighElfRaceVampire',
        'ImperialRaceVampire',
        'OrcRaceVampire',
        'RedguardRaceVampire',
        'WoodElfRaceVampire',
        'ElderRaceVampire',
        'SnowElfRace',
        'DA13AfflictedRace',
        'KhajiitRace',
        'KhajiitRaceVampire',
        'ArgonianRace',
        'ArgonianRaceVampire',
      ],
    },
  },
  execute(_, helpers, settings, locals) {
    /**
     * @param record Handle to either LVLN or NPC_ record
     */
    function lvlnGender(record: RecordHandle): ListInfo {
      const cur = xelib.GetWinningOverride(record);
      // Memoize by EditorID
      const id = xelib.EditorID(cur);
      if (locals.memos.has(id)) {
        return locals.memos.get(id)!;
      }

      let ret;
      const signature = xelib.Signature(cur);
      switch (signature) {
        case 'LVLN':
          // @ts-ignore
          const items = xelib.GetElements(cur, 'Leveled List Entries');
          ret = items
            .map((item) => xelib.GetLinksTo(item, 'LVLO\\Reference'))
            // TODO: Ignore null refs in list? IDK
            .filter((ref) => !!ref)
            .map((ref) => {
              const cur = xelib.GetWinningOverride(ref);
              return lvlnGender(cur);
            })
            .reduce((g1, g2) => ({
              gender: g1.gender === g2.gender ? g1.gender : ListGender.Mixed,
              hasRaces: g1.hasRaces || g2.hasRaces,
            }));
          break;
        case 'NPC_':
          const race = xelib.GetLinksTo(cur, 'RNAM');
          ret = {
            gender: xelib.GetIsFemale(cur)
              ? ListGender.Female
              : ListGender.Male,
            hasRaces: settings.races.lastIndexOf(xelib.EditorID(race)) >= 0,
          };
          break;
        default:
          throw Error('Unexpect record type in leveled list');
      }

      locals.memos.set(id, ret);
      return ret;
    }

    return {
      initialize() {
        /**
         * Used for memoizing lvlnGender
         */
        locals.memos = new Map();
      },
      process: [
        {
          load: {
            // Load leveled NPC records
            signature: 'LVLN',
            filter(record) {
              // Ignore leveled lists with no entries
              if (!xelib.HasElement(record, 'Leveled List Entries')) {
                return false;
              }

              // Onnly edit lists of mixed gender with races of interest
              const { gender, hasRaces } = lvlnGender(record);
              return gender === ListGender.Mixed && hasRaces;
            },
          },
          patch(record) {
            const lvln = xelib.GetWinningOverride(record);
            helpers.logMessage(`Patching ${xelib.LongName(lvln)}`);
            // @ts-ignore
            const items = xelib.GetElements(lvln, 'Leveled List Entries');
            for (const item of items) {
              const ref = xelib.GetLinksTo(item, 'LVLO\\Reference');
              if (!ref) {
                // TODO: Remove the NULLs or ignore them? IDK
                continue;
              }
              const { gender, hasRaces } = lvlnGender(ref);
              if (
                gender ===
                  (settings.deFem ? ListGender.Male : ListGender.Female) ||
                !hasRaces
              ) {
                // Item of desired gender or not a race of interest
                return;
              }

              // Record not of desired gender, remove from list
              const cur = xelib.GetWinningOverride(ref);
              helpers.logMessage(`Removing entry ${xelib.LongName(cur)}`);
              xelib.RemoveLeveledEntry(record, xelib.EditorID(cur));
            }
          },
        },
      ],
    };
  },
});
