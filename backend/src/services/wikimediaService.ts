import axios from 'axios';
import logger from '../utils/logger';
import { wikidataGet } from '../infrastructure/enrichment/wikidataClient';

// Wikimedia requires a descriptive User-Agent to avoid 403 blocks.
// See: https://www.mediawiki.org/wiki/API:Etiquette
const WIKIMEDIA_HEADERS = {
  'User-Agent': 'TourGuideApp/0.1 (https://github.com/tour-guide-app; contact@tourguideapp.example.com) axios'
};

// Define interfaces for the Wikimedia API response
interface WikimediaImageInfo {
  url: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  thumbwidth?: number;
  thumbheight?: number;
  size?: number;
  globalusage?: Array<{ wiki: string, title: string }>;
  extmetadata?: {
    ImageDescription?: { value: string };
    Categories?: { value: string };
    License?: { value: string };
    LicenseShortName?: { value: string };
    ObjectName?: { value: string };
    CommonsMetadataExtension?: { value: string };
    Assessment?: { value: string };
  };
}

interface WikimediaApiResponse {
  query?: {
    pages?: Record<string, {
      pageid: number;
      ns: number;
      title: string;
      imageinfo?: WikimediaImageInfo[];
    }>;
  };
}

interface ImageDetails {
  title: string;
  url: string;
  displayUrl: string;
  width: number;
  height: number;
  thumbWidth?: number;
  thumbHeight?: number;
  size?: number;
  usageCount: number;
  isFeatured: boolean;
  hasDescription: boolean;
  descriptionText: string;
  categoriesText: string;
  objectNameText: string;
  source: 'wikidata' | 'wikipedia' | 'search';
}

interface WikimediaImageSearchContext {
  wikidata?: string;
  wikipedia?: string;
  category?: string;
  osmTags?: Record<string, string>;
  landmarkTier?: string;
}

interface WikidataEntityClaimValue {
  value?: string;
}

interface WikidataEntityClaim {
  mainsnak?: {
    datavalue?: WikidataEntityClaimValue;
  };
}

interface WikidataEntityResponse {
  entities?: Array<{
    id?: string;
    claims?: Record<string, WikidataEntityClaim[]>;
  }> | Record<string, {
    id?: string;
    claims?: Record<string, WikidataEntityClaim[]>;
  }>;
}

interface WikipediaPageImageResponse {
  query?: {
    pages?: Record<string, {
      thumbnail?: {
        source?: string;
        width?: number;
        height?: number;
      };
      pageimage?: string;
      title?: string;
    }>;
  };
}

/**
 * Service for fetching images from Wikimedia Commons with advanced filtering
 */
export class WikimediaService {
  // Minimum acceptable dimension for high-quality images
  private MIN_DIMENSION = 800;
  private THUMBNAIL_WIDTH = 1200;
  private DIRECT_SOURCE_SCORE_BONUS = 1_000_000_000_000;

  /**
   * Fetch an image URL from Wikimedia Commons for a given place, city, and country
   * with enhanced filtering for high-quality images and fallback to basic query
   * 
   * @param placeName The name of the place
   * @param cityName The city where the place is located
   * @param countryName The country where the place is located
   * @returns The URL of the best image found, or null if no images were found
   */
  async fetchImageForPlace(
    placeName: string,
    cityName: string,
    countryName: string,
    context: WikimediaImageSearchContext = {}
  ): Promise<string | null> {
    try {
      const wikidataImageUrl = await this.fetchImageFromWikidata(context.wikidata);
      if (wikidataImageUrl) {
        return wikidataImageUrl;
      }

      const wikipediaImageUrl = await this.fetchImageFromWikipediaPage(context.wikipedia);
      if (wikipediaImageUrl) {
        return wikipediaImageUrl;
      }

      // Try the enhanced approach first
      const enhancedImageUrl = await this.fetchEnhancedImage(placeName, cityName, countryName, context);
      if (enhancedImageUrl) {
        return enhancedImageUrl;
      }
      
      // If enhanced approach fails, fall back to basic approach
      logger.info(`Enhanced image search failed for ${placeName}, trying fallback method`);
      return await this.fetchBasicImage(placeName, cityName, countryName, context);
    } catch (error) {
      logger.error(`Error in image fetching pipeline for ${placeName}:`, error);
      return null;
    }
  }

