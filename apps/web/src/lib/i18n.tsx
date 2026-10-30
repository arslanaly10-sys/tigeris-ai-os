/**
 * Interface language (D-08, revised): English and a drafted Arabic interface with full RTL layout.
 * The Arabic strings are a draft the owner approved for the demonstration (D-99); the label says so on screen.
 * Data content (evidence, case text, source titles) stays in its source language.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SectorKey } from '@tigeris/shared';

export type Lang = 'en' | 'ar';

const en = {
  'brand.tagline': 'Intelligence into Capability. Capital into Sovereign Advantage.',
  'brand.descriptor': 'Sovereign Intelligence OS',
  'nav.overview': 'Sovereign Overview',
  'nav.sectors': 'Sector Intelligence',
  'nav.ai': 'AI Command',
  'nav.scenarios': 'Foresight & Scenarios',
  'nav.mandates': 'Mandates & Authority',
  'nav.decisions': 'Decisions & Approvals',
  'nav.execution': 'Governed Execution',
  'nav.memory': 'Institutional Memory',
  'nav.data': 'Data & Integrations',
  'overdue.title': 'Overdue actions',
  'overdue.none': 'No governed step is past its service level.',
  'overdue.basis':
    'Synthetic demonstration service levels, approved by the owner. Listed only; nothing is escalated automatically.',
  'overdue.late': 'overdue',
  'report.open': 'Case report',
  'report.title': 'Governance case report',
  'report.print': 'Print',
  'report.download': 'Download evidence pack (JSON)',
  'case.tab.analysis': 'Analysis',
  'analysis.title': 'Case analysis',
  'analysis.run': 'Run analysis',
  'analysis.runAgain': 'Run again',
  'sensitivity.title': 'Sensitivity',
  'graph.view.graph': 'Graph',
  'graph.view.entities': 'Entities & dependencies',
  'mandates.view.register': 'Mandates & authority',
  'mandates.view.rules': 'Codified rules',
  'mandates.view.definitions': 'Definitions',
  'mandates.view.export': 'Export',
  'oversight.audit': 'Audit log',
  'oversight.admin': 'Administration',
  'oversight.verify': 'Verify the chain',
  'outcome.link': 'Expected versus observed',
  'outcome.record': 'Record observation',
  'data.title': 'Data & Sources',
  'data.connectors': 'Connectors',
  'data.import': 'Import',
  'data.runs': 'Runs',
  'data.records': 'Records',
  'data.quality': 'Data quality',
  'data.sources': 'Sources & packages',
  'nav.competitive': 'Competitive Intelligence',
  'nav.oversight': 'Audit & Administration',
  'nav.primary': 'Primary navigation',
  'nav.open': 'Open navigation',
  'nav.close': 'Close navigation',
  'top.institution': 'Institution',
  'top.sector': 'Sector',
  'top.allSectors': 'All sectors',
  'top.approvals': 'Approval required',
  'top.noApprovals': 'Nothing awaiting you',
  'top.approvalsHint': 'Items whose next step belongs to your role',
  'top.signOut': 'Sign out',
  'top.search': 'Search signals, cases, entities…',
  'top.searchLabel': 'Search signals, cases and entities',
  'top.language': 'Interface language',
  'demo.banner':
    'Demonstration: fictional institution, synthetic and dated public snapshot data. No live feeds.',
  'demo.label': 'Demonstration',
  'ar.draft': 'Arabic interface draft, approved by the owner for the demonstration',
  'common.lastUpdated': 'Last updated',
  'common.sourceNotConnected': 'Source not connected',
  'common.connectData': 'Connect authorised data',
  'common.connectDataHint': 'This view fills in once an approved source is connected.',
  'common.viewAll': 'View all',
  'common.awaitingData': 'Awaiting data',
  'common.noRunsYet': 'No runs yet',
  'common.phase': 'Arrives in Phase {n}',
  'common.loading': 'Loading…',
  'common.lineage': 'Lineage',
  'common.notRecorded': 'Not recorded',
  'signin.headline1': 'Sovereign intelligence.',
  'signin.headline2': 'Institutional control.',
  'signin.sub': 'Your authorised gateway to capital, policy and strategic intelligence.',
  'signin.title': 'Institutional sign-in',
  'signin.lead': 'Identify your institution to continue securely.',
  'signin.idLabel': 'Institution code or work email',
  'signin.idPlaceholder': 'Enter your institutional identifier',
  'signin.continue': 'Continue with institutional identity',
  'signin.managed': 'Authentication is managed by your institution.',
  'signin.demoHint': 'Demonstration code: GSIA-DEMO',
  'signin.notConnected':
    'This institution is not connected to this deployment. Contact your institution administrator.',
  'signin.chooseRole': 'Choose a demonstration role',
  'signin.demoNote':
    'Demonstration Mode: seeded roles in a fictional institution. No real credentials are used.',
  'signin.workspace': 'Your workspace follows your access',
  'signin.workspaceLead':
    'After sign-in, your institutional permissions determine your available workspaces.',
  'signin.contactAdmin': 'Contact your institution administrator',
  'signin.authorisedOnly': 'Authorised institutional access only',
  'signin.privacy': 'Privacy',
  'signin.support': 'Access support',
  'signin.back': 'Use a different institution',
  'overview.title': 'Sovereign Overview',
  'overview.lead': 'What needs attention across the institution, why it surfaced, and who acts next.',
  'overview.map': 'Gulf Strategic View',
  'overview.mapLead':
    'Chokepoints, ports, terminals and modelled dependencies. Movement is an illustrative replay.',
  'overview.attention': 'Attention queue',
  'overview.attentionLead': 'Items for your role are marked and listed first.',
  'overview.sectors': 'Sectors at a glance',
  'overview.cases': 'Priority Intelligence Cases',
  'overview.review': 'Expert Review Queue',
  'overview.sources': 'Data & Evidence',
  'kpi.openCases': 'Open cases',
  'kpi.awaitingReview': 'Awaiting expert review',
  'kpi.awaitingDecision': 'Awaiting decision',
  'kpi.staleSources': 'Stale sources',
  'sector.atGlance': 'Sector at a Glance',
  'sector.assetMap': 'Asset Map',
  'sector.areas': 'Key Intelligence Areas',
  'sector.cases': 'Priority Intelligence Cases',
  'sector.agents': 'AI Specialist Activity',
  'sector.review': 'Expert Review Queue',
  'sector.scenarios': 'Scenario Launch',
  'sector.mandates': 'Mandates & Decisions',
  'sector.trend': 'Trend',
  'sector.signals': 'Sector signals',
  'sector.noCases': 'No intelligence cases in this sector yet.',
  'sector.noReview': 'Nothing awaiting expert review.',
  'sector.noAssets': 'No sector assets connected',
  'sector.shell': 'Configured sector. No institutional data connected yet.',
  'sector.index': 'Sector Intelligence',
  'sector.indexLead':
    'One operating system, eight sector configurations sharing a single graph, governance and case workflow.',
  'sub.sectors': 'Sectors',
  'sub.signals': 'Signals & Early Warning',
  'sub.cases': 'Intelligence Cases',
  'sub.graph': 'Intelligence Graph',
};

export type MessageKey = keyof typeof en;

const ar: Record<MessageKey, string> = {
  'brand.tagline': 'من المعلومات إلى القدرة. ومن رأس المال إلى الميزة السيادية.',
  'brand.descriptor': 'نظام التشغيل للذكاء السيادي',
  'nav.overview': 'النظرة السيادية العامة',
  'nav.sectors': 'ذكاء القطاعات',
  'nav.ai': 'قيادة الذكاء الاصطناعي',
  'nav.scenarios': 'الاستشراف والسيناريوهات',
  'nav.mandates': 'التفويضات والصلاحيات',
  'nav.decisions': 'القرارات والموافقات',
  'nav.execution': 'التنفيذ المحكوم',
  'nav.memory': 'الذاكرة المؤسسية',
  'nav.data': 'البيانات والتكاملات',
  'overdue.title': 'إجراءات متأخرة',
  'overdue.none': 'لا توجد خطوة حوكمة تجاوزت مستوى الخدمة المحدد.',
  'overdue.basis': 'مستويات خدمة توضيحية اصطناعية معتمدة من المالك. للعرض فقط؛ لا يُصعَّد أي شيء تلقائياً.',
  'overdue.late': 'متأخر',
  'report.open': 'تقرير الحالة',
  'report.title': 'تقرير الحوكمة للحالة',
  'report.print': 'طباعة',
  'report.download': 'تنزيل حزمة الأدلة (JSON)',
  'case.tab.analysis': 'التحليل',
  'analysis.title': 'تحليل الحالة',
  'analysis.run': 'تشغيل التحليل',
  'analysis.runAgain': 'تشغيل مجدداً',
  'sensitivity.title': 'الحساسية',
  'graph.view.graph': 'الرسم البياني',
  'graph.view.entities': 'الكيانات والاعتماديات',
  'mandates.view.register': 'التفويضات والصلاحيات',
  'mandates.view.rules': 'القواعد المقننة',
  'mandates.view.definitions': 'التعريفات',
  'mandates.view.export': 'التصدير',
  'oversight.audit': 'سجل التدقيق',
  'oversight.admin': 'الإدارة',
  'oversight.verify': 'التحقق من السلسلة',
  'outcome.link': 'المتوقع مقابل المرصود',
  'outcome.record': 'تسجيل الملاحظة',
  'data.title': 'البيانات والمصادر',
  'data.connectors': 'الموصلات',
  'data.import': 'الاستيراد',
  'data.runs': 'عمليات التشغيل',
  'data.records': 'السجلات',
  'data.quality': 'جودة البيانات',
  'data.sources': 'المصادر والحزم',
  'nav.competitive': 'الاستخبارات التنافسية',
  'nav.oversight': 'التدقيق والإدارة',
  'nav.primary': 'التنقل الرئيسي',
  'nav.open': 'فتح التنقل',
  'nav.close': 'إغلاق التنقل',
  'top.institution': 'المؤسسة',
  'top.sector': 'القطاع',
  'top.allSectors': 'جميع القطاعات',
  'top.approvals': 'موافقة مطلوبة',
  'top.noApprovals': 'لا شيء بانتظارك',
  'top.approvalsHint': 'عناصر تقع خطوتها التالية ضمن دورك',
  'top.signOut': 'تسجيل الخروج',
  'top.search': 'ابحث في الإشارات والحالات والكيانات…',
  'top.searchLabel': 'البحث في الإشارات والحالات والكيانات',
  'top.language': 'لغة الواجهة',
  'demo.banner': 'عرض توضيحي، مؤسسة افتراضية؛ بيانات اصطناعية ولقطات عامة مؤرخة. لا توجد تغذيات مباشرة.',
  'demo.label': 'عرض توضيحي',
  'ar.draft': 'مسودة الواجهة العربية، معتمدة من المالك للعرض التوضيحي',
  'common.lastUpdated': 'آخر تحديث',
  'common.sourceNotConnected': 'المصدر غير متصل',
  'common.connectData': 'اربط بيانات معتمدة',
  'common.connectDataHint': 'يكتمل هذا العرض عند ربط مصدر معتمد.',
  'common.viewAll': 'عرض الكل',
  'common.awaitingData': 'بانتظار البيانات',
  'common.noRunsYet': 'لا توجد عمليات تشغيل بعد',
  'common.phase': 'يتوفر في المرحلة {n}',
  'common.loading': 'جارٍ التحميل…',
  'common.lineage': 'المصدر والتسلسل',
  'common.notRecorded': 'غير مسجل',
  'signin.headline1': 'ذكاء سيادي.',
  'signin.headline2': 'تحكم مؤسسي.',
  'signin.sub': 'بوابتك المعتمدة إلى ذكاء رأس المال والسياسات والاستراتيجية.',
  'signin.title': 'تسجيل الدخول المؤسسي',
  'signin.lead': 'حدّد مؤسستك للمتابعة بأمان.',
  'signin.idLabel': 'رمز المؤسسة أو البريد الإلكتروني للعمل',
  'signin.idPlaceholder': 'أدخل معرّفك المؤسسي',
  'signin.continue': 'المتابعة بالهوية المؤسسية',
  'signin.managed': 'تتولى مؤسستك إدارة المصادقة.',
  'signin.demoHint': 'رمز العرض التوضيحي: GSIA-DEMO',
  'signin.notConnected': 'هذه المؤسسة غير متصلة بهذا النشر. تواصل مع مسؤول مؤسستك.',
  'signin.chooseRole': 'اختر دوراً للعرض التوضيحي',
  'signin.demoNote':
    'وضع العرض التوضيحي، أدوار مُعدّة مسبقاً في مؤسسة افتراضية. لا تُستخدم بيانات اعتماد حقيقية.',
  'signin.workspace': 'مساحة عملك تتبع صلاحياتك',
  'signin.workspaceLead': 'بعد تسجيل الدخول، تحدد صلاحياتك المؤسسية مساحات العمل المتاحة لك.',
  'signin.contactAdmin': 'تواصل مع مسؤول مؤسستك',
  'signin.authorisedOnly': 'الدخول للجهات المؤسسية المخوّلة فقط',
  'signin.privacy': 'الخصوصية',
  'signin.support': 'دعم الوصول',
  'signin.back': 'استخدام مؤسسة أخرى',
  'overview.title': 'النظرة السيادية العامة',
  'overview.lead': 'ما الذي يتطلب الاهتمام في المؤسسة، ولماذا ظهر، ومن يتخذ الخطوة التالية.',
  'overview.map': 'المنظور الاستراتيجي للخليج',
  'overview.mapLead': 'المضائق والموانئ والمحطات والاعتماديات المنمذجة. الحركة إعادة عرض توضيحية.',
  'overview.attention': 'قائمة الاهتمام',
  'overview.attentionLead': 'العناصر الخاصة بدورك مميزة ومعروضة أولاً.',
  'overview.sectors': 'القطاعات في لمحة',
  'overview.cases': 'حالات الذكاء ذات الأولوية',
  'overview.review': 'قائمة مراجعة الخبراء',
  'overview.sources': 'البيانات والأدلة',
  'kpi.openCases': 'حالات مفتوحة',
  'kpi.awaitingReview': 'بانتظار مراجعة الخبراء',
  'kpi.awaitingDecision': 'بانتظار القرار',
  'kpi.staleSources': 'مصادر متقادمة',
  'sector.atGlance': 'القطاع في لمحة',
  'sector.assetMap': 'خريطة الأصول',
  'sector.areas': 'مجالات الذكاء الرئيسية',
  'sector.cases': 'حالات الذكاء ذات الأولوية',
  'sector.agents': 'نشاط المتخصصين بالذكاء الاصطناعي',
  'sector.review': 'قائمة مراجعة الخبراء',
  'sector.scenarios': 'إطلاق السيناريوهات',
  'sector.mandates': 'التفويضات والقرارات',
  'sector.trend': 'الاتجاه',
  'sector.signals': 'إشارات القطاع',
  'sector.noCases': 'لا توجد حالات ذكاء في هذا القطاع بعد.',
  'sector.noReview': 'لا شيء بانتظار مراجعة الخبراء.',
  'sector.noAssets': 'لا توجد أصول قطاعية متصلة',
  'sector.shell': 'قطاع مُهيأ، لم تُربط بيانات مؤسسية بعد.',
  'sector.index': 'ذكاء القطاعات',
  'sector.indexLead': 'نظام تشغيل واحد وثمانية إعدادات قطاعية تتشارك رسماً بيانياً وحوكمة وسير عمل واحداً.',
  'sub.sectors': 'القطاعات',
  'sub.signals': 'الإشارات والإنذار المبكر',
  'sub.cases': 'حالات الذكاء',
  'sub.graph': 'الرسم البياني للذكاء',
};

/** Arabic sector labels (draft). Keys follow the shared sector registry. */
export const SECTOR_LABEL_AR: Record<SectorKey, string> = {
  energy: 'الطاقة والملاحة البحرية',
  utilities: 'البنية التحتية والمرافق',
  capital: 'رأس المال السيادي',
  supply_chain: 'سلاسل الإمداد والخدمات اللوجستية',
  banking: 'المصارف والخدمات المالية',
  manufacturing: 'التصنيع والصناعات',
  real_estate: 'العقارات والإنشاءات',
  insurance: 'التأمين',
};

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, ar };

interface I18n {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n>({
  lang: 'en',
  dir: 'ltr',
  setLang: () => {},
  t: (k) => en[k],
});

const KEY = 'tigeris.lang';

function readStored(): Lang {
  try {
    return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Language preference is a per-viewer convenience only.
    }
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      let s = DICTS[lang][key] ?? en[key];
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, dir: dir as I18n['dir'], setLang, t }), [lang, dir, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
