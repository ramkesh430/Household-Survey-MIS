/**
 * घरधुरी सर्वेक्षण फारम (अनुसूची १, दफा १० (३) ख सँग सम्बन्धित)
 * Authoritative digital definition of the 22-page household survey PDF.
 *
 * Every question keeps its original number (`no`), wording (`title`), option
 * codes (`code`) and table structure. Where the PDF repeats an option code
 * (e.g. two "घ" in Q9), the displayed code stays as printed and only the
 * internal storage `value` is made unique (e.g. "घ२"). See docs/01-question-inventory.md.
 *
 * Field types:
 *   text | number | date | single | multi | grid | repeat | groupedRepeat | signature
 * Conditions (`showIf`):
 *   { field, eq } | { field, in: [] } | { field, includesAny: [] } | { q, field, eq } (cross-question)
 */

export const FORM_ID = 'household-survey-anusuchi-1';
export const FORM_VERSION = '1.0.0';

// ---------- helpers ----------
const o = (code, label, extra = {}) => ({ code, value: extra.value ?? code, label, ...extra });
const num = (key, label, extra = {}) => ({ key, label, type: 'number', ...extra });
const txt = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const chk = (key, label, extra = {}) => ({ key, label, type: 'check', ...extra });
const sel = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

const YES_NO_KHA = [o('क', 'छ'), o('ख', 'छैन')];
const YES_NO_12 = [o('१', 'छ'), o('२', 'छैन')];
const YES_NO_12_PLURAL = [o('१', 'छन्'), o('२', 'छैनन्')];
const YES_NO_KHA_PLURAL = [o('क', 'छन्'), o('ख', 'छैनन्')];

const CHILD_ROWS = [
  { key: 'boy', label: 'बालक' },
  { key: 'girl', label: 'बालिका' },
  { key: 'third', label: 'तेस्रो लिङ्गी' },
];
const ADULT_COLS_FMT = (prefix = '', group) => [
  num(`${prefix}female`, 'महिला', { group }),
  num(`${prefix}male`, 'पुरुष', { group }),
];
const SEX_SELECT = [o('बालक', 'बालक'), o('बालिका', 'बालिका'), o('तेस्रो लिङ्गी', 'तेस्रो लिङ्गी')];

/** three columns महिला/पुरुष/जम्मा(auto) for a group */
const fmTotal = (prefix, group) => [
  num(`${prefix}_f`, 'महिला', { group }),
  num(`${prefix}_m`, 'पुरुष', { group }),
  num(`${prefix}_t`, 'जम्मा', { group, sumOf: [`${prefix}_f`, `${prefix}_m`] }),
];
/** three columns बालक/बालिका/जम्मा(auto) for a group */
const bgTotal = (prefix, group) => [
  num(`${prefix}_b`, 'बालक', { group }),
  num(`${prefix}_g`, 'बालिका', { group }),
  num(`${prefix}_t`, 'जम्मा', { group, sumOf: [`${prefix}_b`, `${prefix}_g`] }),
];

// ---------- sections ----------
export const sections = [
  { id: 'S1', title: 'घरधुरी परिचय तथा परिवार विवरण', pages: '१–२' },
  { id: 'S2', title: 'खानेपानी, सरसफाइ र स्वास्थ्य सेवा', pages: '२–३' },
  { id: 'S3', title: 'मातृ, शिशु तथा बाल स्वास्थ्य', pages: '३–८' },
  { id: 'S4', title: 'बाल संरक्षण, बालश्रम र सामाजिक अवस्था', pages: '८–११' },
  { id: 'S5', title: 'शिक्षा', pages: '११–१४' },
  { id: 'S6', title: 'सहभागिता, संघसंस्था र तालिम', pages: '१४–१६' },
  { id: 'S7', title: 'पेशा, आवास, ऊर्जा, रोजगारी, आम्दानी र ऋण', pages: '१६–१९' },
  { id: 'S8', title: 'कृषि तथा पशुपालन', pages: '१९–२१' },
  { id: 'S9', title: 'विपद् तथा प्रमाणीकरण', pages: '२२' },
];

