# Technical Notes

This directory contains technical notes, solutions to known issues, and implementation details for the Tour Guide App.

## Contents

- [API Path Fix](./api-path-fix.md) - Solution for API path configuration issues
- [Network Connectivity Fixes](./network-connectivity-fixes.md) - Solutions for network issues in containerized environment
- [Tour Browsing API Connectivity](./tour-browsing-api-connectivity.md) - Implementation of the tour listing API endpoint
- [API Response Structure](./api-response-structure.md) - Documentation of API response formats and data structures
- [Audio Playback Fix](./audio-playback-fix.md) - Solution for audio playback errors and best practices
- [Audio URL Proxy Fix](./audio-url-proxy-fix.md) - Solution for container audio URL issues and Fast Refresh loops
- [Audio Enhancements](./audio-enhancements.md) - Implementation of audio URL handling, playback order, and enhanced player
- [UI Enhancements](./ui-enhancements.md) - Documentation of UI improvements including enhanced audio player and "Continue reading" pattern
- [City Filtering Fix](./city-filtering-fix.md) - Solution for tour filtering by city name in the browse tours page

## Known Issues & Resolutions

| Issue | Status | Resolution |
|-------|--------|------------|
| Container networking in development | ✅ Fixed | Use host.containers.internal or appropriate DNS |
| API path configuration | ✅ Fixed | Updated base path in configuration |
| Markdown formatting in TTS | ✅ Fixed | Added text sanitization in TTS pod |
| API response data structure mismatch | ✅ Fixed | Updated frontend to access proper data path (`data.data.tours`) |
| Audio playback errors | ✅ Fixed | Improved error handling and user feedback for audio files |
| Tour filtering by city not working | ✅ Fixed | Fixed backend controller to pass query parameters to Supabase pod |

## Environment-Specific Configuration

### Docker Desktop
- Host system is accessible via `host.docker.internal`
- Requires enabling DNS resolution in Docker Desktop settings

### Podman
- Host system is accessible via `host.containers.internal` (requires podman-machine-default)
- May require additional port mapping for Windows environments

## Common Troubleshooting

### Container Communication Issues
- Ensure container names are properly specified in `.env` files
- Check the `USE_SERVICE_NAMES` environment variable is set correctly
- Validate network settings in Docker/Podman configuration

### LLM Integration Problems
- Verify API keys are correctly set in environment variables
- Check request timeouts - LLM responses can be slow
- Consider implementing fallback LLM providers

### Audio Generation Failures
- Check TTS pod logs for Python errors
- Verify text doesn't contain problematic characters that break script execution
- Ensure disk space is available for audio storage

## Security Notes

- Supabase credentials are stored in pod-specific `.env` files (not committed to the repository)
- LLM API keys must be set as environment variables
- Container networking is isolated to reduce attack surface
