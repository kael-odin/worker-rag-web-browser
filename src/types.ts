export interface OrganicResult {
  title: string;
  description: string;
  url: string;
  resultType?: SearchResultType;
}

export type SearchResultType = 'ORGANIC' | 'SUGGESTED';

export interface ContentScraperSettings {
  outputFormats: string[];
  removeCookieWarnings: boolean;
  removeElementsCssSelector: string;
  htmlTransformer: 'none' | 'readability' | 'readableText';
  dynamicContentWaitSecs: number;
  readableTextCharThreshold?: number;
}