// ---------- questions ----------
export const questions = [
  // ===== Page 1 header (household identification) =====
  {
    id: 'hdr', no: '', page: 1, section: 'S1', title: 'घरधुरी पहिचान',
    note: 'परिवार र व्यक्तिको गणना गर्दा अक्सर बसोवास गरेको ठाँउबाट गर्नुपर्दछ ।',
    fields: [
      num('ward_no', 'वडा नं.', { required: true, fromHousehold: true }),
      txt('settlement_code', 'बस्ती कोड नं.', { required: true, fromHousehold: true }),
      txt('settlement_name', 'बस्तीको नाम', { required: true, fromHousehold: true }),
      num('house_no', 'घर क्र.सं.', { required: true, fromHousehold: true }),
      num('family_no', 'परिवार क्र.सं.', { required: true, fromHousehold: true }),
    ],
  },
  {
    id: 'q1', no: '१', page: 1, section: 'S1', title: 'परिवार मूलीको नाम',
    fields: [
      txt('head_name', 'परिवार मूलीको नाम', { required: true }),
      { key: 'head_gender', label: 'लिङ्ग', type: 'single', required: true,
        options: [o('१', 'महिला'), o('२', 'पुरुष'), o('३', 'तेस्रो लिङ्गी')] },
    ],
  },
  { id: 'q2', no: '२', page: 1, section: 'S1', title: 'जाति',
    fields: [txt('caste', 'जाति', { required: true, suggest: 'caste' })] },
  { id: 'q3', no: '३', page: 1, section: 'S1', title: 'धर्म',
    fields: [txt('religion', 'धर्म', { required: true, suggest: 'religion' })] },
  { id: 'q4', no: '४', page: 1, section: 'S1', title: 'मातृभाषा',
    fields: [txt('mother_tongue', 'मातृभाषा', { required: true, suggest: 'language' })] },
  {
    id: 'q5', no: '५', page: 1, section: 'S1', title: 'परिवार संख्या',
    fields: [
      num('family_size', 'परिवार संख्या (तलको तालिकाको जम्मासँग मिल्नुपर्छ)', { required: true, min: 1, computedFrom: 'age_table' }),
      {
        key: 'age_table', type: 'grid', label: 'उमेर समूह अनुसार परिवार सदस्य', totalRow: true,
        rows: [
          ['lt1', '१ वर्षभन्दा मुनि'], ['1_2', '१ – २ वर्षसम्म'], ['3_4', '३ – ४ वर्षसम्म'],
          ['5_6', '५ – ६ वर्षसम्म'], ['7_8', '७ – ८ वर्षसम्म'], ['9_10', '९ – १० वर्षसम्म'],
          ['11_12', '११ – १२ वर्षसम्म'], ['13_14', '१३ – १४ वर्षसम्म'], ['15_16', '१५ – १६ वर्षसम्म'],
          ['17_18', '१७ – १८ वर्षसम्म'], ['19_24', '१९ – २४ वर्षसम्म'], ['25_45', '२५ – ४५ वर्षसम्म'],
          ['46_60', '४६ – ६० वर्षसम्म'], ['61_75', '६१ – ७५ वर्षसम्म'], ['gt75', '७५ वर्ष भन्दा माथि'],
        ].map(([key, label]) => ({ key, label })),
        cols: [
          num('female', 'महिला'), num('male', 'पुरुष'), num('third', 'तेस्रो लिङ्गी'),
          num('total', 'जम्मा', { sumOf: ['female', 'male', 'third'] }),
          txt('remarks', 'कैफियत'),
        ],
      },
    ],
  },

  // ===== Page 2 – drinking water & sanitation =====
  {
    id: 'q6', no: '६', page: 2, section: 'S2', title: 'तपाईको परिवारको खानेपानीको मुख्य स्रोत कुन हो ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'पाइपको धाराको पानी प्रयोग गर्ने'), o('ख', 'ट्यूबवेलको पानी प्रयोग गर्ने'),
      o('ग', 'इनार, कुवा, जरुवाको पानी प्रयोग गर्ने'), o('घ', 'नदी, कुलो, नहर, पोखरीको पानी प्रयोग गर्ने'),
      o('ङ', 'आकाशे पानी संकलन गरी प्रयोग गर्ने'), o('च', '............ (खुलाउने) को पानी प्रयोग गर्ने', { specify: true }),
    ] }],
  },
  {
    id: 'q7', no: '७', page: 2, section: 'S2', title: 'खानेपानी ल्याउन (जाँदा आउँदा) लाग्ने समय',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'घरैमा भएको'), o('ख', '१५ मिनेटसम्मको दुरीमा'),
      o('ग', '१५ – ३० मिनेटको दुरीमा'), o('घ', '३० मिनेटभन्दा बढी समय लाग्ने'),
    ] }],
  },
  {
    id: 'q8', no: '८', page: 2, section: 'S2', title: 'खानेपानीको घरायसी रुपमा कसरी प्रशोधन गर्ने गरिएको छ ।',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'प्रणाली बाट नै सुरक्षित खानेपानी आउने गरेको'), o('ख', 'सधै उमालेर प्रयोग गर्ने गरेको'),
      o('ग', 'सुरक्षित फिल्टर जडान गरिएको'), o('घ', 'केहि नरहेको'),
    ] }],
  },
  {
    id: 'q9', no: '९', page: 2, section: 'S2', title: 'खानेपानीको गुणस्तरः पानीजन्य रोगब्याधी बिगत १ बर्षमा',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'घरमा कसैलाई झाडापखाला नलागेको'),
      o('ख', 'घरका सदस्यहरु बर्षमा कम्तीमा १ पटक झाडापखालाबाट विरामी भएको'),
      o('घ', 'घरका सदस्यहरु बर्षमा कम्तीमा २ पटक झाडापखालाबाट विरामी भएको'),
      o('घ', 'घरका सदस्यहरु बर्षमा कम्तीमा ३ वा सो भन्दा बढी पटक झाडापखालाबाट विरामी भएको', { value: 'घ२' }),
    ] }],
  },
  {
    id: 'q10', no: '१०', page: 2, section: 'S2', title: 'शौचालयको अवस्था',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'कच्ची'),
      o('ख (१)', 'पक्की – वायोग्यासमा जडान भएको', { value: 'ख१' }),
      o('ख (२)', 'पक्की – ढलमा शौचालय जडान भएको', { value: 'ख२' }),
      o('ग', 'शौचालय नभएको'),
    ] }],
  },

  // ===== Page 3 =====
  {
    id: 'q11', no: '११', page: 3, section: 'S2',
    title: 'तपाईको घरमा खाना खानु अगाडि, बच्चाको दिसा धोएपछि र शौचालय गएर आएपछि हात के ले धुनुहुन्छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'साबुनपानी'), o('ख', 'खरानी पानी'), o('ग', 'पानीमात्र'), o('घ', 'ढुङगा/माटो'), o('ङ', 'केही पनि नगर्ने'),
    ] }],
  },
  {
    id: 'q12', no: '१२', page: 3, section: 'S2',
    title: 'परिवारको कुनै सदस्य विरामी भएमा उपचारका लागि सबैभन्दा पहिला कहाँ जानुहुन्छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'लामा, धामी, झाँक्री'), o('ख', 'परंपरागत वैद्य'), o('ग', 'स्थानीय स्वास्थ्य संस्था/चौकी'),
      o('घ', 'अस्पताल (निजी, सरकारी)'), o('ङ', 'अन्य भए (खुलाउने)', { specify: true }),
    ] }],
  },
  {
    id: 'q13', no: '१३', page: 3, section: 'S2', title: 'नजिकको स्वास्थ्य संस्थामा पुग्न लाग्ने समय',
    fields: [
      txt('hp_place', 'क) उपस्वास्थ्य चौकी / स्वास्थ्य चौकी / प्राथमिक स्वास्थ्य केन्द्र रहेको स्थान', { required: true }),
      txt('hp_distance', 'दूरी', { required: true }),
      num('hp_time', 'पुग्न लाग्ने समय', { required: true, decimal: true }),
      { key: 'hp_time_unit', label: 'एकाइ', type: 'single', required: true, options: [o('घण्टा', 'घण्टा'), o('दिन', 'दिन')] },
      txt('hosp_place', 'ख) अस्पताल रहेको स्थान', { required: true }),
      txt('hosp_distance', 'दूरी', { required: true }),
      num('hosp_time', 'पुग्न लाग्ने समय', { required: true, decimal: true }),
      { key: 'hosp_time_unit', label: 'एकाइ', type: 'single', required: true, options: [o('घण्टा', 'घण्टा'), o('दिन', 'दिन')] },
    ],
  },
  {
    id: 'q14', no: '१४', page: 3, section: 'S2', title: 'बालबालिका बिरामी पर्दा तुरुन्त उपचार गर्ने आर्थिक क्षमता छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: YES_NO_KHA }],
  },
  {
    id: 'q15', no: '१५', page: 3, section: 'S3', title: 'वितेको २ बर्षभित्र जन्मेका बालबालिकाको विवरण',
    fields: [{
      key: 'table', type: 'grid', totalRow: true, rows: CHILD_ROWS,
      cols: [
        num('live_births', 'जन्मेको जीवित शिशुको जम्मा संख्या'),
        num('bf_immediate', 'जन्मने वितिक्कै बेगुति दुध खुवाएको संख्या', { maxOf: 'live_births' }),
        num('bf_not', 'जन्मने वितिक्कै बेगुति दुध नखुवाएको संख्या', { maxOf: 'live_births' }),
        num('excl_6m', '६ महिनासम्म आमाको दुध मात्र खुवाएको संख्या', { maxOf: 'live_births' }),
        num('mixed_6m', '६ महिनासम्म आमाको दुध र अन्य खानेकुरा पनि खुवाएको संख्या', { maxOf: 'live_births' }),
        num('lt2m', '२ महिना वा सो भन्दा कम मात्र आमाको दुध खुवाएको संख्या', { maxOf: 'live_births' }),
      ],
    }],
  },

  // ===== Page 4 =====
  {
    id: 'q16', no: '१६', page: 4, section: 'S3', title: 'तपाईंलाई बालरोग तथा खोपहरुको विषयमा जानकारी छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: YES_NO_KHA }],
  },
  {
    id: 'q17', no: '१७', page: 4, section: 'S3', title: 'एक वर्ष मुनिका बालबालिकालाई खोप लगाएको विवरण',
    fields: [{
      key: 'table', type: 'grid', totalRow: true, rows: CHILD_ROWS,
      cols: [
        num('total', 'जम्मा संख्या'),
        num('bcg', 'बि.सि.जी. (BCG) लगाएको संख्या', { maxOf: 'total' }),
        num('dpt1', 'डि.पि.टि १ (DPT1) लगाएको संख्या', { maxOf: 'total' }),
        num('dpt2', 'डि.पि.टि २ लगाएको संख्या', { maxOf: 'total' }),
        num('dpt3', 'डि.पि.टि ३ लगाएको संख्या', { maxOf: 'total' }),
        num('mr', 'दादुरा/रुबेला बिरुद्धको खोप लगाएको संख्या', { maxOf: 'total' }),
        num('hepb', 'हेपटाईटिस वी बिरुद्धको खोप लगाएको संख्या', { maxOf: 'total' }),
      ],
    }],
  },
  {
    id: 'q18', no: '१८', page: 4, section: 'S3',
    title: 'पाँच वर्षमुनिका बालबालिकालाई वर्षको २ पटक भिटामिन ए, जुकाको औषधी र पोलियो थोपा खुवाएको विवरण',
    fields: [{
      key: 'table', type: 'grid', totalRow: true, rows: CHILD_ROWS,
      cols: [
        num('total', 'जम्मा संख्या'),
        num('vita', 'भिटामिन ए खुवाएका बालबालिकाको संख्या', { maxOf: 'total' }),
        num('deworm', 'जुकाको औषधी खुवाएका बालबालिकाको संख्या', { maxOf: 'total' }),
        num('polio', 'पोलियो थोपा खुवाएका बालबालिकाको संख्या', { maxOf: 'total' }),
      ],
    }],
  },

  // ===== Page 5 =====
  {
    id: 'q19', no: '१९', page: 5, section: 'S3', sensitive: true,
    title: 'बितेको १ वर्षभित्रको तपाईको परिवारमा रहेका गर्भवती महिलाको स्वास्थ्य अवस्था बारे जानकारी',
    fields: [{
      key: 'rows', type: 'repeat', rowLabel: 'गर्भवती', initialRows: 0, maxRows: 20,
      columns: [
        num('anc_visits', 'गर्भवती परीक्षण गरेको पटक (संख्या)'),
        num('iron_tabs', 'आइरन चक्कीको प्रयोग (चक्कि संख्या)'),
        num('tt_doses', 'टि. टि. खोप लगाएको संख्या'),
        sel('delivered', 'प्रसूति भए नभएको', [o('भएको', 'भएको'), o('नभएको', 'नभएको')]),
        sel('delivery_place', 'प्रसूति कहाँ भएको', [
          o('१', 'स्वास्थ्य संस्थामा'), o('२', 'घरमा स्वास्थ्य कर्मीको सहयोगमा'),
          o('३', 'घरमा स्वास्थ्य कर्मीको सहयोग बिना'), o('४', 'अन्य', { specify: true }),
        ], { showIf: { field: 'delivered', eq: 'भएको' } }),
        num('newborn_checks', 'नवजात शिशुको जाँच गराएको संख्या', { showIf: { field: 'delivered', eq: 'भएको' } }),
      ],
    }],
  },
  {
    id: 'q20', no: '२०', page: 5, section: 'S3', sensitive: true,
    title: 'तपाईको परिवारमा एच्आईभी संक्रमित आमावाट जन्मेका बालवालिका छन्?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_12_PLURAL },
      { key: 'arv', label: 'यदि छन् भने उनीहरुले ARV Prophylaxis पाएका छन् ?', type: 'single', required: true,
        options: YES_NO_12_PLURAL, showIf: { field: 'has', eq: '१' } },
    ],
  },
  {
    id: 'q21', no: '२१', page: 5, section: 'S3', sensitive: true,
    title: 'तपाईको परिवारको १८ वर्षभन्दा मुनिको सदस्यलाई कुनै दीर्घ रोग लागेको छ ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_12 },
      {
        key: 'table', label: 'यदि लागेको छ भने देहायको विवरण खुलाउनुहोस्', type: 'grid', showIf: { field: 'has', eq: '१' },
        rows: [
          { key: 'hiv', label: 'एच.आई.भि./ एड्स' }, { key: 'tb', label: 'क्षयरोग' }, { key: 'cancer', label: 'क्यान्सर' },
          { key: 'diabetes', label: 'मधुमेह (चिनीरोग)' }, { key: 'heart', label: 'मुटु' }, { key: 'kidney', label: 'मृगौला' },
          { key: 'other', label: 'अन्य', specify: true },
        ],
        cols: [num('girl', 'बालिका'), num('boy', 'बालक'), num('third', 'तेस्रो लिङ्गी'),
          num('total', 'जम्मा', { sumOf: ['girl', 'boy', 'third'] })],
      },
    ],
  },

  // ===== Page 6 =====
  {
    id: 'q22', no: '२२', page: 6, section: 'S3', sensitive: true,
    title: 'तपाईको परिवारमा दीर्घ रोगको कारण विगत १० वर्षमा १८ वर्ष भन्दामुनिका कुनै सदस्यको मृत्यु भएको छ ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_12 },
      {
        key: 'table', label: 'यदि छ भने देहायको विवरण खुलाउनुहोस्', type: 'grid', showIf: { field: 'has', eq: '१' },
        rows: [
          { key: 'hiv', label: 'एच.आई.भि./ एड्स' }, { key: 'tb', label: 'क्षयरोग' }, { key: 'cancer', label: 'क्यान्सर' },
          { key: 'diabetes', label: 'मधुमेह (चिनी रोग)' }, { key: 'heart', label: 'मुटु' }, { key: 'kidney', label: 'मृगौला' },
          { key: 'other', label: 'अन्य', specify: true },
        ],
        cols: [num('female', 'महिला'), num('male', 'पुरुष'), num('third', 'तेस्रो लिङ्गी'),
          num('total', 'जम्मा', { sumOf: ['female', 'male', 'third'] })],
      },
    ],
  },
  {
    id: 'q23', no: '२३', page: 6, section: 'S3', sensitive: true,
    title: 'बितेको १ वर्षभित्र तपाईंको परिवारमा ५ वर्षमुनिका कुनै बालबालिकाको मृत्यु भएको छ ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: [o('१', 'छ'), o('२', 'छैन')] },
      {
        key: 'table', label: 'यदि छ भने कतिजनाको मृत्यु भएको थियो र के कारणबाट मृत्यु भएको थियो ?',
        type: 'grid', totalRow: true, rows: CHILD_ROWS, showIf: { field: 'has', eq: '१' },
        cols: [num('deaths', 'मृत्यु भएको जम्मा संख्या'), txt('cause', 'मृत्यु हुनाको कारण')],
      },
    ],
  },

  // ===== Page 7 =====
  {
    id: 'q24', no: '२४', page: 7, section: 'S3', title: 'दुई बालबालिका चिन्ह भएको आयोडिनयुक्त नुन प्रयोग गर्ने गर्नुभएको छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: YES_NO_KHA }],
  },
  {
    id: 'q25', no: '२५', page: 7, section: 'S3',
    title: '५ बर्ष मुनिका बालबालिकाले पोषिलो खाना (दिनको कम्तिमा ३ पटक दुध, लिटो, भात, फलफुल र सागसव्जी) खान पाउँछन् ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [o('क', 'पाउँछन्'), o('ख', 'पाउँदैनन्')] }],
  },
  {
    id: 'q26', no: '२६', page: 7, section: 'S3',
    title: 'तपाईंको परिवारका १ वर्ष मुनिकाको मासिक र १ वर्ष भन्दा माथि ५ वर्ष सम्मका बालबालिकाहरुको त्रैमासिक रुपमा तौल लिने गरिएको छ ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_12 },
      {
        key: 'rows', label: 'छ भने पाँच वर्ष मुनिका बालबालिकाको तौल (वजन)', type: 'repeat', showIf: { field: 'has', eq: '१' },
        rowLabel: 'क्र.सं.', maxRows: 20,
        columns: [
          num('age_months', 'उमेर (महिनामा)', { max: 60 }),
          num('weight_kg', 'तौल (वजन) केजी', { decimal: true, max: 40 }),
          sel('status', 'पोषण स्थिति', [o('कुपोषण', 'कुपोषण (कम तौल) छ'), o('पोषणयुक्त', 'पोषणयुक्त (ठिक तौल) छ')]),
        ],
      },
    ],
  },
  {
    id: 'q27', no: '२७', page: 7, section: 'S3',
    title: 'पाँच वर्षमुनिका र ६ वर्षदेखि १८ वर्षसम्मका बालबालिकाको जन्म दर्ता गराएको विवरण',
    fields: [{
      key: 'table', type: 'grid', totalRow: true, rows: CHILD_ROWS,
      cols: [
        num('u5_total', 'जम्मा संख्या', { group: '५ वर्षमुनिका बालबालिका' }),
        num('u5_reg', 'जन्म दर्ता गराएको संख्या', { group: '५ वर्षमुनिका बालबालिका' }),
        num('u5_notreg', 'जन्म दर्ता नगराएको संख्या', { group: '५ वर्षमुनिका बालबालिका' }),
        num('o6_total', 'जम्मा संख्या', { group: '६ देखि १८ वर्षसम्मका बालबालिका' }),
        num('o6_reg', 'जन्म दर्ता गराएको संख्या', { group: '६ देखि १८ वर्षसम्मका बालबालिका' }),
        num('o6_notreg', 'जन्म दर्ता नगराएको संख्या', { group: '६ देखि १८ वर्षसम्मका बालबालिका' }),
      ],
      rowRules: [
        { sum: ['u5_reg', 'u5_notreg'], equals: 'u5_total', message: 'दर्ता गराएको + नगराएको = जम्मा (५ वर्षमुनि) हुनुपर्छ' },
        { sum: ['o6_reg', 'o6_notreg'], equals: 'o6_total', message: 'दर्ता गराएको + नगराएको = जम्मा (६–१८ वर्ष) हुनुपर्छ' },
      ],
    }],
  },

  // ===== Page 8 =====
  {
    id: 'q28', no: '२८', page: 8, section: 'S4',
    title: 'गएको ३ वर्षभित्र तपाईंको परिवारमा कसैको विवाह भएको भए सो को विवरण दिनुहोस् ।',
    fields: [{
      key: 'table', type: 'grid', totalRow: true,
      rows: [{ key: 'male', label: 'पुरुष' }, { key: 'female', label: 'महिला' }, { key: 'third', label: 'तेस्रो लिङ्गी' }],
      cols: [
        num('count', 'संख्या', { max: 7 }),
        ...[1, 2, 3, 4, 5, 6, 7].map((i) => num(`age${i}`, `${'१२३४५६७'[i - 1]})`, { group: 'विवाह गर्दाको उमेर कति वर्षको थियो', max: 120, noTotal: true })),
      ],
    }],
  },
  {
    id: 'q29', no: '२९', page: 8, section: 'S4', sensitive: true,
    title: 'तपाईको परिवारका १८ वर्षसम्मका बालबालिका अरुको घरमा काम गर्न बसेका छन् ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_12 },
      num('boys', 'क) बालक संख्या', { showIf: { field: 'has', eq: '१' } }),
      num('girls', 'ख) बालिका संख्या', { showIf: { field: 'has', eq: '१' } }),
      num('third', 'ग) तेस्रो लिङ्गी', { showIf: { field: 'has', eq: '१' } }),
      {
        key: 'rows', type: 'repeat', label: 'प्रत्येक बालबालिकाको विवरण', rowLabel: 'बच्चा', showIf: { field: 'has', eq: '१' }, maxRows: 20,
        columns: [
          num('age', 'बच्चाको उमेर कति छ (वर्ष)', { max: 18 }),
          sel('sex', 'लिंग', SEX_SELECT),
          sel('work_type', 'कामको किसिम', [o('व्यक्तिगत घर', 'व्यक्तिगत घर'), o('होटल, पसल', 'होटल, पसल')]),
          num('hours', 'कति घण्टा काम गर्छन्', { max: 24, decimal: true }),
          num('years', 'यो काम गरेको कति वर्ष भयो', { max: 18 }),
          num('annual_pay', 'वार्षिक कति रुपिया पाउछन् (जिन्सि भए नगदमा मिलाएर)'),
          num('visits', 'वर्षमा कति पटक तपाई आफ्नो वच्चालाई भेट्न सक्नुहुन्छ'),
          sel('school', 'विद्यालयमा पढ्ने गरेको', [o('छ', 'छ'), o('छैन', 'छैन')]),
        ],
      },
    ],
  },

  // ===== Page 9 =====
  {
    id: 'q30', no: '३०', page: 9, section: 'S4', sensitive: true,
    title: 'तपाईको परिवारका बालबालिकाहरुले कस्ता प्रकारका बालश्रम गरिरहेका छन् ?',
    fields: [{ key: 'ans', type: 'multi', options: [
      o('क', 'बालभरिया'), o('ख', 'घरेलु बालश्रम अर्काको घरमा काम गर्ने'), o('ग', 'होटल/पसलमा काम गर्ने'),
      o('घ', 'यातायात'), o('ङ', 'कारखाना/उद्योग'), o('च', 'अन्य', { specify: true }),
    ] }],
  },
  {
    id: 'q31', no: '३१', page: 9, section: 'S4', sensitive: true,
    title: 'बालबालिकाहरु घरबाहिर काम गरेको भए गरेको ठाउँमा के कस्तो समस्या भोग्ने गरेका छन् ?',
    fields: [{ key: 'ans', type: 'multi', options: [
      o('क', 'गाली/गलौज'), o('ख', 'कुटपिट'), o('ग', 'खानामा भेदभाव'), o('घ', 'यौन शोषण'),
      o('ङ', 'मनोवैज्ञानिक तनाव'), o('च', 'खेल्नमा भेदभाव वा खेल्न नदिने'), o('छ', 'अन्य', { specify: true }),
    ] }],
  },
  {
    id: 'q32', no: '३२', page: 9, section: 'S4', title: 'तपाईंको परिवारमा बालबालिकाले कमजोरी गरेमा के गर्नु हुन्छ ?',
    fields: [{ key: 'ans', type: 'multi', required: true, options: [
      o('क', 'गाली'), o('ख', 'कुटपीट'), o('ग', 'खानामा बन्देज'), o('घ', 'कोठामा थुन्ने'),
      o('ड', 'सम्झाउने'), o('च', 'हेप्ने, निन्दा गर्ने वा मनोवैज्ञानिक तनाव दिने'), o('छ', 'अन्य', { specify: true }),
    ] }],
  },
  {
    id: 'q33', no: '३३', page: 9, section: 'S4', title: 'तपाईंको घरमा छोरा र छोरीमा कुनै फरक व्यवहार गर्ने गर्नुभएको छ ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: [o('छ', 'छ'), o('छैन', 'छैन')] },
      { key: 'areas', label: 'यदि छ भने,', type: 'multi', required: true, showIf: { field: 'has', eq: 'छ' }, options: [
        o('क', 'शिक्षामा'), o('ख', 'खानपिनमा'), o('ग', 'घरेलु काममा'), o('घ', 'पोशाकमा'), o('ङ', 'अन्य', { specify: true }),
      ] },
    ],
  },
  {
    id: 'q34', no: '३४', page: 9, section: 'S4',
    title: 'तपाईंको परिवारका बालबालिकाहरुले विद्यालयमा गल्ती गरेमा बिद्यालयमा निम्न यातना पाउने गरेका छन् ?',
    fields: [{ key: 'ans', type: 'multi', options: [
      o('क', 'कान समातेर उठ्बस्'), o('ख', 'कुटपीट'), o('ग', 'कक्षा कोठाबाट निष्कासन'),
      o('घ', 'बेन्चमा उभ्याउने'), o('घ', 'शौचालयमा थुन्ने', { value: 'घ२' }), o('ङ', 'गालि गर्ने'),
      o('च', 'हेप्ने, निन्दा गर्ने वा मनोवैज्ञानिक तनाव दिने'), o('छ', 'अन्य', { specify: true }),
    ] }],
  },
  {
    id: 'q35', no: '३५', page: 9, section: 'S4', sensitive: true,
    title: 'तपाईंको परिवारको बालबालिकाहरुमा यौनशोषणको कुनै घटना घटेको छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: YES_NO_KHA }],
  },

  // ===== Page 10 =====
  {
    id: 'q36', no: '३६', page: 10, section: 'S4', sensitive: true,
    title: 'एक वर्षभित्र तपाईंको परिवारमा महिला तथा बालबालिका उपर हिंसा तथा सामाजिक कुरिती सम्बन्धी निम्न कुनै घटना घटेका छन/छैनन् ?',
    fields: [{ key: 'ans', type: 'multi', required: true, options: [
      o('क', 'दाईजोसम्बन्धी'), o('ख', 'वहुविवाह'), o('ग', 'घरायसी हिंसा'), o('घ', 'बालविवाह'),
      o('ङ', 'बलात्कार'), o('च', 'महिला/बालबालिका बेचविखन'), o('छ', 'छाउपडी'), o('ज', 'वहुपतिप्रथा'),
      o('झ', 'देउकी'), o('ञ', 'कुनै पनि घटना नघटेको', { exclusive: true }),
    ] }],
  },
  {
    id: 'q37', no: '३७', page: 10, section: 'S4', sensitive: true,
    title: 'तपाईंको परिवारका कुनै बालबालिका बालगृह वा कुनै संस्थामा बसेका छन् ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_KHA_PLURAL },
      {
        key: 'rows', label: 'यदि छन् भने', type: 'repeat', rowLabel: 'बालबालिका', showIf: { field: 'has', eq: 'क' }, maxRows: 20,
        columns: [
          num('age', 'उमेर', { max: 18 }), sel('sex', 'लिंग', SEX_SELECT),
          sel('institution', 'वसेको संस्था', [o('बाल गृह', 'बाल गृह'), o('होस्टल', 'होस्टल'), o('बोर्डिङ्ग स्कूल', 'बोर्डिङ्ग स्कूल')]),
          txt('place', 'ठाउको नाम'), num('years', 'यहा वसेको कति वर्ष भयो'),
          txt('reason', 'यहा राख्नाको कारण के हो'), num('visits', 'तपाई आफ्नो वच्चालाई वर्षको कति पटक भेट्न पाउनुहुन्छ'),
        ],
      },
    ],
  },
  {
    id: 'q38', no: '३८', page: 10, section: 'S4', sensitive: true,
    title: 'तपाईंको परिवारका कुनै बालबालिका सडक बालबालिकाको रुपमा रहेका छन् ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_KHA_PLURAL },
      {
        key: 'rows', label: 'यदि छन् भने', type: 'repeat', rowLabel: 'बालबालिका', showIf: { field: 'has', eq: 'क' }, maxRows: 20,
        columns: [
          num('age', 'उमेर', { max: 18 }), sel('sex', 'लिंग', SEX_SELECT), txt('place', 'वसेको ठाउको नाम'),
          num('years', 'घर छोडेर गएको कति वर्ष भयो'), txt('reason', 'घर छोड्नाको कारण के हो'),
          num('visits', 'तपाई आफ्नो वच्चालाई वर्षको कति पटक भेट्न पाउनुहुन्छ'),
        ],
      },
    ],
  },
  {
    id: 'q39', no: '३९', page: 10, section: 'S4', title: 'तपाईंलाई बाल अधिकारको बारेमा जानकारी छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [o('क', 'छ'), o('ख', 'छैन'), o('ग', 'केही कुरा सुनेको छु')] }],
  },

  // ===== Page 11 =====
  {
    id: 'q40', no: '४०', page: 11, section: 'S4', sensitive: true,
    title: 'तपाईंको परिवारका कुनै बालबालिकामा लागू पदार्थ दुर्व्यसनको लत रहे नरहेको स्थिति के छ ?',
    fields: [{
      key: 'table', type: 'grid', rows: CHILD_ROWS,
      cols: [
        num('smoking', 'धुम्रपान गर्ने संख्या', { maxOf: 'total' }),
        num('drugs', 'नसालु पदार्थ सेवन गर्ने संख्या', { maxOf: 'total' }),
        num('none', 'कुनै पनि लत नरहेको संख्या', { maxOf: 'total' }),
        num('total', 'जम्मा संख्या'),
      ],
    }],
  },
  {
    id: 'q41', no: '४१', page: 11, section: 'S4', title: 'तपाईंले बालबालिकालाई वर्षमा कति जोर लुगा दिनुहुन्छ ? (सरदर)',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', '१ जोर'), o('ख', '२ जोर'), o('ग', '३ जोर'), o('घ', '४ जोर वा सोभन्दा बढी'),
    ] }],
  },
  {
    id: 'q42', no: '४२', page: 11, section: 'S4', title: 'बालबालिका बस्ने, पढ्ने कोठा अलग्गै छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: YES_NO_KHA }],
  },
  {
    id: 'q43', no: '४३', page: 11, section: 'S4', title: 'मानिस बस्ने घर (मूल घर) र गाईवस्तुहरु बाँध्ने गोठ अलग्गै छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'छ'), o('ख', 'छैन'), o('ग', 'गोठ अलग्गै भए पनि गोठमाथि पनि सुत्ने गरेको छ'),
    ] }],
  },
  {
    id: 'q44', no: '४४', page: 11, section: 'S5',
    title: 'तपाईको परिवारमा बाल विकास केन्द्र वा पूर्व प्रा.वि. तहमा जाने ३ देखि ४ वर्षसम्मका बालबालिका संख्या कति छ',
    fields: [{
      key: 'table', type: 'grid', rows: [{ key: 'count', label: 'संख्या' }],
      cols: [num('boy', 'बालक'), num('girl', 'बालिका'), num('third', 'तेस्रो लिङ्गी'),
        num('total', 'जम्मा', { sumOf: ['boy', 'girl', 'third'] })],
    }],
  },
  {
    id: 'q45', no: '४५', page: 11, section: 'S5', title: 'परिवारको शैक्षिक स्थिति',
    fields: [{
      key: 'table', type: 'grid', totalRow: true,
      rows: [
        { key: '6_18', label: '६ – १८ वर्ष' }, { key: '19_45', label: '१९ – ४५ वर्ष' },
        { key: '46_60', label: '४६ – ६० वर्ष' }, { key: 'gt60', label: '६० वर्षभन्दा माथि' },
      ],
      cols: [
        ...ADULT_COLS_FMT('illiterate_', 'लेखपढ गर्न नसक्ने/ निरक्षर'),
        ...ADULT_COLS_FMT('literate_', 'लेखपढ गर्न सक्ने /साक्षर'),
        ...ADULT_COLS_FMT('see_', 'एस. ई.ई. वा सो सरह पास गरेका संख्या'),
        ...ADULT_COLS_FMT('plus2_', 'माध्यमिक वा १०+२ वा सो सरह उत्तीर्ण गरेको'),
        ...ADULT_COLS_FMT('bachelor_', 'स्नातक (बि. ए. वा सो सरह) तह पास गरेका'),
        ...ADULT_COLS_FMT('master_', 'स्नातकोत्तर (एम. ए. वा सो सरह) तह पास गरेका'),
        ...ADULT_COLS_FMT('phd_', 'विद्यावारिध (पि. एच. डी.) हासिल गरेका'),
      ],
    }],
  },

  // ===== Page 12 =====
  {
    id: 'q46', no: '४६', page: 12, section: 'S5', title: 'विद्यालयस्तरमा अध्ययन गरिरहेका बालबालिकाको विवरण',
    note: 'PDF मा अन्तिम शीर्षक "गाउँपालिका वा नगरपालिका वाहिरका विद्यालयमा अध्ययनरत संख्या" ले दुई समूह (६ स्तम्भ) ढाकेको छ; दुवै समूह यथावत राखिएको छ।',
    fields: [{
      key: 'table', type: 'grid', totalRow: true,
      rows: [
        { key: 'upto5', label: 'कक्षा पाँचसम्म' }, { key: 'basic8', label: 'आधारभुत तह (कक्षा ८)' },
        { key: 'upto10', label: 'कक्षा दशसम्म' }, { key: 'sec12', label: 'माध्यामिक तह (कक्षा १२)' },
      ],
      cols: [
        ...bgTotal('ecd', 'प्रारम्भिक बालविकास केन्द्रमा जाने बालबालिकाको संख्या'),
        ...bgTotal('in', 'गाउँपालिका वा नगरपालिका अन्तर्गतका विद्यालयमा अध्ययनरत संख्या'),
        ...bgTotal('out1', 'गाउँपालिका वा नगरपालिका वाहिरका विद्यालयमा अध्ययनरत संख्या (१)'),
        ...bgTotal('out2', 'गाउँपालिका वा नगरपालिका वाहिरका विद्यालयमा अध्ययनरत संख्या (२)'),
      ],
    }],
  },
  {
    id: 'q47', no: '४७', page: 12, section: 'S5', title: 'घरबाट विद्यालय जान लाग्ने समय (उपयुक्त महलमा ✓ चिन्ह लगाउनु होला)',
    fields: [{
      key: 'table', type: 'grid', rowChoice: true,
      rows: [
        { key: 'upto5', label: 'कक्षा पाँचसम्म' }, { key: 'basic8', label: 'आधारभुत तह (कक्षा ८)' },
        { key: 'upto10', label: 'कक्षा दशसम्म' }, { key: 'sec12', label: 'माध्यामिक तह (कक्षा १२)' },
      ],
      cols: [chk('lt15', '१५ मिनेट भन्दा कम'), chk('15_30', '१५–३० मि.सम्म'), chk('30_60', '३० मि.– १ घण्टा'), chk('gt60', '१ घण्टाभन्दा बढी')],
    }],
  },

  // ===== Page 13 =====
  {
    id: 'q48', no: '४८', page: 13, section: 'S5', title: 'तपाईको बालवालिका पढ्ने विद्यालयमा बालमैत्री शौचालय छ ?',
    fields: [{ key: 'ans', type: 'single', options: [o('क', 'भएको संख्या वा छ'), o('ख', 'नभएको संख्या वा छैन')] }],
  },
  {
    id: 'q49', no: '४९', page: 13, section: 'S5',
    title: 'तपाईंको परिवारका बालबालिका पढ्ने विद्यालयमा अपाङ्गता भएका विद्यार्थीका लागि विशेष शिक्षाको सुविधा छ ?',
    fields: [{ key: 'ans', type: 'single', options: [o('क', 'छ'), o('ख', 'छैन'), o('ग', 'थाहा छैन')] }],
  },
  {
    id: 'q50', no: '५०', page: 13, section: 'S5', title: 'विद्यालय भर्ना नभएका बालबालिकाको संख्या',
    fields: [{
      key: 'table', type: 'grid', totalRow: true,
      rows: [{ key: 'normal', label: 'सामान्य क्षमता' }, { key: 'disabled', label: 'अपांगता भएका' }],
      cols: [
        ...bgTotal('p5', 'कक्षा ५ सम्म (५–९ वर्ष)'),
        ...bgTotal('basic', 'आधारभूत तह (कक्षा ८) उमेर समूह (१०–१४ वर्ष)'),
        ...bgTotal('sec', 'माध्यमिक उमेर समूह (१५–१८ वर्ष)'),
      ],
    }],
  },
  {
    id: 'q51', no: '५१', page: 13, section: 'S5', title: 'बीचैमा विद्यालय जान छोडेका ६ – १५ वर्ष उमेर समूहका बालबालिकाहरुका संख्या र कारण',
    fields: [{
      key: 'table', type: 'grid', rows: [{ key: 'dropout', label: 'संख्या' }],
      cols: [num('boy', 'बालक'), num('girl', 'बालिका'), num('total', 'जम्मा', { sumOf: ['boy', 'girl'] }), txt('reason', 'विद्यालय जान छोड्नुको कारण')],
    }],
  },
  {
    id: 'q52', no: '५२', page: 13, section: 'S5',
    title: 'अनौपचारिक शिक्षामा बाल (विद्यालय शिक्षाबाट वंचित (१० देखि १४ वर्ष सम्मका)) सहभागिता',
    fields: [{
      key: 'table', type: 'grid', totalRow: true,
      rows: [{ key: 'boy', label: 'बालक' }, { key: 'girl', label: 'बालिका' }],
      cols: [num('count', 'अनौपचारिक शिक्षा लिइरहेका संख्या')],
    }],
  },

  // ===== Page 14 =====
  {
    id: 'q53', no: '५३', page: 14, section: 'S6',
    title: 'परिवारमा बालबालिकासँग सम्बन्धित कुनै विषयमा निर्णय गर्दा उनीहरुलाई पनि सहभागी गराउने गर्नु भएको छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [o('क', 'गराउने गरेको छ'), o('ख', 'गराउने गरेको छैन')] }],
  },
  {
    id: 'q54', no: '५४', page: 14, section: 'S6',
    title: 'तपाईंको परिवारका बालबालिकाहरु बाल क्लव/संगठन आदिमा आबद्धता रहेका छन् ?',
    note: '(सकेसम्म सम्बन्धित बालबालिकाहरुसँग पनि सोध्ने)',
    fields: [{
      key: 'table', type: 'grid', rows: [{ key: 'boy', label: 'बालक' }, { key: 'girl', label: 'बालिका' }],
      cols: [num('school', 'स्कुलमा आधारित'), num('community', 'समुदायमा आधारित'), num('labour', 'श्रमिक बाल क्लव'), num('none', 'आबद्ध नभएको')],
    }],
  },
  {
    id: 'q55', no: '५५', page: 14, section: 'S6',
    title: 'तपाईका घरका १८ वर्षभन्दा कम उमेरका कतिजना बालबालिका देहायको निकायमा प्रतिनिधि वा सदस्य रहेका छन् ?',
    fields: [{
      key: 'table', type: 'grid', totalRow: true, rows: [{ key: 'boy', label: 'बालक' }, { key: 'girl', label: 'बालिका' }],
      cols: [
        num('local_plan', 'स्थानीय तह/ योजना तर्जुमा वा कार्यान्वयन समिति'),
        num('ward_forum', 'वडा नागरिक मञ्च'),
        num('smc', 'विद्यालय/ स्वास्थ्य संस्था व्यवस्थापन समिति'),
        num('cpc', 'बाल संरक्षण समिति'),
        num('child_group', 'बाल समूह वा बाल क्लव, बालमैत्री स्थानीय शासन समिति वा बाल संजाल'),
      ],
    }],
  },
  {
    id: 'q56', no: '५६', page: 14, section: 'S6', title: 'तपाईको परिवारका कुनै सदस्य स्थानीय कुनै संघसंस्था वा समूहमा आवद्ध हुनुहुन्छ ?',
    fields: [{ key: 'ans', type: 'multi', required: true, options: [
      o('क', 'सामुदायिक संस्था'), o('ख', 'कृषक समूह'), o('ग', 'सामुदायिक वन उपभोक्ता समूह'), o('घ', 'सहकारी संस्था'),
      o('ङ', 'नागरिक सचेतना केन्द्र'), o('च', 'परम्परागत समूह'), o('छ', 'अन्य (नागरिक मञ्च, विभिन्न समिति...)', { specify: true }),
      o('ज', 'प्यारालिगल कमिटि'), o('झ', 'कुनैमा पनि नरहेको', { exclusive: true }),
    ] }],
  },

  // ===== Page 15 =====
  {
    id: 'q57', no: '५७', page: 15, section: 'S6', title: 'तपाई कहिल्यै प्यारालिगल कमिटिमा जानु भएको छ ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: [o('१', 'छ'), o('२', 'छैन')], impliedOptions: true },
      { key: 'why', label: 'यदि छ भने किन?', type: 'multi', required: true, showIf: { field: 'has', eq: '१' }, options: [
        o('क', 'कमिटिले संचालन गर्ने जनचेतनामुलक कार्यक्रममा भाग लिन'),
        o('ख', 'बाल विवाह, बालवालिकामाथि भएका दुर्व्यवहार, बाल हिंसा, बालश्रम जस्ता विषयमा उजुर गर्न'),
        o('ग', 'महिलामाथि हुने हिंसा र दुर्व्यवहार सम्वन्धी विषयमा उजुर गर्न'),
      ] },
      { key: 'satisfied', label: 'यदि तपाईले कुनै उजुर गर्नु भएको भए प्यारालिगल कमिटिको काम कारवाहिप्रति तपाई सन्तुष्ट हुनहुन्छ?',
        type: 'single', required: true, options: [o('१', 'छु'), o('२', 'छैन')], showIf: { field: 'why', includesAny: ['ख', 'ग'] } },
    ],
  },
  {
    id: 'q58', no: '५८', page: 15, section: 'S6',
    title: 'परिवारका सदस्यहरुको जनचेतनामूलक तालीम (स्वास्थ्य, सुरक्षित मातृत्व, परिवार नियोजन, सशक्तीकरण, लैंगिक समविकास, बाल विकास, संस्थागत नेतृत्व, खानेपानी तथा सरसफाई, उपभोक्ता समिति, बाल अधिकार, बाल संरक्षण, आदि) प्राप्त गरेको विवरण',
    fields: [{
      key: 'rows', type: 'repeat', rowLabel: 'तालिम', initialRows: 0, maxRows: 30,
      columns: [
        txt('name', 'तालिमको नाम'),
        ...fmTotal('d3', '३ दिनसम्मको तालिम प्राप्त संख्या'),
        ...fmTotal('d3_7', '३ देखि ७ दिनसम्मको तालिम प्राप्त संख्या'),
        ...fmTotal('w1_4', '१ देखि ४ हप्तासम्मको तालिम प्राप्त संख्या'),
        ...fmTotal('gt4w', '४ हप्ताभन्दा बढी अवधिको तालिम प्राप्त संख्या'),
      ],
      totalRow: true,
    }],
  },
  {
    id: 'q59', no: '५९', page: 15, section: 'S6',
    title: 'परिवारका सदस्यहरुको व्यवसायिक (जे.टि.ए. कृषि वा पशु, विद्युत जडान, कम्प्युटर, मेकानिक्स, सिलाई वुनाई, आदि) तालिम प्राप्त गरेको विवरण',
    fields: [{
      key: 'rows', type: 'repeat', rowLabel: 'तालिम', initialRows: 0, maxRows: 30, totalRow: true,
      columns: [
        txt('name', 'तालिमको नाम'),
        ...fmTotal('lt1m', '१ महिनाभन्दा कम अवधिको तालिम प्राप्त वा प्रारम्भिक तहको प्राविधिक'),
        ...fmTotal('m1_6', '१ देखि ६ महिनासम्म अवधिको तालिम प्राप्त वा पहिलो तहको प्राविधिक'),
        ...fmTotal('m6_12', '६ देखि १२ महिनासम्मको तालिम प्राप्त वा दोस्रो तहको प्राविधिक'),
        ...fmTotal('gt12m', '१२ महिनाभन्दा वढी अवधिको तालिम प्राप्त वा तेस्रो तह भन्दा माथिको प्राविधिक'),
      ],
    }],
  },

  // ===== Page 16 =====
  {
    id: 'q60', no: '६०', page: 16, section: 'S7', title: 'परिवारको मुख्य पेशा : (एकमा मात्र चिन्ह लगाउने)',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'कृषि/पशुपालन/फलफूल खेती'), o('ख', 'व्यापार व्यवसाय'), o('ग', 'सेवा/नोकरी'),
      o('घ', 'ज्याला/मजदुरी'), o('ङ', 'विप्रेषण (विदेशबाट पठाएको रकम)'), o('च', 'अन्य', { specify: true }),
    ] }],
  },
  {
    id: 'q61', no: '६१', page: 16, section: 'S7', title: 'आजभन्दा पाँच वर्ष पहिले तपाईंको परिवारको बसोवास कहाँ थियो ?',
    fields: [
      { key: 'where', type: 'single', required: true, options: [o('क', 'अन्यत्र स्थानमा'), o('ख', 'यसै स्थानमा')] },
      { key: 'why', label: 'अन्यत्र स्थानबाट आएको भए यहाँ किन आउनु भएको ?', type: 'single', required: true,
        showIf: { field: 'where', eq: 'क' }, options: [
          o('क', 'सहरी सुविधाको लागि'), o('ख', 'द्वन्दका कारण'), o('ग', 'खेतीपाती गर्न'), o('घ', 'व्यापार व्यवसाय गर्न'),
          o('ङ', 'बैवाहिक सम्बन्ध भएर'), o('च', 'रोजगारीका लागि'), o('छ', 'प्राकृतिक विपत्तिबाट'), o('ज', 'अन्य', { specify: true }),
        ] },
    ],
  },
  {
    id: 'q62', no: '६२', page: 16, section: 'S7', title: 'घरको अवस्था : (एकभन्दा बढी घर भएमा मूल घरको विवरणका आधारमा चिन्ह लगाउने)',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'खर वा फुसको छानो भएको'), o('ख', 'टायल, झिँगटी वा स्लेटको छानो भएको'),
      o('ग', 'जस्ता पाताको छानो भएको'), o('घ', 'घर ढलान भएको'),
    ] }],
  },
  {
    id: 'q63', no: '६३', page: 16, section: 'S7', title: 'तपाईको घरमा वत्तीको मुख्य स्रोत के हो ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'मट्टीतेल'), o('ख', 'जेनेरेटर'), o('ग', 'गोवरग्याँस'), o('घ', 'सोलार'),
      o('ङ', 'पानी घट्ट तथा लघु जलविद्युत'), o('च', 'राष्ट्रिय प्रसारणको विजुली'), o('छ', 'अन्य', { specify: true }),
    ] }],
  },
  {
    id: 'q64', no: '६४', page: 16, section: 'S7', title: 'तपाईंको घरमा खाना पकाउन प्रयोग हुने प्रमुख इन्धन कुन हो ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'दाउरा'), o('ख', 'गुइठा'), o('ग', 'गोवरग्याँस'), o('घ', 'मट्टीतेल'),
      o('ङ', 'एल.पि. ग्याँस'), o('च', 'विद्युत'), o('छ', 'अन्य', { specify: true }),
    ] }],
  },

  // ===== Page 17 =====
  {
    id: 'q65', no: '६५', page: 17, section: 'S7', title: 'तपाईंको घरमा कस्तो प्रकारको चुल्हो प्रयोग गर्नुहुन्छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', 'अँगेनो वा माटोको चुल्हो'), o('ख', 'धुँवारहित चुल्हो'), o('ग', 'भुसे चुल्हो'), o('घ', 'मट्टितेल स्टोभ'),
      o('ङ', 'ग्याँस चुल्हो'), o('घ', 'विद्युत चुल्हो (हिटर)', { value: 'घ२' }), o('च', 'अन्य', { specify: true }),
    ] }],
  },
  {
    id: 'q66', no: '६६', page: 17, section: 'S7', title: 'तपार्इंको घरमा संचारका साधनहरु के के रहेका छन् ? (वहु उत्तर)',
    fields: [{ key: 'ans', type: 'multi', options: [
      o('क', 'रेडियो'), o('ख', 'टि.भि.'), o('ग', 'टेलिफोन'), o('घ', 'मोबाइल'), o('ङ', 'इमेल/इन्टरनेट'),
      o('च', 'नियमित आउने पत्रपत्रिका'), o('च', 'अन्य', { value: 'च२', specify: true }),
    ] }],
  },
  {
    id: 'q67', no: '६७', page: 17, section: 'S7', title: 'तपाईंको परिवारका सदस्यहरु कुन कुन पेशा (रोजगारी) मा संलग्न हुनुहुन्छ ?',
    fields: [{
      key: 'table', type: 'grid', totalRow: true,
      rows: [['16_18', '१६–१८'], ['19_24', '१९–२४'], ['25_40', '२५–४०'], ['41_60', '४१–६०'], ['gt60', '६० भन्दामाथि']].map(([key, label]) => ({ key, label })),
      cols: [
        ...fmTotal('agri', 'कृषि (खेती तथा पशुपालन)'), ...fmTotal('trade', 'व्यापार'),
        ...fmTotal('service', 'जागिर (सेवा)'), ...fmTotal('wage', 'ज्याला मजदुरी'), ...fmTotal('industry', 'उद्योग'),
      ],
    }],
  },
  {
    id: 'q68', no: '६८', page: 17, section: 'S7',
    title: 'तपाईंको परिवारका कुनै सदस्य रोजगारीका लागि घरबाट विदेश गएका छन् भने तलको विवरण दिनुहोस् :',
    fields: [
      {
        key: 'table', type: 'grid', rows: [{ key: 'abroad', label: 'विवरण' }],
        cols: [
          ...fmTotal('n', 'विदेश गएकाको संख्या'),
          num('india', 'भारत', { group: 'गएको मुलुकको नाम' }),
          num('other', 'अन्य (खुलाउने)', { group: 'गएको मुलुकको नाम' }),
          num('lt5', '५ भन्दा कम', { group: 'गएको अवधि (वर्षमा)' }),
          num('gt5', '५ भन्दा बढी', { group: 'गएको अवधि (वर्षमा)' }),
        ],
        rowRules: [
          { sum: ['india', 'other'], equals: 'n_t', message: 'भारत + अन्य मुलुक = विदेश गएकाको जम्मा संख्या हुनुपर्छ', warn: true },
          { sum: ['lt5', 'gt5'], equals: 'n_t', message: '५ भन्दा कम + ५ भन्दा बढी = विदेश गएकाको जम्मा संख्या हुनुपर्छ', warn: true },
        ],
      },
      txt('other_countries', 'अन्य मुलुक (खुलाउने)'),
    ],
  },
  {
    id: 'q69', no: '६९', page: 17, section: 'S7',
    title: 'तपाईको परिवारमा १८ वर्षभन्दा कम उमेरका शारीरिक तथा मानसिक हिसाबले अपांगता भएका सदस्यहरु भएमा तलको विवरण दिनुहोस् ।',
    fields: [{
      key: 'table', type: 'grid', totalRow: true,
      rows: [
        ['physical', 'शारीरिक अपाङ्गता'], ['visual', 'दृष्टिविहिन र न्यून दृष्टिविहिन'], ['speech', 'स्वर बोलाईसम्बन्धी अपांगता'],
        ['hearing', 'सुस्त श्रवण तथा बहिरा'], ['intellectual', 'मानसिक/बौद्धिक अपाङ्गता'], ['deafblind', 'श्रवण र दृष्टिविहिन (दुवै)'],
        ['multiple', 'बहु अपांगता'],
      ].map(([key, label]) => ({ key, label })),
      cols: [num('girl', 'बालिका'), num('boy', 'बालक'), num('total', 'जम्मा', { sumOf: ['girl', 'boy'] })],
    }],
  },

  // ===== Page 18 =====
  {
    id: 'q70', no: '७०', page: 18, section: 'S7', title: 'तपाईंको परिवारको वार्षिक आम्दानी र खर्चको विवरण दिनुहोस् ।',
    fields: [
      {
        key: 'income', label: 'आम्दानीको स्रोत', type: 'grid', totalRow: true,
        rows: [
          ['agri', '१ कृषि तथा पशुपालन'], ['trade', '२ व्यापार तथा उद्योग'], ['job', '३ नोकरी तथा पेन्सन'],
          ['remit', '४ वैदेशिक रोजगार'], ['wage', '५ ज्याला मजदुरी'], ['rent', '६ घरभाडा'], ['other', '७ अन्य'],
        ].map(([key, label]) => ({ key, label, specify: key === 'other' })),
        cols: [num('amount', 'रकम रु.', { max: 1e10 })],
      },
      {
        key: 'expense', label: 'खर्च विवरण', type: 'grid', totalRow: true,
        rows: [
          ['food', '१ खाना खर्च'], ['clothes', '२ लत्ता कपडा'], ['education', '३ शिक्षा'], ['health', '४ स्वास्थ्य उपचार खर्च'],
          ['festival', '५ चाडपर्व, विवाह खर्च तथा मनोरञ्जन'], ['utility', '६ महसूल भुक्तानी खर्च (विद्युत, सञ्चार, खानेपानी, आदि)'],
          ['other', '७ अन्य'],
        ].map(([key, label]) => ({ key, label, specify: key === 'other' })),
        cols: [num('amount', 'रकम रु.', { max: 1e10 })],
      },
    ],
  },
  {
    id: 'q71', no: '७१', page: 18, section: 'S7', title: 'तपाईंको परिवारलाई आफ्नो उत्पादन/आम्दानीले वर्षमा कति महिना खान पुग्छ ?',
    fields: [{ key: 'ans', type: 'single', required: true, options: [
      o('क', '३ महिनाभन्दा कम खान पुग्ने'), o('ख', '३ – ६ महिना खान पुग्ने'), o('ग', '६ – ९ महिना खान पुग्ने'),
      o('घ', '९ – १२ महिना खान पुग्ने'), o('ङ', 'वचत हुने'),
    ] }],
  },

  // ===== Page 19 =====
  {
    id: 'q72', no: '७२', page: 19, section: 'S7', title: 'तपाईको परिवारमा कसैले ऋण लिएको छ ?',
    fields: [
      { key: 'has', type: 'single', required: true, options: YES_NO_12 },
      { key: 'source', label: 'यदि छ भने ऋण कहाँबाट लिनुभयो ?', type: 'multi', required: true, showIf: { field: 'has', eq: '१' }, options: [
        o('क', 'बैंक वा वित्तीय संस्था'), o('ख', 'सहकारी संस्था'), o('ग', 'समूह वा सामुदायिक संस्था'),
        o('घ', 'साहु महाजन'), o('ङ', 'अन्य', { specify: true }),
      ] },
    ],
  },
  {
    id: 'q73', no: '७३', page: 19, section: 'S7', title: 'ऋण लिएको भए कुन उद्देश्यका लागि लिनु भएको हो ?',
    showIf: { q: 'q72', field: 'has', eq: '१' },
    fields: [{ key: 'ans', type: 'multi', required: true, options: [
      o('क', 'घरायसी कार्य वा घर खर्च'), o('ख', 'कृषि तथा पशुपालन व्यवसाय गर्न'), o('ग', 'उद्योग व्यापार'),
      o('घ', 'बैदेशिक रोजगारी'), o('ङ', 'सामाजिक तथा धार्मिक कार्य गर्न'), o('च', 'शिक्षा'), o('छ', 'औषधि उपचार'),
      o('ज', 'विवाह, व्रतवन्ध वा यस्तै व्यावहारिक खर्च'), o('झ', 'गोवर ग्याँस, सोलार, विजुली आदि राख्न'),
      o('झ', 'अन्य', { value: 'झ२', specify: true }),
    ] }],
  },
  {
    id: 'q74', no: '७४', page: 19, section: 'S7', title: 'तपाईंको परिवारमा निम्न कार्यहरु प्रायः कसले गर्दछ ?',
    fields: [{
      key: 'table', type: 'grid',
      rows: [
        ['decision', 'घर व्यवहारसम्बन्धी विषयमा निर्णय'], ['housework', 'घरायसी काममा संलग्न'], ['bank', 'बैंकमा खाता संचालन'],
        ['user_committee', 'उपभोक्ता समितिमा सहभागिता'], ['smc', 'विद्यालय व्यवस्थापन समितिको पदाधिकारीका रुपमा सहभागिता'],
        ['business', 'उद्योग व्यापारमा सहभागिता'],
      ].map(([key, label]) => ({ key, label })),
      cols: [chk('female', 'महिला'), chk('male', 'पुरुष')],
    }],
  },
  {
    id: 'q75', no: '७५', page: 19, section: 'S8', title: 'तपाईको वार्षिक रुपमा अन्नवाली, तरकारी वाली, फलफूल आदि उत्पादनको अवस्था के कस्तो छ ?',
    fields: [
      txt('fiscal_year', 'आर्थिक वर्ष (२०६....)', { placeholder: 'जस्तै: २०८२/८३' }),
      {
        key: 'crops', type: 'groupedRepeat', label: 'वाली/उत्पादन समूह',
        groups: [
          ['cereal', 'अन्न वाली (धान, गहुँ .....)', 4], ['pulse', 'दलहन वाली (मास, मसुरो ....)', 3],
          ['oilseed', 'तेलहन वाली (तोरी, सूर्यमुखी ....)', 3], ['vegetable', 'तरकारी (आलु, प्याज, काउली, ......)', 4],
          ['cash', 'नगदे वाली (उखु, सूर्ती, जुट, अलैची, ...)', 3], ['fruit', 'फलफूल खेती (केरा,स्याउ,आँप,सुन्तला ...)', 2],
          ['fodder', 'घासे वाली', 1, true], ['tree_fodder', 'डाले घाँस', 1, true], ['grass', 'भुईँ घास', 1, true],
          ['silk', 'रेशम खेती', 1, true], ['herb', 'जडिवुटी खेती', 1, true], ['other', 'अन्य', 1],
        ].map(([key, label, initialRows, fixed]) => ({ key, label, initialRows, fixed: !!fixed })),
        columns: [
          txt('crop', 'वाली'),
          num('area_ha', 'क्षेत्रफल (हेक्टर)', { decimal: true, max: 10000 }),
          num('production', 'उत्पादन (क्विन्टल) वा रु.', { decimal: true }),
        ],
      },
    ],
  },

  // ===== Page 21 =====
  {
    id: 'q76', no: '७६', page: 21, section: 'S8', title: 'परिवारको पशु धन तथा सोबाट हुने उत्पादन :',
    fields: [
      {
        key: 'livestock', label: '१ पशुधन', type: 'grid', totalRow: true,
        rows: [
          ['cattle', 'गाई गोरु'], ['yak', 'चौंरी याक'], ['buffalo', 'भैंसी राँगा'], ['horse', 'घोडा खच्चर'],
          ['goat', 'वाख्रा'], ['sheep', 'भेडा च्यांग्रा'], ['pig', 'सुँगुर वंगुर'], ['other1', 'अन्य'], ['other2', 'अन्य'],
        ].map(([key, label]) => ({ key, label, specify: key.startsWith('other') })),
        cols: [
          num('local', 'स्थानीय', { group: 'संख्या' }), num('improved', 'उन्नत', { group: 'संख्या' }),
          num('total', 'जम्मा', { group: 'संख्या', sumOf: ['local', 'improved'] }),
          num('milk_l', 'दूध लि.', { group: 'उत्पादन', decimal: true }),
          num('meat_kg', 'मासु केजी', { group: 'उत्पादन', decimal: true }),
          num('wool_kg', 'उन केजी', { group: 'उत्पादन', decimal: true }),
        ],
      },
      {
        key: 'poultry', label: '२ पंक्षी', type: 'grid', totalRow: true,
        rows: [['chicken', 'कुखुरा'], ['duck', 'हाँस'], ['other', 'अन्य']].map(([key, label]) => ({ key, label, specify: key === 'other' })),
        cols: [
          num('local', 'स्थानीय', { group: 'संख्या' }), num('improved', 'उन्नत', { group: 'संख्या' }),
          num('total', 'जम्मा', { group: 'संख्या', sumOf: ['local', 'improved'] }),
          num('eggs', 'अण्डा सख्या', { group: 'उत्पादन' }), num('meat_kg', 'मासु केजी', { group: 'उत्पादन', decimal: true }),
        ],
      },
      {
        key: 'fish_bee', label: '३ माछा / मौरी', type: 'grid',
        rows: [{ key: 'fish', label: 'माछा (केजी)' }, { key: 'bee', label: 'मौरी घार' }],
        cols: [num('hives', 'घार संख्या (मौरी)'), num('kg', 'उत्पादन केजी (माछा / मह)', { decimal: true })],
      },
      {
        key: 'other', label: '४ अन्य', type: 'grid',
        rows: [{ key: 'other1', label: 'अन्य', specify: true }, { key: 'other2', label: 'अन्य', specify: true }],
        cols: [num('count', 'संख्या'), txt('production', 'उत्पादन')],
      },
    ],
  },

  // ===== Page 22 =====
  {
    id: 'q77', no: '७७', page: 22, section: 'S9', title: 'विगत ३ वर्ष भित्रमा तपाईंको परिवारमा कति मानिसहरु प्रकोपवाट प्रभावित भएका छन् ?',
    fields: [
      {
        key: 'affected', label: 'क) प्रभावित संख्या — गत ३ ......... वर्षभित्र प्रकोपबाट पिडित परिवार संख्या', type: 'grid',
        rows: [{ key: 'row', label: 'संख्या' }],
        cols: [
          txt('settlement_code', 'वस्ती क्रम संख्या (कोड)'),
          num('flood', 'बाढी'), num('landslide', 'पहिरो'), num('hail', 'असिना'), num('windstorm', 'हुरीबतास'),
          num('fire', 'आगलागी'), num('earthquake', 'भूकम्प'), num('drought', 'खडेरी'), num('heavy_rain', 'अतिबृष्टी'),
          num('epidemic', 'महामारी'), num('pests', 'सलह किरा आदी'), num('other', 'अन्य प्रकोप'),
          num('total', 'जम्मा', { sumOf: ['flood', 'landslide', 'hail', 'windstorm', 'fire', 'earthquake', 'drought', 'heavy_rain', 'epidemic', 'pests', 'other'] }),
        ],
      },
      num('loss_estimate', '(ख) प्रकोपबाट नोक्सानी (अन्दाजी रु.)'),
      { key: 'school_risk', label: '(ग) तपाईको बालबालिका पढ्ने विद्यालय कुन प्रकोपको जोखिममा रहेको छ', type: 'multi', options: [
        o('क', 'बाढी'), o('ख', 'पहिरो'), o('ग', 'भूकम्प'), o('घ', 'आगलागी'), o('ड', 'अन्य', { specify: true }),
      ] },
      { key: 'route_risk', label: '(घ) विद्यालय जाँदा आउँदा बालबालिकालाई के को जोखिम रहेको छ', type: 'multi', options: [
        o('क', 'बाढी'), o('ख', 'पहिरो'), o('ग', 'वन्यजन्तु'), o('घ', 'भीरबाट लडने'), o('ड', 'अन्य', { specify: true }),
      ] },
    ],
  },
  {
    id: 'verify', no: '', page: 22, section: 'S9', title: 'यति धेरै सूचना दिनु भएकोमा धन्यवाद ।',
    fields: [
      txt('informant_name', 'सूचनादाताको नाम', { required: true }),
      { key: 'informant_sign', label: 'सूचनादाताको सही', type: 'signature', required: true },
      txt('enumerator_name', 'सूचना संकलकको नाम', { required: true }),
      { key: 'enumerator_sign', label: 'सूचना संकलकको सही', type: 'signature', required: true },
      txt('verifier_name', 'प्रमाणित गर्नेको नाम', { reviewOnly: true }),
      { key: 'verifier_sign', label: 'प्रमाणित गर्नेको सही', type: 'signature', reviewOnly: true },
      { key: 'date_bs', label: 'सूचना लिएको मिति (वि.सं. YYYY-MM-DD)', type: 'date', calendar: 'BS', required: true },
    ],
  },
];

/** Number of main numbered questions (१–७७). */
export const MAIN_QUESTION_COUNT = questions.filter((q) => q.no).length;

export const questionnaire = { id: FORM_ID, version: FORM_VERSION, sections, questions };
export default questionnaire;
