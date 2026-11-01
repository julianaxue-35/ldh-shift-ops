/* LDH Shift Ops — differentials reference by sign group (DRAFT: pending Juliana's clinical sign-off).
   Possible causes only: no treatments, doses or advice. Keys match LDHLogic.SIGN_GROUPS (no entry for 'other').
   Browser: global SignDifferentials. Node: module.exports (for unit tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SignDifferentials = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const NOTE = 'For reference only. This is a list of possible causes, not a diagnosis.';
  const BY_GROUP = {
    respiratory: [
      'Feline herpesvirus (cat flu)', 'Feline calicivirus (cat flu)', 'Chlamydia felis', 'Bordetella bronchiseptica',
      'Mycoplasma', 'Canine infectious respiratory disease complex (kennel cough)', 'Pneumonia', 'Feline asthma', 'Foreign body'
    ],
    gi: [
      'Parvovirus', 'Feline panleukopenia', 'Giardia', 'Intestinal parasites', 'Dietary change or indiscretion',
      'Stress-related colitis', 'Coccidia', 'Tritrichomonas foetus', 'Salmonella', 'Campylobacter'
    ],
    urinary: [
      'Urinary tract infection', 'Feline idiopathic cystitis', 'Urolithiasis (urinary stones)', 'Urethral obstruction',
      'Stress-related house soiling', 'Behavioural elimination problem', 'Renal disease', 'Diabetes mellitus'
    ],
    skin: [
      'Dermatophytosis (ringworm)', 'Fleas / flea allergy dermatitis', 'Sarcoptic mange', 'Demodicosis', 'Pyoderma',
      'Food allergy', 'Environmental allergy', 'Malassezia dermatitis', 'Cheyletiellosis', 'Self-trauma from stress'
    ],
    msk: [
      'Soft tissue injury (sprain / strain)', 'Cranial cruciate ligament injury', 'Patellar luxation', 'Osteoarthritis',
      'Hip dysplasia', 'Soft pad or nail injury', 'Abscess', 'Septic arthritis', 'Immune-mediated polyarthritis'
    ],
    neuro: [
      'Epilepsy', 'Toxin exposure', 'Hypoglycaemia', 'Vestibular disease', 'Canine distemper', 'Toxoplasmosis',
      'Head trauma', 'Hepatic encephalopathy', 'Meningoencephalitis'
    ],
    eyes: [
      'Feline herpesvirus conjunctivitis', 'Chlamydia felis conjunctivitis', 'Corneal ulcer', 'Foreign body',
      'Entropion', 'Keratoconjunctivitis sicca (dry eye)', 'Uveitis', 'Glaucoma', 'Blocked tear duct'
    ],
    ears: [
      'Otitis externa', 'Ear mites (Otodectes)', 'Yeast otitis (Malassezia)', 'Bacterial otitis', 'Otitis media',
      'Aural haematoma', 'Foreign body (e.g. grass seed)', 'Allergic otitis'
    ],
    wounds_pain_swelling: [
      'Bite wound', 'Abscess', 'Cellulitis', 'Blunt trauma', 'Insect bite or sting reaction', 'Haematoma',
      'Hernia', 'Foreign body', 'Pancreatitis', 'Bleeding disorder'
    ],
    neonatal: [
      'Hypothermia', 'Hypoglycaemia', 'Dehydration', 'Neonatal sepsis', 'Congenital defects',
      'Flea anaemia', 'Intestinal parasites', 'Maternal neglect or poor lactation'
    ]
  };
  return { BY_GROUP, NOTE };
});
