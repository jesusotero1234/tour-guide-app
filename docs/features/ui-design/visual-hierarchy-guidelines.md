# Visual Hierarchy Guidelines for Tour Guide App

This document outlines the design principles and guidelines for maintaining visual hierarchy, clarity, and consistency across the Tour Guide App interface.

## General UI Principles

### Text Density & Readability

- **Text Paragraphs**: Break lengthy text into shorter paragraphs (3-5 lines) with increased spacing between paragraphs
- **Line Height**: Use a minimum line height of 1.5 (`.leading-relaxed` in Tailwind) for better text readability
- **Max Width**: Maintain a maximum text width of around 70 characters for optimal reading experience
- **Font Size**: Use appropriate font sizes (minimum 14px/0.875rem for body text)

### Spacing Recommendations

- **Component Spacing**: Use a minimum of 1.5rem (24px) spacing between major components
- **Section Spacing**: Add clear visual separation between different sections with spacing and/or borders
- **Content Padding**: Use consistent padding inside containers (recommend 1.5rem/24px)
- **Mobile Considerations**: Increase touch targets to at least 44x44px on mobile devices

### Typography Hierarchy

| Element              | Size        | Weight   | CSS Classes (Tailwind)                      |
|----------------------|-------------|----------|---------------------------------------------|
| Page Title           | 2.25rem     | Bold     | `text-4xl font-bold text-gray-900`         |
| Section Title        | 1.875rem    | Bold     | `text-3xl font-bold text-gray-900`         |
| Card Title           | 1.5rem      | Bold     | `text-2xl font-bold text-gray-900`         |
| Subsection Heading   | 1.25rem     | Medium   | `text-lg font-medium text-gray-800`        |
| Body Text            | 1rem        | Normal   | `text-gray-600 leading-relaxed`            |
| Small/Caption        | 0.875rem    | Normal   | `text-sm text-gray-500`                    |

## Component-Specific Guidelines

### Tour Header

- Display city and country prominently as main heading 
- Show theme and language as colored tags
- Include clear section for tour metadata with proper labeling
- Use border separators to distinguish information sections
- Example:
  ```jsx
  <div className="bg-white rounded-lg shadow-md p-6 mb-6">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
      <h2 className="text-3xl font-bold text-gray-900 mb-2 md:mb-0">
        Tour of {tour.city}, {tour.country}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {/* Tag styling */}
      </div>
    </div>
    <div className="mt-4 pt-4 border-t">
      <h3 className="text-lg font-medium text-gray-800 mb-2">Tour Information</h3>
      <p className="text-gray-600 leading-relaxed">
        {/* Tour details */}
      </p>
    </div>
  </div>
  ```

### Place Cards

- Use large, prominent heading with border separator for place name
- Break description into paragraphs for better readability
- Add section heading for location information
- Make audio control button large and prominent
- Include play/pause icons for better affordance
- Example:
  ```jsx
  <div className="bg-white rounded-lg shadow-md p-6 mb-4">
    <h3 className="text-2xl font-bold text-gray-900 mb-4 border-b pb-2">
      {place.name}
    </h3>
    <div className="mb-6 space-y-4">
      {/* Paragraphs mapped from place description */}
    </div>
    <div className="flex flex-col sm:flex-row justify-between">
      {/* Location info and audio controls */}
    </div>
  </div>
  ```

### Navigation Elements

- Use prominent buttons with icons for primary actions
- Make back navigation clear and recognizable with arrow icon
- Remove redundant navigation options (e.g., removed "Generate New Tour" button)
- Position navigation consistently (top for back button)
- Example:
  ```jsx
  <Link 
    href="/tours" 
    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" /* ... */ />
    Back to Tours
  </Link>
  ```

### Audio Controls

- Use a larger button size for better visibility
- Include recognizable play/pause icons
- Use contrasting colors (blue on white)
- Provide clear text label ("Listen to Description" instead of just "Play Audio")
- Position consistently at bottom of card
- Example:
  ```jsx
  <button
    onClick={handlePlayPause}
    className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
  >
    {/* SVG icon */}
    <span>{isPlaying ? 'Pause Audio' : 'Listen to Description'}</span>
  </button>
  ```

## Before & After Examples

### Before: Place Card
- Dense, unstructured text
- Small play button
- No clear section headers
- Poor visual hierarchy

### After: Place Card
- Larger, bordered heading
- Text broken into paragraphs
- Location information clearly labeled
- Prominent audio button with icon
- Better spacing between elements

## Accessibility Considerations

- Maintain sufficient color contrast (minimum ratio of 4.5:1)
- Ensure all interactive elements have hover/focus states
- Provide text labels alongside icons
- Maintain a logical tab order for keyboard navigation
- Use semantic HTML elements (`h1`, `h2`, etc.) for proper document structure

## Implementation Notes

1. Use consistent spacing units throughout the application
2. Prefer flex layouts for responsive design
3. Apply mobile-first approach with responsive adjustments
4. Use borders and background colors to create visual separation
5. Maintain consistent use of text styles from the typography hierarchy
