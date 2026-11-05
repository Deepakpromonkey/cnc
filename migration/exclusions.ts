// Test / junk rows left out of the migration (spec §5, §12.8). Keyed by legacy numeric `id`.
// Every entry needs Gaurav's confirmation before the go-live run — edit here, re-run, re-read the report.

export const EXCLUDE = {
  /** Spec §5 list: "Promonkey Demo", "promonkey cs demo", "Deepak Gandhi", "Deepak2". */
  users: { 130: "Promonkey Demo (spec §5)", 131: "promonkey cs demo (spec §5)", 135: "Deepak Gandhi (spec §5)", 136: "Deepak2 (spec §5)" } as Record<number, string>,

  /** ProMonkey's own logins: migrated INACTIVE (can't sign in) until confirmed. */
  inactiveUsers: { 1: "Amit Tanwar · amit@promonkey.tech (ProMonkey admin)", 53: "Gaurav Dhingra · login gaurav@promonkey.tech (ProMonkey)" } as Record<number, string>,

  brands: {
    20: "drfgh / dfghj — keyboard mash (spec §5)",
    21: "bebo beauty — terms 'nsksks', GST 'sksksjjs', POC 'ridhima' (spec §5: 'if confirmed')",
    22: "fvjbvdkja / fjhvbkj — keyboard mash (spec §5)",
  } as Record<number, string>,

  projects: {
    12: "promonkey testing (type 'demo', terms '12345')",
    18: "investors deck — type 'jfjwdkbfwekjvne', sub 'dvbkwjvbKK'",
    19: "test — type 'gfghjghj'",
    20: "rjgvbeijgnjek — keyboard mash",
  } as Record<number, string>,

  tasks: {
    3: "Test task", 14: "Promonkey Test", 15: "testing Promonkey", 16: "promonkey testing", 17: "testing", 18: "Testing", 19: "testing promonkey",
    20: "jjj", 28: "Promonkey testing", 29: "Promonkey testing", 31: "testing promonkey", 32: "testing", 33: "new (empty test)",
    39: "test task", 40: "ddedf", 41: "demo", 45: "cdc", 46: "cdc (duplicate)", 47: "Hdhakjxn", 57: "demo", 59: "testttt", 63: "testing3333",
    67: "test", 68: "ytfhg / xcvcb", 69: "v", 70: "d ,mb", 71: "test / sdsdsd", 72: "yhtgrfd", 74: "hjsavhAVSX", 76: "akdskks", 83: "dnntdg",
    88: "jhcfajbajbv", 89: "test", 90: "test2",
  } as Record<number, string>,

  concerns: {
    3: "promonkey testing", 4: "Test / test", 8: "testing / demo", 9: "test / test (Deepak2)", 12: "demo testing by promonkey", 13: "test / client", 21: "cfgvhbn / vghbn",
  } as Record<number, string>,

  /** flags_employees ids */
  flags: { 1: "subject 'as', feedback 'demo testing promonkey'", 5: "subject 'as' / 'as'", 9: "fgfhgh / cfgvb", 15: "as / as (promonkey cs demo)" } as Record<number, string>,

  workRequests: {
    2: "test", 3: "dgfg", 6: "jfjwevjwvjkrsvks", 8: "ksjcjhs · brand 'undefined'", 9: "ksjkschsjcjs · brand 'undefined'", 10: "gffgdfgd",
    11: "gdfdfgfdgdfg · brand 'undefined'", 12: "test", 13: "test2 · brand 'undefined'",
  } as Record<number, string>,

  announcements: { 2: "testing", 6: "testing promonkey", 7: "testing (holiday)", 11: "test (holiday)" } as Record<number, string>,
};

/**
 * Legacy "holidays" that are really someone's leave note. Imported as announcements (not
 * holidays) so they don't mark the whole studio closed or pause Sarthi.
 */
export const HOLIDAY_AS_NOTICE: Record<number, string> = {
  8: "“on leave for 5 days hghgh” — a leave note",
  9: "“Leave 25th to 30sept” — a leave note",
  10: "“weekend” — not a holiday",
};
