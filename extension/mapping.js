// FIELD MAPPING for the EDRS death certificate "Single Page View" (built from a real structure capture, EDRS 4.6.4.12).
// Each entry: key = row key from src/lib/edrsFormat.ts; model = the screen's Angular field name (shortened by MODEL prefix);
// or cap/section = the caption text printed beside the box. `literal` = a fixed choice made only when the case has that value.
// NOT mapped yet (these boxes only appear after another box is chosen - capture them after choosing):
//   age number (after Age type), birth state, residence state/county, informant mailing address, parents (after Relationship),
//   embalmer name/license (after Embalmed = Yes), Hispanic origin boxes, facility street address.
const MODEL = "$parent.$ctrl.vm.cert."
const M = (key, path, extra) => Object.assign({ key, model: MODEL + path }, extra)
self.CASILLAS_EDRS_MAPPING = {
  screens: [
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
        M("deathCity", "personalMedicalInfo.deathPlaceAddress.city"),
      ],
    },
  ],
}
