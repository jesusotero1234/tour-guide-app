import { TourPosition, TourPositionContext } from '../types/api';
import logger from '../utils/logger';

/**
 * Service for framing descriptions with narrative tour elements
 * Creates a cohesive story across multiple tour stops
 */
export class NarrativeFramer {
  /**
   * Frame a description with appropriate narrative elements based on tour position
   */
  public frameWithNarrative(
    description: string,
    place: string,
    city: string,
    tourContext: TourPositionContext
  ): string {
    const { position } = tourContext;
    
    switch (position) {
      case 'first':
        return this.createWelcomeFrame(description, place, city, tourContext);
      case 'middle':
        return this.createTransitionFrame(description, place, city, tourContext);
      case 'last':
        return this.createConclusionFrame(description, place, city, tourContext);
      default:
        return description;
    }
  }

  /**
   * Create welcome and introduction for first stop
   */
  private createWelcomeFrame(
    description: string,
    place: string,
    city: string,
    tourContext: TourPositionContext
  ): string {
    const tourTheme = tourContext.tourTheme || `highlights of ${city}`;
    const tourName = tourContext.tourName || `${city} ${tourTheme} Tour`;
    
    // Build next stops preview
    let nextStopsPreview = '';
    if (tourContext.nextStops && tourContext.nextStops.length > 0) {
      const nextStopNames = tourContext.nextStops.map(stop => stop.name);
      
      if (nextStopNames.length === 1) {
        nextStopsPreview = `After this, we'll visit ${nextStopNames[0]}.`;
      } else if (nextStopNames.length === 2) {
        nextStopsPreview = `After this, we'll continue to ${nextStopNames[0]} and finish at ${nextStopNames[1]}.`;
      } else {
        const lastStop = nextStopNames.pop();
        nextStopsPreview = `After this, our journey will take us to ${nextStopNames.join(', ')}, and finally ${lastStop}.`;
      }
    }
    
    // Extract estimated duration if available
    const durationInfo = tourContext.expectedDuration 
      ? `Our tour today will take approximately ${tourContext.expectedDuration} minutes.`
      : '';
    
    // Create welcome frame - without markdown header
    return `Welcome to our ${tourName}! 

Today we'll be exploring ${tourTheme} in ${city}. ${durationInfo} I'm excited to guide you through some of the city's most fascinating locations.

Our first stop is ${place}.

${description}

${nextStopsPreview}`;
  }

  /**
   * Create transition narrative for middle stops
   */
  private createTransitionFrame(
    description: string,
    place: string,
    city: string,
    tourContext: TourPositionContext
  ): string {
    // Get previous stop information
    let previousStopInfo = 'our previous location';
    let transitionHighlight = '';
    
    if (tourContext.previousStops && tourContext.previousStops.length > 0) {
      const lastStop = tourContext.previousStops[tourContext.previousStops.length - 1];
      previousStopInfo = lastStop.name;
      
      // Create transition highlight
      const tourTheme = tourContext.tourTheme || '';
      if (tourTheme.includes('royal') || tourTheme.includes('heritage')) {
        transitionHighlight = `While ${previousStopInfo} represents the formal royal power, ${place} shows us how the people of Madrid engaged with their city's heritage.`;
      } else if (tourTheme.includes('art') || tourTheme.includes('cultur')) {
        transitionHighlight = `After experiencing the ${previousStopInfo}, ${place} offers a different perspective on ${city}'s cultural landscape.`;
      } else {
        transitionHighlight = `Moving from ${previousStopInfo} to ${place} gives us a broader understanding of ${city}'s historical evolution.`;
      }
    }
    
    // Build next stop teaser
    let nextStopTeaser = '';
    if (tourContext.nextStops && tourContext.nextStops.length > 0) {
      const nextStop = tourContext.nextStops[0];
      nextStopTeaser = `Next, we'll be heading to ${nextStop.name}${nextStop.category ? `, a magnificent ${nextStop.category}` : ''}, to continue our exploration.`;
    }
    
    // Create transition frame - without markdown header
    return `Continuing our journey to ${place}. 

Having explored ${previousStopInfo}, let's now discover ${place}.

${transitionHighlight}

${description}

${nextStopTeaser}`;
  }

  /**
   * Create conclusion narrative for last stop
   */
  private createConclusionFrame(
    description: string,
    place: string,
    city: string,
    tourContext: TourPositionContext
  ): string {
    const tourTheme = tourContext.tourTheme || `highlights of ${city}`;
    
    // Create summary of visited places
    let tourRecap = '';
    if (tourContext.previousStops && tourContext.previousStops.length > 0) {
      const previousStopNames = tourContext.previousStops.map(stop => stop.name);
      
      if (previousStopNames.length === 1) {
        tourRecap = `We've visited ${previousStopNames[0]} and now ${place}`;
      } else {
        tourRecap = `We've explored ${previousStopNames.join(', ')} and now ${place}`;
      }
    } else {
      tourRecap = `We've explored ${place}`;
    }
    
    // Create conclusion frame - without markdown header
    return `Final stop: ${place}. 

We've reached the final destination on our tour of ${city}'s ${tourTheme}.

${description}

This concludes our journey today. ${tourRecap}, discovering the rich history and culture that makes ${city} so special.

Thank you for joining me on this tour! I hope you've enjoyed this exploration of ${city}'s ${tourTheme}.`;
  }
  
  /**
   * Extract key highlights from previous stop descriptions
   * for referencing in transitions
   */
  private extractHighlights(description?: string): string[] {
    if (!description) return [];
    
    const highlights: string[] = [];
    
    // Look for sentences with superlatives or key indicators
    const sentences = description.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 0);
    for (const sentence of sentences) {
      if (
        sentence.match(/most|greatest|famous|renowned|significant|unique|impressive/i) ||
        sentence.match(/stunning|beautiful|remarkable|exceptional|extraordinary/i)
      ) {
        highlights.push(sentence);
      }
    }
    
    // Return top 2 highlights or empty array
    return highlights.slice(0, 2);
  }
}

export const narrativeFramer = new NarrativeFramer();
