// FIELD MAPPING for the EDRS death certificate "Single Page View" (built from a real structure capture, EDRS 4.6.4.12).
// Each entry: key = row key from src/lib/edrsFormat.ts; model = the screen's Angular field name (shortened by MODEL prefix);
// or cap/section = the caption text printed beside the box. `literal` = a fixed choice made only when the case has that value.
// NOT mapped yet (these boxes only appear after another box is chosen - capture them after choosing):
//   age number (after Age type), birth state, residence state/county, informant mailing address, parents (after Relationship),
//   embalmer name/license (after Embalmed = Yes), Hispanic origin boxes, facility street address.
// (Parents 31-38, address types and the place-of-death address are mapped from the real certificate capture.)
const MODEL = "$parent.$ctrl.vm.cert."
const M = (key, path, extra) => Object.assign({ key, model: MODEL + path }, extra)
self.CASILLAS_EDRS_MAPPING = {
  screens: [
    {
      // The certificate search page: look the decedent up first, so a duplicate is never created. Fills the boxes only; you press Search.
      name: 'Search certificates (duplicate check)',
      match: { urlIncludes: '#!/dc/search' },
      fields: [
        { key: 'lastName', cap: 'Last:', section: "Decedent's Names" },
        { key: 'firstName', cap: 'First:', section: "Decedent's Names" },
        { key: 'dod', selector: '#dod_from' },
        { key: 'dod', selector: '#dod_to' },
      ],
    },
    {
      // The first page of a new certificate ("Create New Certificate"). Boxes are found by the number-and-caption printed beside them.
      name: 'Create new certificate',
      match: { urlIncludes: '#!/dc/new/' },
      fields: [
        { key: 'firstName', cap: "1. Decedent's Legal First Name:" },
        { key: 'middleName', cap: '2. Legal Middle Name:' },
        { key: 'lastName', cap: '3. Legal Last Name:' },
        { key: 'dod', cap: '7. Date of Death (MM/DD/YYYY):' },
        { key: 'timeOfDeath', cap: '8. Time of Death (HHMM 24 hour):' },
        { key: 'sex', cap: '6. Sex:' },
        { key: 'deathCounty', cap: '104. Jurisdiction of Death:' },
      ],
    },
    {
      name: 'Death certificate (single page view)',
      match: { urlIncludes: '#!/dc/cert/' },
      fields: [
        M("dob", "personalInfo.birthDate"),
        M("age", "personalInfo.age.type", {"literal": "Years"}),
        M("sex", "personalMedicalInfo.gender"),
        M("dod", "personalMedicalInfo.deathDateTime.date"),
        M("timeOfDeath", "personalMedicalInfo.deathDateTime.hour"),
        M("birth-type", "personalInfo.decedentBirthPlace.kind"),
        M("ssn", "personalInfo.ssn"),
        M("armedForces", "personalInfo.usVeteran"),
        M("maritalStatus", "personalInfo.maritalStatusId"),
        M("education", "personalInfo.educationId"),
        M("hispanic", "personalInfo.hispanic"),
        M("race", "personalInfo.race1CombinedCode"),
        M("occupation", "personalInfo.occupation"),
        M("kindOfBusiness", "personalInfo.industryKind"),
        M("yearsInOccupation", "personalInfo.yearsWorked"),
        M("homeless", "personalInfo.homeless"),
        M("res-number", "personalInfo.decedentAddress.streetNumber"),
        M("res-name", "personalInfo.decedentAddress.streetName"),
        M("res-unit", "personalInfo.decedentAddress.aptSte"),
        M("res-city", "personalInfo.decedentAddress.city"),
        M("res-zip", "personalInfo.decedentAddress.zip9"),
        M("res-years", "personalInfo.yearsInCounty"),
        {"key": "aka-first", "cap": "First Name:", "section": "AKA"},
        {"key": "aka-middle", "cap": "Middle Name:", "section": "AKA"},
        {"key": "aka-last", "cap": "Last Name:", "section": "AKA"},
        {"key": "spouseFirst", "cap": "28. First Name:"},
        {"key": "spouseMiddle", "cap": "29. Middle Name:"},
        {"key": "spouseLast", "cap": "30. Last (Birth) Name:"},
        M("inf-rel", "personalInfo.informantRelationshipId"),
        {"key": "inf-first", "cap": "26. First Name:"},
        {"key": "inf-middle", "cap": "26. Middle Name:"},
        {"key": "inf-last", "cap": "26. Last Name:"},
        M("dispositionDate", "funeralDirectorInfo.dispositionDate"),
        M("finalDisposition", "funeralDirectorInfo.dispositionPlaceName"),
        M("typeOfDisposition", "funeralDirectorInfo.dispositionTypeId"),
        M("embalmed", "funeralDirectorInfo.embalmerInfo.embalmed"),
        M("fd-name", "funeralDirectorInfo.funeralEstName"),
        M("fd-license", "funeralDirectorInfo.funeralDirLicense"),
        M("deathCounty", "personalMedicalInfo.registrationDistrictId"),
        M("pod-type", "personalMedicalInfo.deathPlaceCategory"),
        M("placeOfDeath", "personalMedicalInfo.deathPlace"),
        // Parents (31-38). The relationship is chosen first (Father in the first block, Mother in the second), which is what
        // makes the name boxes appear. Anything unknown goes in as UNK / Unknown. Names are found by their printed number.
        M("father-rel", "personalInfo.parent1Kind", { literal: "Father", always: true }),
        { key: 'fatherFirst', cap: '31. First Name:', unkIfEmpty: 'UNK' },
        { key: 'fatherMiddle', cap: '32. Middle Name:' },
        { key: 'fatherLast', cap: '33. Last (Birth) Name:', unkIfEmpty: 'UNK' },
        M("father-birth-type", "personalInfo.fatherBirthPlace.kind", { unkIfEmpty: 'Unknown' }),
        M("mother-rel", "personalInfo.parent2Kind", { literal: "Mother", always: true }),
        { key: 'motherFirst', cap: '35. First Name:', unkIfEmpty: 'UNK' },
        { key: 'motherMiddle', cap: '36. Middle Name:' },
        { key: 'motherLast', cap: '37. Last (Birth) Name:', unkIfEmpty: 'UNK' },
        M("mother-birth-type", "personalInfo.motherBirthPlace.kind", { unkIfEmpty: 'Unknown' }),
        // Address "types" and the pieces of the place-of-death address (from the real certificate capture).
        M("age", "personalInfo.age.years"),
        M("birth-value", "personalInfo.decedentBirthPlace.placeOther"),
        M("res-kindAlt", "personalInfo.decedentAddress.kindAlt"),
        M("inf-type", "personalInfo.informantMailingAddress.kind"),
        M("disp-type", "funeralDirectorInfo.dispositionPlaceAddress.kind"),
        M("fac-number", "personalMedicalInfo.deathPlaceAddress.streetNumber"),
        M("fac-name", "personalMedicalInfo.deathPlaceAddress.streetName"),
        M("fac-unit", "personalMedicalInfo.deathPlaceAddress.aptSte"),
        M("fac-zip5", "personalMedicalInfo.deathPlaceAddress.zip5"),
        M("fac-zip4", "personalMedicalInfo.deathPlaceAddress.zip4"),
        M("deathCity", "personalMedicalInfo.deathPlaceAddress.city"),
      ],
    },
  ],
}
