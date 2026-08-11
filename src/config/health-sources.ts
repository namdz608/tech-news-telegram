import type { RssSourceConfig } from '../types/source';

export const healthSources: RssSourceConfig[] = [
  {
    id: 'vnexpress-health', name: 'VnExpress Sức khỏe', kind: 'rss', enabled: true,
    homepageUrl: 'https://vnexpress.net/suc-khoe',
    feedUrl: 'https://vnexpress.net/rss/suc-khoe.rss', includeUnmatched: true,
  },
  {
    id: 'tuoitre-health', name: 'Tuổi Trẻ Sức khỏe', kind: 'rss', enabled: true,
    homepageUrl: 'https://tuoitre.vn/suc-khoe.htm',
    feedUrl: 'https://tuoitre.vn/rss/suc-khoe.rss', includeUnmatched: true,
  },
  {
    id: 'thanhnien-health', name: 'Thanh Niên Sức khỏe', kind: 'rss', enabled: true,
    homepageUrl: 'https://thanhnien.vn/suc-khoe.htm',
    feedUrl: 'https://thanhnien.vn/rss/suc-khoe.rss', includeUnmatched: true,
  },
  {
    id: 'medlineplus-new', name: 'MedlinePlus New Links', kind: 'rss', enabled: true,
    homepageUrl: 'https://medlineplus.gov',
    feedUrl: 'https://medlineplus.gov/groupfeeds/new.xml', includeUnmatched: true,
  },
  {
    id: 'medlineplus-healthy-living', name: 'MedlinePlus Healthy Living', kind: 'rss', enabled: true,
    homepageUrl: 'https://medlineplus.gov/healthyliving.html',
    feedUrl: 'https://medlineplus.gov/feeds/topics/healthyliving.xml', includeUnmatched: true,
  },
  {
    id: 'fda-medwatch', name: 'FDA MedWatch', kind: 'rss', enabled: true,
    homepageUrl: 'https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program',
    feedUrl: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml',
    includeUnmatched: true,
  },
  {
    id: 'niddk-news', name: 'NIH/NIDDK News', kind: 'rss', enabled: true,
    homepageUrl: 'https://www.niddk.nih.gov/news',
    feedUrl: 'https://www.niddk.nih.gov/rss/news', includeUnmatched: true,
  },
];
