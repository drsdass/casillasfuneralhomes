// FIELD MAPPING — intentionally EMPTY until built from real EDRS screen structure.
// Each screen:
//   { name: 'Decedent', match: { urlIncludes: '...', textIncludes: 'Decedent Information' },
//     fields: [ { key: 'firstName', selector: '#txtFirst' }, { key: 'sex', selector: 'select[name=sex]' } ] }
// `key` is a row key from src/lib/edrsFormat.ts (see README). Until screens are listed the
// panel offers only "Capture structure".
self.CASILLAS_EDRS_MAPPING = { screens: [] }
