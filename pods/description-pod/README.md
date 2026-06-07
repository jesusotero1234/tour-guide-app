# Description Pod

## Overview
The Description Pod is responsible for generating rich, immersive content about places and landmarks for the Tour Guide App. It integrates with the LLM Pod to create descriptions, historical context, and visitor tips that form a cohesive narrative experience.

## Features
- Generate engaging place descriptions with adjustable detail levels
- Provide historical and cultural context for landmarks
- Offer practical visitor recommendations and tips
- Support for narrative storytelling across a complete tour
- Position-aware content (first, middle, or last stops in a tour)
- Multi-language support through LLM Pod integration
- In-memory caching for performance optimization

## API Endpoints

### Health Check
- `GET /health` - Check service status

### Content Generation
- `POST /generate/description` - Generate place descriptions
- `POST /generate/context` - Generate historical and cultural context
- `POST /generate/tips` - Generate visitor recommendations

## Narrative Tour Experience

The Description Pod includes specialized support for creating a narrative flow across a complete tour, similar to what a human tour guide would do. Instead of generating isolated content for each stop, it can:

1. **Provide Welcome & Introduction (First Stop)**
   - Create welcoming language for the start of a tour
   - Preview upcoming stops on the journey
   - Set expectations and introduce themes

2. **Create Narrative Flow (Middle Stops)**
   - Reference previously visited locations
   - Create smooth transitions between stops
   - Build a coherent story that connects locations

3. **Deliver Conclusion & Farewell (Last Stop)**
   - Summarize the tour experience
   - Reflect on the journey's highlights
   - Provide a satisfying conclusion

### Using Tour Context

To enable narrative features, include the `tourContext` parameter in your requests:

```json
{
  "place": {
    "name": "Royal Palace of Madrid",
    "city": "Madrid",
    "country": "Spain"
  },
  "tourContext": {
    "position": "first",
    "tourTheme": "royal heritage",
    "nextStops": [
      { "name": "Plaza Mayor", "category": "public square" },
      { "name": "Prado Museum", "category": "art museum" }
    ],
    "expectedDuration": 180
  }
}
```

## Architecture
The Description Pod follows a similar architecture to other pods in the Tour Guide App:
- Express.js server (port 3004)
- TypeScript codebase
- Integration with LLM Pod for content generation
- In-memory caching system

## Implementation Details

### Prompt Templates
The pod uses specialized prompt templates for different tour positions:
- **First Stop**: Welcome language, tour preview, scene-setting
- **Middle Stop**: Transitional language, references to previous stops
- **Last Stop**: Summary language, tour reflection, farewell text

### Content Personalization
Content can be customized through various parameters:
- **Detail Level**: Brief, standard, or detailed descriptions
- **Tour Theme**: Cultural, historical, architectural focus
- **Audience Type**: General, family, seniors, etc.
- **Style**: Informative, conversational, dramatic, etc.

## Future Enhancements

### Phase 1: Current Implementation
- Basic narrative flow with position awareness
- Reference to previously seen locations
- Welcome/farewell language

### Phase 2: Enhanced Narrative
- Theme tracking across stops
- More sophisticated transitions
- Varied pacing based on tour position
- Foreshadowing of upcoming highlights

### Phase 3: Advanced Personalization
- Time-of-day relevant content
- Seasonal/event-based variations
- Weather-appropriate suggestions
- Visitor-profile specific narration

## Example Usage

### First Stop Example
```bash
curl -X POST http://localhost:3004/generate/description \
  -H "Content-Type: application/json" \
  -d '{
    "place": {
      "name": "Royal Palace of Madrid",
      "category": "historical",
      "city": "Madrid",
      "country": "Spain"
    },
    "detailLevel": "standard",
    "tourContext": {
      "position": "first",
      "tourTheme": "royal heritage",
      "nextStops": [
        { "name": "Plaza Mayor" },
        { "name": "Prado Museum" }
      ]
    }
  }'