  /**
   * Enhanced image fetching with quality filters
   */
  private async fetchEnhancedImage(
    placeName: string,
    cityName: string,
    countryName: string,
    context: WikimediaImageSearchContext
  ): Promise<string | null> {
    try {
      // Create search query with all parameters
      const searchQuery = `${placeName} ${cityName} ${countryName}`;
      const encodedQuery = encodeURIComponent(searchQuery);

      // Build the Wikimedia API URL with enhanced parameters
      const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodedQuery}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|dimensions|globalusage|extmetadata&iiurlwidth=${this.THUMBNAIL_WIDTH}&gimlimit=5`;

      logger.info(`Fetching enhanced images for: ${searchQuery}`);
      const response = await axios.get<WikimediaApiResponse>(apiUrl, { headers: WIKIMEDIA_HEADERS });

      // Check if we have valid results
      if (
        !response.data || 
        !response.data.query || 
        !response.data.query.pages || 
        Object.keys(response.data.query.pages).length === 0
      ) {
        logger.warn(`No enhanced images found for ${searchQuery}`);
        return null;
      }

      const pages = response.data.query.pages;
      const imageDetails = this.extractImageDetailsFromPages(pages, 'search');

      // No valid images found
      if (imageDetails.length === 0) {
        logger.warn(`No valid enhanced images found for ${searchQuery}`);
        return null;
      }

      const bestImage = await this.findFirstUsableImage(imageDetails, placeName, cityName, countryName, context);
      if (!bestImage) {
        logger.warn(`No usable enhanced image URL found for ${searchQuery}`);
        return null;
      }

      logger.info(`Found best image for ${placeName}: ${bestImage.displayUrl} (${bestImage.width}x${bestImage.height})`);
      return bestImage.displayUrl;
    } catch (error) {
      logger.error(`Error fetching enhanced image for ${placeName}:`, error);
      return null;
    }
  }
  
  /**
   * Basic image fetching (original implementation as fallback)
   */
  private async fetchBasicImage(
    placeName: string,
    cityName: string,
    countryName: string,
    context: WikimediaImageSearchContext
  ): Promise<string | null> {
    try {
      // Create search query with all parameters
      const searchQuery = `${placeName} ${cityName} ${countryName}`;
      const encodedQuery = encodeURIComponent(searchQuery);

      // Build the basic Wikimedia API URL (original implementation)
      const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodedQuery}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size|dimensions|extmetadata&iiurlwidth=${this.THUMBNAIL_WIDTH}`;

      logger.info(`Fetching basic image for: ${searchQuery}`);
      const response = await axios.get(apiUrl, { headers: WIKIMEDIA_HEADERS });

      // Check if we have valid results
      if (
        !response.data || 
        !response.data.query || 
        !response.data.query.pages || 
        Object.keys(response.data.query.pages).length === 0
      ) {
        logger.warn(`No basic image found for ${searchQuery}`);
        return null;
      }

      const pages = response.data.query.pages;
      const imageDetails = this.extractImageDetailsFromPages(pages, 'search');
      if (imageDetails.length === 0) {
        logger.warn(`No valid basic image candidates found for ${searchQuery}`);
        return null;
      }

      const bestImage = await this.findFirstUsableImage(imageDetails, placeName, cityName, countryName, context);
      if (!bestImage) {
        logger.warn(`No usable basic image URL found for ${searchQuery}`);
        return null;
      }

      logger.info(`Found basic image for ${placeName}: ${bestImage.displayUrl}`);
      return bestImage.displayUrl;
    } catch (error) {
      logger.error(`Error fetching basic image for ${placeName}:`, error);
      return null;
    }
  }
  
  /**
   * Select the best image from a list based on quality criteria
   */
  private extractImageDetailsFromPages(
    pages: Record<string, { title: string; imageinfo?: WikimediaImageInfo[] }>,
    source: ImageDetails['source']
  ): ImageDetails[] {
    const imageDetails: ImageDetails[] = [];

    for (const pageKey of Object.keys(pages)) {
      const page = pages[pageKey];
      if (!page.imageinfo || page.imageinfo.length === 0) continue;

      const info = page.imageinfo[0];

      if (!this.isValidImageFile(page.title)) continue;

      const width = info.width || 0;
      const height = info.height || 0;
      const usageCount = info.globalusage ? info.globalusage.length : 0;
      const displayUrl = info.thumburl || info.url;
      const descriptionText = info.extmetadata?.ImageDescription?.value || '';
      const categoriesText = info.extmetadata?.Categories?.value || '';
      const objectNameText = info.extmetadata?.ObjectName?.value || '';

      imageDetails.push({
        title: page.title,
        url: info.url,
        displayUrl,
        width,
        height,
        thumbWidth: info.thumbwidth,
        thumbHeight: info.thumbheight,
        size: info.size,
        usageCount,
        isFeatured: this.isFeaturedImage(info),
        hasDescription: this.hasGoodDescription(info),
        descriptionText,
        categoriesText,
        objectNameText,
        source,
      });
    }

    return imageDetails;
  }

  private async findFirstUsableImage(
    images: ImageDetails[],
    placeName: string,
    cityName: string,
    countryName: string,
    context: WikimediaImageSearchContext
  ): Promise<ImageDetails | null> {
    const rankedImages = [...images].sort(
      (a, b) => this.getImageScore(b, placeName, cityName, countryName, context) - this.getImageScore(a, placeName, cityName, countryName, context)
    );

    for (const image of rankedImages) {
      if (await this.isUsableImageUrl(image.displayUrl)) {
        return image;
      }
    }

    return null;
  }

  private getImageScore(
    image: ImageDetails,
    placeName: string,
    cityName: string,
    countryName: string,
    context: WikimediaImageSearchContext
  ): number {
    const areaScore = image.width * image.height;
    const usageMultiplier = 1 + Math.min(image.usageCount, 10) / 10;
    const featuredBonus = image.isFeatured ? 1.25 : 1;
    const descriptionBonus = image.hasDescription ? 1.05 : 1;
    const dimensionBonus = image.width >= this.MIN_DIMENSION && image.height >= this.MIN_DIMENSION ? 1.15 : 1;
    const directSourceBonus = image.source === 'wikidata'
      ? this.DIRECT_SOURCE_SCORE_BONUS * 2
      : image.source === 'wikipedia'
        ? this.DIRECT_SOURCE_SCORE_BONUS
        : 0;
    const relevanceMultiplier = this.getRelevanceMultiplier(image, placeName, cityName, countryName, context);

    return (areaScore * usageMultiplier * featuredBonus * descriptionBonus * dimensionBonus * relevanceMultiplier) + directSourceBonus;
  }

  private getRelevanceMultiplier(
    image: ImageDetails,
    placeName: string,
    cityName: string,
    countryName: string,
    context: WikimediaImageSearchContext
  ): number {
    const searchableText = this.normalizeText([
      image.title,
      image.descriptionText,
      image.categoriesText,
      image.objectNameText,
    ].join(' '));

    const placeTokens = this.getSearchTokens([placeName, this.getPrimaryOsmName(context.osmTags)]);
    const locationTokens = this.getSearchTokens([cityName, countryName]);
    const categoryHints = this.getCategoryHints(context.category, context.osmTags);

    let multiplier = 1;

    const placeMatches = placeTokens.filter((token) => searchableText.includes(token)).length;
    const locationMatches = locationTokens.filter((token) => searchableText.includes(token)).length;
    const categoryMatches = categoryHints.positive.filter((token) => searchableText.includes(token)).length;
    const negativeMatches = categoryHints.negative.filter((token) => searchableText.includes(token)).length;

    if (placeMatches > 0) {
      multiplier += Math.min(placeMatches, 3) * 0.35;
    }

    if (locationMatches > 0) {
      multiplier += Math.min(locationMatches, 2) * 0.15;
    }

    if (categoryMatches > 0) {
      multiplier += Math.min(categoryMatches, 3) * 0.2;
    }

    if (negativeMatches > 0) {
      multiplier -= Math.min(negativeMatches, 3) * 0.3;
    }

    if (this.looksLikeRepresentativePlacePhoto(searchableText, context.category)) {
      multiplier += 0.75;
    }

    if (this.looksLikeIrrelevantArtworkForPlace(searchableText, context.category)) {
      multiplier *= 0.02;
    }

    return Math.max(multiplier, 0.1);
  }

  private async isUsableImageUrl(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        headers: WIKIMEDIA_HEADERS,
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const contentType = response.headers['content-type'];
      return typeof contentType === 'string' && contentType.startsWith('image/');
    } catch (error) {
      logger.warn(`Rejected unusable Wikimedia image URL: ${url}`, error);
      return false;
    }
  }
  
  /**
   * Check if the image is marked as featured
   */
  private isFeaturedImage(info: WikimediaImageInfo): boolean {
    const categories = info.extmetadata?.Categories?.value || '';
    const assessment = info.extmetadata?.Assessment?.value || '';
    
    return (
      categories.includes('Featured') || 
      categories.includes('Quality images') ||
      assessment.includes('featured') ||
      assessment.includes('quality')
    );
  }
  
  /**
   * Check if the image has a good description
   */
  private hasGoodDescription(info: WikimediaImageInfo): boolean {
    const description = info.extmetadata?.ImageDescription?.value || '';
    // A good description is typically longer than 20 characters
    return description.length > 20;
  }

  private async fetchImageFromWikidata(wikidataId?: string): Promise<string | null> {
    if (!wikidataId) {
      return null;
    }

    try {
      const data = await wikidataGet<WikidataEntityResponse>({
        params: {
          action: 'wbgetentities',
          ids: wikidataId,
          props: 'claims',
          format: 'json',
          formatversion: 2,
        },
      });

      const entities = data.entities;
      const entity = Array.isArray(entities)
        ? entities.find((candidate) => candidate?.id === wikidataId)
        : entities?.[wikidataId];
      const filenames = (entity?.claims?.P18 ?? [])
        .map((claim) => claim?.mainsnak?.datavalue?.value)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

      if (filenames.length === 0) {
        return null;
      }

      for (const filename of filenames) {
        const image = await this.fetchCommonsFileImage(filename, 'wikidata');
        if (image && await this.isUsableImageUrl(image.displayUrl)) {
          return image.displayUrl;
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to fetch Wikidata image for ${wikidataId}:`, error);
      return null;
    }
  }

  private async fetchImageFromWikipediaPage(wikipediaTag?: string): Promise<string | null> {
    if (!wikipediaTag || !wikipediaTag.includes(':')) {
      return null;
    }

    const separatorIndex = wikipediaTag.indexOf(':');
    const language = wikipediaTag.slice(0, separatorIndex).trim();
    const title = wikipediaTag.slice(separatorIndex + 1).trim();

    if (!language || !title) {
      return null;
    }

    try {
      const apiUrl = `https://${language}.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=${this.THUMBNAIL_WIDTH}`;
      const response = await axios.get<WikipediaPageImageResponse>(apiUrl, { headers: WIKIMEDIA_HEADERS });
      const pages = response.data.query?.pages ?? {};

      for (const page of Object.values(pages)) {
        const source = page.thumbnail?.source;
        if (source && await this.isUsableImageUrl(source)) {
          return source;
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to fetch Wikipedia page image for ${wikipediaTag}:`, error);
      return null;
    }
  }

  private async fetchCommonsFileImage(filename: string, source: ImageDetails['source']): Promise<ImageDetails | null> {
    const normalizedTitle = this.normalizeCommonsFileTitle(filename);
    if (!normalizedTitle) {
      return null;
    }

    try {
      const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(normalizedTitle)}&prop=imageinfo&iiprop=url|size|dimensions|globalusage|extmetadata&iiurlwidth=${this.THUMBNAIL_WIDTH}`;
      const response = await axios.get<WikimediaApiResponse>(apiUrl, { headers: WIKIMEDIA_HEADERS });
      const pages = response.data.query?.pages;

      if (!pages || Object.keys(pages).length === 0) {
        return null;
      }

      const images = this.extractImageDetailsFromPages(pages, source);
      return images[0] ?? null;
    } catch (error) {
      logger.warn(`Failed to fetch Commons image info for ${filename}:`, error);
      return null;
    }
  }

  private normalizeCommonsFileTitle(filename: string): string | null {
    const trimmed = filename.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.startsWith('File:') ? trimmed : `File:${trimmed}`;
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/<[^>]*>/g, ' ')
      .replace(/[_()\-,.:/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getSearchTokens(values: Array<string | undefined>): string[] {
    return Array.from(new Set(
      values
        .flatMap((value) => this.normalizeText(value || '').split(' '))
        .filter((token) => token.length >= 4)
    ));
  }

  private getPrimaryOsmName(osmTags?: Record<string, string>): string | undefined {
    return osmTags?.name || osmTags?.['name:en'];
  }

  private getCategoryHints(category?: string, osmTags?: Record<string, string>): { positive: string[]; negative: string[] } {
    const tourism = osmTags?.tourism;
    const building = osmTags?.building;

    switch (category) {
      case 'museum':
        return {
          positive: ['museum', 'facade', 'building', 'exterior', tourism || '', building || ''],
          negative: ['painting', 'portrait', 'artwork', 'canvas', 'self portrait', 'google art project'],
        };
      case 'square_civic':
        return {
          positive: ['square', 'plaza', 'civic', 'street view'],
          negative: ['painting', 'map', 'plan', 'coat of arms'],
        };
      case 'palace_castle':
        return {
          positive: ['palace', 'castle', 'facade', 'building', 'exterior'],
          negative: ['painting', 'portrait', 'drawing', 'plan'],
        };
      case 'religious':
        return {
          positive: ['church', 'cathedral', 'basilica', 'facade', 'building', 'exterior'],
          negative: ['painting', 'icon', 'altarpiece', 'drawing'],
        };
      case 'market':
        return {
          positive: ['market', 'marketplace', 'hall', 'building', 'exterior'],
          negative: ['logo', 'map', 'poster'],
        };
      case 'artwork':
        return {
          positive: ['artwork', 'sculpture', 'statue', 'monument'],
          negative: ['map', 'logo'],
        };
      default:
        return {
          positive: [tourism || '', building || ''].filter(Boolean),
          negative: ['map', 'logo'],
        };
    }
  }

  private looksLikeIrrelevantArtworkForPlace(searchableText: string, category?: string): boolean {
    if (category === 'artwork' || category === 'memorial') {
      return false;
    }

    const artworkSignals = ['painting', 'portrait', 'canvas', 'oil on canvas', 'museum artwork', 'google art project'];
    const placeSignals = ['facade', 'building', 'exterior', 'front', 'palace', 'castle', 'square', 'plaza', 'church', 'cathedral'];

    return artworkSignals.some((token) => searchableText.includes(token))
      && !placeSignals.some((token) => searchableText.includes(token));
  }

  private looksLikeRepresentativePlacePhoto(searchableText: string, category?: string): boolean {
    if (!category || category === 'artwork') {
      return false;
    }

    const representativeSignals = ['facade', 'building', 'exterior', 'front', 'square', 'plaza', 'church', 'cathedral', 'palace', 'castle'];
    return representativeSignals.some((token) => searchableText.includes(token));
  }
  
  /**
   * Check if the file is a valid image (not a document, video, etc.)
   */
  private isValidImageFile(title: string): boolean {
    const lowerTitle = title.toLowerCase();
    
    // Check for image file extensions
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    // Exclude SVGs as they're often icons or diagrams, not photos
    const excludedExtensions = ['.svg', '.pdf', '.doc', '.txt'];
    
    for (const ext of validExtensions) {
      if (lowerTitle.endsWith(ext)) return true;
    }
    
    for (const ext of excludedExtensions) {
      if (lowerTitle.endsWith(ext)) return false;
    }
    
    return false;
  }
}

// Export a singleton instance
export const wikimediaService = new WikimediaService();
