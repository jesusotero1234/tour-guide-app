# Tour Guide App Integration Plan

## Overview

This document outlines the plan for connecting all components of the Tour Guide App into a complete end-to-end workflow. This represents Phase 3 of the development roadmap, bridging the completion of all individual pods (Phase 2) to the advanced system intelligence features (Phase 4).

## Integration Goals

1. Create seamless communication between the frontend, backend, and all pods
2. Implement complete tour generation, retrieval, and update flows
3. Establish consistent error handling and recovery mechanisms
4. Set up monitoring and logging across all components
5. Optimize performance through caching and efficient data transfer

## Current Component Status

| Component | Status | Endpoint | Functionality |
|-----------|--------|----------|--------------|
| Frontend | Completed | :3000 | Using mock data currently |
| Backend API | Completed | :3001 | Basic orchestration with mock data |
| LLM Pod | Operational | :3002 | Text generation and translation |
| Verification Pod | Operational | :3003 | Place validation and importance scoring |
| Description Pod | Operational | :3004 | Narrative content generation |
| TTS Pod | Operational | :3005 | Audio generation from text |
| Supabase Pod | Operational | :3006 | Data persistence and file storage |

## Integration Tasks

### 1. Backend Integration Service (Week 1)

#### 1.1 Create Tour Orchestration Service

Create a new service in the backend to coordinate all pod interactions:

```typescript
// tour-guide-app/backend/src/services/orchestrationService.ts
import axios from 'axios';
import { TourRequest, Tour } from '../types/api';

export class OrchestrationService {
  private llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://localhost:3002';
  private verificationServiceUrl = process.env.VERIFICATION_SERVICE_URL || 'http://localhost:3003';
  private descriptionServiceUrl = process.env.DESCRIPTION_SERVICE_URL || 'http://localhost:3004';
  private ttsServiceUrl = process.env.TTS_SERVICE_URL || 'http://localhost:3005';
  private supabaseServiceUrl = process.env.SUPABASE_SERVICE_URL || 'http://localhost:3006';
  
  async generateCompleteTour(request: TourRequest): Promise<Tour> {
    // Step 1: Get initial places from LLM
    // Step 2: Verify places with Verification Pod
    // Step 3: Generate descriptions with Description Pod
    // Step 4: Generate audio with TTS Pod
    // Step 5: Save everything with Supabase Pod
    // Step 6: Return complete tour
  }
  
  async retrieveTour(id: string): Promise<Tour> {
    // Get tour from Supabase Pod
  }
  
  async updateTour(id: string, updates: any): Promise<Tour> {
    // Update tour in Supabase Pod
  }
}
```

#### 1.2 Update Backend Controllers

Update the controllers to use the orchestration service:

```typescript
// tour-guide-app/backend/src/api/controllers/tours.ts
import { OrchestrationService } from '../../services/orchestrationService';

const orchestrationService = new OrchestrationService();

export async function generateTour(req: Request, res: Response) {
  try {
    const tour = await orchestrationService.generateCompleteTour(req.body);
    res.status(201).json(tour);
  } catch (error) {
    // Error handling
  }
}

// Update other controller methods...
```

#### 1.3 Implement Error Handling Middleware

Create middleware for consistent error handling:

```typescript
// tour-guide-app/backend/src/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function errorHandler(
  error: any, 
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  // Log error
  logger.error('API Error', { 
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });
  
  // Format response based on error type
  // ...
}
```

### 2. Frontend Integration (Week 1)

#### 2.1 Update API Client

Update the frontend API client to use real backend endpoints:

```typescript
// tour-guide-app/frontend/src/lib/api.ts
export async function generateTour(request: TourRequest): Promise<Tour> {
  try {
    const response = await fetch(`${API_BASE_URL}/tours/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to generate tour');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error generating tour:', error);
    throw new Error('Failed to generate tour. Please try again.');
  }
}

