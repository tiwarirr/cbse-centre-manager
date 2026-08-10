// ============================================================
// constants.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================

// ── CLASS XII SUBJECT CODES ───────────────────────────────────
export const XII_CODES = {
  '001':'English Elective','301':'English Core','002':'Hindi Elective','302':'Hindi Core',
  '003':'Urdu Elective','303':'Urdu Core','022':'Sanskrit Elective','322':'Sanskrit Core',
  '027':'History','028':'Political Science','029':'Geography','030':'Economics',
  '034':'Hindustani Music','035':'Hindustani Music Mel.','036':'Hindustani Per.',
  '037':'Psychology','039':'Sociology','041':'Mathematics','241':'Applied Mathematics',
  '042':'Physics','043':'Chemistry','044':'Biology','045':'Biotechnology',
  '046':'Engineering Graphics','048':'Physical Education','049':'Painting',
  '054':'Business Studies','055':'Accountancy','064':'Home Science',
  '065':'Informatics Practices','066':'Entrepreneurship','073':'Knowledge Traditions',
  '074':'Legal Studies','076':'NCC','083':'Computer Science',
  '105':'Bengali','118':'French','196':'Spanish',
  '801':'Retail','802':'Information Technology','803':'Web Application',
  '805':'Financial Markets Mgmt','806':'Tourism','807':'Beauty & Wellness',
  '808':'Agriculture','809':'Food Production','811':'Banking','812':'Marketing',
  '813':'Health Care','816':'Horticulture','820':'Electronic Technology',
  '821':'Multi-Media','822':'Taxation','823':'Cost Accounting',
  '825':'Shorthand (English)','826':'Shorthand (Hindi)',
  '827':'Air Conditioning','828':'Medical Diagnostics',
  '833':'Business Administration','834':'Food Nutrition',
  '835':'Mass Media Studies','837':'Fashion Studies','841':'Yoga',
  '842':'Early Childhood Care','843':'Artificial Intelligence',
};
// ── CLASS X SUBJECT CODES (Official CBSE 2025-26) ────────────
export const X_CODES = {
  // Core subjects
  '041':'Mathematics Standard','241':'Mathematics Basic',
  '184':'English Lang & Lit.','086':'Science','087':'Social Science',
  '002':'Hindi Course-A','003':'Hindi Course-B',
  '122':'Sanskrit (Communicative)','123':'Sanskrit',
  // Skill / Vocational subjects
  '049':'Painting',
  '064':'Home Science',
  '154':'Elements of Business','155':'Elements of Book Keeping & Accountancy',
  '165':'Computer Applications',
  '402':'Information Technology',
  '403':'Retail',
  '404':'Information Technology (ITeS)',
  '405':'Security',
  '406':'Automotive',
  '407':'Introduction to Financial Markets',
  '408':'Introduction to Tourism',
  '409':'Beauty & Wellness',
  '410':'Agriculture',
  '411':'Food Production',
  '412':'Front Office Operations',
  '413':'Banking & Insurance',
  '414':'Marketing & Sales',
  '415':'Health Care',
  '416':'Apparel',
  '417':'Artificial Intelligence',
  '418':'Physical Activity Trainer',
  '419':'Data Science',
  '420':'Electronics & Hardware',
  '421':'Foundation Skill for Sciences',
  '422':'Design Thinking & Innovation',
  '467':'Multi-Media',
  '468':'Multi-Skill Foundation Course',
  '838':'NCC',
};
// ── CLASS XII DATESHEET ────────────────────────────────────────
export const XII_DATESHEET = {
  '17-Feb-2026':['045','066','825','826'],
  '18-Feb-2026':['048'],
  '20-Feb-2026':['042'],
  '21-Feb-2026':['804','837'],
  '23-Feb-2026':['835'],
  '24-Feb-2026':['055'],
  '25-Feb-2026':['807','817'],
  '26-Feb-2026':['029'],
  '27-Feb-2026':['049','050','051','052'],
  '28-Feb-2026':['043'],
  '02-Mar-2026':['003','022','031','032','033','056','303','810','814','818','819'],
  '05-Mar-2026':['037'],
  '06-Mar-2026':['104','105','106','107','108','109','110','112','113','114','115','116','118','120','121','124','196'],
  '07-Mar-2026':['841','820'],
  '09-Mar-2026':['041','241'],
  '10-Mar-2026':['809','824','836','842'],
  '11-Mar-2026':['035','036','813','830'],
  '12-Mar-2026':['001','301'],
  '13-Mar-2026':['806','827'],
  '14-Mar-2026':['064'],
  '16-Mar-2026':['002','302'],
  '17-Mar-2026':['034'],
  '18-Mar-2026':['030'],
  '20-Mar-2026':['812'],
  '23-Mar-2026':['028'],
  '24-Mar-2026':['801','843'],
  '25-Mar-2026':['065','083','802'],
  '27-Mar-2026':['044'],
  '28-Mar-2026':['054','833'],
  '30-Mar-2026':['027'],
  '01-Apr-2026':['805','808','828','831'],
  '02-Apr-2026':['076','834'],
  '04-Apr-2026':['039'],
  '06-Apr-2026':['073','811'],
  '07-Apr-2026':['803'],
  '08-Apr-2026':['322','822'],
  '09-Apr-2026':['821','829'],
  '10-Apr-2026':['074'],
};
// ── CLASS X DATESHEET (Official CBSE Revised, 30-Dec-2025) ────
export const X_DATESHEET = {
  '17-Feb-2026':['041','241'],
  '18-Feb-2026':['064'],
  '20-Feb-2026':['409','414','468','418'],   // Beauty&Wellness, Marketing, Multi-Skill, Physical Activity Trainer
  '21-Feb-2026':['184'],
  '23-Feb-2026':['003','105'],               // Hindi-B, Bengali etc (regional languages)
  '24-Feb-2026':['154'],                     // Elements of Business
  '25-Feb-2026':['086'],
  '26-Feb-2026':['403','405','406','407','408','410','411','412','413','415','416','419','420','421','422','467'],
  '27-Feb-2026':['165','402','417'],         // Computer Applications, IT, AI
  '02-Mar-2026':['002'],
  '06-Mar-2026':['049'],
  '07-Mar-2026':['087'],
  '10-Mar-2026':['838'],                     // NCC
};
// Build reverse maps
export const XII_CODE_TO_DATE = {};
Object.entries(XII_DATESHEET).forEach(([d,codes]) => codes.forEach(c => XII_CODE_TO_DATE[c] = d));
export const X_CODE_TO_DATE = {};
Object.entries(X_DATESHEET).forEach(([d,codes]) => codes.forEach(c => X_CODE_TO_DATE[c] = d));