// Update other API methods...
```

#### 2.2 Add Loading States

Implement loading states and error handling in UI components:

```typescript
// tour-guide-app/frontend/src/components/form/TourForm.tsx
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleSubmit = async (data: TourFormData) => {
  setIsLoading(true);
  setError(null);
  
  try {
    const tour = await generateTour({
      city: data.city,
      country: data.country,
      theme: data.theme,
      language: data.language
    });
    
    // Handle successful tour generation
    router.push(`/tour/${tour.id}`);
  } catch (error) {
    setError(error instanceof Error ? error.message : 'An error occurred');
  } finally {
    setIsLoading(false);
  }
};
```

### 3. Complete Tour Generation Flow (Week 2)

#### 3.1 LLM Integration

Implement the first step of the tour generation flow:

```typescript
// Inside orchestrationService.ts
async generateInitialPlaces(city: string, theme: string, language: string): Promise<any> {
  try {
    const response = await axios.post(`${this.llmServiceUrl}/generate/places`, {
      city,
      theme,
      language
    });
    
    return response.data;
  } catch (error) {
    throw new Error(`LLM service error: ${error.message}`);
  }
}
```

#### 3.2 Verification Integration

Add verification step to the flow:

```typescript
// Inside orchestrationService.ts
async verifyPlaces(places: any[], city: string): Promise<any> {
  try {
    const response = await axios.post(`${this.verificationServiceUrl}/places/verify`, {
      places,
      city
    });
    
    return response.data;
  } catch (error) {
    throw new Error(`Verification service error: ${error.message}`);
  }
}
```

#### 3.3 Description Integration

Add description generation step:

```typescript
// Inside orchestrationService.ts
async generateDescriptions(places: any[], theme: string, language: string): Promise<any> {
  try {
    const response = await axios.post(`${this.descriptionServiceUrl}/generate/descriptions`, {
      places,
      theme,
      language
    });
    
    return response.data;
  } catch (error) {
    throw new Error(`Description service error: ${error.message}`);
  }
}
```

#### 3.4 TTS Integration

Add audio generation step:

```typescript
// Inside orchestrationService.ts
async generateAudio(places: any[], language: string): Promise<any> {
  const placesWithAudio = [];
  
  for (const place of places) {
    try {
      const response = await axios.post(`${this.ttsServiceUrl}/tts/generate`, {
        text: place.description,
        language
      });
      
      placesWithAudio.push({
        ...place,
        audioUrl: response.data.audioUrl
      });
    } catch (error) {
      // Continue with other places if one fails
      console.error(`Audio generation failed for ${place.name}: ${error.message}`);
      placesWithAudio.push(place);
    }
  }
  
  return placesWithAudio;
}
```

#### 3.5 Supabase Storage Integration

Add storage step:

```typescript
// Inside orchestrationService.ts
async saveTour(tourData: any): Promise<Tour> {
  try {
    const response = await axios.post(`${this.supabaseServiceUrl}/tours`, {
      tour: tourData
    });
    
    return response.data;
  } catch (error) {
    throw new Error(`Storage service error: ${error.message}`);
  }
}
```

### 4. Tour Retrieval Flow (Week 2)

#### 4.1 Implement Tour Detail Retrieval

```typescript
// Inside orchestrationService.ts
async retrieveTour(id: string): Promise<Tour> {
  try {
    const response = await axios.get(`${this.supabaseServiceUrl}/tours/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to retrieve tour');
    }
    
    return response.data.data;
  } catch (error) {
    throw new Error(`Error retrieving tour: ${error.message}`);
  }
}
```

#### 4.2 Implement Audio URL Resolution

```typescript
// Inside orchestrationService.ts
async getAudioUrl(audioId: string): Promise<string> {
  try {
    const response = await axios.get(`${this.supabaseServiceUrl}/audio/${audioId}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to get audio URL');
    }
    
    return response.data.data.url;
  } catch (error) {
    throw new Error(`Error getting audio URL: ${error.message}`);
  }
}
```

### 5. System Resilience (Week 3)

#### 5.1 Add Circuit Breaker Pattern

Implement circuit breaker to handle service outages:

```typescript
// tour-guide-app/backend/src/utils/circuit-breaker.ts
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;

  constructor(
    failureThreshold = 3,
    successThreshold = 2,
    timeout = 10000
  ) {
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.timeout = timeout;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.reset();
      }
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    if (this.state === 'CLOSED') {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
      }
    } else if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    }
  }

  private reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }
}
```

#### 5.2 Implement Retry Logic

```typescript
// tour-guide-app/backend/src/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`Retry attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
}
```

#### 5.3 Add Caching Layer

```typescript
// tour-guide-app/backend/src/utils/cache.ts
import NodeCache from 'node-cache';

export class Cache {
  private cache: NodeCache;
  
  constructor(ttlSeconds = 3600) {
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2
    });
  }
  
  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }
  
  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, ttl);
  }
  
  del(key: string): void {
    this.cache.del(key);
  }
  
  flush(): void {
    this.cache.flushAll();
  }
}

export const tourCache = new Cache();
```

#### 5.4 Implement Monitoring

```typescript
// tour-guide-app/backend/src/middleware/monitoring.ts
import { Request, Response, NextFunction } from 'express';

export function requestMonitoring(req: Request, res: Response, next: NextFunction) {
  // Record start time
  const startTime = Date.now();
  
  // Add listener for when response finishes
  res.on('finish', () => {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log request details
    console.info({
      type: 'request_metrics',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration
    });
    
    // Could send to a monitoring service here
  });
  
  next();
}
```

### 6. Performance Optimization (Week 3)

#### 6.1 Implement Parallel Processing Where Possible

```typescript
// Inside orchestrationService.ts
async generateMultipleDescriptions(places: any[], theme: string, language: string): Promise<any> {
  // Process descriptions in parallel for faster results
  const descriptionPromises = places.map(place => 
    axios.post(`${this.descriptionServiceUrl}/generate/description`, {
      place,
      theme,
      language
    })
  );
  
  const results = await Promise.all(descriptionPromises);
  
  return places.map((place, index) => ({
    ...place,
    description: results[index].data.description
  }));
}
```

#### 6.2 Add Response Compression

```typescript
// tour-guide-app/backend/src/server.ts
import compression from 'compression';

// Add compression middleware
app.use(compression());
```

## Integration Testing Plan

### End-to-End Tests

1. Complete tour generation flow
   - Test with various cities, themes, and languages
   - Verify all components interact correctly

2. Tour retrieval flow
   - Test retrieving tours by ID
   - Verify audio playback works

3. Error handling
   - Test behavior when services are down
   - Verify circuit breaker functionality

### Load Testing

1. Determine performance under load
   - Multiple concurrent tour generation requests
   - Response time measurement

### Monitoring Setup

1. Set up basic monitoring
   - Request volume
   - Error rates
   - Response times
   - Service availability

## Rollout Plan

1. Development environment
   - Complete integration in development environment
   - Test all flows
   - Fix issues

2. Production deployment
   - Deploy all services
   - Run smoke tests
   - Monitor for errors

## Success Criteria

1. End-to-end flows work reliably
   - Tour generation
   - Tour retrieval
   - Audio playback

2. Performance meets targets
   - Tour generation < 10 seconds
   - Tour retrieval < 2 seconds
   - Audio retrieval < 1 second

3. Resilience
   - System handles service outages gracefully
   - Recovery is automatic
